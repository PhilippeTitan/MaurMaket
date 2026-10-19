// Public app origin used for provider redirects and account-facing links.
// Keep the default on the always-on primary; deployments may override it.
export const PRODUCTION_URL = (
  process.env.PRODUCTION_URL || 'https://maurmaket.vercel.app'
).replace(/\/+$/, '');
