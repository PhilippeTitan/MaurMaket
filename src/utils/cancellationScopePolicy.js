/**
 * Cancellation scope policy — post-fulfillment cancellation requests.
 *
 * Ledger: APP-Q340 "In a multi-seller checkout, should canceling one seller's
 * sub-order cancel the other sellers' sub-orders? Answered: cancel only affected
 * seller sub-order unless buyer explicitly cancels the whole checkout."
 *
 * APP-Q341 "What should happen if a cancellation request receives no response
 * before its deadline? Answered: keep order/payment unchanged, remind once, then
 * use a clear unresolved state or Support path; no automatic fault/refund."
 *
 * Two consequences follow, and both are easy to get wrong in the same direction —
 * by being *more* destructive than the rules allow:
 *
 *   1. A portion cancellation may only ever touch its own seller. Nothing here
 *      reads or returns another seller's state, and the order itself is only
 *      cancelled when no other portion is still active.
 *   2. An unanswered request is not a fault and never refunds by itself. It only
 *      becomes resolvable by a human reviewer, on exactly the same hard
 *      conditions as a request the seller agreed to: the portion must still be
 *      unshipped, paid by verified MonCash delivery, and backed by held escrow.
 *      Whatever the basis, the outcome is a *separate refund review* — never a
 *      transfer, and never an automatic refund.
 *
 * No imports and no SQL: the reviewer path reads these answers, and so does the
 * guardrail, so the two cannot drift.
 */

/** Every portion decision is scoped to one seller. */
export const PORTION_CANCELLATION_SCOPE = 'seller_portion';

/**
 * The recorded basis of a resolvable request:
 *   'seller_accepted' — the seller agreed to the cancellation.
 *   'unanswered'      — the seller never responded and the window lapsed.
 * Anything else (a decline, a withdrawal, an already-reviewed request) is not a
 * basis for cancelling a portion.
 *
 * @param {{ resolution?: string|null }} [request]
 * @returns {'seller_accepted'|'unanswered'|null}
 */
export function cancellationBasis({ resolution = null } = {}) {
  if (resolution === 'seller_accepted_pending_settlement') return 'seller_accepted';
  if (resolution === 'seller_response_overdue') return 'unanswered';
  return null;
}

/**
 * The hard conditions that must still hold before a reviewer may cancel an
 * unshipped portion. Every one of them is a reason *not* to move money: a
 * completed or cancelled order, a non-MonCash payment, an unverified payment, a
 * portion that has already shipped or is being handed over, a meetup that has
 * begun, escrow that is not held, or a refund review that is already open.
 *
 * @param {{
 *   orderStatus?: string|null,
 *   paymentMethod?: string|null,
 *   fulfillment?: { payment_status?: string, fulfillment_status?: string, fulfillment_method?: string }|null,
 *   hasMeetupCheckin?: boolean,
 *   hasHeldEscrow?: boolean,
 *   hasOpenRefundReview?: boolean,
 * }} [portion]
 * @returns {boolean}
 */
export function portionIsCancellableBeforeShipment({
  orderStatus = null,
  paymentMethod = null,
  fulfillment = null,
  hasMeetupCheckin = false,
  hasHeldEscrow = false,
  hasOpenRefundReview = false,
} = {}) {
  if (orderStatus === 'completed' || orderStatus === 'cancelled') return false;
  if (paymentMethod !== 'moncash') return false;
  if (!fulfillment) return false;
  if (fulfillment.payment_status !== 'verified') return false;
  if (fulfillment.fulfillment_status !== 'processing') return false;
  if (fulfillment.fulfillment_method !== 'delivery') return false;
  if (hasMeetupCheckin) return false;
  if (!hasHeldEscrow) return false;
  if (hasOpenRefundReview) return false;
  return true;
}

/**
 * The resolution recorded once a portion is cancelled after review. The two
 * bases are recorded distinctly so the audit trail shows whether the seller
 * agreed or simply never answered — the money outcome is identical either way,
 * and neither one is a finding of fault.
 *
 * @param {'seller_accepted'|'unanswered'|null} basis
 * @returns {string}
 */
export function portionCancellationResolution(basis) {
  return basis === 'unanswered'
    ? 'admin_cancelled_unanswered_portion_refund_review'
    : 'admin_cancelled_before_shipment_refund_review';
}
