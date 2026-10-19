/**
 * Retired: the former app-level outbox was not a complete database replica.
 * Keep this path fail-closed so an old manual command cannot recreate that
 * misleading setup on Supabase or a newly provisioned Neon standby.
 */
console.error(
  '[Migration] Refusing to create legacy mirror_outbox tables. ' +
  'Use the documented provider-native replication setup after the standby is provisioned.'
);
process.exitCode = 1;
