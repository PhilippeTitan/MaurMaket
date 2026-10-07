import { Router } from 'express';
import { pool } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';
import { normalizeCartLines } from '../utils/cartSync.js';

const router = Router();

// Batch 75 / APP-Q097 — a signed-in cart follows the account across devices.
//
// Three things this file deliberately does NOT do:
//
//   * it does not store a snapshot of the listing. Only product, variant, and
//     quantity live in `cart_items`; names, prices, images, and stock are read
//     live from `products` on every read, so a cart that has been sitting on
//     another device cannot show last week's price.
//   * it does not reserve stock. Adding to a cart writes one row and nothing
//     else — reserving on cart-add is how a marketplace lets one shopper hold a
//     seller's only item hostage. Stock is decided at checkout, as it already is.
//   * it does not accept a client's idea of price or stock. Quantity and identity
//     are the only things a device gets to assert, plus a *reference* to an offer
//     it claims to have accepted — and that reference is checked here, on every
//     read, and again at checkout before it can change a price.
//
// Reads are scoped to the caller's own rows; there is no route that can read or
// write another account's cart.

// Live view of one account's cart lines, hydrated from the listings.
//
// The offer join is deliberately narrow: it matches only while the offer is still
// the buyer's, for this same product, accepted, not already turned into an order,
// and not past its accepted window. An offer that lapsed simply stops matching, so
// the line falls back to live pricing and becomes editable again — the cart never
// shows an agreement the buyer can no longer use.
const CART_QUERY = `
  SELECT ci.product_id, ci.variant_id, ci.quantity, ci.added_at,
         p.name, p.price, p.sale_price, p.sale_starts_at, p.sale_ends_at,
         p.stock, p.is_available, p.seller_id, p.listing_status,
         s.full_name AS seller_name, s.store_name,
         v.id AS v_id, v.price AS v_price, v.stock AS v_stock,
         v.option_label AS v_label, v.options AS v_options, v.is_active AS v_active,
         mo.message_id AS offer_message_id, mo.offered_price AS offer_price,
         (SELECT json_agg(json_build_object(
                   'id', pi.id, 'url', pi.image_url,
                   'is_primary', pi.is_primary, 'display_order', pi.display_order)
                 ORDER BY pi.is_primary DESC, pi.display_order)
            FROM product_images pi WHERE pi.product_id = p.id) AS images
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    LEFT JOIN product_variants v ON v.id = ci.variant_id
    LEFT JOIN users s ON s.id = p.seller_id
    LEFT JOIN message_offers mo
           ON mo.message_id = ci.accepted_offer_message_id
          AND mo.buyer_id = ci.user_id
          AND mo.product_id = ci.product_id
          AND mo.status = 'accepted'
          AND mo.accepted_checkout_id IS NULL
          AND (mo.accepted_expires_at IS NULL OR mo.accepted_expires_at > CURRENT_TIMESTAMP)
   WHERE ci.user_id = $1
   ORDER BY ci.added_at ASC, p.name ASC
`;

function saleIsActive(row) {
  return row.sale_price !== null && row.sale_price !== undefined
    && (row.sale_starts_at === null || new Date(row.sale_starts_at) <= new Date())
    && (row.sale_ends_at === null || new Date(row.sale_ends_at) >= new Date());
}

/**
 * Shape one cart row like the CartItem the app already works with.
 *
 * A line whose listing has gone unavailable stays in the cart rather than
 * disappearing silently, but reports 0 stock — which is exactly how the cart UI
 * already treats an item that can no longer be bought.
 */
function shapeCartLine(row) {
  const hasVariant = Boolean(row.variant_id);
  // An accepted offer replaces the price for its line, exactly as it did when the
  // buyer tapped "checkout this offer" — one agreed price, no sale tag on top.
  const offerPrice = row.offer_message_id ? Number(row.offer_price) : null;
  // Same visibility rule the rest of the catalogue uses: published and available.
  // A listing pulled back into review, paused, or rejected is not purchasable.
  const published = row.listing_status === 'active' || row.listing_status === null || row.listing_status === undefined;
  const purchasable = row.is_available === true && published && (!hasVariant || row.v_active === true);
  const listPrice = offerPrice !== null
    ? offerPrice
    : (hasVariant ? Number(row.v_price) : Number(row.price));
  const onSale = offerPrice === null && !hasVariant && saleIsActive(row);
  const effective = offerPrice !== null
    ? offerPrice
    : (hasVariant ? Number(row.v_price) : (onSale ? Number(row.sale_price) : Number(row.price)));
  const discountPct = onSale && listPrice > 0
    ? Math.max(0, Math.round((1 - effective / listPrice) * 100))
    : 0;
  return {
    id: row.product_id,
    name: row.name,
    price: listPrice,
    effective_price: effective,
    is_on_sale: onSale,
    discount_pct: discountPct,
    ...(offerPrice !== null ? { acceptedOfferMessageId: row.offer_message_id } : {}),
    quantity: row.quantity,
    images: row.images || [],
    seller_id: row.seller_id,
    seller_name: row.seller_name || null,
    store_name: row.store_name || null,
    stock: purchasable ? Number(hasVariant ? row.v_stock : row.stock) : 0,
    variantId: row.variant_id || null,
    variantLabel: hasVariant ? (row.v_label || null) : null,
    variantOptions: hasVariant ? (row.v_options || null) : null,
  };
}

async function loadCart(userId, db = pool) {
  const result = await db.query(CART_QUERY, [userId]);
  return result.rows.map(shapeCartLine);
}

// ─── GET /cart ──────────────────────────────────────────────────────────────
// The account's cart, live. An empty list is a real answer: nothing in it.
router.get('/cart', authRequired, async (req, res) => {
  try {
    res.json({ items: await loadCart(req.user.id) });
  } catch (err) {
    console.error('Cart read error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PUT /cart ──────────────────────────────────────────────────────────────
// Replace the account's cart with the device's list. Replace-all is deliberate:
// the client merges before pushing (see src/utils/cartSync.js), so one request
// settles the whole cart with no ordering race between two devices, and a repeat
// of the same request is a no-op.
//
// Lines are dropped rather than failing the request when they cannot be kept —
// a listing deleted, a variant that no longer belongs to the product, or the
// caller's own listing — and the response names them, so the device can tell the
// difference between "synced" and "synced, minus one".
//
// An offer reference is checked the same way: only an offer that is the caller's,
// for the line's own product and quantity, still accepted, unconsumed and inside
// its window is stored. A reference that fails is *released* instead of ignored —
// the line is kept at live pricing and reported separately, because "this item is
// gone" and "your agreed price expired" are different things to be told.
router.put('/cart', authRequired, async (req, res) => {
  const lines = normalizeCartLines(req.body?.items);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const productIds = [...new Set(lines.map((line) => line.item.id))];
    const variantIds = [...new Set(lines.map((line) => line.item.variantId).filter(Boolean))];
    const offerIds = [...new Set(lines.map((line) => line.item.offerMessageId).filter(Boolean))];
    const products = productIds.length
      ? await client.query('SELECT id, seller_id FROM products WHERE id = ANY($1::uuid[])', [productIds])
      : { rows: [] };
    const variants = variantIds.length
      ? await client.query('SELECT id, product_id FROM product_variants WHERE id = ANY($1::uuid[])', [variantIds])
      : { rows: [] };
    const offers = offerIds.length
      ? await client.query(
        `SELECT message_id, product_id, quantity
           FROM message_offers
          WHERE message_id = ANY($1::uuid[])
            AND buyer_id = $2
            AND status = 'accepted'
            AND accepted_checkout_id IS NULL
            AND (accepted_expires_at IS NULL OR accepted_expires_at > CURRENT_TIMESTAMP)`,
        [offerIds, req.user.id]
      )
      : { rows: [] };
    const productById = new Map(products.rows.map((row) => [row.id, row]));
    const variantById = new Map(variants.rows.map((row) => [row.id, row]));
    const offerById = new Map(offers.rows.map((row) => [row.message_id, row]));

    const accepted = [];
    const ignored = [];
    const released = [];
    const claimedOffers = new Set();
    for (const line of lines) {
      const product = productById.get(line.item.id);
      if (!product) { ignored.push({ productId: line.item.id, variantId: line.item.variantId, reason: 'unavailable' }); continue; }
      if (product.seller_id === req.user.id) { ignored.push({ productId: line.item.id, variantId: line.item.variantId, reason: 'own-listing' }); continue; }
      if (line.item.variantId && variantById.get(line.item.variantId)?.product_id !== line.item.id) {
        ignored.push({ productId: line.item.id, variantId: line.item.variantId, reason: 'variant-mismatch' });
        continue;
      }

      let offerMessageId = null;
      if (line.item.offerMessageId) {
        const offer = offerById.get(line.item.offerMessageId);
        if (!offer) {
          released.push({ productId: line.item.id, variantId: line.item.variantId, reason: 'offer-expired' });
        } else if (offer.product_id !== line.item.id || Number(offer.quantity) !== line.item.quantity || claimedOffers.has(line.item.offerMessageId)) {
          released.push({ productId: line.item.id, variantId: line.item.variantId, reason: 'offer-mismatch' });
        } else {
          claimedOffers.add(line.item.offerMessageId);
          offerMessageId = line.item.offerMessageId;
        }
      }

      accepted.push({ line, offerMessageId });
    }

    await client.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);
    for (const { line, offerMessageId } of accepted) {
      await client.query(
        `INSERT INTO cart_items (user_id, product_id, variant_id, quantity, accepted_offer_message_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user.id, line.item.id, line.item.variantId, line.item.quantity, offerMessageId]
      );
    }

    const items = await loadCart(req.user.id, client);
    await client.query('COMMIT');
    res.json({ items, ignored, released });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Cart write error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ─── DELETE /cart ───────────────────────────────────────────────────────────
// Empty the account's cart (used after a completed checkout).
router.delete('/cart', authRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);
    res.json({ items: [] });
  } catch (err) {
    console.error('Cart clear error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
