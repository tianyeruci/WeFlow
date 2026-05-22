-- Clear all invite-stat tables in an order-independent way.
-- This only clears rows and resets identity sequences like Navicat "truncate table".
-- It does not drop tables, indexes, or grants.
-- It intentionally keeps inviter_identity_mappings because that table is manually maintained config.

begin;

truncate table
  activity_tags,
  group_tag_bindings,
  raw_events,
  invite_events,
  quit_events,
  member_identity_bindings,
  scan_logs,
  sync_batches
restart identity cascade;

commit;
