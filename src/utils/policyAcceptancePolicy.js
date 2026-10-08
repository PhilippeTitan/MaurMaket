/**
 * Policy-acceptance policy — Batch 72 (APP-Q356–APP-Q365).
 *
 * Ledger: "require renewed agreement **only when needed**" and "If a user
 * declines a material update, explain the resulting access limits, preserve
 * account help and existing obligations, and provide closure/export paths."
 *
 * The interesting part of that pair is the word *needed*. A material policy
 * change is not a reason to lock someone out of their own account: it is a
 * reason to stop them from taking on something **new** until they have decided.
 * So the rules are:
 *
 *   - What is paused is only starting a new commitment — creating a listing,
 *     placing an order, or making an offer.
 *   - What is never paused, whatever the state: signing in, existing orders and
 *     their fulfilment, order messages, Help & Support, security settings, data
 *     export, account closure, and reading the policy itself.
 *   - An unanswered material change and a declined one differ in *why* they are
 *     paused and in what the copy says, not in what the account can still do.
 *     Both are decisions the user owns; neither is a punishment.
 *
 * Accounts created before acceptance tracking existed are covered by the
 * baseline version, so this never asks anyone to re-accept terms they already
 * agreed to at signup — that rule lives here rather than in the route, so the
 * gate and the screen cannot disagree about who owes a decision.
 *
 * No imports and no SQL: the route, the middleware, and the guardrail all read
 * the same answers.
 */

/** The only actions a pending or declined material policy pauses. */
export const POLICY_GATED_ACTIONS = ['create_listing', 'place_order', 'make_offer'];

/**
 * Actions that must keep working in every policy state. Listed explicitly so a
 * future gate cannot quietly start covering one of them.
 */
export const POLICY_PRESERVED_ACTIONS = [
  'sign_in',
  'existing_orders',
  'order_messages',
  'support',
  'security_settings',
  'data_export',
  'account_closure',
  'policy_review',
];

/**
 * Work out, per policy kind, whether the user still owes a decision.
 *
 * @param {{
 *   versions?: Array<{ id: number|string, kind: string, version: string, is_material?: boolean }>,
 *   acceptances?: Array<{ kind: string, version: string, accepted_at?: string }>,
 *   declines?: Array<{ kind: string, version: string, declined_at?: string }>,
 * }} [rows]
 *   `versions` must be ordered oldest-first within each kind.
 * @returns {Array<{ kind: string, version: string, is_material: boolean, baseline: boolean,
 *   accepted_version: string|null, accepted_current: boolean, declined: boolean }>}
 */
export function policyDecisions({ versions = [], acceptances = [], declines = [] } = {}) {
  const byKind = new Map();
  for (const row of versions) {
    const list = byKind.get(row.kind) || [];
    list.push(row);
    byKind.set(row.kind, list);
  }

  const acceptedByKind = new Map();
  for (const row of acceptances) {
    if (!acceptedByKind.has(row.kind)) acceptedByKind.set(row.kind, row);
  }
  const declinedKeys = new Set(declines.map((row) => `${row.kind}:${row.version}`));

  const decisions = [];
  for (const [kind, list] of byKind) {
    const current = list[list.length - 1];
    // A kind that only ever had one version is the baseline: nobody is asked to
    // re-accept what they agreed to when they signed up.
    const baseline = list[0].id === current.id;
    const accepted = acceptedByKind.get(kind) || null;
    decisions.push({
      kind,
      version: current.version,
      is_material: !!current.is_material,
      baseline,
      accepted_version: accepted ? accepted.version : null,
      accepted_current: Boolean(accepted && accepted.version === current.version) || (baseline && !accepted),
      declined: declinedKeys.has(`${kind}:${current.version}`),
    });
  }
  return decisions;
}

/**
 * The resulting access limits, in plain terms.
 *
 * @param {ReturnType<typeof policyDecisions>} decisions
 * @returns {{
 *   restricted: boolean,
 *   needs_decision: string[],
 *   pending_decision: string[],
 *   declined: string[],
 *   gated_actions: string[],
 *   preserved_actions: string[],
 * }}
 */
export function policyAccessState(decisions = []) {
  const material = decisions.filter((d) => d.is_material);
  const needsDecision = material.filter((d) => !d.accepted_current);
  const declined = needsDecision.filter((d) => d.declined).map((d) => d.kind);
  const pending = needsDecision.filter((d) => !d.declined).map((d) => d.kind);
  const restricted = needsDecision.length > 0;
  return {
    restricted,
    needs_decision: needsDecision.map((d) => d.kind),
    pending_decision: pending,
    declined,
    gated_actions: restricted ? [...POLICY_GATED_ACTIONS] : [],
    preserved_actions: [...POLICY_PRESERVED_ACTIONS],
  };
}

/**
 * Why a new commitment is paused, if it is.
 *
 *   'declined' — the user read the change and said no. Recorded, and reversible:
 *                accepting later clears it immediately.
 *   'pending'  — no decision recorded yet.
 *   null       — nothing is owed, so the action proceeds.
 *
 * @param {ReturnType<typeof policyDecisions>} decisions
 * @returns {'declined'|'pending'|null}
 */
export function policyGateReason(decisions = []) {
  const access = policyAccessState(decisions);
  if (!access.restricted) return null;
  return access.declined.length > 0 ? 'declined' : 'pending';
}

/**
 * The one-line explanation shown when an action is paused. Kept here so the
 * server response and the screen say the same thing.
 *
 * @param {'declined'|'pending'|null} reason
 * @returns {string}
 */
export function policyGateMessage(reason) {
  if (reason === 'declined') {
    return 'You declined an updated policy, so new listings, orders, and offers are paused. Your existing orders, messages, Help & Support, and data export keep working.';
  }
  if (reason === 'pending') {
    return 'Please review the updated policy before starting something new. Your existing orders, messages, Help & Support, and data export keep working.';
  }
  return '';
}
