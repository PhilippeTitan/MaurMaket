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
//   3. Only identity and intent are stored server-side — product, variant,
//      quantity, and (when a line came from an accepted offer) the offer it is
//      bound to. Names, prices, images, and stock are read live from the listing
//      when the cart is opened, which is what makes a cart that spans devices show
//      current prices instead of whatever one device saw last week. It is also why
//      nothing here touches stock: a cart is a note to self, not a reservation.
//
//      The accepted offer is *intent*, not a snapshot: a buyer who agreed a price
//      in a chat and tapped "checkout this offer" expects that agreement to be
//      there in the cart on any device, and the price to be the agreed one. It is
//      carried as a reference only — the server re-validates the offer (still
//      accepted, unconsumed, unexpired, right product and quantity) on every read
//      and again at checkout, so a stale reference cannot buy anything.
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The offer agreement a line is bound to, or null. A reference is opaque here —
 * whether it still stands is the server's answer, never the client's.
 */
export function normalizeOfferReference(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim()) ? value.trim() : null;
}

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
      item: {
        id,
        variantId,
        quantity: Math.min(quantity, MAX_LINE_QUANTITY),
        offerMessageId: normalizeOfferReference(raw.acceptedOfferMessageId),
        source: raw,
      },
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
 * (a line the account has never seen), which includes an offer agreement accepted
 * on this device while the account has not seen it yet. Repeat calls with the same
 * inputs produce the same cart, so a device can re-sync after every restart
 * without inflating.
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
    // The account's own record of the agreement wins; the device's is kept only
    // while the account has none, and the server re-validates it on the push.
    const offerMessageId = normalizeOfferReference(existing.acceptedOfferMessageId) || line.item.offerMessageId;
    const next = { ...existing, quantity };
    if (offerMessageId) next.acceptedOfferMessageId = offerMessageId;
    merged.set(line.lineKey, next);
  }
  return [...merged.values()];
}

/**
 * Does the account need this device's version of the cart?
 *
 * True when the merge holds a line the server has never seen, a larger quantity
 * than the server holds, or an offer agreement the server does not know about.
 * Price and stock differences are deliberately not a reason to write anything:
 * the server reads those live, so a push could not change them anyway.
 *
 * @param {Array<any>} mergedItems the cart after merging
 * @param {Array<any>} remoteItems the cart as the server just reported it
 */
export function cartNeedsPush(mergedItems, remoteItems) {
  const remote = new Map(normalizeCartLines(remoteItems).map((line) => [line.lineKey, line.item]));
  for (const line of normalizeCartLines(mergedItems)) {
    const existing = remote.get(line.lineKey);
    if (!existing) return true;
    if (line.item.quantity > existing.quantity) return true;
    if (line.item.offerMessageId && !existing.offerMessageId) return true;
  }
  return false;
}

/**
 * The identity payload the server stores: product, variant, quantity — no
 * snapshots, no prices, nothing that can go stale or that a cart has no business
 * asserting.
 *
 * The offer reference rides along only when a line has one, so an ordinary line
 * still asserts identity and quantity and nothing else.
 *
 * @param {Array<any>} items
 * @returns {Array<{ productId: string, variantId: string|null, quantity: number, acceptedOfferMessageId?: string }>}
 */
export function toCartPayload(items) {
  return normalizeCartLines(items).map((line) => ({
    productId: line.item.id,
    variantId: line.item.variantId,
    quantity: line.item.quantity,
    ...(line.item.offerMessageId ? { acceptedOfferMessageId: line.item.offerMessageId } : {}),
  }));
}
