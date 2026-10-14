/**
 * Optional-analytics consent policy — Batch 77 (APP-Q416, APP-Q432).
 *
 * Ledger: "separate optional analytics from essential reliability/security
 * measurements, with a clear opt-out that does not remove core features", and
 * "stop future optional collection/use and delete or irreversibly aggregate
 * prior optional event data where feasible; retain essential security/reliability
 * records under their separate purpose."
 *
 * The app ships no optional analytics instrumentation at all. That is exactly why
 * this module exists instead of a lone settings row: the separation has to be a
 * mechanism before it can be a promise. Any future recorder is expected to ask
 * `shouldRecordAnalytics` first, so the answer is decided in one place instead of
 * being re-derived — and quietly forgotten — at each new call site.
 *
 * Three rules, and the third is what keeps the first two honest:
 *
 *   1. **Essential processing is never gated.** Security, reliability, billing,
 *      fulfilment, and support records exist to run the marketplace and keep
 *      people safe. A privacy preference must not be able to switch them off.
 *   2. **Optional use stops the moment the opt-out is set**, and the stored
 *      preference defaults to opted out, so nothing optional is recorded before
 *      the user has decided anything at all.
 *   3. **An event class nobody has classified is refused.** Unknown means no, so
 *      a new event type cannot become trackable just by being added at a call
 *      site and forgotten here.
 *
 * No imports and no SQL: the route, the screen's copy, and the guardrail all read
 * the same two lists.
 */

/** Processing that keeps the marketplace running and people safe. Never gated. */
export const ESSENTIAL_EVENT_CLASSES = ['security', 'reliability', 'billing', 'fulfillment', 'support'];

/** Optional product-usage analytics. Gated by the opt-out. */
export const OPTIONAL_EVENT_CLASSES = ['screen_view', 'search_refinement', 'feature_usage', 'content_engagement'];

/**
 * How an event class is treated: 'essential', 'optional', or 'unknown'.
 *
 * @param {string} eventClass
 * @returns {'essential'|'optional'|'unknown'}
 */
export function analyticsEventClass(eventClass) {
  if (ESSENTIAL_EVENT_CLASSES.includes(eventClass)) return 'essential';
  if (OPTIONAL_EVENT_CLASSES.includes(eventClass)) return 'optional';
  return 'unknown';
}

/**
 * The one question a recorder must ask before writing an optional event.
 *
 * `optOut` defaults to true and an undefined value counts as opted out, so the
 * failure mode of a missing preference is "record nothing" rather than "record
 * everything".
 *
 * @param {{ optOut?: boolean, eventClass: string }} input
 * @returns {boolean}
 */
export function shouldRecordAnalytics({ optOut = true, eventClass } = {}) {
  const kind = analyticsEventClass(eventClass);
  if (kind === 'essential') return true;
  if (kind === 'optional') return optOut !== true;
  return false;
}

/**
 * The consent state a client or a future privacy request can read, in plain
 * terms: what is currently allowed, what the default is, when the user decided,
 * and which classes are on each side of the line.
 *
 * @param {{ optOut?: boolean, decidedAt?: string|null }} [input]
 * @returns {{
 *   optional_analytics: 'off'|'allowed',
 *   default: 'off',
 *   decided_at: string|null,
 *   essential_processing: string[],
 *   optional_uses: string[],
 * }}
 */
export function analyticsConsent({ optOut = true, decidedAt = null } = {}) {
  return {
    optional_analytics: optOut === true ? 'off' : 'allowed',
    default: 'off',
    decided_at: decidedAt,
    essential_processing: [...ESSENTIAL_EVENT_CLASSES],
    optional_uses: [...OPTIONAL_EVENT_CLASSES],
  };
}
