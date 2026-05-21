import { createHash } from 'crypto'
import { NextRequest } from 'next/server'
import { supabaseDelete, supabaseInsert, supabasePatch, supabaseSelect } from './supabase-rest'

type SyncBatchRow = {
  id: number
  account_scope: string
  source_client: string | null
  status: string
  started_at: string
  finished_at?: string | null
  error_text?: string | null
}

type SyncCounts = Partial<Record<
  'activityTags' |
  'groupTagBindings' |
  'rawEvents' |
  'inviteEvents' |
  'quitEvents' |
  'memberIdentityBindings' |
  'scanLogs',
  number
>>

const REFRESH_SOURCE_PREFIX = 'web-refresh:'
const REFRESH_ACCOUNT_SCOPE = process.env.REMOTE_REFRESH_ACCOUNT_SCOPE || 'remote-refresh'
const REFRESH_COOLDOWN_SECONDS = 15

export async function createWebRefreshRequest(request: NextRequest) {
  await cleanupOldWebRefreshRequests()

  const ip = getClientIp(request)
  const ipHash = hashValue(ip)
  const sourceClient = `${REFRESH_SOURCE_PREFIX}${ipHash}`
  const now = new Date()
  const latest = await getLatestRefreshForSource(sourceClient)

  if (latest) {
    const elapsedSeconds = Math.floor((now.getTime() - new Date(latest.started_at).getTime()) / 1000)
    if (elapsedSeconds < REFRESH_COOLDOWN_SECONDS) {
      return {
        accepted: false,
        cooldown: true,
        remainingSeconds: Math.max(1, REFRESH_COOLDOWN_SECONDS - elapsedSeconds),
        cooldownSeconds: REFRESH_COOLDOWN_SECONDS
      }
    }
  }

  const rows = await supabaseInsert<Partial<SyncBatchRow> & Record<string, unknown>>('sync_batches', [{
    account_scope: REFRESH_ACCOUNT_SCOPE,
    source_client: sourceClient,
    status: 'requested',
    started_at: now.toISOString(),
    raw_json: {
      kind: 'web-refresh',
      ip,
      ip_hash: ipHash,
      user_agent: request.headers.get('user-agent') || '',
      requested_at: now.toISOString()
    }
  }])
  const row = rows[0]

  return {
    accepted: true,
    cooldown: false,
    requestId: row?.id,
    remainingSeconds: REFRESH_COOLDOWN_SECONDS,
    cooldownSeconds: REFRESH_COOLDOWN_SECONDS
  }
}

export async function claimLatestWebRefreshRequest() {
  await cleanupOldWebRefreshRequests()

  const rows = await supabaseSelect<SyncBatchRow>('sync_batches', {
    select: 'id,account_scope,source_client,status,started_at,finished_at,error_text',
    source_client: `like.${REFRESH_SOURCE_PREFIX}%`,
    status: 'eq.requested',
    order: 'started_at.desc',
    limit: 100
  })

  const latest = rows[0]
  if (!latest) {
    return { requestId: null as number | null }
  }

  const now = new Date().toISOString()
  const supersededIds = rows.slice(1).map((row) => row.id).filter(Boolean)
  if (supersededIds.length) {
    await supabasePatch('sync_batches', {
      id: `in.(${supersededIds.join(',')})`
    }, {
      status: 'superseded',
      finished_at: now,
      error_text: 'Superseded by latest web refresh request'
    })
  }

  await supabasePatch('sync_batches', {
    id: `eq.${latest.id}`
  }, {
    status: 'processing'
  })

  return {
    requestId: latest.id,
    requestedAt: latest.started_at
  }
}

export async function peekLatestWebRefreshRequest() {
  await cleanupOldWebRefreshRequests()

  const rows = await supabaseSelect<SyncBatchRow>('sync_batches', {
    select: 'id,account_scope,source_client,status,started_at,finished_at,error_text',
    source_client: `like.${REFRESH_SOURCE_PREFIX}%`,
    status: 'eq.requested',
    order: 'started_at.desc',
    limit: 1
  })

  const latest = rows[0]
  if (!latest) {
    return { requestId: null as number | null }
  }

  return {
    requestId: latest.id,
    requestedAt: latest.started_at
  }
}

export async function completeWebRefreshRequest(input: {
  requestId: number
  success: boolean
  counts?: SyncCounts
  error?: string
}) {
  const counts = input.counts || {}
  await supabasePatch('sync_batches', {
    id: `eq.${input.requestId}`
  }, {
    status: input.success ? 'completed' : 'failed',
    activity_tags_count: Number(counts.activityTags || 0),
    group_tag_bindings_count: Number(counts.groupTagBindings || 0),
    raw_events_count: Number(counts.rawEvents || 0),
    invite_events_count: Number(counts.inviteEvents || 0),
    quit_events_count: Number(counts.quitEvents || 0),
    member_identity_bindings_count: Number(counts.memberIdentityBindings || 0),
    scan_logs_count: Number(counts.scanLogs || 0),
    error_text: input.success ? null : (input.error || 'Remote refresh sync failed'),
    finished_at: new Date().toISOString()
  })
}

export async function cleanupOldWebRefreshRequests() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  await supabaseDelete('sync_batches', {
    source_client: `like.${REFRESH_SOURCE_PREFIX}%`,
    started_at: `lt.${start.toISOString()}`
  })
}

async function getLatestRefreshForSource(sourceClient: string) {
  const rows = await supabaseSelect<SyncBatchRow>('sync_batches', {
    select: 'id,account_scope,source_client,status,started_at',
    source_client: `eq.${sourceClient}`,
    order: 'started_at.desc',
    limit: 1
  })
  return rows[0]
}

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    forwarded ||
    'unknown'
}

function hashValue(value: string) {
  return createHash('sha256').update(value || 'unknown').digest('hex').slice(0, 16)
}
