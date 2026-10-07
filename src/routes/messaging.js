import { Router } from 'express';
import { pool } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';
import { msgLimiter, convLimiter, previewLimiter } from '../middleware/rateLimit.js';
import dns from 'node:dns/promises';
import { dobRequired } from '../middleware/auth.js';
import { sendPushNotification } from '../utils/notifications.js';
import { emitToUsers } from '../realtime.js';
import { touchPresence, markConversationActive, isConversationOpen, isOnline, lastSeen } from '../utils/chatActivity.js';
import { staysInInbox, normalizeMarkUnread, inboxUnreadTotal } from '../utils/conversationListPolicy.js';
import { normalizeSearchQuery, MESSAGE_SEARCH_LIMIT } from '../utils/messageSearchPolicy.js';
import { bookmarkableMessage, bookmarkExcerpt, bookmarkPageSize } from '../utils/messageBookmarkPolicy.js';

const router = Router();

// ───── Presence (WhatsApp-style Online / Last seen) ─────
// In-memory, single-instance. A user is "online" while messaging endpoints are being hit
// (ChatScreen polls every 5s while open, InboxScreen on focus) — mirrors WhatsApp semantics
// of "app/chat open on their device".
router.get('/api/users/:id/presence', authRequired, async (req, res) => {
  try {
  const target = await pool.query('SELECT presence_visibility FROM users WHERE id = $1', [req.params.id]);
  if (!target.rows.length) return res.status(404).json({ error: 'User not found' });
  const visibility = target.rows[0].presence_visibility || 'chatted_with';
  const viewer = await pool.query('SELECT presence_visibility FROM users WHERE id = $1', [req.user.id]);
  const hasChatted = visibility === 'chatted_with' ? await pool.query(
    'SELECT 1 FROM conversations WHERE (buyer_id = $1 AND seller_id = $2) OR (buyer_id = $2 AND seller_id = $1) LIMIT 1',
    [req.user.id, req.params.id]
  ) : { rows: [] };
  const visible = req.user.id !== req.params.id && viewer.rows[0]?.presence_visibility !== 'nobody' &&
    (visibility === 'everyone' || (visibility === 'chatted_with' && hasChatted.rows.length > 0));
  if (!visible) return res.json({ online: false, lastSeen: null, hidden: true });
  const lastSeenMs = lastSeen(req.params.id);
  res.json({
    online: isOnline(req.params.id),
    lastSeen: lastSeenMs ? new Date(lastSeenMs).toISOString() : null,
  });
  } catch (err) {
    console.error('Presence privacy error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/users/me/presence-visibility', authRequired, async (req, res) => {
  try {
    const result = await pool.query('SELECT presence_visibility FROM users WHERE id = $1', [req.user.id]);
    res.json({ visibility: result.rows[0]?.presence_visibility || 'chatted_with' });
  } catch (err) { console.error('Presence setting fetch error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.put('/api/users/me/presence-visibility', authRequired, async (req, res) => {
  const { visibility } = req.body;
  if (!['everyone', 'chatted_with', 'nobody'].includes(visibility)) return res.status(400).json({ error: 'Invalid presence visibility' });
  try {
    await pool.query('UPDATE users SET presence_visibility = $1 WHERE id = $2', [visibility, req.user.id]);
    res.json({ visibility });
  } catch (err) { console.error('Presence setting update error:', err); res.status(500).json({ error: 'Server error' }); }
});

// Conversations list
router.get('/api/conversations', authRequired, async (req, res) => {
  touchPresence(req.user.id);
  try {
    const result = await pool.query(
      `SELECT c.*,
              CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END AS other_party_id,
              u.full_name AS other_party_name, u.username AS other_party_username, u.avatar_url AS other_party_avatar, u.store_name AS other_party_store_name,
              u.use_store_identity AS other_party_use_store_identity, u.store_logo_url AS other_party_store_logo_url, u.seller_tier AS other_party_seller_tier,
              latest.last_message, latest.last_message_type,
              COUNT(unread.id)::INTEGER AS unread_count,
              -- Check for active pending offers
              EXISTS (
                SELECT 1 FROM message_offers mo
                JOIN messages om ON om.id = mo.message_id
                WHERE om.conversation_id = c.id AND mo.status IN ('pending', 'countered') AND mo.expires_at > NOW()
              ) AS has_active_offer,
              (COALESCE(cus.is_muted, false) AND (cus.muted_until IS NULL OR cus.muted_until > NOW())) AS is_muted,
              COALESCE(cus.is_pinned, false) AS is_pinned,
              COALESCE(cus.is_archived, false) AS is_archived,
              COALESCE(cus.marked_unread, false) AS marked_unread,
              o.status AS order_status,
              oi.product_name AS order_product_name
       FROM conversations c
       JOIN users u ON u.id = CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END
       LEFT JOIN LATERAL (
         SELECT CASE WHEN message_type = 'image' THEN 'Photo' WHEN message_type = 'offer' THEN 'Offer' WHEN message_type = 'product' THEN 'Product shared' WHEN message_type = 'audio' THEN 'Voice message' ELSE content END AS last_message,
              (SELECT message_type FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message_type
         FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1
       ) latest ON true
       LEFT JOIN messages unread ON unread.conversation_id = c.id AND unread.sender_id != $1 AND unread.is_read = false
       LEFT JOIN conversation_user_settings cus ON cus.conversation_id = c.id AND cus.user_id = $1
       LEFT JOIN orders o ON o.id = c.order_id
       LEFT JOIN LATERAL (SELECT p.name AS product_name FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = c.order_id ORDER BY oi.id LIMIT 1) oi ON true
       WHERE (c.buyer_id = $1 OR c.seller_id = $1)
       GROUP BY c.id, u.id, latest.last_message, latest.last_message_type, cus.is_pinned, cus.is_muted, cus.muted_until, cus.is_archived, cus.marked_unread, o.status, oi.product_name
       ORDER BY COALESCE(cus.is_pinned, false) DESC, c.last_message_at DESC`,
      [req.user.id]
    );
    // Split into sections. An archived chat leaves the Inbox, but a live offer is
    // time-sensitive and is never filed away with it — that is the single rule in
    // conversationListPolicy.staysInInbox, shared with the client filter.
    const pinned = [];
    const active = [];
    const offers = [];
    const archived = [];
    for (const conv of result.rows) {
      if (!staysInInbox({ isArchived: conv.is_archived, hasActiveOffer: conv.has_active_offer })) archived.push(conv);
      else if (conv.has_active_offer) offers.push(conv);
      else if (conv.is_pinned) pinned.push(conv);
      else active.push(conv);
    }
    res.json({ conversations: result.rows, pinned, active, offers, archived });
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
  let sellerId;
  let buyerId = req.user.id;
  try {
    await client.query('BEGIN');
    if (orderId) {
      const o = await client.query('SELECT buyer_id FROM orders WHERE id = $1', [orderId]);
      if (o.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found' }); }
      const items = await client.query('SELECT DISTINCT seller_id FROM order_items WHERE order_id = $1', [orderId]);
      buyerId = o.rows[0].buyer_id;
      const sellerIds = items.rows.map(item => item.seller_id);
      if (req.user.id !== buyerId && !sellerIds.includes(req.user.id)) {
        await client.query('ROLLBACK'); return res.status(403).json({ error: 'Not a participant in this order' });
      }
      if (req.user.id === buyerId) {
        sellerId = directSellerId || (sellerIds.length === 1 ? sellerIds[0] : null);
        if (!sellerId || !sellerIds.includes(sellerId)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Choose a seller from this order' }); }
      } else {
        sellerId = req.user.id;
      }
      if (productId) {
        const p = await client.query('SELECT seller_id FROM products WHERE id = $1', [productId]);
        if (!p.rows.length || p.rows[0].seller_id !== sellerId) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Product is not part of this seller conversation' }); }
      }
    } else if (productId) {
      const p = await client.query('SELECT seller_id FROM products WHERE id = $1', [productId]);
      if (p.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Product not found' }); }
      if (directSellerId && directSellerId !== p.rows[0].seller_id) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Product does not belong to this seller' }); }
      sellerId = p.rows[0].seller_id;
    } else if (directSellerId) {
      const peer = await client.query('SELECT id FROM users WHERE id = $1', [directSellerId]);
      if (!peer.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'User not found' }); }
      sellerId = directSellerId;
    } else {
      await client.query('ROLLBACK'); return res.status(400).json({ error: 'A conversation participant is required' });
    }
    if (buyerId === sellerId) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Cannot message yourself' }); }
    // Check if blocked
    const blocked = await client.query(
      'SELECT id FROM blocked_users WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1',
      [buyerId, sellerId]
    );
    if (blocked.rows.length > 0) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Cannot message this user' }); }
    const [pairA, pairB] = [buyerId, sellerId].sort();
    // Serialize conversation creation for this participant pair so concurrent
    // first messages cannot create duplicate general threads.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))", [pairA, pairB]);
    const existing = await client.query(
      `SELECT id FROM conversations WHERE ((buyer_id = $1 AND seller_id = $2) OR (buyer_id = $2 AND seller_id = $1)) AND (($3::uuid IS NULL AND order_id IS NULL) OR order_id = $3) FOR SHARE`,
      [buyerId, sellerId, orderId || null]
    );
    if (existing.rows.length > 0) { await client.query('COMMIT'); return res.json({ conversationId: existing.rows[0].id }); }
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
        [orderId, buyerId, sellerId]
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
    touchPresence(req.user.id);
    markConversationActive(req.user.id, req.params.id);
    // Flip 'sent' → 'delivered': recipient's client fetched these messages (WhatsApp 2nd gray tick)
    await pool.query(
      `UPDATE message_deliveries md SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP
       WHERE md.recipient_id = $1 AND md.status = 'sent'
         AND md.message_id IN (SELECT id FROM messages WHERE conversation_id = $2 AND sender_id <> $1)`,
      [req.user.id, req.params.id]
    );
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
       mo.quantity AS offer_quantity, mo.counter_count AS offer_counter_count,
       mo.negotiation_id AS offer_negotiation_id, mo.accepted_expires_at AS offer_accepted_expires_at,
       (mo.accepted_checkout_id IS NOT NULL) AS offer_is_in_checkout,
       mo.buyer_id AS offer_buyer_id, mo.seller_id AS offer_seller_id, mo.expires_at AS offer_expires_at,
       p.stock AS offer_current_stock, p.is_available AS offer_product_available,
       live_product.available AS live_product_available, live_product.stock AS live_product_stock,
       p.name AS offer_product_name,
       (SELECT image_url FROM product_images WHERE product_id = mo.product_id ORDER BY is_primary DESC, display_order ASC LIMIT 1) AS offer_product_image,
       -- Reply context
       rm.id AS reply_to_msg_id, rm.content AS reply_to_content, rm.sender_id AS reply_to_sender_id,
       rm.message_type AS reply_to_type,
       ru.full_name AS reply_to_sender_name,
       (mb.message_id IS NOT NULL) AS bookmarked
       FROM messages m JOIN users u ON m.sender_id = u.id
       LEFT JOIN message_bookmarks mb ON mb.message_id = m.id AND mb.user_id = $2
       LEFT JOIN message_offers mo ON mo.message_id = m.id
       LEFT JOIN products p ON p.id = mo.product_id
       LEFT JOIN messages rm ON rm.id = m.reply_to_id
       LEFT JOIN users ru ON ru.id = rm.sender_id
       LEFT JOIN LATERAL (SELECT is_available AND stock > 0 AS available, stock FROM products WHERE id = (m.product_data->>'productId')::uuid) live_product ON m.message_type = 'product'
       WHERE m.conversation_id = $1`;
    // $2 is the caller, used only for their own private bookmark flag.
    const params = [req.params.id, req.user.id];
    if (since) {
      params.push(since);
      if (sinceId) { params.push(sinceId); query += ` AND (m.created_at > $${params.length - 1} OR (m.created_at = $${params.length - 1} AND m.id > $${params.length}))`; }
      else { query += ` AND m.created_at > $${params.length}`; }
      query += ` ORDER BY m.created_at ASC, m.id ASC LIMIT $${params.length + 1}`;
      params.push(limit);
    } else {
      query = `SELECT * FROM (${query} ORDER BY m.created_at DESC, m.id DESC LIMIT $3 OFFSET $4) recent ORDER BY created_at ASC, id ASC`;
      params.push(limit, offset);
    }
    const result = await pool.query(query, params);
    const messages = result.rows.map(row => {
      const msg = { ...row };
      if (msg.offer_product_id) {
        msg.offer_data = { productId: msg.offer_product_id, productName: msg.offer_product_name, productImage: msg.offer_product_image, offeredPrice: parseFloat(msg.offer_offered_price), listPrice: parseFloat(msg.offer_list_price), quantity: Number(msg.offer_quantity || 1), status: msg.offer_status, negotiationRound: msg.offer_negotiation_round || 1, counterCount: Number(msg.offer_counter_count || 0), negotiationId: msg.offer_negotiation_id, buyerId: msg.offer_buyer_id, sellerId: msg.offer_seller_id, senderId: msg.sender_id, expiresAt: msg.offer_expires_at, acceptedExpiresAt: msg.offer_accepted_expires_at, isInCheckout: !!msg.offer_is_in_checkout, currentStock: Number(msg.offer_current_stock || 0), productAvailable: !!msg.offer_product_available };
      }
      if (msg.message_type === 'product' && msg.product_data) {
        msg.product_data = { ...msg.product_data, currentlyAvailable: !!msg.live_product_available, currentStock: Number(msg.live_product_stock || 0) };
      }
      // Reply context
      if (msg.reply_to_msg_id) {
        msg.reply_to = { id: msg.reply_to_msg_id, content: msg.reply_to_content, senderId: msg.reply_to_sender_id, senderName: msg.reply_to_sender_name, type: msg.reply_to_type };
      }
      // Clean up joined fields
      for (const key of ['offer_product_id','offer_product_name','offer_product_image','offer_offered_price','offer_list_price','offer_quantity','offer_status','offer_negotiation_round','offer_counter_count','offer_negotiation_id','offer_buyer_id','offer_seller_id','offer_expires_at','offer_accepted_expires_at','offer_is_in_checkout','offer_current_stock','offer_product_available','live_product_available','live_product_stock','reply_to_msg_id','reply_to_content','reply_to_sender_id','reply_to_type','reply_to_sender_name']) {
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
    const [mySettings, blocks] = await Promise.all([
      pool.query('SELECT is_pinned, is_muted, muted_until, is_archived FROM conversation_user_settings WHERE conversation_id = $1 AND user_id = $2', [req.params.id, req.user.id]),
      pool.query('SELECT blocker_id, blocked_id FROM blocked_users WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)', [req.user.id, conv.rows[0].buyer_id === req.user.id ? conv.rows[0].seller_id : conv.rows[0].buyer_id]),
    ]);
    const otherId = conv.rows[0].buyer_id === req.user.id ? conv.rows[0].seller_id : conv.rows[0].buyer_id;
    // Read receipts (Inbox/Messaging decisions): the other participant may have
    // turned them off. Then nothing in this response may reveal that they read
    // these messages — the ticks stay at "delivered" and the `is_read` flag on my
    // own outgoing rows is not theirs to see either. This is the mask that also
    // covers receipts sent before they switched the preference off.
    const otherPrefs = await pool.query('SELECT read_receipts_enabled FROM users WHERE id = $1', [otherId]);
    const otherReceiptsOff = otherPrefs.rows[0]?.read_receipts_enabled === false;
    if (otherReceiptsOff) {
      for (const msg of messages) {
        if (msg.sender_id !== req.user.id) continue;
        if (msg.delivery_status === 'read') msg.delivery_status = 'delivered';
        msg.is_read = false;
      }
    }
    res.json({ messages, context: {
      product,
      order: conv.rows[0].order_id ? { id: conv.rows[0].order_id } : null,
      readReceiptsOff: otherReceiptsOff,
      isPinned: !!mySettings.rows[0]?.is_pinned,
      isArchived: !!mySettings.rows[0]?.is_archived,
      isMuted: !!mySettings.rows[0]?.is_muted && (!mySettings.rows[0]?.muted_until || new Date(mySettings.rows[0].muted_until) > new Date()),
      mutedUntil: mySettings.rows[0]?.muted_until || null,
      blockedByMe: blocks.rows.some(b => b.blocker_id === req.user.id),
      blockedByOther: blocks.rows.some(b => b.blocker_id === otherId),
      myRole: conv.rows[0].seller_id === req.user.id ? 'seller' : 'buyer',
    } });
  } catch (err) {
    console.error('Messages fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Search inside one conversation. Scoped to a participant, and matched as a plain
// substring — never a LIKE pattern — so a query of "%" searches for a literal "%"
// instead of dumping the whole thread. See src/utils/messageSearchPolicy.js.
router.get('/api/conversations/:id/messages/search', authRequired, async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  const { term, valid } = normalizeSearchQuery(req.query.q);
  try {
    const conv = await pool.query('SELECT id FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [req.params.id, req.user.id]);
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    // A query that is still being typed is not an error and must never fall back
    // to "match everything" — it simply has no matches yet.
    if (!valid) return res.json({ query: term, results: [], truncated: false, limit: MESSAGE_SEARCH_LIMIT });
    const requested = parseInt(req.query.limit);
    const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : MESSAGE_SEARCH_LIMIT, 1), MESSAGE_SEARCH_LIMIT);
    // One row beyond the limit tells us whether more matches exist, so the client
    // can say "showing the first N" honestly instead of implying it found them all.
    const rows = await pool.query(
      `SELECT m.id, m.content, m.created_at, m.sender_id, m.message_type, u.full_name AS sender_name,
              (mb.message_id IS NOT NULL) AS bookmarked
       FROM messages m JOIN users u ON u.id = m.sender_id
       LEFT JOIN message_bookmarks mb ON mb.message_id = m.id AND mb.user_id = $4
       WHERE m.conversation_id = $1
         AND m.is_deleted = false
         AND m.content IS NOT NULL
         AND strpos(lower(m.content), lower($2)) > 0
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $3`,
      [req.params.id, term, limit + 1, req.user.id]
    );
    const truncated = rows.rows.length > limit;
    const results = rows.rows.slice(0, limit).map(row => ({
      id: row.id,
      conversation_id: req.params.id,
      sender_id: row.sender_id,
      sender_name: row.sender_name,
      content: row.content,
      message_type: row.message_type,
      created_at: row.created_at,
      is_own: row.sender_id === req.user.id,
      bookmarked: !!row.bookmarked,
    }));
    res.json({ query: term, results, truncated, limit });
  } catch (err) {
    console.error('Message search error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Shared media (all photos in a conversation)
router.get('/api/conversations/:id/media', authRequired, async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  try {
    const conv = await pool.query('SELECT id FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [req.params.id, req.user.id]);
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    const result = await pool.query(
      `SELECT id, sender_id, image_url, created_at FROM messages
       WHERE conversation_id = $1 AND message_type = 'image' AND image_url IS NOT NULL AND is_deleted = false
       ORDER BY created_at DESC LIMIT 300`,
      [req.params.id]
    );
    res.json({ media: result.rows });
  } catch (err) {
    console.error('Conversation media error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Link previews (WhatsApp-style OG metadata) ─────
const previewCache = new Map(); // url -> { data: preview|null, exp: number }
const PREVIEW_TTL = 10 * 60 * 1000;

function isPrivateIp(ip) {
  const h = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (h.includes(':')) {
    return h === '::1' || h === '::' || h === '::ffff:127.0.0.1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd');
  }
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return true; // unparseable → treat as private
  const a = +m[1], b = +m[2];
  if (a === 127 || a === 0 || a === 10 || a > 223) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function isBlockedHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h.includes(':')) return isPrivateIp(h);
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return isPrivateIp(h);
  return false;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ');
}

function getMeta(html, names) {
  for (const name of names) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let m = html.match(new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${esc}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, 'i'));
    if (!m) m = html.match(new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${esc}["']`, 'i'));
    if (m && m[1] && m[1].trim()) return decodeEntities(m[1].trim());
  }
  return null;
}

router.get('/api/link-preview', authRequired, previewLimiter, async (req, res) => {
  const raw = String(req.query.url || '').trim();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  if (isBlockedHost(parsed.hostname)) {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  // DNS check — reject if the host resolves to a private address
  try {
    const addrs = await dns.lookup(parsed.hostname, { all: true });
    if (addrs.some(a => isPrivateIp(a.address))) {
      return res.status(400).json({ error: 'Invalid URL' });
    }
  } catch {
    return res.json({ preview: null });
  }

  const cached = previewCache.get(raw);
  if (cached && cached.exp > Date.now()) return res.json({ preview: cached.data });

  let preview = null;
  try {
    const response = await fetch(raw, {
      signal: AbortSignal.timeout(6000),
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MaurMaket/1.0; link-preview)', 'Accept': 'text/html,application/xhtml+xml' },
    });
    if (response.ok) {
      const ctype = response.headers.get('content-type') || '';
      if (ctype.includes('html') || ctype.includes('xhtml') || !ctype) {
        const buf = await response.arrayBuffer();
        const html = new TextDecoder('utf-8').decode(new Uint8Array(buf.slice(0, 1024 * 1024)));
        const title = getMeta(html, ['og:title', 'twitter:title']) ||
          (html.match(/<title[^>]*>([^<]+)<\/title>/i) ? decodeEntities(html.match(/<title[^>]*>([^<]+)<\/title>/i)[1].trim()) : null);
        const description = getMeta(html, ['og:description', 'twitter:description', 'description']);
        const siteName = getMeta(html, ['og:site_name', 'application-name']);
        let image = getMeta(html, ['og:image', 'og:image:url', 'twitter:image']);
        if (image) {
          try { image = new URL(image, response.url || raw).toString(); } catch { image = null; }
        }
        if (title || description || image) {
          preview = {
            url: response.url || raw,
            title: title ? title.slice(0, 200) : null,
            description: description ? description.slice(0, 300) : null,
            image: image ? image.slice(0, 2000) : null,
            siteName: siteName ? siteName.slice(0, 80) : null,
          };
        }
      }
    }
  } catch {
    preview = null;
  }

  previewCache.set(raw, { data: preview, exp: Date.now() + PREVIEW_TTL });
  if (previewCache.size > 300) {
    const oldest = previewCache.keys().next().value;
    previewCache.delete(oldest);
  }
  res.json({ preview });
});

// Send message
router.post('/api/conversations/:id/messages', authRequired, msgLimiter, dobRequired, async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  const { content, imageUrl, messageType, replyToId, clientId, audioUrl, audioDuration } = req.body;
  const msgType = messageType || 'text';
  if (!['text', 'image', 'audio'].includes(msgType)) return res.status(400).json({ error: 'Invalid message type' });
  if (msgType === 'image' && !imageUrl) return res.status(400).json({ error: 'Image URL required for image messages' });
  if (msgType === 'audio' && !audioUrl) return res.status(400).json({ error: 'Audio URL required for voice messages' });
  if (msgType === 'text' && (!content || !content.trim())) return res.status(400).json({ error: 'Message content required' });
  if (content && content.length > 5000) return res.status(400).json({ error: 'Message too long (max 5000 characters)' });
  const audioDur = msgType === 'audio'
    ? (Number.isFinite(Number(audioDuration)) && Number(audioDuration) > 0 ? Math.min(600, Math.max(1, Math.round(Number(audioDuration)))) : 1)
    : null;
  try {
    const conv = await pool.query('SELECT * FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [req.params.id, req.user.id]);
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    const recipientId = conv.rows[0].buyer_id === req.user.id ? conv.rows[0].seller_id : conv.rows[0].buyer_id;
    const blocked = await pool.query('SELECT 1 FROM blocked_users WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1', [req.user.id, recipientId]);
    if (blocked.rows.length) return res.status(403).json({ error: 'Messaging is unavailable because one participant blocked the other', code: 'USER_BLOCKED' });
    touchPresence(req.user.id);
    // Idempotent retry: if this client already sent this message (outbox flush after reconnect),
    // return the stored row instead of duplicating — WhatsApp's key_id dedupe pattern.
    const validClientId = typeof clientId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId) ? clientId : null;
    if (validClientId) {
      const dup = await pool.query('SELECT * FROM messages WHERE conversation_id = $1 AND sender_id = $2 AND client_id = $3', [req.params.id, req.user.id, validClientId]);
      if (dup.rows.length > 0) return res.status(200).json({ message: dup.rows[0], deduped: true });
    }
    // Validate reply_to message exists in same conversation
    let validatedReplyToId = null;
    if (replyToId) {
      const replyMsg = await pool.query('SELECT id FROM messages WHERE id = $1 AND conversation_id = $2', [replyToId, req.params.id]);
      if (replyMsg.rows.length > 0) validatedReplyToId = replyToId;
    }
    const storedContent = (msgType === 'image' || msgType === 'audio') ? null : content?.trim() || null;
    const result = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, content, message_type, image_url, reply_to_id, client_id, audio_url, audio_duration) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.params.id, req.user.id, storedContent, msgType, imageUrl || null, validatedReplyToId, validClientId, msgType === 'audio' ? audioUrl : null, audioDur]
    );
    // Create delivery record for recipient
    await pool.query(
      `INSERT INTO message_deliveries (message_id, recipient_id, status) VALUES ($1, $2, 'sent') ON CONFLICT DO NOTHING`,
      [result.rows[0].id, recipientId]
    );
    // A new message must never sit buried: lift the recipient's archive and their
    // own mark-unread reminder. Only the recipient's row is touched, and only when
    // there is actually something to clear.
    await pool.query(
      `UPDATE conversation_user_settings SET is_archived = false, marked_unread = false, updated_at = CURRENT_TIMESTAMP
       WHERE conversation_id = $1 AND user_id = $2 AND (is_archived OR marked_unread)`,
      [req.params.id, recipientId]
    );
    await pool.query('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    const senderInfo = (await pool.query('SELECT full_name, avatar_url FROM users WHERE id = $1', [req.user.id])).rows[0];
    const senderName = senderInfo?.full_name || 'Someone';
    const preview = content?.trim() ? (content.trim().length > 80 ? content.trim().substring(0, 80) + '...' : content.trim()) : (msgType === 'audio' ? 'Voice message' : 'Photo');
    const notifData = { type: 'new_message', conversationId: req.params.id, senderId: req.user.id, senderName };
    if (senderInfo?.avatar_url) notifData.image = senderInfo.avatar_url;
    const recipientSettings = await pool.query('SELECT is_muted, muted_until FROM conversation_user_settings WHERE conversation_id = $1 AND user_id = $2', [req.params.id, recipientId]);
    const isMuted = !!recipientSettings.rows[0]?.is_muted && (!recipientSettings.rows[0]?.muted_until || new Date(recipientSettings.rows[0].muted_until) > new Date());
    // Keep chat unread state in the Inbox. A push alert is still sent when
    // appropriate, but ordinary messages should not inflate the bell count.
    if (!isConversationOpen(recipientId, req.params.id) && !isMuted) sendPushNotification(recipientId, 'New Message', `${senderName}: ${preview}`, notifData);
    // Realtime: push to both participants instantly (clients dedupe by id / client_id)
    let reply_to;
    if (validatedReplyToId) {
      const rt = await pool.query(
        `SELECT rm.id, rm.content, rm.sender_id, rm.message_type, ru.full_name
         FROM messages rm JOIN users ru ON ru.id = rm.sender_id WHERE rm.id = $1`,
        [validatedReplyToId]
      );
      if (rt.rows[0]) {
        reply_to = { id: rt.rows[0].id, content: rt.rows[0].content, senderId: rt.rows[0].sender_id, senderName: rt.rows[0].full_name, type: rt.rows[0].message_type };
      }
    }
    emitToUsers([req.user.id, recipientId], {
      type: 'message_new',
      conversationId: req.params.id,
      message: { ...result.rows[0], reply_to, reactions: [], delivery_status: 'sent' },
    });
    res.status(201).json({ message: result.rows[0] });
  } catch (err) {
    // Concurrent retry with the same clientId — unique index caught it; return the winner's row
    if (err.code === '23505' && typeof req.body.clientId === 'string') {
      try {
        const dup = await pool.query('SELECT * FROM messages WHERE conversation_id = $1 AND sender_id = $2 AND client_id = $3', [req.params.id, req.user.id, req.body.clientId]);
        if (dup.rows.length > 0) return res.status(200).json({ message: dup.rows[0], deduped: true });
      } catch { /* fall through */ }
    }
    console.error('Message send error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Share a live marketplace listing with an immutable snapshot of what was discussed.
router.post('/api/conversations/:id/products', authRequired, msgLimiter, dobRequired, async (req, res) => {
  const { productId } = req.body;
  if (!productId) return res.status(400).json({ error: 'productId is required' });
  try {
    const conv = await pool.query('SELECT * FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [req.params.id, req.user.id]);
    if (!conv.rows.length) return res.status(404).json({ error: 'Conversation not found' });
    const conversation = conv.rows[0];
    const otherId = conversation.buyer_id === req.user.id ? conversation.seller_id : conversation.buyer_id;
    const blocked = await pool.query('SELECT 1 FROM blocked_users WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1', [req.user.id, otherId]);
    if (blocked.rows.length) return res.status(403).json({ error: 'Messaging is unavailable because one participant blocked the other', code: 'USER_BLOCKED' });
    const result = await pool.query(
      `SELECT p.id, p.seller_id, p.name, p.description, p.price, p.sale_price, p.sale_starts_at, p.sale_ends_at, p.stock, p.is_available,
        (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, display_order ASC LIMIT 1) AS image_url
       FROM products p WHERE p.id = $1`, [productId]
    );
    const p = result.rows[0];
    if (!p || p.seller_id !== otherId && p.seller_id !== req.user.id) return res.status(404).json({ error: 'Listing not found' });
    const saleActive = p.sale_price && (!p.sale_starts_at || new Date(p.sale_starts_at) <= new Date()) && (!p.sale_ends_at || new Date(p.sale_ends_at) >= new Date());
    const productData = {
      productId: p.id, sellerId: p.seller_id, name: p.name, description: p.description,
      price: Number(saleActive ? p.sale_price : p.price), listPrice: Number(p.price), imageUrl: p.image_url,
      sharedAt: new Date().toISOString(), availableAtShare: !!p.is_available && Number(p.stock) > 0,
    };
    const message = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, content, message_type, product_data)
       VALUES ($1, $2, NULL, 'product', $3::jsonb) RETURNING *`,
      [req.params.id, req.user.id, JSON.stringify(productData)]
    );
    await pool.query('INSERT INTO message_deliveries (message_id, recipient_id, status) VALUES ($1, $2, \'sent\') ON CONFLICT DO NOTHING', [message.rows[0].id, otherId]);
    await pool.query('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    const senderName = (await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id])).rows[0]?.full_name || 'Someone';
    const recipientSettings = await pool.query('SELECT is_muted, muted_until FROM conversation_user_settings WHERE conversation_id = $1 AND user_id = $2', [req.params.id, otherId]);
    const isMuted = !!recipientSettings.rows[0]?.is_muted && (!recipientSettings.rows[0]?.muted_until || new Date(recipientSettings.rows[0].muted_until) > new Date());
    if (!isConversationOpen(otherId, req.params.id) && !isMuted) sendPushNotification(otherId, 'Listing shared', `${senderName} shared ${p.name}`, { type: 'new_message', conversationId: req.params.id, senderId: req.user.id, senderName });
    const payload = { ...message.rows[0], product_data: productData, delivery_status: 'sent', reactions: [] };
    emitToUsers([req.user.id, otherId], { type: 'message_new', conversationId: req.params.id, message: payload });
    res.status(201).json({ message: payload });
  } catch (err) {
    console.error('Product share error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Unread count
router.get('/api/conversations/unread-count', authRequired, async (req, res) => {
  try {
    // Real unread messages plus the chats this user flagged as reminders — one
    // number, so the tab badge and the list it opens can never disagree.
    const [unreadMessages, markedConversations] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS count FROM messages m JOIN conversations c ON m.conversation_id = c.id
         WHERE (c.buyer_id = $1 OR c.seller_id = $1) AND m.sender_id != $1 AND m.is_read = false`,
        [req.user.id]
      ),
      pool.query(
        `SELECT COUNT(*) AS count FROM conversation_user_settings cus JOIN conversations c ON c.id = cus.conversation_id
         WHERE cus.user_id = $1 AND cus.marked_unread = true AND (c.buyer_id = $1 OR c.seller_id = $1)`,
        [req.user.id]
      ),
    ]);
    res.json({ count: inboxUnreadTotal({
      unreadMessages: parseInt(unreadMessages.rows[0].count),
      markedConversations: parseInt(markedConversations.rows[0].count),
    }) });
  } catch (err) {
    console.error('Unread count error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Conversations with active offers
router.get('/api/conversations/with-offers', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `WITH latest_offer AS (
         SELECT mo.*, m.sender_id, m.is_read,
           ROW_NUMBER() OVER (PARTITION BY mo.negotiation_id ORDER BY mo.created_at DESC, m.id DESC) AS rn
         FROM message_offers mo JOIN messages m ON m.id = mo.message_id
       )
       SELECT c.*,
              u.full_name AS other_party_name, u.username AS other_party_username, u.avatar_url AS other_party_avatar,
              u.use_store_identity AS other_party_use_store_identity, u.store_logo_url AS other_party_store_logo_url,
              u.store_name AS other_party_store_name, u.seller_tier AS other_party_seller_tier,
              CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END AS other_party_id,
              mo.message_id AS offer_message_id, mo.offered_price, mo.list_price, mo.status AS offer_status,
              mo.negotiation_round, mo.counter_count, mo.quantity, mo.negotiation_id, mo.product_id,
              p.name AS product_name, mo.expires_at AS offer_expires_at, mo.accepted_expires_at,
              (mo.status IN ('pending', 'countered') AND mo.sender_id <> $1 AND mo.expires_at > NOW() AND mo.is_read = false) AS needs_action,
              (mo.status IN ('declined', 'expired', 'redeemed')
                OR (mo.status IN ('pending', 'countered') AND mo.expires_at <= NOW())
                OR (mo.status = 'accepted' AND mo.accepted_expires_at <= NOW())) AS is_history,
              ((mo.status IN ('pending', 'countered') AND mo.expires_at > NOW())
                OR (mo.status = 'accepted' AND mo.accepted_expires_at > NOW())) AS is_active,
              COALESCE(cus.is_pinned, false) AS is_pinned
       FROM conversations c
       JOIN users u ON u.id = CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END
       JOIN latest_offer mo ON mo.conversation_id = c.id AND mo.rn = 1
       JOIN products p ON p.id = mo.product_id
       LEFT JOIN conversation_user_settings cus ON cus.conversation_id = c.id AND cus.user_id = $1
       WHERE (c.buyer_id = $1 OR c.seller_id = $1)
         AND (mo.status IN ('pending', 'countered') OR mo.status IN ('accepted', 'declined', 'expired', 'redeemed'))
       ORDER BY (mo.status IN ('pending', 'countered') AND mo.expires_at > NOW()) DESC, mo.expires_at ASC NULLS LAST, mo.created_at DESC`,
      [req.user.id]
    );
    const conversations = result.rows.map(row => ['pending', 'countered'].includes(row.offer_status) && row.offer_expires_at && new Date(row.offer_expires_at) <= new Date()
      ? { ...row, offer_status: 'expired', is_history: true, is_active: false, needs_action: false }
      : row);
    res.json({ conversations, needsActionCount: conversations.filter(row => row.needs_action).length });
  } catch (err) {
    console.error('Offer conversations fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Typing indicator
const typingUsers = new Map();
function getTypingKey(convId, userId) { return `${convId}:${userId}`; }

// Delivery statuses for the caller's own messages — polled every 5s so the sender's
// ticks flip live (sent → delivered → read) without reloading the chat.
router.get('/api/conversations/:id/delivery-status', authRequired, async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  try {
    // The recipient's read receipts may be off, in which case a stored 'read' is
    // never reported: the sender sees the message delivered and no more. Checked
    // here as well as at write time, so a receipt left over from before the
    // preference changed cannot leak through this poll.
    const conv = await pool.query('SELECT buyer_id, seller_id FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [req.params.id, req.user.id]);
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    const otherId = conv.rows[0].buyer_id === req.user.id ? conv.rows[0].seller_id : conv.rows[0].buyer_id;
    const prefs = await pool.query('SELECT read_receipts_enabled FROM users WHERE id = $1', [otherId]);
    const readReceiptsOff = prefs.rows[0]?.read_receipts_enabled === false;
    const result = await pool.query(
      `SELECT m.id, COALESCE(md.status, 'sent') AS status
       FROM messages m
       LEFT JOIN message_deliveries md ON md.message_id = m.id
       WHERE m.conversation_id = $1 AND m.sender_id = $2
       ORDER BY m.created_at DESC
       LIMIT 100`,
      [req.params.id, req.user.id]
    );
    const statuses = readReceiptsOff
      ? result.rows.map((row) => ({ ...row, status: row.status === 'read' ? 'delivered' : row.status }))
      : result.rows;
    res.json({ statuses, readReceiptsOff });
  } catch (err) {
    console.error('Delivery status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/conversations/:id/typing', authRequired, async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) return res.json({ ok: true });
  touchPresence(req.user.id);
  const key = getTypingKey(req.params.id, req.user.id);
  typingUsers.set(key, Date.now());
  setTimeout(() => { typingUsers.delete(key); }, 5000);
  try {
    const convr = await pool.query('SELECT buyer_id, seller_id FROM conversations WHERE id = $1', [req.params.id]);
    if (convr.rows.length) {
      const { buyer_id, seller_id } = convr.rows[0];
      const other = req.user.id === buyer_id ? seller_id : (req.user.id === seller_id ? buyer_id : null);
      if (other) emitToUsers([other], { type: 'typing', conversationId: req.params.id, userId: req.user.id });
    }
  } catch { /* realtime broadcast is best-effort */ }
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
  const allowedEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉'];
  if (!allowedEmojis.includes(emoji)) return res.status(400).json({ error: 'Choose a supported reaction' });
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    // Serialize updates for this message so a person's previous reaction is
    // replaced atomically, including when they react from two devices at once.
    const msg = await client.query('SELECT conversation_id FROM messages WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (msg.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Message not found' });
    }
    const conv = await client.query(
      'SELECT buyer_id, seller_id FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)',
      [msg.rows[0].conversation_id, req.user.id]
    );
    if (conv.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not a participant' });
    }

    const existing = await client.query(
      'SELECT id, emoji FROM message_reactions WHERE message_id = $1 AND user_id = $2 FOR UPDATE',
      [req.params.id, req.user.id]
    );
    let action;
    if (existing.rows[0]?.emoji === emoji) {
      await client.query('DELETE FROM message_reactions WHERE id = $1', [existing.rows[0].id]);
      action = 'removed';
    } else if (existing.rows.length > 0) {
      await client.query('UPDATE message_reactions SET emoji = $1, created_at = CURRENT_TIMESTAMP WHERE id = $2', [emoji, existing.rows[0].id]);
      action = 'changed';
    } else {
      await client.query('INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)', [req.params.id, req.user.id, emoji]);
      action = 'added';
    }
    const rr = await client.query(
      `SELECT mr.emoji, mr.user_id, u.full_name AS user_name
       FROM message_reactions mr JOIN users u ON u.id = mr.user_id WHERE mr.message_id = $1`,
      [req.params.id]
    );
    await client.query('COMMIT');
    const reactions = rr.rows.map(r => ({ emoji: r.emoji, userId: r.user_id, userName: r.user_name }));
    emitToUsers([conv.rows[0].buyer_id, conv.rows[0].seller_id], {
      type: 'message_reactions',
      conversationId: msg.rows[0].conversation_id,
      messageId: req.params.id,
      reactions,
    });
    res.json({ action, emoji, reactions });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch { /* transaction may already be closed */ }
    }
    console.error('Reaction error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client?.release();
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
    try {
      const convr = await pool.query('SELECT buyer_id, seller_id FROM conversations WHERE id = $1', [msg.rows[0].conversation_id]);
      if (convr.rows.length) {
        emitToUsers([convr.rows[0].buyer_id, convr.rows[0].seller_id], {
          type: 'message_updated',
          conversationId: msg.rows[0].conversation_id,
          message: result.rows[0],
        });
      }
    } catch { /* best-effort */ }
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
    try {
      const convr = await pool.query('SELECT buyer_id, seller_id FROM conversations WHERE id = $1', [msg.rows[0].conversation_id]);
      if (convr.rows.length) {
        emitToUsers([convr.rows[0].buyer_id, convr.rows[0].seller_id], {
          type: 'message_deleted',
          conversationId: msg.rows[0].conversation_id,
          messageId: req.params.id,
        });
      }
    } catch { /* best-effort */ }
    res.json({ deleted: true });
  } catch (err) {
    console.error('Message delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Conversation Pin / Mute / Block ─────

// ── Private message bookmarks (Inbox/Messaging decisions) ──
// A bookmark is one person's own note to themselves. Every statement below is
// scoped to the caller, and none of them writes a message row, a read receipt, a
// delivery state, or anything an order later reads as its terms. Keeping a line
// someone wrote is not a change to the deal.

router.get('/api/messages/bookmarks', authRequired, async (req, res) => {
  try {
    const limit = bookmarkPageSize(req.query.limit);
    // One row past the limit so "more saved messages" is honest.
    const rows = await pool.query(
      `SELECT mb.message_id, mb.created_at AS bookmarked_at,
              m.content, m.is_deleted, m.message_type, m.created_at AS message_created_at,
              m.conversation_id, m.sender_id,
              peer.full_name AS peer_name, peer.store_name AS peer_store_name,
              peer.use_store_identity AS peer_use_store, c.order_id
       FROM message_bookmarks mb
       JOIN messages m ON m.id = mb.message_id
       JOIN conversations c ON c.id = m.conversation_id
       JOIN users peer ON peer.id = CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END
       WHERE mb.user_id = $1 AND (c.buyer_id = $1 OR c.seller_id = $1)
       ORDER BY mb.created_at DESC, mb.message_id DESC
       LIMIT $2`,
      [req.user.id, limit + 1]
    );
    const truncated = rows.rows.length > limit;
    const bookmarks = rows.rows.slice(0, limit).map(row => ({
      messageId: row.message_id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      messageType: row.message_type,
      isDeleted: !!row.is_deleted,
      excerpt: bookmarkExcerpt(row.content, { isDeleted: row.is_deleted }),
      messageCreatedAt: row.message_created_at,
      bookmarkedAt: row.bookmarked_at,
      peerName: row.peer_use_store && row.peer_store_name ? row.peer_store_name : row.peer_name,
      orderId: row.order_id || null,
    }));
    res.json({ bookmarks, truncated, limit });
  } catch (err) {
    console.error('Message bookmarks list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Idempotent: saving a message twice is still just saved.
router.put('/api/messages/:id/bookmark', authRequired, async (req, res) => {
  try {
    const target = await pool.query(
      `SELECT m.is_deleted FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.id = $1 AND (c.buyer_id = $2 OR c.seller_id = $2)`,
      [req.params.id, req.user.id]
    );
    const { bookmarkable, reason } = bookmarkableMessage({
      exists: target.rows.length > 0,
      isDeleted: !!target.rows[0]?.is_deleted,
    });
    if (!bookmarkable) {
      return res.status(reason === 'missing' ? 404 : 409).json({
        error: reason === 'missing' ? 'Message not found' : 'A deleted message cannot be saved',
        code: reason === 'missing' ? 'BOOKMARK_MESSAGE_MISSING' : 'BOOKMARK_MESSAGE_DELETED',
      });
    }
    await pool.query(
      `INSERT INTO message_bookmarks (user_id, message_id) VALUES ($1, $2)
       ON CONFLICT (user_id, message_id) DO NOTHING`,
      [req.user.id, req.params.id]
    );
    res.json({ bookmarked: true, messageId: req.params.id });
  } catch (err) {
    console.error('Message bookmark error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Removing is idempotent and cannot reach anyone else's bookmark: the statement
// is scoped by user_id, so a valid message id alone changes nothing.
router.delete('/api/messages/:id/bookmark', authRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM message_bookmarks WHERE user_id = $1 AND message_id = $2', [req.user.id, req.params.id]);
    res.json({ bookmarked: false, messageId: req.params.id });
  } catch (err) {
    console.error('Message unbookmark error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/api/conversations/:id/pin', authRequired, async (req, res) => {
  try {
    const conv = await pool.query('SELECT * FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [req.params.id, req.user.id]);
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    const previous = await pool.query('SELECT is_pinned FROM conversation_user_settings WHERE conversation_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    const newPinned = !previous.rows[0]?.is_pinned;
    await pool.query(`INSERT INTO conversation_user_settings (conversation_id, user_id, is_pinned)
      VALUES ($1, $2, $3) ON CONFLICT (conversation_id, user_id) DO UPDATE SET is_pinned = EXCLUDED.is_pinned, updated_at = CURRENT_TIMESTAMP`, [req.params.id, req.user.id, newPinned]);
    res.json({ pinned: newPinned });
  } catch (err) {
    console.error('Pin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/api/conversations/:id/mute', authRequired, async (req, res) => {
  const { enabled = true } = req.body;
  const durationHours = req.body.durationHours ?? req.body.hours;
  try {
    const conv = await pool.query('SELECT * FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [req.params.id, req.user.id]);
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    if (!enabled) {
      await pool.query(`INSERT INTO conversation_user_settings (conversation_id, user_id, is_muted, muted_until)
        VALUES ($1, $2, false, NULL) ON CONFLICT (conversation_id, user_id) DO UPDATE SET is_muted = false, muted_until = NULL, updated_at = CURRENT_TIMESTAMP`, [req.params.id, req.user.id]);
      return res.json({ muted: false, mutedUntil: null });
    }
    if (durationHours !== null && durationHours !== undefined && (!Number.isFinite(Number(durationHours)) || Number(durationHours) < 1 || Number(durationHours) > 8760)) {
      return res.status(400).json({ error: 'Mute duration must be between 1 hour and 365 days, or null for indefinitely' });
    }
    const mutedUntil = durationHours == null ? null : new Date(Date.now() + Number(durationHours) * 3600 * 1000);
    await pool.query(`INSERT INTO conversation_user_settings (conversation_id, user_id, is_muted, muted_until)
      VALUES ($1, $2, true, $3) ON CONFLICT (conversation_id, user_id) DO UPDATE SET is_muted = true, muted_until = EXCLUDED.muted_until, updated_at = CURRENT_TIMESTAMP`, [req.params.id, req.user.id, mutedUntil]);
    res.json({ muted: true, mutedUntil });
  } catch (err) {
    console.error('Mute error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Archive files a chat away from the Inbox. Private to the caller: the flag lives
// on conversation_user_settings, so one participant filing a chat away changes
// nothing for the other. A live offer is exempt (it stays in front of the user),
// and the underlying order stays reachable from the Buying/Selling screens.
router.put('/api/conversations/:id/archive', authRequired, async (req, res) => {
  try {
    const conv = await pool.query('SELECT id FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [req.params.id, req.user.id]);
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    const archived = req.body?.archived === undefined ? true : req.body.archived === true;
    await pool.query(`INSERT INTO conversation_user_settings (conversation_id, user_id, is_archived)
      VALUES ($1, $2, $3) ON CONFLICT (conversation_id, user_id) DO UPDATE SET is_archived = EXCLUDED.is_archived, updated_at = CURRENT_TIMESTAMP`,
      [req.params.id, req.user.id, archived]);
    res.json({ archived });
  } catch (err) {
    console.error('Archive error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// A reminder the user leaves for themselves. It is a separate flag, so neither the
// other participant's read receipt (message_deliveries) nor the messages.is_read
// bookkeeping is touched — nothing about this is visible to them.
router.put('/api/conversations/:id/mark-unread', authRequired, async (req, res) => {
  try {
    const conv = await pool.query('SELECT id FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [req.params.id, req.user.id]);
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    const markedUnread = normalizeMarkUnread(req.body?.unread === undefined ? true : req.body.unread);
    await pool.query(`INSERT INTO conversation_user_settings (conversation_id, user_id, marked_unread)
      VALUES ($1, $2, $3) ON CONFLICT (conversation_id, user_id) DO UPDATE SET marked_unread = EXCLUDED.marked_unread, updated_at = CURRENT_TIMESTAMP`,
      [req.params.id, req.user.id, markedUnread]);
    res.json({ markedUnread });
  } catch (err) {
    console.error('Mark-unread error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/users/:id/block', authRequired, async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot block yourself' });
  try {
    const existing = await pool.query('SELECT id FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2', [req.user.id, req.params.id]);
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2', [req.user.id, req.params.id]);
      emitToUsers([req.user.id, req.params.id], { type: 'block_updated', blockerId: req.user.id, blockedId: req.params.id, blocked: false });
      return res.json({ blocked: false });
    }
    await pool.query('INSERT INTO blocked_users (blocker_id, blocked_id) VALUES ($1, $2)', [req.user.id, req.params.id]);
    emitToUsers([req.user.id, req.params.id], { type: 'block_updated', blockerId: req.user.id, blockedId: req.params.id, blocked: true });
    res.json({ blocked: true });
  } catch (err) {
    console.error('Block error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/conversations/:id/report', authRequired, async (req, res) => {
  const { reason, details } = req.body;
  const allowed = ['harassment', 'scam', 'inappropriate', 'spam', 'other'];
  if (!allowed.includes(reason)) return res.status(400).json({ error: 'Choose a report reason' });
  if (details != null && (typeof details !== 'string' || details.length > 1500)) return res.status(400).json({ error: 'Details must be 1500 characters or fewer' });
  try {
    const conv = await pool.query('SELECT buyer_id, seller_id FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [req.params.id, req.user.id]);
    if (!conv.rows.length) return res.status(404).json({ error: 'Conversation not found' });
    const reportedUserId = conv.rows[0].buyer_id === req.user.id ? conv.rows[0].seller_id : conv.rows[0].buyer_id;
    const report = await pool.query(
      'INSERT INTO message_reports (reporter_id, reported_user_id, conversation_id, reason, details) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at',
      [req.user.id, reportedUserId, req.params.id, reason, details?.trim() || null]
    );
    res.status(201).json({ reportId: report.rows[0].id, createdAt: report.rows[0].created_at });
  } catch (err) { console.error('Chat report error:', err); res.status(500).json({ error: 'Server error' }); }
});

// ───── Mark Messages Delivered / Read ─────

router.put('/api/conversations/:id/read', authRequired, async (req, res) => {
  try {
    const conv = await pool.query('SELECT buyer_id, seller_id FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [req.params.id, req.user.id]);
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    touchPresence(req.user.id);
    markConversationActive(req.user.id, req.params.id);
    // Read receipts off: this account still marks its own messages read, because
    // its unread badges are its own business — but nothing is sent to the other
    // participant. No delivery receipt, no realtime 'messages_read' tick.
    const mine = await pool.query('SELECT read_receipts_enabled FROM users WHERE id = $1', [req.user.id]);
    const receiptsOff = mine.rows[0]?.read_receipts_enabled === false;
    // Update delivery states first — must NOT depend on messages.is_read (GET may have
    // already flipped it; keying off that would leave message_deliveries stuck on 'delivered').
    const deliveries = receiptsOff
      ? { rows: [] }
      : await pool.query(
        `UPDATE message_deliveries md SET status = 'read', read_at = CURRENT_TIMESTAMP
         WHERE md.recipient_id = $1 AND md.status <> 'read'
           AND md.message_id IN (SELECT id FROM messages WHERE conversation_id = $2 AND sender_id <> $1)
         RETURNING md.message_id`,
        [req.user.id, req.params.id]
      );
    // Mark all unread incoming messages as read (conversation badges)
    const result = await pool.query(
      `UPDATE messages SET is_read = true
       WHERE conversation_id = $1 AND sender_id != $2 AND is_read = false
       RETURNING id`,
      [req.params.id, req.user.id]
    );
    // Reading the chat satisfies the user's own unread reminder.
    await pool.query(
      `UPDATE conversation_user_settings SET marked_unread = false, updated_at = CURRENT_TIMESTAMP
       WHERE conversation_id = $1 AND user_id = $2 AND marked_unread`,
      [req.params.id, req.user.id]
    );
    if (!receiptsOff) {
      try {
        const other = req.user.id === conv.rows[0].buyer_id ? conv.rows[0].seller_id : conv.rows[0].buyer_id;
        emitToUsers([other], { type: 'messages_read', conversationId: req.params.id, readerId: req.user.id });
      } catch { /* best-effort */ }
    }
    res.json({ marked: Math.max(result.rows.length, deliveries.rows.length), readReceiptsOff: receiptsOff });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
