-- Invite dashboard hot-path index patch.
-- Safe to run directly in Supabase.
-- This targets the active group lookup path used by the dashboard.

create index if not exists idx_group_tag_bindings_active_tag_group
  on group_tag_bindings(activity_tag_id, group_id)
  where enabled = true and deleted_at is null;
