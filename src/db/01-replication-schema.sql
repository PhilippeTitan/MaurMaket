-- mirror_outbox: tracks every write operation for async replication
-- Both Supabase and Neon have this table
CREATE TABLE IF NOT EXISTS mirror_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID UNIQUE NOT NULL,
  model TEXT NOT NULL,
  action TEXT NOT NULL,
  record_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'supabase',
  synced BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'normal'
);

CREATE INDEX IF NOT EXISTS idx_mirror_outbox_synced ON mirror_outbox(synced, created_at);
CREATE INDEX IF NOT EXISTS idx_mirror_outbox_priority ON mirror_outbox(priority, synced);

-- mirror_operations: idempotency guard (prevents duplicate processing)
CREATE TABLE IF NOT EXISTS mirror_operations (
  operation_id UUID PRIMARY KEY,
  source TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mirror_operations_source ON mirror_operations(source, processed_at);

-- sync_state: tracks replication health
CREATE TABLE IF NOT EXISTS sync_state (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO sync_state (key, value) VALUES
  ('primary', 'supabase'),
  ('last_sync_supabase_to_neon', NULL),
  ('last_sync_neon_to_supabase', NULL),
  ('supabase_failures', '0'),
  ('neon_failures', '0')
ON CONFLICT (key) DO NOTHING;
