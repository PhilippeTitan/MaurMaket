import { describe, it, expect } from 'vitest';
import { handleBusinessDowngrade, handleBusinessUpgrade } from '../../src/utils/tierCap.js';

type QueryResult = { rows?: Record<string, unknown>[]; rowCount?: number };

function fakeClient(responses: (sql: string) => QueryResult) {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return responses(sql);
    },
    release: () => {},
  };
  return { client: client as never, calls };
}

function listings(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    is_pinned: i === 0,
    updated_at: new Date(2026, 0, count - i).toISOString(),
    created_at: new Date(2026, 0, count - i).toISOString(),
  }));
}

describe('handleBusinessDowngrade', () => {
  it('keeps everything when the seller is under the 100-listing cap', async () => {
    const { client, calls } = fakeClient((sql) =>
      sql.includes('FROM products') ? { rows: listings(42) } : { rows: [], rowCount: 1 },
    );
    const notification = await handleBusinessDowngrade('seller-1', client);

    expect(notification?.type).toBe('tier_downgraded');
    expect(calls.some((c) => c.sql.includes('is_available = false'))).toBe(false);
  });

  it('pauses exactly the excess listings beyond 100 with paused_reason=tier_cap', async () => {
    const rows = listings(105);
    const { client, calls } = fakeClient((sql) =>
      sql.includes('FROM products') ? { rows } : { rows: [], rowCount: 1 },
    );
    const notification = await handleBusinessDowngrade('seller-1', client);

    expect(notification?.type).toBe('tier_cap_paused');
    expect(notification?.data?.pausedCount).toBe(5);

    const pauseCall = calls.find((c) => c.sql.includes('is_available = false') && c.sql.includes('tier_cap'));
    expect(pauseCall).toBeDefined();
    const pausedIds = pauseCall!.params?.[0] as string[];
    expect(pausedIds).toHaveLength(5);
    // Excess = tail of the (pinned-first, recency-ordered) list: newest/pinned survive
    expect(pausedIds).not.toContain(rows[0].id);
    expect(pausedIds).toContain(rows[104].id);
    expect(pausedIds).not.toContain(rows[99].id);
  });

  it('downgrades business tier to verified and clears store identity', async () => {
    const { client, calls } = fakeClient(() => ({ rows: [], rowCount: 1 }));
    await handleBusinessDowngrade('seller-1', client);

    const userUpdate = calls.find((c) => c.sql.includes('UPDATE users') && c.sql.includes('use_store_identity'));
    expect(userUpdate).toBeDefined();
    expect(userUpdate!.sql).toContain("seller_tier = 'business' THEN 'verified'");
  });
});

describe('handleBusinessUpgrade', () => {
  it('sets tier to business and reactivates only tier_cap-paused listings', async () => {
    const { client, calls } = fakeClient((sql) =>
      sql.includes('RETURNING id') ? { rows: [{ id: 'x' }], rowCount: 1 } : { rows: [], rowCount: 1 },
    );
    await handleBusinessUpgrade('seller-1', client);

    const tierUpdate = calls.find((c) => c.sql.includes("seller_tier = 'business'") && c.sql.includes('UPDATE users'));
    expect(tierUpdate).toBeDefined();

    const reactivate = calls.find((c) => c.sql.includes("paused_reason = 'tier_cap'") && c.sql.includes('is_available = true'));
    expect(reactivate).toBeDefined();
    expect(reactivate!.sql).toContain('WHERE seller_id = $1 AND paused_reason');
  });
});
