import { Router } from 'express';
import { pool } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';
import { createNotification } from '../utils/notifications.js';
import { processRefundPayout, settleSellerDebtPayment } from '../utils/helpers.js';
import { releaseCancelledOrderStock } from '../utils/orderStock.js';
import { recordKycEvidenceAccess } from '../utils/kycEvidenceAccess.js';
import { cancellationBasis, portionIsCancellableBeforeShipment, portionCancellationResolution } from '../utils/cancellationScopePolicy.js';

const router = Router();

function adminRequired(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

router.get('/api/admin/users', authRequired, adminRequired, async (_req, res) => {
  try {
    const result = await pool.query('SELECT id, full_name, email, phone, role, created_at FROM users ORDER BY created_at DESC LIMIT 100');
    res.json({ users: result.rows });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/admin/disputes', authRequired, adminRequired, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, u.full_name AS raised_by_name, o.buyer_id
       FROM disputes d
       JOIN users u ON d.raised_by = u.id
       JOIN orders o ON d.order_id = o.id
       ORDER BY d.created_at DESC`
    );
    res.json({ disputes: result.rows });
  } catch (err) {
    console.error('Admin disputes error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/api/admin/disputes/:id', authRequired, adminRequired, async (req, res) => {
  const { status, resolution } = req.body;
  if (!status || !['open', 'under_review', 'resolved', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  try {
    const existing = await pool.query('SELECT reason FROM disputes WHERE id = $1', [req.params.id]);
    if (!existing.rowCount) return res.status(404).json({ error: 'Dispute not found' });
    if (existing.rows[0].reason === 'cancellation_request') {
      return res.status(409).json({ error: 'Cancellation requests require the dedicated audited resolution route.' });
    }
    await pool.query(
      `UPDATE disputes SET status = $1, resolution = COALESCE($2, resolution), updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [status, resolution || null, req.params.id]
    );
    const disputeInfo = await pool.query(
      `SELECT d.order_id, d.raised_by, o.buyer_id FROM disputes d JOIN orders o ON d.order_id = o.id WHERE d.id = $1`,
      [req.params.id]
    );
    if (disputeInfo.rows.length > 0) {
      const { order_id, raised_by, buyer_id } = disputeInfo.rows[0];
      const sellerRes = await pool.query('SELECT seller_id FROM order_items WHERE order_id = $1 LIMIT 1', [order_id]);
      const sellerId = sellerRes.rows[0]?.seller_id;
      const msg = resolution ? `Your dispute has been ${status}. ${resolution}` : `Your dispute has been ${status}.`;
      const parties = [buyer_id, sellerId].filter(Boolean);
      for (const pid of parties) {
        createNotification(pid, 'dispute_resolved', 'Dispute Updated', msg, { disputeId: req.params.id, orderId: order_id });
      }
    }
    res.json({ updated: true });
  } catch (err) {
    console.error('Admin dispute update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// A post-fulfillment cancellation can only resume unchanged after a human
// review. This endpoint does not cancel an order, assign fault, or issue a
// refund; those outcomes require their own explicit settlement workflow.
router.put('/api/admin/cancellation-requests/:id/resolve', authRequired, adminRequired, async (req, res) => {
  const decision = String(req.body?.decision || '');
  const note = String(req.body?.note || '').trim().slice(0, 500);
  if (!['resume_order', 'cancel_before_shipment'].includes(decision) || note.length < 10) {
    return res.status(400).json({ error: 'Choose a supported resolution and provide a review note of at least 10 characters.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT d.id, d.order_id, d.seller_id, d.raised_by, d.status, d.resolution,
              o.buyer_id, o.status AS order_status, o.payment_method
       FROM disputes d JOIN orders o ON o.id = d.order_id
       WHERE d.id = $1 AND d.reason = 'cancellation_request'
       FOR UPDATE OF d, o`, [req.params.id]
    );
    const request = found.rows[0];
    if (!request) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cancellation request not found' });
    }
    if (request.status !== 'under_review') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Only an accepted, declined, or overdue request in review can be resolved here.' });
    }

    let outcome = 'order_resumed';
    let newResolution = 'admin_reviewed_order_resumes';
    let refundReviewOpened = false;
    // An unanswered request is resolvable on exactly the same terms as one the
    // seller agreed to (APP-Q341: no fault, no automatic refund) — the basis only
    // changes what the record says, never what is allowed.
    const basis = decision === 'cancel_before_shipment' ? cancellationBasis(request) : null;
    if (decision === 'cancel_before_shipment') {
      if (!basis) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'The seller must have accepted this cancellation, or the response window must have lapsed unanswered, before a portion can be cancelled.' });
      }
      const fulfillmentResult = await client.query(
        `SELECT * FROM seller_fulfillments WHERE order_id = $1 AND seller_id = $2 FOR UPDATE`,
        [request.order_id, request.seller_id]
      );
      const fulfillment = fulfillmentResult.rows[0];
      const meetupCheckin = await client.query('SELECT 1 FROM meetup_checkins WHERE order_id = $1 LIMIT 1', [request.order_id]);
      const heldEscrow = await client.query(
        `SELECT id FROM order_escrow WHERE order_id = $1 AND seller_id = $2 AND status = 'held' FOR UPDATE`,
        [request.order_id, request.seller_id]
      );
      const existingRefundRequest = await client.query(
        `SELECT id FROM disputes WHERE order_id = $1 AND seller_id = $2 AND reason = 'refund_request'
         AND status IN ('open', 'under_review') LIMIT 1`, [request.order_id, request.seller_id]
      );
      // Every hard condition lives in one pure, tested place. Shipping started,
      // a meetup under way, missing escrow, a non-MonCash rail, or a refund review
      // already open all still freeze this decision.
      if (!portionIsCancellableBeforeShipment({
        orderStatus: request.order_status,
        paymentMethod: request.payment_method,
        fulfillment,
        hasMeetupCheckin: (meetupCheckin.rowCount || 0) > 0,
        hasHeldEscrow: (heldEscrow.rowCount || 0) > 0,
        hasOpenRefundReview: (existingRefundRequest.rowCount || 0) > 0,
      })) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Only a still-processing MonCash delivery portion with held escrow can be cancelled here. Shipped, delivered, meetup, NatCash, completed, escrow-free, and already-refund-reviewing cases remain under review.' });
      }

      await client.query(
        `UPDATE seller_fulfillments SET fulfillment_status = 'cancelled', agreement_status = 'cancelled', updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $1 AND seller_id = $2`, [request.order_id, request.seller_id]
      );
      await releaseCancelledOrderStock(client, request.order_id, [fulfillment], request.seller_id);
      await client.query(
        `UPDATE message_offers SET accepted_checkout_id = NULL
         WHERE accepted_checkout_id = $1 AND seller_id = $2 AND status = 'accepted'`, [request.order_id, request.seller_id]
      );
      const otherActive = await client.query(
        `SELECT 1 FROM order_items oi LEFT JOIN seller_fulfillments sf
           ON sf.order_id = oi.order_id AND sf.seller_id = oi.seller_id
         WHERE oi.order_id = $1 AND oi.seller_id <> $2
           AND COALESCE(sf.fulfillment_status, 'pending') <> 'cancelled' LIMIT 1`,
        [request.order_id, request.seller_id]
      );
      if (!otherActive.rowCount) {
        await client.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [request.order_id]);
      }
      await client.query(
        `INSERT INTO disputes (order_id, seller_id, raised_by, reason, description, status)
         VALUES ($1, $2, $3, 'refund_request', $4, 'open')`,
        [request.order_id, request.seller_id, request.buyer_id,
          basis === 'unanswered'
            ? 'Admin cancelled this unshipped seller portion after the response window lapsed unanswered. No fault is assigned. MonCash refund review is open; no transfer has been approved or confirmed.'
            : 'Admin cancelled this seller portion before shipment after seller acceptance. MonCash refund review is open; no transfer has been approved or confirmed.']
      );
      outcome = 'portion_cancelled_refund_pending';
      newResolution = portionCancellationResolution(basis);
      refundReviewOpened = true;
    }

    await client.query(
      `UPDATE disputes SET status = 'resolved', resolution = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`, [request.id, newResolution]
    );
    await client.query(
      `INSERT INTO order_events (order_id, event_type, actor_id, note)
       VALUES ($1, 'cancellation_response', $2, $3)`,
      [request.order_id, req.user.id, decision === 'resume_order'
        ? `Admin reviewed cancellation request ${request.id}; order resumes unchanged. No order/payment/refund state was changed. Review note: ${note}`
        : basis === 'unanswered'
          ? `Admin cancelled seller ${request.seller_id}'s unshipped portion after the response window lapsed unanswered. No fault was assigned. Separate MonCash refund review opened; no transfer is approved or confirmed. Review note: ${note}`
          : `Admin cancelled seller ${request.seller_id}'s unshipped portion after seller acceptance. Separate MonCash refund review opened; no transfer is approved or confirmed. Review note: ${note}`]
    );
    await client.query(
      `UPDATE notifications SET action_resolved = true, is_read = true
       WHERE (data->>'cancellationRequestId') = $1 AND type IN ('cancellation_requested', 'cancellation_response')`,
      [String(request.id)]
    );
    await client.query('COMMIT');

    const recipients = [...new Set([request.buyer_id, request.seller_id].filter(Boolean))];
    for (const userId of recipients) {
      createNotification(userId, decision === 'resume_order' ? 'cancellation_response' : 'order_cancelled',
        decision === 'resume_order' ? 'Cancellation review complete' : 'Seller portion cancelled',
        decision === 'resume_order'
          ? 'The cancellation request was reviewed and closed. The order and payment continue unchanged; no refund was issued.'
          : basis === 'unanswered'
            ? 'The unshipped seller portion was cancelled after review. The seller did not respond in time and no fault is assigned. MonCash refund review is open; no refund transfer has been approved or confirmed.'
            : 'The unshipped seller portion was cancelled after review. MonCash refund review is open; no refund transfer has been approved or confirmed.',
        { orderId: request.order_id, sellerId: request.seller_id, cancellationRequestId: request.id, cancellationOutcome: outcome, refundReviewPending: refundReviewOpened });
    }
    return res.json({ resolved: true, outcome, orderChanged: decision === 'cancel_before_shipment', paymentChanged: false, refundReviewOpened, refundIssued: false });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Admin cancellation resolution error:', err);
    return res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// MonCash refund queue. A refund only leaves this queue after the signed
// payout webhook confirms settlement; ambiguous transfers are never resent.
router.get('/api/admin/moncash/refunds', authRequired, adminRequired, async (req, res) => {
  const allowed = new Set(['pending', 'processing', 'failed', 'completed']);
  const status = String(req.query.status || 'pending');
  if (!allowed.has(status)) return res.status(400).json({ error: 'Invalid refund status' });
  try {
    const result = await pool.query(
      `SELECT r.*, u.full_name AS buyer_name, seller.full_name AS refunded_seller_name, o.status AS order_status
       FROM refund_payouts r
       JOIN users u ON u.id = r.buyer_id
       LEFT JOIN users seller ON seller.id = r.refunded_seller_id
       JOIN orders o ON o.id = r.order_id
       WHERE r.status = $1
       ORDER BY r.created_at ASC LIMIT 100`,
      [status]
    );
    res.json({ refunds: result.rows });
  } catch (err) {
    console.error('Admin MonCash refund queue error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/admin/moncash/refunds/:id/approve', authRequired, adminRequired, async (req, res) => {
  const destination = String(req.body?.receiverPhone || '').replace(/[^+\d]/g, '');
  if (destination.replace(/\D/g, '').length < 8 || destination.replace(/\D/g, '').length > 15) {
    return res.status(400).json({ error: 'Provide the buyer’s verified MonCash phone number' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM refund_payouts WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Refund not found' });
    }
    const refund = result.rows[0];
    if (!['pending', 'failed'].includes(refund.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Only a new or provider-confirmed failed refund can be approved/retried' });
    }
    const reason = String(req.body?.reason || refund.reason || '').trim();
    if (reason.length < 5) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'A support reason is required' });
    }
    const reference = refund.status === 'failed'
      ? `refund_${refund.id}_retry_${Number(refund.attempts || 0) + 1}`
      : (refund.moncash_reference || `refund_${refund.id}`);
    await client.query(
      `UPDATE refund_payouts
       SET status = 'pending', receiver_phone = $2, destination_verified = true,
           reason = $3, approved_by = $4, moncash_reference = $5,
           provider_reference = NULL, error_message = NULL,
           next_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [refund.id, destination, reason, req.user.id, reference]
    );
    await client.query('COMMIT');
    res.status(202).json({ status: 'processing', refundId: refund.id });
    await processRefundPayout(refund.id);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Admin MonCash refund approval error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

router.get('/api/admin/moncash/transfers/processing', authRequired, adminRequired, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT 'seller_payout' AS kind, id, amount, fee_amount, total_debit, status, provider_reference, moncash_reference, error_message, created_at
         FROM payouts WHERE status = 'processing'
       UNION ALL
       SELECT 'platform_payout', id, amount, fee_amount, total_debit, status, provider_reference, moncash_reference, error_message, created_at
         FROM platform_payouts WHERE status = 'processing'
       UNION ALL
       SELECT 'refund', id, amount, fee_amount, amount + fee_amount, status, provider_reference, moncash_reference, error_message, created_at
         FROM refund_payouts WHERE status = 'processing'
       UNION ALL
       SELECT 'seller_debt_payment', id, charge_amount, collection_fee_amount, charge_amount, status, provider_reference, reference_id, error_message, created_at
         FROM seller_debt_payments WHERE status IN ('created','processing','unknown')
       ORDER BY created_at ASC LIMIT 100`
    );
    res.json({ transfers: result.rows });
  } catch (err) {
    console.error('Admin MonCash transfer reconciliation queue error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/admin/moncash/transfers/:kind/:id/reconcile', authRequired, adminRequired, async (req, res) => {
  const tableByKind = { seller_payout: 'payouts', platform_payout: 'platform_payouts', refund: 'refund_payouts', seller_debt_payment: 'seller_debt_payments' };
  const table = tableByKind[req.params.kind];
  const outcome = req.body?.outcome;
  const note = String(req.body?.note || '').trim();
  const confirmedReference = String(req.body?.providerReference || '').trim();
  if (!table || !['completed', 'failed'].includes(outcome) || note.length < 10 || !confirmedReference) {
    return res.status(400).json({ error: 'Provide a confirmed provider reference, outcome, and reconciliation note' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`SELECT * FROM ${table} WHERE id = $1 FOR UPDATE`, [req.params.id]);
    if (!found.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }
    const transfer = found.rows[0];
    const allowedStatuses = req.params.kind === 'seller_debt_payment' ? ['created', 'processing', 'unknown'] : ['processing'];
    if (!allowedStatuses.includes(transfer.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Only unresolved processing transfers can be reconciled' });
    }
    const references = [transfer.id, transfer.provider_reference, transfer.moncash_reference, transfer.reference_id].filter(Boolean).map(String);
    if (!references.includes(confirmedReference)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Reference does not match this transfer' });
    }

    if (req.params.kind === 'seller_debt_payment' && outcome === 'completed') {
      const settled = await settleSellerDebtPayment(client, transfer.id, Number(transfer.charge_amount));
      if (settled.status !== 'completed') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Debt payment could not be applied to the open seller debt' });
      }
    }
    await client.query(
      `UPDATE ${table} SET status = $1, settlement_confirmed = $6, reconciled_by = $2, reconciled_at = CURRENT_TIMESTAMP,
         reconciliation_note = $3, provider_reference = COALESCE(provider_reference, $4),
         error_message = CASE WHEN $1 = 'failed' THEN $3 ELSE NULL END,
         updated_at = CURRENT_TIMESTAMP WHERE id = $5`,
      [outcome, req.user.id, note, confirmedReference, transfer.id, outcome === 'completed']
    );
    if (req.params.kind === 'seller_payout') {
      if (outcome === 'completed') {
        await client.query('UPDATE seller_balances SET total_paid_out = total_paid_out + $1, updated_at = CURRENT_TIMESTAMP WHERE seller_id = $2', [transfer.amount, transfer.seller_id]);
      } else {
        await client.query('UPDATE seller_balances SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE seller_id = $2', [Number(transfer.total_debit || Number(transfer.amount) + Number(transfer.fee_amount || 0)), transfer.seller_id]);
      }
    } else if (req.params.kind === 'refund' && outcome === 'completed') {
      await client.query(
        `UPDATE disputes SET status = 'resolved', resolution = 'Support reconciled the MonCash refund as completed', updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $1 AND reason = 'refund_request' AND status IN ('open', 'under_review')
           AND ($2::uuid IS NULL OR seller_id = $2)`,
        [transfer.order_id, transfer.refunded_seller_id || null]
      );
    }
    await client.query('COMMIT');
    if (req.params.kind === 'seller_payout' && outcome === 'failed') {
      createNotification(transfer.seller_id, 'payout_failed', 'Payout Failed', `Support confirmed your MonCash payout failed. G ${Number(transfer.total_debit || transfer.amount).toFixed(2)} was returned to your balance.`, { payoutId: transfer.id });
    }
    if (req.params.kind === 'refund') {
      createNotification(transfer.buyer_id, 'order_status', outcome === 'completed' ? 'Refund sent' : 'Refund needs support',
        outcome === 'completed' ? `Support confirmed your MonCash refund of G ${Number(transfer.amount).toFixed(2)}.` : `Support confirmed the MonCash refund failed. Support will review next steps.`,
        { orderId: transfer.order_id });
    }
    if (req.params.kind === 'seller_debt_payment') {
      createNotification(transfer.seller_id, 'seller_debt_payment', outcome === 'completed' ? 'Debt payment confirmed' : 'Debt payment failed',
        outcome === 'completed' ? `Support confirmed G ${Number(transfer.debt_amount).toFixed(2)} toward your outstanding seller fees.` : 'Support confirmed this MonCash payment did not complete.',
        { paymentId: transfer.id });
    }
    res.json({ reconciled: true, status: outcome });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Admin MonCash transfer reconciliation error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

router.get('/api/admin/moncash/legacy-transfers', authRequired, adminRequired, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT 'seller_payout' AS kind, id, amount, fee_amount, total_debit, status, provider_reference, moncash_reference, created_at
         FROM payouts WHERE status = 'completed' AND settlement_confirmed = false
       UNION ALL
       SELECT 'platform_payout', id, amount, fee_amount, total_debit, status, provider_reference, moncash_reference, created_at
         FROM platform_payouts WHERE status = 'completed' AND settlement_confirmed = false
       UNION ALL
       SELECT 'refund', id, amount, fee_amount, amount + fee_amount, status, provider_reference, moncash_reference, created_at
         FROM refund_payouts WHERE status = 'completed' AND settlement_confirmed = false
       ORDER BY created_at ASC LIMIT 250`
    );
    res.json({ transfers: result.rows });
  } catch (err) {
    console.error('Admin legacy MonCash settlement review error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/admin/moncash/legacy-transfers/:kind/:id/confirm', authRequired, adminRequired, async (req, res) => {
  const tableByKind = { seller_payout: 'payouts', platform_payout: 'platform_payouts', refund: 'refund_payouts' };
  const table = tableByKind[req.params.kind];
  const note = String(req.body?.note || '').trim();
  const confirmedReference = String(req.body?.providerReference || '').trim();
  if (!table || note.length < 10 || !confirmedReference) return res.status(400).json({ error: 'Provide the confirmed provider reference and a reconciliation note' });
  try {
    const result = await pool.query(
      `UPDATE ${table} SET settlement_confirmed = true, reconciled_by = $1, reconciled_at = CURRENT_TIMESTAMP,
         reconciliation_note = $2, provider_reference = COALESCE(provider_reference, $3), updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND status = 'completed' AND settlement_confirmed = false
         AND ($3 = id::text OR $3 = provider_reference OR $3 = moncash_reference)
       RETURNING id`,
      [req.user.id, note, confirmedReference, req.params.id]
    );
    if (!result.rowCount) return res.status(409).json({ error: 'Transfer is not an unverified legacy completion or its reference did not match' });
    res.json({ confirmed: true });
  } catch (err) {
    console.error('Admin legacy MonCash settlement confirmation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/admin/verification/:attemptId/evidence-access ────────────
// Batch 75 — "Log staff access to sensitive KYC evidence".
//
// This is the disconnected seam, not a working staff tool: no screen in the app
// calls it, and it deliberately does not return any evidence. Whichever staff
// surface eventually opens a subject's documents (the planned Support website)
// calls this first, so the subject's history records the read. Until that
// surface exists the endpoint stays unexercised — so do not claim to anyone that
// it has logged a case.
//
// `purpose` is required and must be one of KYC_ACCESS_PURPOSES: an unexplained
// access is refused rather than stored, because a log full of "other" would be
// indistinguishable from no log at all.
router.post('/api/admin/verification/:attemptId/evidence-access', authRequired, adminRequired, async (req, res) => {
  try {
    const { purpose, scope, caseReference, actorLabel } = req.body || {};
    const attempt = await pool.query(
      'SELECT id, user_id FROM verification_attempts WHERE id = $1',
      [req.params.attemptId]
    );
    if (attempt.rows.length === 0) return res.status(404).json({ error: 'Verification case not found' });

    const entry = await recordKycEvidenceAccess({
      subjectUserId: attempt.rows[0].user_id,
      attemptId: attempt.rows[0].id,
      actorUserId: req.user.id,
      actorLabel,
      purpose,
      scope,
      caseReference,
    });
    if (!entry) return res.status(400).json({ error: 'A recognised purpose is required to log this access', code: 'INVALID_PURPOSE' });

    res.json({ entry });
  } catch (err) {
    console.error('Admin KYC evidence access logging error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
export { adminRequired };
