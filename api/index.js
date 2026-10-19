// ───── Vercel function entry (zero-dep, no serverless-http) ─────
// Vercel is the PRIMARY API; Render (maurmaket.onrender.com) is the auto-
// suspended/resumed SECONDARY. The mobile/web client falls back between the
// two URLs (src/api.ts). This entry reuses the exact same Express app.
//
// initApp() is promise-guarded in server.js, so concurrent invocations in the
// same isolate initialize DB controller + Better Auth exactly once. Migrations
// are deliberately NOT run here — Render owns schema migration so a Vercel
// deploy can never race a live Render boot.
//
// Realtime WebSocket and node-cron jobs are NOT started on Vercel: /ws degrades
// to the existing 5s HTTP polling fallback, and time-sensitive jobs are
// triggered externally (cron-job.org) against whichever backend is primary.
import { app, initApp } from '../server.js';

const ready = initApp({ runDbMigrations: false }).catch((err) => {
  console.error('[VERCEL] initApp failed:', err.message);
  return null;
});

export default async function handler(req, res) {
  const initializedApp = await ready;
  if (!initializedApp) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Service temporarily unavailable, retry shortly' }));
    return;
  }
  return initializedApp(req, res);
}
