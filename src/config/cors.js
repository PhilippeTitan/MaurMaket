// ───── Browser origin policy for the API ─────
// 2026-10-19 failover: Vercel is the PRIMARY host. Browser requests from the
// Vercel web app carry `Origin: https://maurmaket.vercel.app` (every POST, and
// every preflight), so a Render-only allowlist made the app 500 against its own
// API on the same domain. Render stays listed as the secondary/legacy host.
export const ALLOWED_ORIGINS = [
  'https://maurmaket.vercel.app',
  'https://maurmaket.onrender.com',
  'http://localhost:3001',
  'http://localhost:4000',
  'http://localhost:8081',
  'http://localhost:19006',
];

// Vercel-generated hosts for THIS project only: branch aliases
// (maurmaket-git-main-<team>.vercel.app) and immutable deployment URLs
// (maurmaket-<hash>-<team>.vercel.app). Anchored to the team suffix so nobody
// can squat a `maurmaket-*` project in their own account and be trusted with
// credentialed cross-origin requests. A blanket *.vercel.app match would.
export const VERCEL_PROJECT_ORIGIN_RE = /^https:\/\/maurmaket(-[a-z0-9-]+)*-maurinexuscontact-4757\.vercel\.app$/;

// LAN + loopback dev origins (Expo/Metro can land on any port, and a native app
// may send its own LAN IP as Origin).
const DEV_ORIGIN_RE = /^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|localhost|127\.0\.0\.1)/;

/**
 * Hosts configured at deploy time (e.g. PRODUCTION_URL) so a future primary-URL
 * change does not need a code edit. Comma-separated values are accepted.
 */
export function envAllowedOrigins(env = process.env) {
  return [env.PRODUCTION_URL, env.CORS_EXTRA_ORIGINS]
    .filter(Boolean)
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

/**
 * True when a browser `Origin` may make credentialed API calls.
 * A missing Origin (native app fetch, curl, server-to-server) is always allowed.
 */
export function isAllowedOrigin(origin, env = process.env) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (envAllowedOrigins(env).includes(origin)) return true;
  if (VERCEL_PROJECT_ORIGIN_RE.test(origin)) return true;
  if (DEV_ORIGIN_RE.test(origin)) return true;
  return false;
}
