import { Router } from 'express';
import { pool } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';
import { msgLimiter } from '../middleware/rateLimit.js';
import { createNotification } from '../utils/notifications.js';

const router = Router();

// Send an offer
router.post('/api/conversations/:id/offer', authRequired, msgLimiter, async (req, res) => {
  const client = await pool.connect();
  try {
    const { productId, productName, offeredPrice, listPrice } = req.body;
    if (!productId || !offeredPrice || offeredPrice <= 0) return res.status(400).json({ error: 'Valid productId and offeredPrice required' });
    await client.query('BEGIN');
    const conv = await client.query('SELECT * FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2) FOR UPDATE', [req.params.id, req.user.id]);
    if (conv.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Conversation not found' }); }
    const conversation = conv.rows[0];
    const buyerId = conversation.buyer_id;
    const sellerId = conversation.seller_id;
    if (req.user.id !== buyerId) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Only the buyer can send offers' }); }
    const product = await client.query('SELECT id, price, stock, seller_id, name FROM products WHERE id = $1 AND is_available = true', [productId]);
    if (product.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Product not found or unavailable' }); }
    if (product.rows[0].seller_id !== sellerId) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Product does not belong to this seller' }); }
    if (product.rows[0].stock <= 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Product is out of stock' }); }
    const existingOffer = await client.query("SELECT id FROM message_offers WHERE product_id = $1 AND buyer_id = $2 AND conversation_id = $3 AND status = 'pending'", [productId, buyerId, req.params.id]);
    if (existingOffer.rows.length > 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'You already have a pending offer for this product' }); }
    const msgResult = await client.query(`INSERT INTO messages (conversation_id, sender_id, content, message_type) VALUES ($1, $2, NULL, 'offer') RETURNING *`, [req.params.id, req.user.id]);
    const message = msgResult.rows[0];
    const offerResult = await client.query(
      `INSERT INTO message_offers (message_id, conversation_id, product_id, buyer_id, seller_id, offered_price, list_price) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [message.id, req.params.id, productId, buyerId, sellerId, offeredPrice, listPrice]
    );
    const offer = offerResult.rows[0];
    await client.query('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    client.release();
    const buyerInfo = await pool.query('SELECT full_name FROM users WHERE id = $1', [buyerId]);
    const buyerName = buyerInfo.rows[0]?.full_name || 'A buyer';
    createNotification(sellerId, 'new_message', 'New Offer', `${buyerName} offered G ${offeredPrice} for ${productName || product.rows[0].name}`, { conversationId: req.params.id, senderId: buyerId, senderName: buyerName });
    res.status(201).json({ message: { ...message, offer_data: { productId: offer.product_id, productName: productName || product.rows[0].name, offeredPrice: parseFloat(offer.offered_price), listPrice: parseFloat(offer.list_price), status: offer.status, negotiationRound: 1 } } });
  } catch (err) { try { await client.query('ROLLBACK'); } catch {} client.release(); console.error('Send offer error:', err); res.status(500).json({ error: 'Server error' }); }
});

// Respond to offer
router.post('/api/offers/:messageId/respond', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { action } = req.body;
    if (!action || !['accepted', 'declined'].includes(action)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Action must be "accepted" or "declined"' }); }
    const offerRes = await client.query('SELECT mo.*, m.conversation_id FROM message_offers mo JOIN messages m ON mo.message_id = m.id WHERE mo.message_id = $1 FOR UPDATE', [req.params.messageId]);
    if (offerRes.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Offer not found' }); }
    const offer = offerRes.rows[0];
    const convCheck = await client.query('SELECT 1 FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [offer.conversation_id, req.user.id]);
    if (convCheck.rows.length === 0) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Not a member of this conversation' }); }
    const sellerResponding = req.user.id === offer.seller_id && offer.status === 'pending';
    const buyerRespondingToCounter = req.user.id === offer.buyer_id && offer.status === 'countered';
    if (!sellerResponding && !buyerRespondingToCounter) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Only the recipient can respond to this offer' }); }
    if (offer.expires_at && new Date(offer.expires_at) < new Date()) {
      await client.query("UPDATE message_offers SET status = 'expired' WHERE message_id = $1", [req.params.messageId]);
      await client.query('COMMIT'); return res.status(400).json({ error: 'Offer has expired' });
    }
    await client.query('UPDATE message_offers SET status = $1, responded_at = CURRENT_TIMESTAMP WHERE message_id = $2', [action, req.params.messageId]);
    const responderInfo = await client.query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
    const responderName = responderInfo.rows[0]?.full_name || 'Seller';
    const productInfo = await client.query('SELECT name FROM products WHERE id = $1', [offer.product_id]);
    const productName = productInfo.rows[0]?.name || 'the item';
    const systemContent = action === 'accepted' ? `Offer accepted — you can now check out "${productName}" at G ${offer.offered_price}` : `Offer declined for "${productName}"`;
    await client.query(`INSERT INTO messages (conversation_id, sender_id, content, message_type) VALUES ($1, $2, $3, 'text')`, [offer.conversation_id, req.user.id, systemContent]);
    await client.query('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1', [offer.conversation_id]);
    await client.query('COMMIT');
    client.release();
    const recipientId = req.user.id === offer.buyer_id ? offer.seller_id : offer.buyer_id;
    const buyerNotifMsg = action === 'accepted' ? `Your offer of G ${offer.offered_price} for "${productName}" was accepted!` : `Your offer of G ${offer.offered_price} for "${productName}" was declined.`;
    createNotification(recipientId, 'new_message', action === 'accepted' ? 'Offer Accepted' : 'Offer Declined', buyerNotifMsg, { conversationId: offer.conversation_id, senderId: req.user.id, senderName: responderName });
    res.json({ success: true, status: action });
  } catch (err) { try { await client.query('ROLLBACK'); } catch {} client.release(); console.error('Respond to offer error:', err); res.status(500).json({ error: 'Server error' }); }
});

// Counter offer
router.post('/api/offers/:messageId/counter', authRequired, msgLimiter, async (req, res) => {
  const client = await pool.connect();
  try {
    const offeredPrice = Number(req.body.offeredPrice);
    if (!Number.isFinite(offeredPrice) || offeredPrice <= 0) return res.status(400).json({ error: 'A valid counter price is required' });
    await client.query('BEGIN');
    const result = await client.query('SELECT mo.*, m.conversation_id FROM message_offers mo JOIN messages m ON m.id = mo.message_id WHERE mo.message_id = $1 FOR UPDATE', [req.params.messageId]);
    const offer = result.rows[0];
    if (!offer) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Offer not found' }); }
    if (offer.seller_id !== req.user.id || !['pending', 'countered'].includes(offer.status)) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'This offer cannot be countered' }); }
    if (offer.expires_at && new Date(offer.expires_at) < new Date()) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Offer has expired' }); }
    const currentRound = offer.negotiation_round || 1;
    if (currentRound >= 3) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Maximum 3 negotiation rounds reached.' }); }
    await client.query("UPDATE message_offers SET offered_price = $1, status = 'countered', negotiation_round = $2, responded_at = CURRENT_TIMESTAMP, expires_at = CURRENT_TIMESTAMP + INTERVAL '48 hours' WHERE message_id = $3", [offeredPrice, currentRound + 1, req.params.messageId]);
    await client.query("INSERT INTO messages (conversation_id, sender_id, content, message_type) VALUES ($1, $2, $3, 'text')", [offer.conversation_id, req.user.id, `Seller countered with G ${offeredPrice} (round ${currentRound + 1}/3)`]);
    await client.query('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1', [offer.conversation_id]);
    await client.query('COMMIT');
    client.release();
    createNotification(offer.buyer_id, 'new_message', 'Counter offer', `The seller countered your offer with G ${offeredPrice}.`, { conversationId: offer.conversation_id, senderId: req.user.id });
    res.json({ success: true, status: 'countered', offeredPrice, negotiationRound: currentRound + 1 });
  } catch (err) { try { await client.query('ROLLBACK'); } catch {} client.release(); console.error('Counter offer error:', err); res.status(500).json({ error: 'Server error' }); }
});

// Seller's active items for offer carousel
router.get('/api/sellers/:id/items', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.price, p.stock, p.sale_price, p.sale_starts_at, p.sale_ends_at,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN p.sale_price ELSE p.price END)::DECIMAL(10,2) AS effective_price,
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

// Offer details
router.get('/api/offers/:messageId', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT mo.*, p.name AS product_name,
              (SELECT image_url FROM product_images WHERE product_id = mo.product_id ORDER BY is_primary DESC, display_order ASC LIMIT 1) AS product_image,
              bu.full_name AS buyer_name, bu.avatar_url AS buyer_avatar, bu.seller_tier AS buyer_tier,
              su.full_name AS seller_name, su.avatar_url AS seller_avatar, su.seller_tier AS seller_tier,
              su.use_store_identity AS seller_use_store_identity, su.store_logo_url AS seller_store_logo_url
       FROM message_offers mo JOIN products p ON p.id = mo.product_id JOIN messages m ON m.id = mo.message_id
       JOIN conversations c ON c.id = mo.conversation_id JOIN users bu ON bu.id = mo.buyer_id JOIN users su ON su.id = mo.seller_id
       WHERE mo.message_id = $1 AND (c.buyer_id = $2 OR c.seller_id = $2)`,
      [req.params.messageId, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Offer not found' });
    const o = result.rows[0];
    res.json({ offer: { messageId: o.message_id, productId: o.product_id, productName: o.product_name, productImage: o.product_image, offeredPrice: parseFloat(o.offered_price), listPrice: parseFloat(o.list_price), status: o.status, negotiationRound: o.negotiation_round || 1, buyerId: o.buyer_id, sellerId: o.seller_id, buyerName: o.buyer_name, buyerAvatar: o.buyer_avatar, sellerName: o.seller_name, sellerAvatar: o.seller_avatar, sellerTier: o.seller_tier, sellerUseStoreIdentity: o.seller_use_store_identity, sellerStoreLogoUrl: o.seller_store_logo_url, expiresAt: o.expires_at, createdAt: o.created_at, respondedAt: o.responded_at } });
  } catch (err) {
    console.error('Offer details error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
