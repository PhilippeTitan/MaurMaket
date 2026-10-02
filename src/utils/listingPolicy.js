// Shared listing rules for the Add Product experience.
// Source of truth: AGENTS.md "Add Product Discovery — Complete / Implementation Ready".
// Pure constants/helpers live in listingConstants.js (dependency-free so the
// React Native app can import them too); this module re-exports them and adds
// the database-backed checks.

import { pool } from '../config/database.js';
import {
  TIER_CAPS,
  CONDITIONS,
  FLAW_REQUIRED_CONDITIONS,
  MIN_PRICE,
  MAX_PRICE,
  MAX_PHOTOS,
  MAX_VARIANTS,
  MAX_VARIANT_DIMENSIONS,
  MAX_ATTR_KEYS,
  LISTING_LANGUAGES,
  DEFAULT_LOW_STOCK_THRESHOLD,
  tierCapFor,
} from './listingConstants.js';

export * from './listingConstants.js';

export function countActiveListings(sellerId, client = pool) {
  return client
    .query(
      `SELECT COUNT(*)::int AS count FROM products
        WHERE seller_id = $1 AND listing_status = 'active' AND is_available = true`,
      [sellerId]
    )
    .then((r) => r.rows[0].count);
}

// extra = how many additional listings we are about to make active.
export async function checkTierCap(sellerId, tier, extra = 1, client = pool) {
  const cap = tierCapFor(tier);
  if (cap === Infinity) return { ok: true, cap: null, count: 0 };
  const count = await countActiveListings(sellerId, client);
  return { ok: count + extra <= cap, cap, count };
}

// ───── Validation ─────
// publish = false → draft autosave: only structural/length checks so incomplete
// drafts survive. publish = true → full pre-publish rules (plain English messages,
// mirrored client-side with i18n for immediate feedback).
export function validateListingPayload(data, { publish = false } = {}) {
  const errors = [];
  const d = data || {};

  const name = typeof d.name === 'string' ? d.name.trim() : '';
  if (name.length > 200) errors.push('Product name too long (max 200 characters)');
  if (d.description && d.description.length > 5000) {
    errors.push('Description too long (max 5000 characters)');
  }
  if (d.flawNotes && d.flawNotes.length > 2000) {
    errors.push('Condition details too long (max 2000 characters)');
  }
  if (d.sku && d.sku.length > 60) errors.push('SKU too long (max 60 characters)');
  if (d.languageLabel && !LISTING_LANGUAGES.includes(d.languageLabel)) {
    errors.push('Unsupported language label');
  }
  if (d.condition && !CONDITIONS.includes(d.condition)) {
    errors.push('Unknown item condition');
  }

  if (d.attrs !== undefined && d.attrs !== null) {
    if (typeof d.attrs !== 'object' || Array.isArray(d.attrs)) {
      errors.push('Invalid attributes');
    } else {
      const keys = Object.keys(d.attrs);
      if (keys.length > MAX_ATTR_KEYS) errors.push(`Too many attributes (max ${MAX_ATTR_KEYS})`);
      for (const k of keys) {
        if (k.length > 30) errors.push('Attribute name too long');
        const v = d.attrs[k];
        if (v !== null && v !== undefined && String(v).length > 100) {
          errors.push('Attribute value too long');
        }
      }
    }
  }

  if (d.lowStockThreshold !== undefined && d.lowStockThreshold !== null && d.lowStockThreshold !== '') {
    const th = parseInt(d.lowStockThreshold, 10);
    if (isNaN(th) || th < 1 || th > 20) errors.push('Low-stock alert must be between 1 and 20');
  }

  const variants = Array.isArray(d.variants) ? d.variants : null;
  if (variants) {
    if (variants.length > MAX_VARIANTS) errors.push(`Too many variants (max ${MAX_VARIANTS})`);
    const seen = new Set();
    for (const v of variants) {
      const opts = v && typeof v.options === 'object' && v.options ? v.options : null;
      if (!opts || Object.keys(opts).length === 0) {
        errors.push('Each variant needs its options');
        continue;
      }
      const dimCount = Object.keys(opts).length;
      if (dimCount > MAX_VARIANT_DIMENSIONS) {
        errors.push(`Use at most ${MAX_VARIANT_DIMENSIONS} option types per listing`);
      }
      const label = Object.entries(opts).map(([k, val]) => `${k}: ${val}`).join(' / ');
      if (seen.has(label)) errors.push('Duplicate variant options');
      seen.add(label);
      if (v.sku && String(v.sku).length > 60) errors.push('Variant SKU too long (max 60 characters)');
      // Price/stock completeness is a publish rule only — drafts may hold
      // half-typed variant prices while the seller is still working.
      if (publish) {
        const vp = parseFloat(v.price);
        if (isNaN(vp) || vp < MIN_PRICE || vp > MAX_PRICE) {
          errors.push(`Variant price must be between ${MIN_PRICE} and ${MAX_PRICE} G`);
        }
        const vs = parseInt(v.stock, 10);
        if (isNaN(vs)) errors.push('Every option needs a stock count (use 0 if out of stock)');
        else if (vs < 0) errors.push('Variant stock cannot be negative');
      }
    }
  }

  if (!publish) return errors;

  if (!name) errors.push('Product name is required');
  if (!d.condition || !CONDITIONS.includes(d.condition)) {
    errors.push('Please choose the item condition');
  } else if (flawNotesRequired(d.condition) && !(d.flawNotes || '').trim()) {
    errors.push('Please describe the item’s known flaws honestly');
  }
  if (!d.categoryId) errors.push('Please choose a category');

  const images = Array.isArray(d.images) ? d.images : [];
  if (images.length === 0) errors.push('Add at least one photo');
  if (images.length > MAX_PHOTOS) errors.push(`Maximum ${MAX_PHOTOS} images allowed`);

  const basePrice = parseFloat(d.price);
  const baseStock = d.stock === undefined || d.stock === null || d.stock === '' ? null : parseInt(d.stock, 10);

  if (variants && variants.length > 0) {
    const prices = variants.map((v) => parseFloat(v.price)).filter((p) => !isNaN(p));
    const totalStock = variants.reduce((s, v) => s + (parseInt(v.stock, 10) || 0), 0);
    if (prices.length < variants.length) errors.push('Every variant needs a price');
    if (prices.some((p) => p < MIN_PRICE || p > MAX_PRICE)) {
      errors.push(`Variant price must be between ${MIN_PRICE} and ${MAX_PRICE} G`);
    }
    if (totalStock < 1) errors.push('At least one variant must have stock');
  } else {
    if (isNaN(basePrice) || basePrice < MIN_PRICE || basePrice > MAX_PRICE) {
      errors.push(`Price must be between ${MIN_PRICE} and ${MAX_PRICE} G`);
    }
    if (baseStock === null || isNaN(baseStock) || baseStock < 1) {
      errors.push('Stock must be at least 1');
    }
  }

  if (d.salePrice !== undefined && d.salePrice !== null && d.salePrice !== '') {
    if (variants && variants.length > 0) {
      errors.push('Sale prices are not available for listings with variants');
    } else {
      const saleP = parseFloat(d.salePrice);
      const origP = parseFloat(d.price);
      if (isNaN(saleP) || saleP <= 0) {
        errors.push('Sale price must be a positive number');
      } else if (!isNaN(origP) && saleP >= origP) {
        errors.push('Sale price must be lower than the original price');
      } else if (!isNaN(origP)) {
        const discountPct = Math.round((1 - saleP / origP) * 100);
        if (discountPct > 25) errors.push('Maximum discount is 25%');
      }
    }
    if (!d.saleEndDate) {
      errors.push('Sale end date is required when setting a sale price');
    } else if (new Date(d.saleEndDate) <= new Date()) {
      errors.push('Sale end date must be in the future');
    }
  }

  return errors;
}

// Material = affects what is being sold or raises a safety/policy concern →
// re-runs moderation. Routine commercial edits never interrupt sales.
const MATERIAL_FIELDS = ['name', 'description', 'categoryId', 'condition', 'flawNotes'];

export function isMaterialChange(before, next) {
  const b = before || {};
  const n = next || {};
  for (const f of MATERIAL_FIELDS) {
    if (n[f] === undefined) continue;
    const bv = b[f] === undefined || b[f] === null ? '' : String(b[f]);
    const nv = n[f] === undefined || n[f] === null ? '' : String(n[f]);
    if (bv !== nv) return true;
  }
  if (n.attrs !== undefined) {
    const beforeAttrs = JSON.stringify(b.attrs || {});
    const afterAttrs = JSON.stringify(n.attrs || {});
    if (beforeAttrs !== afterAttrs) return true;
  }
  if (n.variants !== undefined) return true; // caller only passes when images/variants changed
  if (n.imagesChanged) return true;
  return false;
}

export function deniedPaymentError(tier) {
  return {
    error: 'Identity verification required before listing products.',
    code: 'VERIFICATION_REQUIRED',
    tier,
  };
}

// A price/stock/variant edit could rewrite an active commitment — those fields
// are locked while an order for this product is in flight or stock is reserved.
export async function hasActiveCommitment(productId, client = pool) {
  const order = await client.query(
    `SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE oi.product_id = $1
        AND o.status IN ('pending','paid','processing','shipped','delivered')
      LIMIT 1`,
    [productId]
  );
  if (order.rows.length > 0) return true;
  const res = await client.query(
    `SELECT 1 FROM stock_reservations WHERE product_id = $1 AND status = 'active' LIMIT 1`,
    [productId]
  );
  return res.rows.length > 0;
}

// Out-of-stock auto-pause + per-listing low-stock alert (one alert per crossing;
// resets when stock climbs back above the threshold).
export async function applyStockSideEffects(productId, client = pool) {
  const r = await client.query(
    `SELECT id, seller_id, name, stock, is_available, paused_reason,
            low_stock_threshold, low_stock_notified_at
       FROM products WHERE id = $1 FOR UPDATE`,
    [productId]
  );
  const p = r.rows[0];
  if (!p) return null;
  const total = Number(p.stock || 0);
  const threshold = p.low_stock_threshold || DEFAULT_LOW_STOCK_THRESHOLD;
  let soldOut = false;

  if (total < 1 && p.is_available) {
    await client.query(
      `UPDATE products SET is_available = false, paused_reason = 'out_of_stock', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [productId]
    );
    soldOut = true;
  }

  let lowStock = false;
  if (total >= 1 && total <= threshold && !p.low_stock_notified_at) {
    await client.query('UPDATE products SET low_stock_notified_at = CURRENT_TIMESTAMP WHERE id = $1', [productId]);
    lowStock = true;
  } else if (total > threshold && p.low_stock_notified_at) {
    await client.query('UPDATE products SET low_stock_notified_at = NULL WHERE id = $1', [productId]);
  }

  if (soldOut || lowStock) {
    try {
      const { createNotification } = await import('./notifications.js');
      if (soldOut) {
        await createNotification(
          p.seller_id,
          'product_sold_out',
          'A listing just sold out',
          `"${p.name}" has no stock left. Buyers can no longer order it until you restock.`,
          { screen: 'MyListings', productId: p.id }
        );
      } else {
        await createNotification(
          p.seller_id,
          'low_stock',
          'Low stock alert',
          `"${p.name}" has only ${total} left (your alert threshold is ${threshold}).`,
          { screen: 'MyListings', productId: p.id }
        );
      }
    } catch (e) {
      console.error('Stock notification error:', e.message);
    }
  }
  return { total, threshold, soldOut, lowStock };
}
