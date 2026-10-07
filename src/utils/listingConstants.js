// Shared, dependency-free listing rules for the Add Product experience.
// Imported by BOTH the Express backend (re-exported through listingPolicy.js)
// and the React Native app — keep this file free of imports (no database, no
// Node-only APIs) so Metro can bundle it.
// Source of truth: AGENTS.md "Add Product Discovery — Complete / Implementation Ready".
// Seller tier is an entitlement (listing caps); identity verification (id_verified)
// is a separate gate required of every tier before selling.

export const TIER_CAPS = { none: 0, casual: 10, verified: 100, business: Infinity };
export const CONDITIONS = ['new', 'like_new', 'good', 'fair', 'for_parts'];

/** Maps a stored condition value to its i18n message key (shared by UI surfaces). */
/** @type {Record<string, string>} */
export const CONDITION_I18N_KEYS = {
  new: 'addListing.cond.new',
  like_new: 'addListing.cond.likeNew',
  good: 'addListing.cond.good',
  fair: 'addListing.cond.fair',
  for_parts: 'addListing.cond.forParts',
};

export const FLAW_REQUIRED_CONDITIONS = ['like_new', 'good', 'fair', 'for_parts'];
export const MAX_PHOTOS = 8;
export const MIN_PRICE = 100;
export const MAX_PRICE = 99999;
export const MAX_VARIANTS = 100;
export const MAX_VARIANT_DIMENSIONS = 2;
export const MAX_ATTR_KEYS = 5;
export const MAX_DRAFTS_PER_SELLER = 30;
export const DEFAULT_LOW_STOCK_THRESHOLD = 3;
export const LISTING_LANGUAGES = ['en', 'fr', 'ht'];

// Optional category-aware attributes (labels come from i18n: addListing.attr.*).
// Every category may use 'brand'; extras are listed per category name (lowercase).
export const CATEGORY_ATTRS = {
  electronics: ['brand', 'model', 'warranty'],
  clothing: ['brand', 'size', 'material'],
  'home & garden': ['brand', 'material'],
  sports: ['brand'],
  beauty: ['brand'],
  vehicles: ['brand', 'year'],
  books: ['author', 'publisher'],
  'food & drinks': ['brand'],
  other: ['brand'],
};
export const COMMON_ATTRS = ['brand'];

export function tierCapFor(tier) {
  const cap = TIER_CAPS[tier];
  return cap === undefined ? 0 : cap;
}

export function allowedAttrsForCategory(categoryName) {
  const key = (categoryName || '').toLowerCase();
  const specific = CATEGORY_ATTRS[key] || [];
  return Array.from(new Set([...specific, ...COMMON_ATTRS]));
}

export function conditionRequired(condition) {
  return CONDITIONS.includes(condition);
}

export function flawNotesRequired(condition) {
  return FLAW_REQUIRED_CONDITIONS.includes(condition);
}

// ───── Variant helpers (pure) ─────

export function variantComboLabel(options) {
  return Object.entries(options || {})
    .map(([k, v]) => `${k}: ${v}`)
    .join(' / ');
}

// dims: [{ name, values: string[] }] → [{ options: { dim: value } }]
/**
 * @param {Array<{ name: string, values: string[] }>} dims
 * @returns {Array<{ options: Record<string, string> }>}
 */
export function generateVariantCombos(dims) {
  const active = (dims || []).filter(
    (d) => d && typeof d.name === 'string' && d.name.trim() && Array.isArray(d.values) && d.values.length > 0
  );
  if (active.length === 0) return [];
  const combos = active.reduce(
    (acc, dim) => {
      const next = [];
      const name = dim.name.trim();
      for (const base of acc) {
        for (const val of dim.values) next.push({ ...base, [name]: val });
      }
      return next;
    },
    [{}]
  );
  return combos.map((options) => ({ options }));
}

// Rebuild dimension definitions from saved combos (duplicate/resumed drafts).
export function dimsFromVariants(variants) {
  const names = [];
  const values = {};
  for (const v of variants || []) {
    const opts = (v && v.options) || {};
    for (const [k, val] of Object.entries(opts)) {
      if (!names.includes(k)) {
        names.push(k);
        values[k] = [];
      }
      if (val && !values[k].includes(String(val))) values[k].push(String(val));
    }
  }
  const dims = names.map((n) => ({ name: n, values: values[n] }));
  while (dims.length < MAX_VARIANT_DIMENSIONS) dims.push({ name: '', values: [] });
  return dims.slice(0, MAX_VARIANT_DIMENSIONS);
}

// ───── Moderation (v1 keyword policy) ─────
// Conservative high-confidence scam patterns only; ordinary marketplace language
// (including phone numbers and prices) must never be flagged.
// APP-Q549: matches are private review signals, never decisions. A flagged
// listing is held for human review; automated checks never restrict, reject, or
// punish on their own, and the seller is told a person will review the flag.
const MODERATION_PATTERNS = [
  { id: 'wire_transfer', re: /western union|moneygram|money gram|wire transfer/i },
  { id: 'advance_fee', re: /advance (fee|payment)|pay (first|upfront)|send (money|cash) (first|ahead)/i },
  { id: 'guaranteed_income', re: /guaranteed (income|profit|returns?)|double your money|get rich quick/i },
  { id: 'fake_giveaway', re: /crypto giveaway|bitcoin giveaway|paypal (gift|friends and family)|100% guaranteed/i },
  { id: 'off_platform_payment', re: /pay(ment)? outside maurmaket|skip (moncash|escrow)/i },
];

export function assessModeration(listing) {
  const d = listing || {};
  const text = [d.name, d.description, d.flawNotes].filter(Boolean).join('\n');
  for (const { id, re } of MODERATION_PATTERNS) {
    const m = text.match(re);
    if (m) return { flagged: true, reason: `Flagged phrase: "${m[0]}" (${id})` };
  }
  return { flagged: false, reason: null };
}

// Effective checkout methods = seller profile capability ∩ listing opt-in flags.
// null listing flag = "inherit seller profile".
export function normalizeFulfillmentFlags(profile, listing) {
  const p = profile || {};
  const l = listing || {};
  return {
    meetup: l.meetupEnabled === undefined || l.meetupEnabled === null ? !!p.meetupEnabled : !!l.meetupEnabled,
    delivery: l.deliveryEnabled === undefined || l.deliveryEnabled === null ? !!p.deliveryEnabled : !!l.deliveryEnabled,
  };
}
