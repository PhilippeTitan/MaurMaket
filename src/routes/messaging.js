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
              latest.last_message,
              COUNT(unread.id)::INTEGER AS unread_count
       FROM conversations c
       JOIN users u ON u.id = CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END
       LEFT JOIN LATERAL (
         SELECT CASE WHEN message_type = 'image' THEN 'Photo' WHEN message_type = 'offer' THEN 'Offer' ELSE content END AS last_message,
              (SELECT message_type FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message_type
         FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1
       ) latest ON true
       LEFT JOIN messages unread ON unread.conversation_id = c.id AND unread.sender_id != $1 AND unread.is_read = false
       WHERE c.buyer_id = $1 OR c.seller_id = $1
       GROUP BY c.id, u.id, latest.last_message ORDER BY c.last_message_at DESC`,
      [req.user.id]
    );
    res.json({ conversations: result.rows });
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
       p.name AS offer_product_name
       FROM messages m JOIN users u ON m.sender_id = u.id
       LEFT JOIN message_offers mo ON mo.message_id = m.id
       LEFT JOIN products p ON p.id = mo.product_id
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
      delete msg.offer_product_id; delete msg.offer_product_name; delete msg.offer_offered_price; delete msg.offer_list_price;
      delete msg.offer_status; delete msg.offer_negotiation_round; delete msg.offer_buyer_id; delete msg.offer_seller_id; delete msg.offer_expires_at;
      return msg;
    });
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
  const { content, imageUrl, messageType } = req.body;
  const msgType = messageType || 'text';
  if (!['text', 'image', 'offer'].includes(msgType)) return res.status(400).json({ error: 'Invalid message type' });
  if (msgType === 'image' && !imageUrl) return res.status(400).json({ error: 'Image URL required for image messages' });
  if (msgType === 'text' && (!content || !content.trim())) return res.status(400).json({ error: 'Message content required' });
  if (content && content.length > 5000) return res.status(400).json({ error: 'Message too long (max 5000 characters)' });
  try {
    const conv = await pool.query('SELECT * FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [req.params.id, req.user.id]);
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    const storedContent = msgType === 'image' ? null : content?.trim() || null;
    const result = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, content, message_type, image_url) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.id, req.user.id, storedContent, msgType, imageUrl || null]
    );
    await pool.query('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    const recipientId = conv.rows[0].buyer_id === req.user.id ? conv.rows[0].seller_id : conv.rows[0].buyer_id;
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

export default router;
