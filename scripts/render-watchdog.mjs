#!/usr/bin/env node
/**
 * Render failover watchdog — Vercel primary / Render secondary.
 *
 * Vercel serves /api/* by default; Render is billing-suspended to save free
 * hours and resumed automatically when Vercel is down. This script is the
 * only thing allowed to move that state, so it is deliberately small, zero
 * dependency, and fail-closed: any uncertainty exits 1 (a failed Actions run
 * emails the owner) and mutates nothing.
 *
 * Decision table (Render state x Vercel probes, all in one run — the script
 * is stateless across runs, GitHub cron is the scheduler):
 *
 *   suspended + healthy(1)  -> steady state, exit 0
 *   active    + down(1)     -> failover already active, exit 0
 *   suspended + down(2x60s) -> resume Render (the failover)
 *   active    + healthy(6x) -> suspend Render (back to primary-only)
 *
 * Down = non-2xx (a 5xx from the health route counts as down), network
 * error, or timeout. A single blip never resumes (2 consecutive down probes)
 * and a single healthy answer never suspends (6 consecutive healthy probes,
 * ~5 min sustained — shorter than a typical deploy gap, longer than a blip).
 *
 * Env (all optional except RENDER_API_KEY for any run that probes):
 *   RENDER_API_KEY     Render API key (Bearer). Required unless "disabled".
 *   WATCHDOG_ENABLED   'true' allows mutations. Anything else mutates nothing.
 *   DRY_RUN            'true' logs the intended mutation and exits 0 without
 *                      calling Render. Allowed even while disabled, so the
 *                      wiring can be verified before the switch is flipped.
 *   RENDER_SERVICE_ID  default srv-d8ten9mrnols73aejjg0 (MaurMaket)
 *   VERCEL_HEALTH_URL  default https://maurmaket.vercel.app/api/health
 *   RENDER_API_BASE    default https://api.render.com/v1
 *
 * Exit codes: 0 = handled (no action, dry-run, or 4xx-noop on mutation),
 *             1 = unusable (missing key, state read failed, unexpected
 *             suspended value, mutation failed after one retry).
 *
 * Run: node scripts/render-watchdog.mjs
 */

const CONFIG = {
  apiKey: process.env.RENDER_API_KEY || '',
  enabled: process.env.WATCHDOG_ENABLED === 'true',
  dryRun: process.env.DRY_RUN === 'true',
  serviceId: process.env.RENDER_SERVICE_ID || 'srv-d8ten9mrnols73aejjg0',
  vercelHealthUrl: process.env.VERCEL_HEALTH_URL || 'https://maurmaket.vercel.app/api/health',
  renderApiBase: process.env.RENDER_API_BASE || 'https://api.render.com/v1',
};

const DOWN_PROBES = 2;
const HEALTHY_PROBES = 6;
const PROBE_INTERVAL_MS = 60_000;
const PROBE_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 5_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (msg) => console.log(`[render-watchdog] ${msg}`);

/** True = Vercel answered 2xx within the timeout. */
async function probeVercel() {
  try {
    const res = await fetch(CONFIG.vercelHealthUrl, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Read the service row; throws on any non-2xx (auth/config problems exit 1). */
async function getRenderService() {
  const res = await fetch(`${CONFIG.renderApiBase}/services/${CONFIG.serviceId}`, {
    headers: { Authorization: `Bearer ${CONFIG.apiKey}` },
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GET /services/${CONFIG.serviceId} -> HTTP ${res.status}`);
  const body = await res.json();
  // The API returns the service row unwrapped; tolerate a wrapped shape too.
  return body.service ?? body;
}

/** 'suspended' | 'active' | 'unexpected' — unknown values never mutate. */
function parseSuspended(value) {
  if (value === true || value === 'suspended') return 'suspended';
  if (value === false || value === 'not_suspended') return 'active';
  return 'unexpected';
}

/**
 * POST /services/:id/{suspend,resume} (bodyless). 202 = accepted; 4xx =
 * already in target state or not eligible (no-op, exit 0); 5xx/network
 * retried once, then exit 1 so the failure is visible.
 */
async function mutate(action) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${CONFIG.renderApiBase}/services/${CONFIG.serviceId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${CONFIG.apiKey}` },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (res.ok) {
        log(`POST ${action} -> HTTP ${res.status} (accepted)`);
        return 0;
      }
      if (res.status >= 400 && res.status < 500) {
        log(`POST ${action} -> HTTP ${res.status} (no-op: already in target state or not eligible)`);
        return 0;
      }
      log(`POST ${action} -> HTTP ${res.status} (attempt ${attempt}/2)`);
    } catch (err) {
      log(`POST ${action} -> network error (attempt ${attempt}/2): ${err.message}`);
    }
    if (attempt < 2) await sleep(RETRY_DELAY_MS);
  }
  log(`POST ${action} failed after retry — not confirmed; leaving state unchanged`);
  return 1;
}

async function main() {
  if (!CONFIG.dryRun && !CONFIG.enabled) {
    log('disabled (WATCHDOG_ENABLED is not "true") — no probe, no mutation');
    return 0;
  }
  if (!CONFIG.apiKey) {
    log('RENDER_API_KEY is not set — cannot read Render state');
    return 1;
  }

  let service;
  try {
    service = await getRenderService();
  } catch (err) {
    log(`failed to read Render service state: ${err.message}`);
    return 1;
  }

  const state = parseSuspended(service.suspended);
  if (state === 'unexpected') {
    log(`unexpected suspended value from Render API: ${JSON.stringify(service.suspended)}`);
    return 1;
  }
  log(`render=${state} vercel=${CONFIG.vercelHealthUrl} dryRun=${CONFIG.dryRun} enabled=${CONFIG.enabled}`);

  // Probe #1.
  let healthy = await probeVercel();
  log(`vercel probe #1: ${healthy ? 'healthy' : 'down'}`);

  if (state === 'suspended' && healthy) {
    log('steady state (suspended + healthy) — no action');
    return 0;
  }
  if (state === 'active' && !healthy) {
    log('failover already active (active + down) — no action');
    return 0;
  }

  if (state === 'suspended' && !healthy) {
    // Failover: DOWN_PROBES consecutive down probes, then resume.
    for (let n = 2; n <= DOWN_PROBES; n++) {
      await sleep(PROBE_INTERVAL_MS);
      healthy = await probeVercel();
      log(`vercel probe #${n}: ${healthy ? 'healthy' : 'down'}`);
      if (healthy) {
        log('vercel recovered during debounce — transient blip, no action');
        return 0;
      }
    }
    if (CONFIG.dryRun) {
      log(`[dry-run] would POST ${CONFIG.renderApiBase}/services/${CONFIG.serviceId}/resume`);
      return 0;
    }
    log('vercel down (sustained) + render suspended — resuming render');
    return mutate('resume');
  }

  // state === 'active' && healthy: HEALTY_PROBES consecutive healthy probes, then suspend.
  for (let n = 2; n <= HEALTHY_PROBES; n++) {
    await sleep(PROBE_INTERVAL_MS);
    healthy = await probeVercel();
    log(`vercel probe #${n}: ${healthy ? 'healthy' : 'down'}`);
    if (!healthy) {
      log('vercel flapped during healthy debounce — not sustained, no action');
      return 0;
    }
  }
  if (CONFIG.dryRun) {
    log(`[dry-run] would POST ${CONFIG.renderApiBase}/services/${CONFIG.serviceId}/suspend`);
    return 0;
  }
  log('vercel healthy (sustained) + render active — suspending render');
  return mutate('suspend');
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    log(`unexpected error: ${err.message}`);
    process.exit(1);
  });
