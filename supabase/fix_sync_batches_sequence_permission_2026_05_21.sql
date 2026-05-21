-- Fix for "permission denied for sequence sync_batches_id_seq"
-- Safe to run directly in Supabase.

grant usage, select on sequence sync_batches_id_seq to service_role;
