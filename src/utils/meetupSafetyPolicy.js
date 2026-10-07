// Batch 82/83 — meetup-area safety feedback and advisory warnings.
//
// The ledger settled a narrow, deliberately weak power for this feature:
//
//   * anyone may report a firsthand safety concern, but a report is an
//     ALLEGATION, not a finding — it needs review, and one report never
//     penalises a seller and never cancels or changes a confirmed order;
//   * credibility comes from specific detail or corroboration, not from volume,
//     so nothing here counts reports or turns a number into a verdict;
//   * a warning is ADVISORY and temporary: it is shown only while the risk is
//     unresolved, and it disappears when the review window ends or the risk is
//     dismissed or resolved;
//   * positive recommendations may pause while a credible risk is unresolved,
//     which is the only lever the platform gets;
//   * feedback can never make a place look safe — the absence of a warning is
//     not a promise, and nothing here can produce that promise.
//
// What already exists elsewhere, and is deliberately not rebuilt here: community
// meetup spots are proposed per order and confirmed by both sides
// (`meetup_place_confirmations`), the map-quality reasons a shopper can pick from
// live with that flow (`meetup_place_reports`, `wrong_details` / `not_a_meetup_place`
// / `other`), and a spot's *suggestion* pauses once two different orders report it
// within 90 days. That is the recommendation half of the ledger decision.
//
// This file is the other half, which had nothing: an advisory on an affected
// upcoming meetup, so the people already committed to a spot hear that it is
// under review instead of finding out afterwards.
//
// No imports: this file is pure decision logic so Node guardrails and the app
// share one definition of when a warning is allowed to appear.
//
// It is also deliberately inert. There is no order, payment, stock, or listing
// call anywhere in this module, because the decision above says a safety report
// must not move marketplace state — the guardrail asserts that by reading it.

/** Where a reviewed report currently stands. */
export const MEETUP_RISK_STATUSES = ['under_review', 'credible', 'dismissed', 'resolved'];

/** Whether a reviewed condition is expected to pass or to keep applying. */
export const MEETUP_CONDITIONS = ['temporary', 'ongoing'];

const NONE = { level: 'none', pauseRecommendations: false, expired: false, reason: 'no_risk' };

/** Null for anything unrecognised; unknown review states never produce a warning. */
export function normalizeRiskStatus(value) {
  return MEETUP_RISK_STATUSES.includes(value) ? value : null;
}

export function normalizeCondition(value) {
  return MEETUP_CONDITIONS.includes(value) ? value : null;
}

/**
 * Should this order's meetup carry an advisory, and may positive
 * recommendations pause while it stands?
 *
 * @param {{ status?: string, reviewUntil?: string|number|null, now?: number }} input
 * @returns {{ level: 'none'|'advisory', pauseRecommendations: boolean, expired: boolean, reason: string }}
 */
export function meetupSafetyAdvisory({ status, reviewUntil = null, now = Date.now() } = {}) {
  const normalized = normalizeRiskStatus(status);
  // Nothing reviewed (or a status we do not understand) is not a reason to warn.
  if (!normalized) return { ...NONE, reason: 'no_risk' };
  // Reviewed and closed: the warning goes away, and so does the pause.
  if (normalized === 'dismissed' || normalized === 'resolved') return { ...NONE, reason: 'closed' };

  // A review window that has lapsed ends the warning on its own. A credible risk
  // without a date is still open: the review has not concluded it either way.
  const until = typeof reviewUntil === 'number' ? reviewUntil : Date.parse(reviewUntil);
  if (Number.isFinite(until) && until <= now) return { ...NONE, expired: true, reason: 'expired' };

  return { level: 'advisory', pauseRecommendations: true, expired: false, reason: 'unresolved' };
}

/**
 * Apply the rule above to a reviewed notice, keeping only what may be shown.
 *
 * A notice that fails the policy is dropped entirely rather than softened: the
 * half-state — "there was something, we are not saying what" — would be worse
 * than saying nothing.
 */
export function advisoryFromNotice(notice, now = Date.now()) {
  if (!notice || typeof notice !== 'object') return null;
  const verdict = meetupSafetyAdvisory({ status: notice.status, reviewUntil: notice.reviewUntil, now });
  if (verdict.level !== 'advisory') return null;
  return {
    level: 'advisory',
    pauseRecommendations: verdict.pauseRecommendations,
    condition: normalizeCondition(notice.condition),
    areaLabel: typeof notice.areaLabel === 'string' && notice.areaLabel.trim() ? notice.areaLabel.trim() : null,
    reviewUntil: typeof notice.reviewUntil === 'string' ? notice.reviewUntil : null,
    note: typeof notice.note === 'string' && notice.note.trim() ? notice.note.trim() : null,
  };
}

/**
 * Where a place can be described as verified-safe. Nowhere: feedback is private
 * and unverified, so the platform has no basis for that label, and a warning
 * being absent means only that no reviewed risk is open.
 */
export function areaSafetyLabel() {
  return null;
}

/**
 * The disclosure shown beside a report path, so nobody thinks a report is proof
 * and nobody expects the app to act on one.
 */
export const SAFETY_REPORT_HANDLING = {
  isAllegation: true,
  penalisesAutomatically: false,
  changesOrderState: false,
  /** Where a report actually goes today: the live private Support channel. */
  handledBy: 'help-support',
};
