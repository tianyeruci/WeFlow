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

type RawEventRow = {
  id: string
  account_scope: string
  dedup_key: string
  event_type: string
  group_id: string
  group_name: string
  member_name: string
  member_wxid: string
  related_name: string
  related_wxid: string
  join_type: string
  quit_type: string
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
  parsed_content: string
  confidence: number
  sync_status: string
  sync_error: string
  last_sync_at: string | null
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
  rawEvents?: RawEventRow[]
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

  const counts = await upsertScopeRows(payload)

  return {
    accountScope,
    counts
  }
}

export async function resetInviteStatsRemoteData() {
  const tables = [
    'sync_batches',
    'scan_logs',
    'member_identity_bindings',
    'quit_events',
    'invite_events',
    'raw_events',
    'group_tag_bindings',
    'activity_tags'
  ]

  for (const table of tables) {
    await supabaseDelete(table, { id: 'not.is.null' })
  }

  return {
    tables
  }
}

async function upsertScopeRows(payload: InviteSyncPayload) {
  const activityTags = payload.activityTags.filter(row => row.id)
  const activityTagIds = new Set(activityTags.map(row => row.id))
  const groupTagBindings = payload.groupTagBindings.filter(row =>
    row.activity_tag_id && activityTagIds.has(row.activity_tag_id)
  )

  await supabaseUpsert('activity_tags', activityTags, { onConflict: ['id'] })
  await supabaseUpsert('group_tag_bindings', groupTagBindings, {
    onConflict: ['account_scope', 'group_id']
  })
  await supabaseUpsert('raw_events', payload.rawEvents || [], { onConflict: ['account_scope', 'dedup_key'] })
  await supabaseUpsert('invite_events', payload.inviteEvents, { onConflict: ['id'] })
  await supabaseUpsert('quit_events', payload.quitEvents, { onConflict: ['id'] })
  await supabaseUpsert('member_identity_bindings', payload.memberIdentityBindings, { onConflict: ['id'] })
  await supabaseUpsert('scan_logs', payload.scanLogs, { onConflict: ['id'] })

  return {
    activityTags: activityTags.length,
    groupTagBindings: groupTagBindings.length,
    rawEvents: payload.rawEvents?.length || 0,
    inviteEvents: payload.inviteEvents.length,
    quitEvents: payload.quitEvents.length,
    memberIdentityBindings: payload.memberIdentityBindings.length,
    scanLogs: payload.scanLogs.length
  }
}
