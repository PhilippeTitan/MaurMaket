import crypto from 'crypto';

// Realtime is a hint channel only; all user data still comes from Better Auth
// protected API requests. The service role secret stays on the server.
const supabaseUrl = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const topicSecret = () => process.env.REALTIME_TOPIC_SECRET || process.env.BETTER_AUTH_SECRET || '';

export function realtimeEnabled() {
  return Boolean(supabaseUrl() && serviceKey() && topicSecret());
}

export function userTopic(userId) {
  const digest = crypto.createHmac('sha256', topicSecret()).update(`user:${userId}`).digest('hex');
  return `u_${digest.slice(0, 40)}`;
}

/** Publish content-free change notifications. Polling remains the fallback. */
export function publishUserEvent(userId, type) {
  if (!userId || !type || !realtimeEnabled()) return;
  fetch(`${supabaseUrl()}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      apikey: serviceKey(),
      Authorization: `Bearer ${serviceKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [{ topic: userTopic(userId), event: 'ping', payload: { type }, private: false }],
    }),
    signal: AbortSignal.timeout(3000),
  }).then(response => {
    if (!response.ok) console.warn(`[REALTIME] publish failed with HTTP ${response.status}`);
  }).catch(error => console.warn('[REALTIME] publish failed:', error.message));
}
