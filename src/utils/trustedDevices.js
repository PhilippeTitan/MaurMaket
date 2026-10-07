// Trusted-device ("remember this device") policy — Batch 74, APP-Q379.
//
// The settled decision: a trusted-device duration must stay **bounded and
// visible**, must be **immediately revocable**, and a trusted device must
// **never** be treated as identity verification, KYC evidence, or proof of
// anything about a payment or payout.
//
// This module is deliberately dependency-free so the server (Node) and the app
// (Metro/TypeScript, `allowJs` is on) both import the same numbers. That is the
// only way the duration the user is shown can be guaranteed to equal the
// duration the server actually enforces.
//
// Where the trust lives: Better Auth's two-factor plugin owns it. When a user
// verifies a second-factor code with `trustDevice: true`, the plugin writes a
// row in `verifications` with an identifier of the form
// `trust-device-<random>`, `value = user id`, and `expires_at = now + maxAge`,
// and sets a signed `trust_device` cookie. On a later sign-in the plugin
// accepts that cookie only while the matching row exists and has not expired.
// Deleting the row is therefore an immediate, server-side revocation.

/**
 * How long a device may skip the second-factor code before it must ask again.
 * This is the single source of truth: it is handed to Better Auth as the plugin
 * option and shown verbatim to the user. Nothing may exceed it.
 */
export const TRUSTED_DEVICE_DAYS = 30;

/** The same bound in seconds — the unit Better Auth's `trustDeviceMaxAge` expects. */
export const TRUSTED_DEVICE_MAX_AGE_SECONDS = TRUSTED_DEVICE_DAYS * 24 * 60 * 60;

/**
 * Identifier prefix Better Auth uses for trust records. Revocation only ever
 * touches rows that start with this prefix, so a bug here cannot delete
 * unrelated verification records (password resets, OTPs, pending sign-ins).
 */
export const TRUST_DEVICE_IDENTIFIER_PREFIX = 'trust-device-';

/** True only for a trust record identifier, never for another verification row. */
export function isTrustedDeviceIdentifier(value) {
  return typeof value === 'string' && value.startsWith(TRUST_DEVICE_IDENTIFIER_PREFIX);
}

/**
 * Whole days until a trust record expires; 0 once it has. Used to label the
 * remaining window in the user's own language rather than showing a raw
 * timestamp delta.
 */
export function trustedDeviceDaysRemaining(expiresAt, now = Date.now()) {
  const expiry = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
  if (!Number.isFinite(expiry)) return 0;
  const ms = expiry - now;
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000));
}
