import { supabaseDelete, supabaseUpsert } from './supabase-rest'

type ActivityTagRow = {
  id: string
  account_scope: string
  name: string
  enabled: boolean
  sort_order: number
  created_at: string | null
  updated_at: string | null
  raw_json: unknown
}

type GroupTagBindingRow = {
  id: string
  account_scope: string
  group_id: string
  group_name: string
  activity_tag_id: string
  enabled: boolean
  last_scan_at: string | null
  last_invite_time: string | null
  created_at: string | null
  updated_at: string | null
  raw_json: unknown
}

type InviteEventRow = {
  id: string
  account_scope: string
  activity_tag_id: string
  group_id: string
  group_name: string
  member_name: string
  member_wxid: string
  inviter_name: string
  inviter_wxid: string
  status: string
  valid_flag: number
  delete_flag: number
  created_time: string | null
  invite_time: string | null
  exit_time: string | null
  source_message_id: string
  source_local_id: string | null
  source_create_time: string | null
  raw_message: string
  confirm_source: string
  feishu_record_id: string
  sync_status: string
  sync_error: string
  last_sync_at: string | null
  created_at: string | null
  updated_at: string | null
  raw_json: unknown
}

type QuitEventRow = {
  id: string
  account_scope: string
  activity_tag_id: string
  group_id: string
  group_name: string
  member_name: string
  member_wxid: string
  operator_name: string
  operator_wxid: string
  status: string
  valid_flag: number
  delete_flag: number
  created_time: string | null
  invite_time: string | null
  exit_time: string | null
  source_message_id: string
  source_local_id: string | null
  source_create_time: string | null
  raw_message: string
  confirm_source: string
  feishu_record_id: string
  sync_status: string
  sync_error: string
  last_sync_at: string | null
  created_at: string | null
  updated_at: string | null
  raw_json: unknown
}

type MemberIdentityBindingRow = {
  id: string
  account_scope: string
  activity_tag_id: string | null
  group_id: string
  display_name: string
  wxid: string
  binding_type: string
  source: string
  created_at: string | null
  updated_at: string | null
  raw_json: unknown
}

type ScanLogRow = {
  id: string
  account_scope: string
  activity_tag_id: string
  group_id: string | null
  scan_mode: string
  status: string
  started_at: string | null
  finished_at: string | null
  scanned_messages: number
  new_invite_events: number
  new_quit_events: number
  message: string
  error_text: string
  operator_name: string
  created_at: string | null
  updated_at: string | null
  raw_json: unknown
}

export type InviteSyncPayload = {
  accountScope: string
  activityTags: ActivityTagRow[]
  groupTagBindings: GroupTagBindingRow[]
  inviteEvents: InviteEventRow[]
  quitEvents: QuitEventRow[]
  memberIdentityBindings: MemberIdentityBindingRow[]
  scanLogs: ScanLogRow[]
}

export async function syncInvitePayload(payload: InviteSyncPayload) {
  const accountScope = String(payload.accountScope || '').trim()
  if (!accountScope) {
    throw new Error('accountScope is required')
  }

  await replaceScopeRows(accountScope, payload)

  return {
    accountScope,
    counts: {
      activityTags: payload.activityTags.length,
      groupTagBindings: payload.groupTagBindings.length,
      inviteEvents: payload.inviteEvents.length,
      quitEvents: payload.quitEvents.length,
      memberIdentityBindings: payload.memberIdentityBindings.length,
      scanLogs: payload.scanLogs.length
    }
  }
}

async function replaceScopeRows(accountScope: string, payload: InviteSyncPayload) {
  const scopeFilter = { account_scope: `eq.${accountScope}` }

  await supabaseDelete('scan_logs', scopeFilter)
  await supabaseDelete('member_identity_bindings', scopeFilter)
  await supabaseDelete('quit_events', scopeFilter)
  await supabaseDelete('invite_events', scopeFilter)
  await supabaseDelete('group_tag_bindings', scopeFilter)
  await supabaseDelete('activity_tags', scopeFilter)

  await supabaseUpsert('activity_tags', payload.activityTags, { onConflict: ['id'] })
  await supabaseUpsert('group_tag_bindings', payload.groupTagBindings, {
    onConflict: ['account_scope', 'group_id', 'activity_tag_id']
  })
  await supabaseUpsert('invite_events', payload.inviteEvents, { onConflict: ['id'] })
  await supabaseUpsert('quit_events', payload.quitEvents, { onConflict: ['id'] })
  await supabaseUpsert('member_identity_bindings', payload.memberIdentityBindings, { onConflict: ['id'] })
  await supabaseUpsert('scan_logs', payload.scanLogs, { onConflict: ['id'] })
}
