import { createSign, createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';

// KYC v2 — Play Integrity device verification + app pin check.
// docs/rfc/kyc-on-device.md (DECIDED 2026-10-17, free stack).
// Zero new npm dependencies: the service-account JWT is signed with
// node:crypto and the token exchange / decodeIntegrityToken calls are plain
// fetch. Device verdicts work for sideloaded builds (project number is set
// client-side); appRecognitionVerdict will read UNRECOGNIZED_VERSION until
// the $25 Play Console upgrade — that is expected and only logged.

const STRONG = 'MEETS_STRONG_INTEGRITY';
const DEVICE = 'MEETS_DEVICE_INTEGRITY';
const BASIC = 'MEETS_BASIC_INTEGRITY';
const VIRTUAL = 'MEETS_VIRTUAL_INTEGRITY';
const KNOWN_VERDICTS = [STRONG, DEVICE, BASIC, VIRTUAL];

export function kycV2Enabled() {
  return process.env.KYC_V2_ENABLED === 'true';
}

/** Phase 4 hook ($25 Play Console trigger): require a hardware-backed verdict. */
export function attestationRequired() {
  return process.env.KYC_ATTEST_FULL === 'true';
}

export function loadServiceAccount(raw = process.env.PLAY_INTEGRITY_SA_JSON) {
  if (!raw || typeof raw !== 'string') return null;
  let text = raw.trim();
  if (!text) return null;
  if (!text.startsWith('{')) {
    try {
      text = readFileSync(text, 'utf8');
    } catch {
      return null;
    }
  }
  let sa;
  try {
    sa = JSON.parse(text);
  } catch {
    return null;
  }
  if (sa?.type !== 'service_account' || !sa.client_email || !sa.private_key) return null;
  return sa;
}

export function buildServiceAccountAssertion(sa, nowMs = Date.now()) {
  if (!sa?.private_key || !sa?.client_email) throw new Error('Play Integrity service account is incomplete');
  const iat = Math.floor(nowMs / 1000);
  const b64url = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
  const header = b64url({ alg: 'RS256', typ: 'JWT' });
  const claims = b64url({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/playintegrity',
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + 3600,
  });
  const key = createPrivateKey(sa.private_key);
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(key).toString('base64url');
  return `${header}.${claims}.${signature}`;
}

let tokenCache = { email: null, token: null, expiresAt: 0 };

export async function getPlayIntegrityAccessToken(sa, { fetchImpl = fetch, now = Date.now } = {}) {
  if (!sa?.client_email) throw new Error('Play Integrity service account is not configured');
  const ts = now();
  if (tokenCache.email === sa.client_email && tokenCache.token && ts < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }
  const assertion = buildServiceAccountAssertion(sa, ts);
  const resp = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`Play Integrity token exchange failed: ${resp.status}`);
  const data = await resp.json();
  if (!data.access_token) throw new Error('Play Integrity token exchange returned no access token');
  tokenCache = {
    email: sa.client_email,
    token: data.access_token,
    expiresAt: ts + Number(data.expires_in || 3600) * 1000,
  };
  return data.access_token;
}

/** Normalise a decoded token payload into the fields the policy layer stores. */
export function parseIntegrityPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const requestDetails = payload.requestDetails || {};
  const appIntegrity = payload.appIntegrity || {};
  const deviceIntegrity = payload.deviceIntegrity || {};
  return {
    requestHash: typeof requestDetails.requestHash === 'string' ? requestDetails.requestHash : null,
    timestampMillis: Number.isFinite(Number(requestDetails.timestampMillis)) ? Number(requestDetails.timestampMillis) : null,
    nonce: typeof requestDetails.nonce === 'string' ? requestDetails.nonce : null,
    appRecognitionVerdict: typeof appIntegrity.appRecognitionVerdict === 'string' ? appIntegrity.appRecognitionVerdict : null,
    packageName: typeof appIntegrity.packageName === 'string' ? appIntegrity.packageName : null,
    certificateSha256Digest: Array.isArray(appIntegrity.certificateSha256Digest) ? appIntegrity.certificateSha256Digest : [],
    deviceRecognitionVerdict: Array.isArray(deviceIntegrity.deviceRecognitionVerdict)
      ? deviceIntegrity.deviceRecognitionVerdict.filter((v) => typeof v === 'string')
      : [],
  };
}

export async function decodeIntegrityToken({
  integrityToken,
  packageName = process.env.KYC_APP_PACKAGE || 'com.maurmaket.app',
  sa = loadServiceAccount(),
  fetchImpl = fetch,
} = {}) {
  if (!integrityToken || typeof integrityToken !== 'string') throw new Error('Missing integrity token');
  if (!sa) throw new Error('PLAY_INTEGRITY_SA_JSON is not configured');
  const accessToken = await getPlayIntegrityAccessToken(sa, { fetchImpl });
  const resp = await fetchImpl(
    `https://playintegrity.googleapis.com/v1/${encodeURIComponent(packageName)}:decodeIntegrityToken`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ integrityToken }),
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`decodeIntegrityToken failed: ${resp.status} ${String(body).slice(0, 200)}`);
  }
  return parseIntegrityPayload(await resp.json());
}

/**
 * Pure policy over a decoded deviceRecognitionVerdict list.
 * - hardware/classic verdict present → attested: true
 * - only MEETS_BASIC_INTEGRITY → attested: 'basic' + advisory flag
 * - MEETS_VIRTUAL_INTEGRITY → emulator flag (attestation still evaluated)
 * - empty/missing → attested: null + 'unattested' (sideloaded first builds,
 *   no Play Services, or the client has not wired the request yet)
 */
export function evaluateDeviceSignals(deviceVerdicts) {
  const list = Array.isArray(deviceVerdicts)
    ? deviceVerdicts.filter((v) => typeof v === 'string' && v)
    : [];
  if (list.length === 0) {
    return { attested: null, flags: ['unattested'], verdicts: [] };
  }
  const flags = [];
  if (list.includes(VIRTUAL)) flags.push('emulator');
  let attested = null;
  if (list.includes(STRONG) || list.includes(DEVICE)) {
    attested = true;
  } else if (list.includes(BASIC)) {
    attested = 'basic';
    flags.push('basic_integrity_only');
  } else {
    flags.push('no_integrity_verdict');
  }
  for (const verdict of list) {
    if (!KNOWN_VERDICTS.includes(verdict)) flags.push(verdict);
  }
  return { attested, flags, verdicts: list };
}

const HEX64 = /^[0-9a-f]{64}$/i;

/** Accepts a bare digest, colon-separated, sha256-prefixed, or an array. */
export function normalizePin(value) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = normalizePin(entry);
      if (normalized) return normalized;
    }
    return null;
  }
  if (typeof value !== 'string') return null;
  // Strip the prefix BEFORE removing colons — otherwise "sha256:aa:bb..."
  // becomes "sha256aabb..." and the prefix never matches.
  const cleaned = value.trim().toLowerCase().replace(/^sha256[:=]/i, '').replace(/:/g, '');
  return HEX64.test(cleaned) ? cleaned : null;
}

/**
 * Client pin claim vs APP_SIGNING_CERT_SHA256. A tollbooth, not a wall: a
 * modded APK that does not bother spoofing the field is caught; a determined
 * attacker patches the claim. Unconfigured env → { configured: false }.
 */
export function verifyAppPinClaim(claimed) {
  const expected = normalizePin(process.env.APP_SIGNING_CERT_SHA256);
  const claim = normalizePin(claimed);
  if (!expected) return { configured: false, match: null, claimed: claim };
  return { configured: true, match: claim !== null && claim === expected, claimed: claim };
}
