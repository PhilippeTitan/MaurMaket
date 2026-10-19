#!/usr/bin/env node
/**
 * Render failover watchdog check — Vercel primary / Render secondary.
 *
 * The watchdog is the only thing that moves Render between billing-suspended
 * and active, and it runs unattended every 5 minutes from the public mirror.
 * Two classes of rot matter, and neither shows up in a type check:
 *
 *   1. A missing safety gate. The WATCHDOG_ENABLED job gate, the script's own
 *      double-gate, and the DRY_RUN path are what keep an accidental enable
 *      from suspending Render mid-deploy or resuming it on every blip. The
 *      debounce thresholds (2 down probes to resume, 6 healthy probes to
 *      suspend) are the same kind of decision rendered as numbers.
 *   2. Secret hygiene. The workflow file is public; a literal key in it is a
 *      permanent leak. The script must read the key from env and must never
 *      log it.
 *
 * Run: node scripts/watchdog-check.js
 * Exit code 0 = clean, 1 = violation
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const read = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');

let failures = 0;
const check = (label, ok, detail = '') => {
  if (ok) return;
  failures++;
  console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
};

const wfSrc = read('.github/workflows/render-watchdog.yml');
const scriptSrc = read('scripts/render-watchdog.mjs');
const pkgSrc = read('package.json');

// ── 1. The workflow file ──
check('the watchdog workflow exists', wfSrc.length > 0);
check('the schedule is every 5 minutes', /cron: '\*\/5 \* \* \* \*'/.test(wfSrc));
check('workflow_dispatch is available for manual/dry runs', /workflow_dispatch:/.test(wfSrc));
check('dry_run input exists with type boolean',
  /dry_run:[\s\S]*?type: boolean/.test(wfSrc));
check('overlapping runs queue instead of cancelling', /group: render-watchdog/.test(wfSrc)
  && /cancel-in-progress: false/.test(wfSrc));
check('the job is gated on the WATCHDOG_ENABLED variable',
  /if: vars\.WATCHDOG_ENABLED == 'true'/.test(wfSrc)
  && /github\.event_name == 'workflow_dispatch' && inputs\.dry_run == true/.test(wfSrc));
check('the workflow declares minimal permissions', /permissions:\s*\n\s*contents: read/.test(wfSrc));
check('the job has a hard timeout', /timeout-minutes: 10/.test(wfSrc));
check('the key is referenced only as a secret, never inlined',
  /\$\{\{ secrets\.RENDER_API_KEY \}\}/.test(wfSrc) && !/rnd_/.test(wfSrc));
check('the workflow does not npm-install (the script is zero-dependency)',
  !/npm (ci|install)/.test(wfSrc));

// ── 2. The script's gates and thresholds ──
check('the watchdog script exists', scriptSrc.length > 0);
check('the script double-gates mutations on WATCHDOG_ENABLED',
  /!CONFIG\.dryRun && !CONFIG\.enabled/.test(scriptSrc)
  && /process\.env\.WATCHDOG_ENABLED === 'true'/.test(scriptSrc));
check('the script supports DRY_RUN without mutating',
  /process\.env\.DRY_RUN === 'true'/.test(scriptSrc)
  && /\[dry-run\] would POST/.test(scriptSrc));
check('resume waits for 2 consecutive down probes', /const DOWN_PROBES = 2;/.test(scriptSrc));
check('suspend waits for 6 consecutive healthy probes', /const HEALTHY_PROBES = 6;/.test(scriptSrc));
check('probes are spaced 60 seconds apart', /const PROBE_INTERVAL_MS = 60_000;/.test(scriptSrc));
check('probes are bounded by a 20s timeout', /const PROBE_TIMEOUT_MS = 20_000;/.test(scriptSrc)
  && /AbortSignal\.timeout\(PROBE_TIMEOUT_MS\)/.test(scriptSrc));

// ── 3. Defaults and secret hygiene in the script ──
check('the Vercel health URL default is correct',
  /VERCEL_HEALTH_URL \|\| 'https:\/\/maurmaket\.vercel\.app\/api\/health'/.test(scriptSrc));
check('the Render API base default is correct',
  /RENDER_API_BASE \|\| 'https:\/\/api\.render\.com\/v1'/.test(scriptSrc));
check('the MaurMaket service id default is correct',
  /RENDER_SERVICE_ID \|\| 'srv-d8ten9mrnols73aejjg0'/.test(scriptSrc));
check('no Render API key literal in the script', !/rnd_/.test(scriptSrc));
check('the script never logs the API key',
  !/console\.(log|error|warn|info)\([^)]*apiKey/.test(scriptSrc));
check('an unexpected suspended value is never mutated',
  /return 'unexpected';/.test(scriptSrc) && /state === 'unexpected'/.test(scriptSrc));

// ── 4. The check is wired into the test chain ──
check('package.json test chain runs the watchdog check',
  /watchdog-check\.js/.test(pkgSrc));

if (failures > 0) {
  console.log(`\nFAIL: ${failures} render-watchdog violation(s).`);
  process.exit(1);
}
console.log('OK: render watchdog holds (gated, debounced, secret-free; suspend/resume only on sustained evidence).');
