// Public review visibility (reviews v1 — Profile & Settings handoff in AGENTS.md).
//
// A review is public only when:
//   - it was not moderated/removed by Support,
//   - its author has not deleted it, and
//   - its order was not fully refunded.
// Moderated or fully refunded reviews are retained privately (order/audit) but
// must never appear in public lists or rating averages.
//
// Assumes the `reviews` table is aliased `r` in the surrounding query.
export const PUBLIC_REVIEW_PREDICATE = `
        r.is_moderated = false
        AND r.deleted_at IS NULL
        AND NOT (
          COALESCE((SELECT o.total_amount FROM orders o WHERE o.id = r.order_id), 0) > 0
          AND COALESCE((SELECT SUM(rp.amount) FROM refund_payouts rp WHERE rp.order_id = r.order_id AND rp.status = 'completed'), 0)
              >= COALESCE((SELECT o.total_amount FROM orders o WHERE o.id = r.order_id), 0)
        )`;
