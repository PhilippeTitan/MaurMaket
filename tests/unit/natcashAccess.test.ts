import { describe, it, expect } from 'vitest';
import { getNatCashAccess } from '../../src/utils/natcashAccess.js';

type Row = Record<string, unknown>;

function fakeDb(row: Row | undefined) {
  return {
    query: async (sql: string, params?: unknown[]) => {
      expect(sql).toContain('FROM users');
      expect(params).toEqual(['seller-1']);
      return { rows: row ? [row] : [] };
    },
  } as never;
}

const baseRow = (overrides: Row = {}): Row => ({
  seller_tier: 'standard',
  accepted_payment_methods: null,
  natcash_phone: null,
  business_active: false,
  standalone_status: null,
  standalone_expires_at: null,
  ...overrides,
});

describe('getNatCashAccess', () => {
  it('returns unavailable when the seller does not exist', async () => {
    const result = await getNatCashAccess('seller-1', fakeDb(undefined));
    expect(result).toEqual({ entitled: false, source: null, status: 'unavailable', expiresAt: null });
  });

  it('business tier with an active subscription is entitled', async () => {
    const result = await getNatCashAccess(
      'seller-1',
      fakeDb(baseRow({ seller_tier: 'business', business_active: true })),
    );
    expect(result.entitled).toBe(true);
    expect(result.source).toBe('business');
    expect(result.status).toBe('active');
  });

  it('business tier without an active subscription falls through to standalone', async () => {
    const result = await getNatCashAccess(
      'seller-1',
      fakeDb(baseRow({ seller_tier: 'business', business_active: false })),
    );
    expect(result.entitled).toBe(false);
    expect(result.status).toBe('not_subscribed');
  });

  it('active standalone subscription is entitled', async () => {
    const future = new Date(Date.now() + 30 * 86400000).toISOString();
    const result = await getNatCashAccess(
      'seller-1',
      fakeDb(baseRow({ standalone_status: 'active', standalone_expires_at: future })),
    );
    expect(result.entitled).toBe(true);
    expect(result.source).toBe('monthly');
    expect(result.status).toBe('active');
    expect(result.inGracePeriod).toBe(false);
  });

  it('active standalone subscription inside the 3-day grace window stays entitled but flags grace', async () => {
    const justPast = new Date(Date.now() - 86400000).toISOString();
    const result = await getNatCashAccess(
      'seller-1',
      fakeDb(baseRow({ standalone_status: 'active', standalone_expires_at: justPast })),
    );
    expect(result.entitled).toBe(true);
    expect(result.inGracePeriod).toBe(true);
  });

  it('active standalone subscription past the 3-day grace window is expired', async () => {
    const longPast = new Date(Date.now() - 4 * 86400000).toISOString();
    const result = await getNatCashAccess(
      'seller-1',
      fakeDb(baseRow({ standalone_status: 'active', standalone_expires_at: longPast })),
    );
    expect(result.entitled).toBe(false);
    expect(result.status).toBe('expired');
  });

  it('paused standalone subscription is not entitled and reports paused', async () => {
    const future = new Date(Date.now() + 30 * 86400000).toISOString();
    const result = await getNatCashAccess(
      'seller-1',
      fakeDb(baseRow({ standalone_status: 'paused', standalone_expires_at: future })),
    );
    expect(result.entitled).toBe(false);
    expect(result.status).toBe('paused');
  });

  it('paymentMethodEnabled requires both a phone and natcash in accepted methods', async () => {
    const entitledRow = (methods: unknown, phone: unknown) =>
      fakeDb(baseRow({ seller_tier: 'business', business_active: true, accepted_payment_methods: methods, natcash_phone: phone }));

    const both = await getNatCashAccess('seller-1', entitledRow(['moncash', 'natcash'], '5551234'));
    expect(both.paymentMethodEnabled).toBe(true);
    expect(both.phoneConfigured).toBe(true);

    const methodOnly = await getNatCashAccess('seller-1', entitledRow(['natcash'], null));
    expect(methodOnly.paymentMethodEnabled).toBe(false);
    expect(methodOnly.phoneConfigured).toBe(false);

    const phoneOnly = await getNatCashAccess('seller-1', entitledRow(['moncash'], '5551234'));
    expect(phoneOnly.paymentMethodEnabled).toBe(false);
    expect(phoneOnly.phoneConfigured).toBe(true);
  });
});
