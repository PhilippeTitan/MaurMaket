import { Router } from 'express';
import { pool } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';
import { policyCurrentRequired } from '../middleware/policyAcceptance.js';
import { msgLimiter } from '../middleware/rateLimit.js';
import { createNotification } from '../utils/notifications.js';
import { emitToUsers } from '../realtime.js';
import { isConversationOpen } from '../utils/chatActivity.js';

const router = Router();

async function notifyIfNeeded(userId, conversationId, title, body, data) {
  try {
    const settings = await pool.query('SELECT is_muted, muted_until FROM conversation_user_settings WHERE conversation_id = $1 AND user_id = $2', [conversationId, userId]);
    const muted = !!settings.rows[0]?.is_muted && (!settings.rows[0]?.muted_until || new Date(settings.rows[0].muted_until) > new Date());
    if (!muted && !isConversationOpen(userId, conversationId)) createNotification(userId, 'new_message', title, body, data);
  } catch (err) { console.warn('Offer notification skipped:', err?.message || err); }
}

// Send an offer
// Making an offer is a new commitment. Existing conversations and orders keep
// working whatever the policy state (Batch 72, APP-Q359).
router.post('/api/conversations/:id/offer', authRequired, msgLimiter, policyCurrentRequired('make_offer'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { productId, offeredPrice } = req.body;
    const quantity = Number(req.body.quantity ?? 1);
    if (!productId || !Number.isFinite(Number(offeredPrice)) || Number(offeredPrice) <= 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return res.status(400).json({ error: 'Valid product, price, and quantity required' });
    await client.query('BEGIN');
    const conv = await client.query('SELECT * FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2) FOR UPDATE', [req.params.id, req.user.id]);
    if (conv.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Conversation not found' }); }
    const conversation = conv.rows[0];
    const buyerId = conversation.buyer_id;
    const sellerId = conversation.seller_id;
    if (req.user.id !== buyerId) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Only the buyer can send offers' }); }
    const blocked = await client.query('SELECT 1 FROM blocked_users WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1', [buyerId, sellerId]);
    if (blocked.rows.length) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Offers are unavailable because one participant blocked the other', code: 'USER_BLOCKED' }); }
    const product = await client.query('SELECT id, price, sale_price, sale_starts_at, sale_ends_at, stock, seller_id, name, offers_enabled, has_variants FROM products WHERE id = $1 AND is_available = true FOR UPDATE', [productId]);
    if (product.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Product not found or unavailable' }); }
    if (product.rows[0].offers_enabled === false) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'The seller is not accepting offers on this listing', code: 'OFFERS_DISABLED' }); }
    if (product.rows[0].seller_id !== sellerId) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Product does not belong to this seller' }); }
    if (product.rows[0].stock < quantity) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Not enough stock for that quantity' }); }
    const existingOffer = await client.query("SELECT id FROM message_offers WHERE product_id = $1 AND buyer_id = $2 AND conversation_id = $3 AND status IN ('pending', 'countered') AND expires_at > NOW()", [productId, buyerId, req.params.id]);
    if (existingOffer.rows.length > 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'You already have a pending negotiation for this product' }); }
    const activeSale = product.rows[0].sale_price && (!product.rows[0].sale_starts_at || new Date(product.rows[0].sale_starts_at) <= new Date()) && (!product.rows[0].sale_ends_at || new Date(product.rows[0].sale_ends_at) >= new Date());
    const actualListPrice = Number(activeSale ? product.rows[0].sale_price : product.rows[0].price);
    if (Number(offeredPrice) >= actualListPrice) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Offer must be below the current listing price' }); }
    const msgResult = await client.query(`INSERT INTO messages (conversation_id, sender_id, content, message_type) VALUES ($1, $2, NULL, 'offer') RETURNING *`, [req.params.id, req.user.id]);
    const message = msgResult.rows[0];
    const offerResult = await client.query(
      `INSERT INTO message_offers (message_id, conversation_id, product_id, buyer_id, seller_id, offered_price, list_price, negotiation_id, counter_count, quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, gen_random_uuid(), 0, $8) RETURNING *`,
      [message.id, req.params.id, productId, buyerId, sellerId, offeredPrice, actualListPrice, quantity]
    );
    const offer = offerResult.rows[0];
    await client.query('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    const buyerInfo = await pool.query('SELECT full_name FROM users WHERE id = $1', [buyerId]);
    const buyerName = buyerInfo.rows[0]?.full_name || 'A buyer';
    const offerData = { productId: offer.product_id, productName: product.rows[0].name, offeredPrice: Number(offer.offered_price), listPrice: Number(offer.list_price), quantity, status: offer.status, negotiationRound: 1, counterCount: 0, negotiationId: offer.negotiation_id, expiresAt: offer.expires_at };
    await notifyIfNeeded(sellerId, req.params.id, 'New Offer', `${buyerName} offered G ${offeredPrice} each for ${product.rows[0].name} (${quantity})`, { conversationId: req.params.id, senderId: buyerId, senderName: buyerName });
    const payload = { ...message, offer_data: offerData, reactions: [], delivery_status: 'sent' };
    await pool.query('INSERT INTO message_deliveries (message_id, recipient_id, status) VALUES ($1, $2, \'sent\') ON CONFLICT DO NOTHING', [message.id, sellerId]);
    emitToUsers([buyerId, sellerId], { type: 'message_new', conversationId: req.params.id, message: payload });
    res.status(201).json({ message: payload });
  } catch (err) { try { await client.query('ROLLBACK'); } catch {} console.error('Send offer error:', err); res.status(500).json({ error: 'Server error' }); }
  finally { client.release(); }
});

// Respond to offer
router.post('/api/offers/:messageId/respond', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { action } = req.body;
    if (!action || !['accepted', 'declined'].includes(action)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Action must be "accepted" or "declined"' }); }
    const offerRes = await client.query('SELECT mo.*, m.conversation_id, m.sender_id FROM message_offers mo JOIN messages m ON mo.message_id = m.id WHERE mo.message_id = $1 FOR UPDATE OF mo', [req.params.messageId]);
    if (offerRes.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Offer not found' }); }
    const offer = offerRes.rows[0];
    const convCheck = await client.query('SELECT 1 FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [offer.conversation_id, req.user.id]);
    if (convCheck.rows.length === 0) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Not a member of this conversation' }); }
    if (offer.status !== 'pending' || offer.sender_id === req.user.id) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Only the recipient can respond to the current offer' }); }
    const isParticipant = req.user.id === offer.buyer_id || req.user.id === offer.seller_id;
    if (!isParticipant) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Not a participant in this offer' }); }
    const otherId = req.user.id === offer.buyer_id ? offer.seller_id : offer.buyer_id;
    const blocked = await client.query('SELECT 1 FROM blocked_users WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1', [req.user.id, otherId]);
    if (blocked.rows.length) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Offer actions are unavailable because one participant blocked the other', code: 'USER_BLOCKED' }); }
    if (offer.expires_at && new Date(offer.expires_at) < new Date()) {
      await client.query("UPDATE message_offers SET status = 'expired' WHERE message_id = $1", [req.params.messageId]);
      await client.query('COMMIT'); return res.status(400).json({ error: 'Offer has expired' });
    }
    if (action === 'accepted') {
      const stock = await client.query('SELECT stock, is_available FROM products WHERE id = $1 FOR UPDATE', [offer.product_id]);
      if (!stock.rows[0]?.is_available || Number(stock.rows[0].stock) < Number(offer.quantity)) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'The listing no longer has enough available stock' }); }
    }
    await client.query('UPDATE message_offers SET status = $1, responded_at = CURRENT_TIMESTAMP, accepted_expires_at = CASE WHEN $1 = \'accepted\' THEN CURRENT_TIMESTAMP + INTERVAL \'48 hours\' ELSE accepted_expires_at END WHERE message_id = $2', [action, req.params.messageId]);
    const responderInfo = await client.query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
    const responderName = responderInfo.rows[0]?.full_name || 'Seller';
    const productInfo = await client.query('SELECT name FROM products WHERE id = $1', [offer.product_id]);
    const productName = productInfo.rows[0]?.name || 'the item';
    await client.query('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1', [offer.conversation_id]);
    await client.query('COMMIT');
    const recipientId = otherId;
    const buyerNotifMsg = `The proposal of G ${offer.offered_price} for "${productName}" was ${action}.`;
    await notifyIfNeeded(recipientId, offer.conversation_id, action === 'accepted' ? 'Offer Accepted' : 'Offer Declined', buyerNotifMsg, { conversationId: offer.conversation_id, senderId: req.user.id, senderName: responderName });
    emitToUsers([offer.buyer_id, offer.seller_id], { type: 'offer_updated', conversationId: offer.conversation_id, messageId: req.params.messageId, status: action });
    res.json({ success: true, status: action });
  } catch (err) { try { await client.query('ROLLBACK'); } catch {} console.error('Respond to offer error:', err); res.status(500).json({ error: 'Server error' }); }
  finally { client.release(); }
});

// Counter offer
router.post('/api/offers/:messageId/counter', authRequired, msgLimiter, async (req, res) => {
  const client = await pool.connect();
  try {
    const offeredPrice = Number(req.body.offeredPrice);
    if (!Number.isFinite(offeredPrice) || offeredPrice <= 0) return res.status(400).json({ error: 'A valid counter price is required' });
    await client.query('BEGIN');
    const result = await client.query('SELECT mo.*, m.conversation_id, m.sender_id FROM message_offers mo JOIN messages m ON m.id = mo.message_id WHERE mo.message_id = $1 FOR UPDATE OF mo', [req.params.messageId]);
    const offer = result.rows[0];
    if (!offer) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Offer not found' }); }
    if (![offer.buyer_id, offer.seller_id].includes(req.user.id) || offer.sender_id === req.user.id || offer.status !== 'pending') { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Only the recipient of the current offer can counter' }); }
    if (offer.expires_at && new Date(offer.expires_at) < new Date()) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Offer has expired' }); }
    const blocked = await client.query('SELECT 1 FROM blocked_users WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1', [req.user.id, req.user.id === offer.buyer_id ? offer.seller_id : offer.buyer_id]);
    if (blocked.rows.length) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Offer actions are unavailable because one participant blocked the other', code: 'USER_BLOCKED' }); }
    const counterCount = Number(offer.counter_count || 0);
    if (counterCount >= 6) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Maximum six counteroffers reached. Start a new offer to continue.' }); }
    if (offeredPrice > Number(offer.list_price)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Counter must not exceed the current listed price' }); }
    const product = await client.query('SELECT stock, is_available FROM products WHERE id = $1 FOR UPDATE', [offer.product_id]);
    if (!product.rows[0]?.is_available || Number(product.rows[0].stock) < Number(offer.quantity)) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'The listing no longer has enough available stock' }); }
    await client.query("UPDATE message_offers SET status = 'countered', responded_at = CURRENT_TIMESTAMP WHERE message_id = $1", [req.params.messageId]);
    const nextRound = Number(offer.negotiation_round || 1) + 1;
    const newMessage = await client.query("INSERT INTO messages (conversation_id, sender_id, content, message_type) VALUES ($1, $2, NULL, 'offer') RETURNING *", [offer.conversation_id, req.user.id]);
    const newOffer = await client.query(
      `INSERT INTO message_offers (message_id, conversation_id, product_id, buyer_id, seller_id, offered_price, list_price, negotiation_id, counter_count, quantity, negotiation_round)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [newMessage.rows[0].id, offer.conversation_id, offer.product_id, offer.buyer_id, offer.seller_id, offeredPrice, offer.list_price, offer.negotiation_id, counterCount + 1, offer.quantity, nextRound]
    );
    await client.query('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1', [offer.conversation_id]);
    await client.query('COMMIT');
    const recipientId = req.user.id === offer.buyer_id ? offer.seller_id : offer.buyer_id;
    const responder = (await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id])).rows[0]?.full_name || 'The other person';
    const productName = (await pool.query('SELECT name FROM products WHERE id = $1', [offer.product_id])).rows[0]?.name || 'the item';
    await notifyIfNeeded(recipientId, offer.conversation_id, 'Counter offer', `${responder} countered with G ${offeredPrice} each for ${productName}`, { conversationId: offer.conversation_id, senderId: req.user.id });
    const offerData = { productId: offer.product_id, productName, offeredPrice, listPrice: Number(offer.list_price), quantity: Number(offer.quantity), status: 'pending', negotiationRound: nextRound, counterCount: counterCount + 1, negotiationId: offer.negotiation_id, expiresAt: newOffer.rows[0].expires_at };
    const payload = { ...newMessage.rows[0], offer_data: offerData, reactions: [], delivery_status: 'sent' };
    await pool.query('INSERT INTO message_deliveries (message_id, recipient_id, status) VALUES ($1, $2, \'sent\') ON CONFLICT DO NOTHING', [newMessage.rows[0].id, recipientId]);
    emitToUsers([offer.buyer_id, offer.seller_id], { type: 'message_new', conversationId: offer.conversation_id, message: payload });
    res.json({ success: true, status: 'pending', offeredPrice, negotiationRound: nextRound, counterCount: counterCount + 1, message: payload });
  } catch (err) { try { await client.query('ROLLBACK'); } catch {} console.error('Counter offer error:', err); res.status(500).json({ error: 'Server error' }); }
  finally { client.release(); }
});

// Seller's active items for offer carousel
router.get('/api/sellers/:id/items', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.description,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN p.sale_price ELSE p.price END)::DECIMAL(10,2) AS price,
              p.price AS list_price, p.stock, p.is_available,
              (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, display_order ASC LIMIT 1) AS image_url,
              (SELECT json_agg(json_build_object('image_url', pi.image_url, 'thumbnail_url', pi.thumbnail_url, 'is_primary', pi.is_primary, 'image_width', pi.image_width, 'image_height', pi.image_height) ORDER BY pi.is_primary DESC, pi.display_order ASC) FROM product_images pi WHERE pi.product_id = p.id) AS images
       FROM products p WHERE p.seller_id = $1 AND p.is_available = true AND p.stock > 0 ORDER BY p.created_at DESC LIMIT 50`,
      [req.params.id]
    );
    res.json({ items: result.rows });
  } catch (err) {
    console.error('Seller items fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/api/offers/:messageId/seen', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE messages m SET is_read = true FROM message_offers mo
       WHERE mo.message_id = $1 AND m.id = mo.message_id
         AND (mo.buyer_id = $2 OR mo.seller_id = $2)
       RETURNING m.id`, [req.params.messageId, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Offer not found' });
    await pool.query(
      `UPDATE message_deliveries SET status = 'read', read_at = CURRENT_TIMESTAMP
       WHERE message_id = $1 AND recipient_id = $2 AND status <> 'read'`, [req.params.messageId, req.user.id]
    );
    res.json({ seen: true });
  } catch (err) { console.error('Offer seen error:', err); res.status(500).json({ error: 'Server error' }); }
});

// Offer details
router.get('/api/offers/:messageId', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT mo.*, m.sender_id, p.name AS product_name, p.stock AS current_stock, p.is_available AS product_available,
              (SELECT image_url FROM product_images WHERE product_id = mo.product_id ORDER BY is_primary DESC, display_order ASC LIMIT 1) AS product_image,
              bu.full_name AS buyer_name, bu.avatar_url AS buyer_avatar, bu.seller_tier AS buyer_tier,
              su.full_name AS seller_name, su.avatar_url AS seller_avatar, su.seller_tier AS seller_tier,
              su.use_store_identity AS seller_use_store_identity, su.store_logo_url AS seller_store_logo_url,
              su.store_name AS seller_store_name
       FROM message_offers mo JOIN products p ON p.id = mo.product_id JOIN messages m ON m.id = mo.message_id
       JOIN conversations c ON c.id = mo.conversation_id JOIN users bu ON bu.id = mo.buyer_id JOIN users su ON su.id = mo.seller_id
       WHERE mo.message_id = $1 AND (c.buyer_id = $2 OR c.seller_id = $2)`,
      [req.params.messageId, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Offer not found' });
    const o = result.rows[0];
    const blockState = await pool.query('SELECT 1 FROM blocked_users WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1', [o.buyer_id, o.seller_id]);
    const history = await pool.query(
      `SELECT mo.message_id, mo.offered_price, mo.status, mo.negotiation_round, mo.counter_count,
              mo.quantity, mo.expires_at, mo.accepted_expires_at, mo.created_at, m.sender_id, u.full_name AS sender_name
       FROM message_offers mo JOIN messages m ON m.id = mo.message_id JOIN users u ON u.id = m.sender_id
       WHERE mo.negotiation_id = $1 ORDER BY mo.created_at ASC, mo.message_id ASC`, [o.negotiation_id]
    );
    const sellerDisplayName = o.seller_use_store_identity && o.seller_store_name ? o.seller_store_name : o.seller_name;
    res.json({ offer: { messageId: o.message_id, productId: o.product_id, productName: o.product_name, productImage: o.product_image, currentStock: Number(o.current_stock || 0), productAvailable: !!o.product_available, isBlocked: blockState.rows.length > 0, isInCheckout: !!o.accepted_checkout_id, offeredPrice: parseFloat(o.offered_price), listPrice: parseFloat(o.list_price), quantity: Number(o.quantity || 1), status: o.status, negotiationId: o.negotiation_id, counterCount: Number(o.counter_count || 0), negotiationRound: o.negotiation_round || 1, buyerId: o.buyer_id, sellerId: o.seller_id, senderId: o.sender_id, buyerName: o.buyer_name, buyerAvatar: o.buyer_avatar, sellerName: sellerDisplayName, sellerAvatar: o.seller_avatar, sellerTier: o.seller_tier, sellerUseStoreIdentity: o.seller_use_store_identity, sellerStoreLogoUrl: o.seller_store_logo_url, expiresAt: o.expires_at, acceptedExpiresAt: o.accepted_expires_at, createdAt: o.created_at, respondedAt: o.responded_at, history: history.rows.map(h => ({ messageId: h.message_id, offeredPrice: Number(h.offered_price), status: h.status, round: h.negotiation_round, counterCount: h.counter_count, quantity: h.quantity, expiresAt: h.expires_at, acceptedExpiresAt: h.accepted_expires_at, createdAt: h.created_at, senderId: h.sender_id, senderName: h.sender_name })) } });
  } catch (err) {
    console.error('Offer details error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
