import { Router } from 'express';
import { pool } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';
import { msgLimiter, convLimiter } from '../middleware/rateLimit.js';
import { dobRequired } from '../middleware/auth.js';
import { createNotification } from '../utils/notifications.js';

const router = Router();

// Conversations list
router.get('/api/conversations', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*,
              CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END AS other_party_id,
              u.full_name AS other_party_name, u.username AS other_party_username, u.avatar_url AS other_party_avatar,
              u.use_store_identity AS other_party_use_store_identity, u.store_logo_url AS other_party_store_logo_url, u.seller_tier AS other_party_seller_tier,
              latest.last_message, latest.last_message_type,
              COUNT(unread.id)::INTEGER AS unread_count,
              -- Check for active pending offers
              EXISTS (
                SELECT 1 FROM message_offers mo
                JOIN messages om ON om.id = mo.message_id
                WHERE om.conversation_id = c.id AND mo.status IN ('pending', 'countered')
              ) AS has_active_offer,
              -- Mute status
              c.muted_until, c.is_pinned
       FROM conversations c
       JOIN users u ON u.id = CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END
       LEFT JOIN LATERAL (
         SELECT CASE WHEN message_type = 'image' THEN 'Photo' WHEN message_type = 'offer' THEN 'Offer' ELSE content END AS last_message,
              (SELECT message_type FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message_type
         FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1
       ) latest ON true
       LEFT JOIN messages unread ON unread.conversation_id = c.id AND unread.sender_id != $1 AND unread.is_read = false
       WHERE (c.buyer_id = $1 OR c.seller_id = $1)
         AND (c.muted_until IS NULL OR c.muted_until > NOW())
       GROUP BY c.id, u.id, latest.last_message, latest.last_message_type
       ORDER BY c.is_pinned DESC, c.last_message_at DESC`,
      [req.user.id]
    );
    // Split into sections
    const pinned = [];
    const active = [];
    const offers = [];
    for (const conv of result.rows) {
      if (conv.has_active_offer) offers.push(conv);
      else if (conv.is_pinned) pinned.push(conv);
      else active.push(conv);
    }
    res.json({ conversations: result.rows, pinned, active, offers });
  } catch (err) {
    console.error('Conversations fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create conversation
router.post('/api/conversations', authRequired, convLimiter, dobRequired, async (req, res) => {
  const { productId, orderId, sellerId: directSellerId } = req.body;
  if (!productId && !orderId && !directSellerId) return res.status(400).json({ error: 'productId, orderId, or sellerId required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let sellerId;
    if (directSellerId) {
      sellerId = directSellerId;
    } else if (orderId) {
      const o = await client.query('SELECT buyer_id FROM orders WHERE id = $1', [orderId]);
      if (o.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found' }); }
      const items = await client.query('SELECT DISTINCT seller_id FROM order_items WHERE order_id = $1', [orderId]);
      if (req.user.id !== o.rows[0].buyer_id && !items.rows.some(item => item.seller_id === req.user.id)) {
        await client.query('ROLLBACK'); return res.status(403).json({ error: 'Not a participant in this order' });
      }
      sellerId = items.rows[0]?.seller_id;
      if (req.user.id === sellerId) sellerId = o.rows[0].buyer_id;
    } else {
      const p = await client.query('SELECT seller_id FROM products WHERE id = $1', [productId]);
      if (p.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Product not found' }); }
      sellerId = p.rows[0].seller_id;
    }
    if (req.user.id === sellerId) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Cannot message yourself' }); }
    // Check if blocked
    const blocked = await client.query(
      'SELECT id FROM blocked_users WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1',
      [req.user.id, sellerId]
    );
    if (blocked.rows.length > 0) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Cannot message this user' }); }
    const existing = await client.query(
      `SELECT id FROM conversations WHERE ((buyer_id = $1 AND seller_id = $2) OR (buyer_id = $2 AND seller_id = $1)) AND ($3::uuid IS NULL OR order_id = $3) FOR SHARE`,
      [req.user.id, sellerId, orderId || null]
    );
    if (existing.rows.length > 0) { await client.query('COMMIT'); return res.json({ conversationId: existing.rows[0].id }); }
    const buyerId = req.user.id;
    const result = await client.query(
      `INSERT INTO conversations (order_id, product_id, buyer_id, seller_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [orderId || null, productId || null, buyerId, sellerId]
    );
    await client.query('COMMIT');
    res.status(201).json({ conversationId: result.rows[0].id });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    if (err.code === '23505' && orderId) {
      const existing = await pool.query(
        `SELECT id FROM conversations WHERE order_id = $1 AND LEAST(buyer_id, seller_id) = LEAST($2::uuid, $3::uuid) AND GREATEST(buyer_id, seller_id) = GREATEST($2::uuid, $3::uuid) LIMIT 1`,
        [orderId, req.user.id, sellerId]
      );
      if (existing.rows.length > 0) return res.json({ conversationId: existing.rows[0].id });
    }
    console.error('Conversation create error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// Get messages
router.get('/api/conversations/:id/messages', authRequired, async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  try {
    const conv = await pool.query('SELECT * FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [req.params.id, req.user.id]);
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    const unreadCheck = await pool.query('SELECT 1 FROM messages WHERE conversation_id = $1 AND sender_id != $2 AND is_read = false LIMIT 1', [req.params.id, req.user.id]);
    if (unreadCheck.rows.length > 0) {
      await pool.query('UPDATE messages SET is_read = true WHERE conversation_id = $1 AND sender_id != $2 AND is_read = false', [req.params.id, req.user.id]);
    }
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const since = req.query.since;
    const sinceId = req.query.sinceId;
    let query = `SELECT m.*, u.full_name AS sender_name,
       mo.product_id AS offer_product_id, mo.offered_price AS offer_offered_price, mo.list_price AS offer_list_price,
       mo.status AS offer_status, mo.negotiation_round AS offer_negotiation_round,
       mo.buyer_id AS offer_buyer_id, mo.seller_id AS offer_seller_id, mo.expires_at AS offer_expires_at,
       p.name AS offer_product_name,
       -- Reply context
       rm.id AS reply_to_msg_id, rm.content AS reply_to_content, rm.sender_id AS reply_to_sender_id,
       rm.message_type AS reply_to_type,
       ru.full_name AS reply_to_sender_name
       FROM messages m JOIN users u ON m.sender_id = u.id
       LEFT JOIN message_offers mo ON mo.message_id = m.id
       LEFT JOIN products p ON p.id = mo.product_id
       LEFT JOIN messages rm ON rm.id = m.reply_to_id
       LEFT JOIN users ru ON ru.id = rm.sender_id
       WHERE m.conversation_id = $1`;
    const params = [req.params.id];
    if (since) {
      params.push(since);
      if (sinceId) { params.push(sinceId); query += ` AND (m.created_at > $${params.length - 1} OR (m.created_at = $${params.length - 1} AND m.id > $${params.length}))`; }
      else { query += ` AND m.created_at > $${params.length}`; }
      query += ` ORDER BY m.created_at ASC, m.id ASC LIMIT $${params.length + 1}`;
      params.push(limit);
    } else {
      query = `SELECT * FROM (${query} ORDER BY m.created_at DESC, m.id DESC LIMIT $2 OFFSET $3) recent ORDER BY created_at ASC, id ASC`;
      params.push(limit, offset);
    }
    const result = await pool.query(query, params);
    const messages = result.rows.map(row => {
      const msg = { ...row };
      if (msg.offer_product_id) {
        msg.offer_data = { productId: msg.offer_product_id, productName: msg.offer_product_name, offeredPrice: parseFloat(msg.offer_offered_price), listPrice: parseFloat(msg.offer_list_price), status: msg.offer_status, negotiationRound: msg.offer_negotiation_round || 1, buyerId: msg.offer_buyer_id, sellerId: msg.offer_seller_id, expiresAt: msg.offer_expires_at };
      }
      // Reply context
      if (msg.reply_to_msg_id) {
        msg.reply_to = { id: msg.reply_to_msg_id, content: msg.reply_to_content, senderId: msg.reply_to_sender_id, senderName: msg.reply_to_sender_name, type: msg.reply_to_type };
      }
      // Clean up joined fields
      for (const key of ['offer_product_id','offer_product_name','offer_offered_price','offer_list_price','offer_status','offer_negotiation_round','offer_buyer_id','offer_seller_id','offer_expires_at','reply_to_msg_id','reply_to_content','reply_to_sender_id','reply_to_type','reply_to_sender_name']) {
        delete msg[key];
      }
      msg.reactions = []; // will be batch-filled below
      msg.delivery_status = null;
      return msg;
    });
    // Batch-fetch reactions for all messages
    if (messages.length > 0) {
      const msgIds = messages.map(m => m.id);
      const reactionsResult = await pool.query(
        `SELECT mr.message_id, mr.emoji, mr.user_id, u.full_name AS user_name
         FROM message_reactions mr JOIN users u ON u.id = mr.user_id
         WHERE mr.message_id = ANY($1)`,
        [msgIds]
      );
      const reactionsMap = {};
      for (const r of reactionsResult.rows) {
        if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = [];
        reactionsMap[r.message_id].push({ emoji: r.emoji, userId: r.user_id, userName: r.user_name });
      }
      // Batch-fetch delivery states for outgoing messages
      const deliveriesResult = await pool.query(
        `SELECT message_id, status FROM message_deliveries
         WHERE message_id = ANY($1) AND recipient_id = $2`,
        [msgIds, req.user.id]
      );
      const deliveriesMap = {};
      for (const d of deliveriesResult.rows) deliveriesMap[d.message_id] = d.status;
      for (const msg of messages) {
        msg.reactions = reactionsMap[msg.id] || [];
        if (msg.sender_id === req.user.id) msg.delivery_status = deliveriesMap[msg.id] || 'sent';
      }
    }
    let product = null;
    if (conv.rows[0].product_id) {
      const productResult = await pool.query(`SELECT p.id, p.name, p.price, p.stock, (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, display_order ASC LIMIT 1) AS image_url FROM products p WHERE p.id = $1`, [conv.rows[0].product_id]);
      product = productResult.rows[0] || null;
    }
    res.json({ messages, context: { product } });
  } catch (err) {
    console.error('Messages fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send message
router.post('/api/conversations/:id/messages', authRequired, msgLimiter, dobRequired, async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  const { content, imageUrl, messageType, replyToId } = req.body;
  const msgType = messageType || 'text';
  if (!['text', 'image', 'offer'].includes(msgType)) return res.status(400).json({ error: 'Invalid message type' });
  if (msgType === 'image' && !imageUrl) return res.status(400).json({ error: 'Image URL required for image messages' });
  if (msgType === 'text' && (!content || !content.trim())) return res.status(400).json({ error: 'Message content required' });
  if (content && content.length > 5000) return res.status(400).json({ error: 'Message too long (max 5000 characters)' });
  try {
    const conv = await pool.query('SELECT * FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [req.params.id, req.user.id]);
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    // Validate reply_to message exists in same conversation
    let validatedReplyToId = null;
    if (replyToId) {
      const replyMsg = await pool.query('SELECT id FROM messages WHERE id = $1 AND conversation_id = $2', [replyToId, req.params.id]);
      if (replyMsg.rows.length > 0) validatedReplyToId = replyToId;
    }
    const storedContent = msgType === 'image' ? null : content?.trim() || null;
    const result = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, content, message_type, image_url, reply_to_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.id, req.user.id, storedContent, msgType, imageUrl || null, validatedReplyToId]
    );
    // Create delivery record for recipient
    const recipientId = conv.rows[0].buyer_id === req.user.id ? conv.rows[0].seller_id : conv.rows[0].buyer_id;
    await pool.query(
      `INSERT INTO message_deliveries (message_id, recipient_id, status) VALUES ($1, $2, 'sent') ON CONFLICT DO NOTHING`,
      [result.rows[0].id, recipientId]
    );
    await pool.query('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    const senderInfo = (await pool.query('SELECT full_name, avatar_url FROM users WHERE id = $1', [req.user.id])).rows[0];
    const senderName = senderInfo?.full_name || 'Someone';
    const preview = content?.trim() ? (content.trim().length > 80 ? content.trim().substring(0, 80) + '...' : content.trim()) : '\ud83d\udcf7 Photo';
    const notifData = { type: 'new_message', conversationId: req.params.id, senderId: req.user.id, senderName };
    if (senderInfo?.avatar_url) notifData.image = senderInfo.avatar_url;
    createNotification(recipientId, 'new_message', 'New Message', `${senderName}: ${preview}`, notifData);
    res.status(201).json({ message: result.rows[0] });
  } catch (err) {
    console.error('Message send error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Unread count
router.get('/api/conversations/unread-count', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) AS count FROM messages m JOIN conversations c ON m.conversation_id = c.id
       WHERE (c.buyer_id = $1 OR c.seller_id = $1) AND m.sender_id != $1 AND m.is_read = false`,
      [req.user.id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('Unread count error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Conversations with active offers
router.get('/api/conversations/with-offers', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT c.*,
              u.full_name AS other_party_name, u.username AS other_party_username, u.avatar_url AS other_party_avatar,
              u.use_store_identity AS other_party_use_store_identity, u.store_logo_url AS other_party_store_logo_url,
              u.store_name AS other_party_store_name, u.seller_tier AS other_party_seller_tier,
              CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END AS other_party_id,
              mo.message_id AS offer_message_id, mo.offered_price, mo.status AS offer_status,
              mo.negotiation_round, mo.product_id, p.name AS product_name, mo.expires_at AS offer_expires_at
       FROM conversations c
       JOIN users u ON u.id = CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END
       JOIN message_offers mo ON mo.conversation_id = c.id AND mo.status IN ('pending', 'countered')
       JOIN products p ON p.id = mo.product_id
       WHERE (c.buyer_id = $1 OR c.seller_id = $1) ORDER BY mo.expires_at ASC`,
      [req.user.id]
    );
    res.json({ conversations: result.rows });
  } catch (err) {
    console.error('Offer conversations fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Typing indicator
const typingUsers = new Map();
function getTypingKey(convId, userId) { return `${convId}:${userId}`; }

router.post('/api/conversations/:id/typing', authRequired, async (req, res) => {
  const key = getTypingKey(req.params.id, req.user.id);
  typingUsers.set(key, Date.now());
  setTimeout(() => { typingUsers.delete(key); }, 5000);
  res.json({ ok: true });
});

router.get('/api/conversations/:id/typing', authRequired, async (req, res) => {
  try {
    const convResult = await pool.query('SELECT buyer_id, seller_id FROM conversations WHERE id = $1', [req.params.id]);
    if (!convResult.rows.length) return res.json({ typing: false });
    const { buyer_id, seller_id } = convResult.rows[0];
    if (req.user.id !== buyer_id && req.user.id !== seller_id) return res.json({ typing: false });
    const otherUserId = req.user.id === buyer_id ? seller_id : buyer_id;
    const key = getTypingKey(req.params.id, otherUserId);
    const lastTyped = typingUsers.get(key);
    const typing = lastTyped && (Date.now() - lastTyped < 5000);
    res.json({ typing: !!typing });
  } catch (err) {
    console.error('Typing status error:', err);
    res.json({ typing: false });
  }
});

// ───── Message Reactions ─────

router.post('/api/messages/:id/react', authRequired, async (req, res) => {
  const { emoji } = req.body;
  if (!emoji || typeof emoji !== 'string' || emoji.length > 10) return res.status(400).json({ error: 'Valid emoji required' });
  try {
    const msg = await pool.query('SELECT conversation_id FROM messages WHERE id = $1', [req.params.id]);
    if (msg.rows.length === 0) return res.status(404).json({ error: 'Message not found' });
    const conv = await pool.query('SELECT buyer_id, seller_id FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [msg.rows[0].conversation_id, req.user.id]);
    if (conv.rows.length === 0) return res.status(403).json({ error: 'Not a participant' });
    // Toggle: if exists, remove; else, add
    const existing = await pool.query('SELECT id FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3', [req.params.id, req.user.id, emoji]);
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3', [req.params.id, req.user.id, emoji]);
      return res.json({ action: 'removed', emoji });
    }
    await pool.query('INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)', [req.params.id, req.user.id, emoji]);
    res.json({ action: 'added', emoji });
  } catch (err) {
    console.error('Reaction error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Edit / Delete Message ─────

router.put('/api/messages/:id', authRequired, async (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim() || content.length > 5000) return res.status(400).json({ error: 'Valid content required (max 5000 chars)' });
  try {
    const msg = await pool.query('SELECT * FROM messages WHERE id = $1 AND sender_id = $2', [req.params.id, req.user.id]);
    if (msg.rows.length === 0) return res.status(404).json({ error: 'Message not found or not yours' });
    if (msg.rows[0].message_type !== 'text') return res.status(400).json({ error: 'Can only edit text messages' });
    const result = await pool.query(
      'UPDATE messages SET content = $1, is_edited = true, edited_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [content.trim(), req.params.id]
    );
    res.json({ message: result.rows[0] });
  } catch (err) {
    console.error('Message edit error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/messages/:id', authRequired, async (req, res) => {
  try {
    const msg = await pool.query('SELECT * FROM messages WHERE id = $1 AND sender_id = $2', [req.params.id, req.user.id]);
    if (msg.rows.length === 0) return res.status(404).json({ error: 'Message not found or not yours' });
    await pool.query('UPDATE messages SET is_deleted = true, content = NULL, image_url = NULL WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error('Message delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Conversation Pin / Mute / Block ─────

router.put('/api/conversations/:id/pin', authRequired, async (req, res) => {
  try {
    const conv = await pool.query('SELECT * FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [req.params.id, req.user.id]);
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    const newPinned = !conv.rows[0].is_pinned;
    await pool.query('UPDATE conversations SET is_pinned = $1 WHERE id = $2', [newPinned, req.params.id]);
    res.json({ pinned: newPinned });
  } catch (err) {
    console.error('Pin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/api/conversations/:id/mute', authRequired, async (req, res) => {
  const { hours } = req.body;
  try {
    const conv = await pool.query('SELECT * FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [req.params.id, req.user.id]);
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    if (hours === 0 || hours === null) {
      await pool.query('UPDATE conversations SET muted_until = NULL WHERE id = $1', [req.params.id]);
      return res.json({ muted: false });
    }
    const mutedUntil = new Date(Date.now() + (hours || 8) * 3600 * 1000);
    await pool.query('UPDATE conversations SET muted_until = $1 WHERE id = $2', [mutedUntil, req.params.id]);
    res.json({ muted: true, mutedUntil });
  } catch (err) {
    console.error('Mute error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/users/:id/block', authRequired, async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot block yourself' });
  try {
    const existing = await pool.query('SELECT id FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2', [req.user.id, req.params.id]);
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2', [req.user.id, req.params.id]);
      return res.json({ blocked: false });
    }
    await pool.query('INSERT INTO blocked_users (blocker_id, blocked_id) VALUES ($1, $2)', [req.user.id, req.params.id]);
    res.json({ blocked: true });
  } catch (err) {
    console.error('Block error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Mark Messages Delivered / Read ─────

router.put('/api/conversations/:id/read', authRequired, async (req, res) => {
  try {
    const conv = await pool.query('SELECT buyer_id, seller_id FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [req.params.id, req.user.id]);
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    // Mark all unread incoming messages as read
    const result = await pool.query(
      `UPDATE messages SET is_read = true
       WHERE conversation_id = $1 AND sender_id != $2 AND is_read = false
       RETURNING id`,
      [req.params.id, req.user.id]
    );
    // Update delivery states
    if (result.rows.length > 0) {
      const ids = result.rows.map(r => r.id);
      await pool.query(
        `UPDATE message_deliveries SET status = 'read', read_at = CURRENT_TIMESTAMP
         WHERE message_id = ANY($1) AND recipient_id = $2 AND status != 'read'`,
        [ids, req.user.id]
      );
    }
    res.json({ marked: result.rows.length });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
