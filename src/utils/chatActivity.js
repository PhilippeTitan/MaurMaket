import { pool } from '../config/database.js';

const PRESENCE_TTL_SECONDS = 15;
const ACTIVE_CHAT_TTL_SECONDS = 30;

// Presence and open-chat markers are shared between Render and Vercel through
// the primary database. They are expiry windows only; we do not retain a
// durable last-seen timestamp or expose one to other users.
export async function touchPresence(userId) {
  if (!userId) return;
  try {
    await pool.query(
      `INSERT INTO chat_user_activity (user_id, presence_expires_at)
       VALUES ($1, CURRENT_TIMESTAMP + ($2 * INTERVAL '1 second'))
       ON CONFLICT (user_id) DO UPDATE
         SET presence_expires_at = EXCLUDED.presence_expires_at`,
      [userId, PRESENCE_TTL_SECONDS]
    );
  } catch { /* optional social presence must never block chat or orders */ }
}

export async function markConversationActive(userId, conversationId) {
  if (!userId || !conversationId) return;
  try {
    await pool.query(
      `INSERT INTO chat_user_activity
         (user_id, presence_expires_at, active_conversation_id, active_expires_at)
       VALUES (
         $1,
         CURRENT_TIMESTAMP + ($3 * INTERVAL '1 second'),
         $2,
         CURRENT_TIMESTAMP + ($4 * INTERVAL '1 second')
       )
       ON CONFLICT (user_id) DO UPDATE SET
         presence_expires_at = EXCLUDED.presence_expires_at,
         active_conversation_id = EXCLUDED.active_conversation_id,
         active_expires_at = EXCLUDED.active_expires_at`,
      [userId, conversationId, PRESENCE_TTL_SECONDS, ACTIVE_CHAT_TTL_SECONDS]
    );
  } catch { /* suppression is best-effort; never block opening a conversation */ }
}

export async function isConversationOpen(userId, conversationId) {
  if (!userId || !conversationId) return false;
  try {
    const result = await pool.query(
      `SELECT 1 FROM chat_user_activity
       WHERE user_id = $1
         AND active_conversation_id = $2
         AND active_expires_at > CURRENT_TIMESTAMP`,
      [userId, conversationId]
    );
    return result.rows.length > 0;
  } catch { return false; }
}

export async function isOnline(userId) {
  if (!userId) return false;
  try {
    const result = await pool.query(
      `SELECT 1 FROM chat_user_activity
       WHERE user_id = $1 AND presence_expires_at > CURRENT_TIMESTAMP`,
      [userId]
    );
    return result.rows.length > 0;
  } catch { return false; }
}
