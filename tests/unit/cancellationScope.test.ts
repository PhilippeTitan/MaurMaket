import { describe, it, expect } from 'vitest';
import {
  PORTION_CANCELLATION_SCOPE,
  cancellationBasis,
  portionIsCancellableBeforeShipment,
  portionCancellationResolution,
} from '../../src/utils/cancellationScopePolicy.js';

describe('cancellationBasis', () => {
  it("maps seller_accepted_pending_settlement to 'seller_accepted'", () => {
    expect(cancellationBasis({ resolution: 'seller_accepted_pending_settlement' })).toBe('seller_accepted');
  });

  it("maps seller_response_overdue to 'unanswered'", () => {
    expect(cancellationBasis({ resolution: 'seller_response_overdue' })).toBe('unanswered');
  });

  it('returns null for declines, withdrawals, and unknown resolutions', () => {
    expect(cancellationBasis({ resolution: 'seller_declined' })).toBeNull();
    expect(cancellationBasis({ resolution: 'buyer_withdrew' })).toBeNull();
    expect(cancellationBasis({ resolution: 'already_reviewed' })).toBeNull();
    expect(cancellationBasis({ resolution: '' })).toBeNull();
  });

  it('returns null when resolution is missing or null', () => {
    expect(cancellationBasis()).toBeNull();
    expect(cancellationBasis({})).toBeNull();
    expect(cancellationBasis({ resolution: null })).toBeNull();
  });
});

describe('portionIsCancellableBeforeShipment', () => {
  const eligible = () => ({
    orderStatus: 'confirmed',
    paymentMethod: 'moncash',
    fulfillment: { payment_status: 'verified', fulfillment_status: 'processing', fulfillment_method: 'delivery' },
    hasMeetupCheckin: false,
    hasHeldEscrow: true,
    hasOpenRefundReview: false,
  });

  it('returns true only when every hard condition holds', () => {
    expect(portionIsCancellableBeforeShipment(eligible())).toBe(true);
  });

  it('refuses completed or cancelled orders', () => {
    expect(portionIsCancellableBeforeShipment({ ...eligible(), orderStatus: 'completed' })).toBe(false);
    expect(portionIsCancellableBeforeShipment({ ...eligible(), orderStatus: 'cancelled' })).toBe(false);
  });

  it('refuses non-MonCash payments', () => {
    expect(portionIsCancellableBeforeShipment({ ...eligible(), paymentMethod: 'natcash' })).toBe(false);
    expect(portionIsCancellableBeforeShipment({ ...eligible(), paymentMethod: null })).toBe(false);
  });

  it('refuses when fulfillment data is missing or not moncash-delivery-verified-processing', () => {
    expect(portionIsCancellableBeforeShipment({ ...eligible(), fulfillment: null })).toBe(false);
    expect(
      portionIsCancellableBeforeShipment({
        ...eligible(),
        fulfillment: { ...eligible().fulfillment, payment_status: 'pending' },
      }),
    ).toBe(false);
    expect(
      portionIsCancellableBeforeShipment({
        ...eligible(),
        fulfillment: { ...eligible().fulfillment, fulfillment_status: 'shipped' },
      }),
    ).toBe(false);
    expect(
      portionIsCancellableBeforeShipment({
        ...eligible(),
        fulfillment: { ...eligible().fulfillment, fulfillment_method: 'meetup' },
      }),
    ).toBe(false);
  });

  it('refuses once a meetup check-in has happened', () => {
    expect(portionIsCancellableBeforeShipment({ ...eligible(), hasMeetupCheckin: true })).toBe(false);
  });

  it('refuses without held escrow', () => {
    expect(portionIsCancellableBeforeShipment({ ...eligible(), hasHeldEscrow: false })).toBe(false);
  });

  it('refuses when a refund review is already open', () => {
    expect(portionIsCancellableBeforeShipment({ ...eligible(), hasOpenRefundReview: true })).toBe(false);
  });

  it('refuses on empty input', () => {
    expect(portionIsCancellableBeforeShipment()).toBe(false);
  });
});

describe('portionCancellationResolution', () => {
  it("records the unanswered basis distinctly", () => {
    expect(portionCancellationResolution('unanswered')).toBe(
      'admin_cancelled_unanswered_portion_refund_review',
    );
  });

  it("records the seller_accepted basis (and the null default) as the accepted form", () => {
    expect(portionCancellationResolution('seller_accepted')).toBe(
      'admin_cancelled_before_shipment_refund_review',
    );
    expect(portionCancellationResolution(null)).toBe(
      'admin_cancelled_before_shipment_refund_review',
    );
  });
});

describe('PORTION_CANCELLATION_SCOPE', () => {
  it('is seller_portion — never whole-order', () => {
    expect(PORTION_CANCELLATION_SCOPE).toBe('seller_portion');
  });
});
