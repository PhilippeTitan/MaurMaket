// Batch 75 / APP-Q097 — the cart's identity rules.
//
// "Should a signed-in cart follow the account across devices?" Answered: yes, a
// signed-in cart syncs across devices; a guest cart stays on the device; and the
// cart never reserves stock.
//
// Three consequences shape this file:
//
//   1. There are two carts on a device, not one. A guest cart belongs to whoever
//      is holding the phone and must survive sign-in; an account cart belongs to
//      the account and must not be handed to the next person who signs in. They
//      are separate storage keys, and sign-out sweeps the account one only.
//   2. Signing in MERGES rather than replaces, and the merge is idempotent: the
//      union of both carts, with the larger quantity per line. Adding them would
//      double a line every time the app restarts, and taking the local copy would
//      silently drop a line added on another device.
//   3. Only identity and intent are stored server-side — product, variant, and
//      quantity. Names, prices, images, and stock are read live from the listing
//      when the cart is opened, which is what makes a cart that spans devices show
//      current prices instead of whatever one device saw last week. It is also why
//      nothing here touches stock: a cart is a note to self, not a reservation.
//
// No imports, so Node scripts and Metro/TypeScript (`allowJs`) share one
// definition of a cart line.

/**
 * Identity of a cart line: product id, or product+variant when the listing has
 * options. store.ts re-exports this, so every screen and the sync layer agree on
 * what "the same line" means.
 */
export const cartLineKey = (c) => {
  if (!c || !c.id) return '';
  return c.variantId ? `${c.id}::${c.variantId}` : c.id;
};

/** The signed-in account's cart, cached on this device. Swept at sign-out. */
export const CART_ACCOUNT_KEY = 'mm_cart_account';

/** The guest cart. Device-local, kept at sign-out. */
export const CART_GUEST_KEY = 'mm_cart';

/** A cart is a shopping list, not a warehouse. */
export const MAX_CART_LINES = 100;
export const MAX_LINE_QUANTITY = 999;

/**
 * Keep only well-formed lines: a product id, a positive integer quantity, and a
 * variant id when there is one. Anything else is dropped rather than guessed at,
 * because a cart line with no product cannot be read, priced, or ordered.
 *
 * @param {Array<any>} items
 * @returns {Array<{ lineKey: string, item: { id: string, variantId: string|null, quantity: number, source: any } }>}
 */
export function normalizeCartLines(items) {
  const list = Array.isArray(items) ? items : [];
  const seen = new Set();
  const lines = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id : (typeof raw.productId === 'string' ? raw.productId : null);
    if (!id) continue;
    const variantId = typeof raw.variantId === 'string' && raw.variantId.trim() ? raw.variantId : null;
    const quantity = Math.floor(Number(raw.quantity));
    if (!Number.isFinite(quantity) || quantity < 1) continue;
    const lineKey = cartLineKey({ id, variantId });
    if (seen.has(lineKey)) continue;
    seen.add(lineKey);
    lines.push({
      lineKey,
      item: { id, variantId, quantity: Math.min(quantity, MAX_LINE_QUANTITY), source: raw },
    });
    if (lines.length >= MAX_CART_LINES) break;
  }
  return lines;
}

/**
 * The union of two carts, keyed by line, with the larger quantity per shared line.
 *
 * `remote` wins the display fields for a shared line because the server reads them
 * live from the listing; `local` only fills in what the server does not know about
 * (a line the account has never seen). Repeat calls with the same inputs produce
 * the same cart, so a device can re-sync after every restart without inflating.
 *
 * @param {Array<any>} localItems the cart on this device
 * @param {Array<any>} remoteItems the cart on the account
 * @returns {Array<any>}
 */
export function mergeCarts(localItems, remoteItems) {
  const merged = new Map();
  for (const line of normalizeCartLines(remoteItems)) merged.set(line.lineKey, line.item.source || line.item);
  for (const line of normalizeCartLines(localItems)) {
    const existing = merged.get(line.lineKey);
    if (!existing) {
      merged.set(line.lineKey, line.item.source || line.item);
      continue;
    }
    const quantity = Math.max(
      Math.floor(Number(existing.quantity)) || 1,
      line.item.quantity
    );
    merged.set(line.lineKey, { ...existing, quantity });
  }
  return [...merged.values()];
}

/**
 * The identity payload the server stores: product, variant, quantity — no
 * snapshots, no prices, nothing that can go stale or that a cart has no business
 * asserting.
 *
 * @param {Array<any>} items
 * @returns {Array<{ productId: string, variantId: string|null, quantity: number }>}
 */
export function toCartPayload(items) {
  return normalizeCartLines(items).map((line) => ({
    productId: line.item.id,
    variantId: line.item.variantId,
    quantity: line.item.quantity,
  }));
}
