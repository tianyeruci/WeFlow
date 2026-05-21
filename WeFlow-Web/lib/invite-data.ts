import {
  ActivityTag,
  DashboardData,
  GroupOption,
  InviteRankingRow,
  MemberTraceData,
  MemberTraceRow,
  TraceAttribution,
  TraceStatus
} from '@/types/invite'
import { csvText } from './csv'
import { supabaseSelect, supabaseSelectAll } from './supabase-rest'

type AnyRecord = Record<string, unknown>

type FinalStatEvent = {
  event_id?: string
  id?: string
  activity_tag_id?: string
  activity_tag_name?: string
  group_id?: string
  group_name?: string
  event_type?: string
  user?: string
  member_name?: string
  wx_id?: string
  wxid?: string
  head_img?: string | null
  avatar_url?: string | null
  inviter?: string
  inviter_name?: string
  inviter_wx_id?: string
  operator_name?: string
  operator_wxid?: string
  join_type?: string
  quit_type?: string
  invite_time?: string | null
  exit_time?: string | null
  created_time?: string | null
  status?: string
  valid_flag?: number
  delete_flag?: number
  raw_content?: string
  source_raw_content?: string
  raw_json?: unknown
  updated_at?: string | null
}

type GroupTagBinding = {
  group_id?: string
  group_name?: string
  activity_tag_id?: string
  enabled?: boolean
  member_count?: number | null
  updated_at?: string | null
  raw_json?: unknown
}

type DashboardFilters = {
  tagId?: string
  rankingGroupId?: string
  rankingStart?: string
  rankingEnd?: string
}

type TraceFilters = {
  tagId?: string
  groupId?: string
  keyword?: string
  startTime?: string
  endTime?: string
  status?: string
  attribution?: string
  includeQuit?: boolean
}

type GroupReleaseFilters = {
  tagId?: string
  includeQuit?: boolean
}

type GroupMemberExportFilters = GroupReleaseFilters & {
  groupId: string
}

type GroupExportFile = {
  filename: string
  content: string
}

const ALL_ACTIVITY_TAG_ID = '__all__'

export async function listActivityTags(): Promise<ActivityTag[]> {
  const rows = await supabaseSelect<AnyRecord>('activity_tags', { select: '*' })
  return rows
    .filter(row => row.enabled !== false && row.deleted !== true)
    .map(row => ({
      id: String(row.id ?? row.activity_tag_id ?? ''),
      name: String(row.tag_name ?? row.name ?? row.label ?? '未命名活动')
    }))
    .filter(tag => tag.id)
}

export async function getDashboard(filters: DashboardFilters): Promise<DashboardData> {
  const [events, groupBindings] = await Promise.all([
    loadFinalEvents(filters.tagId),
    loadGroupBindings(filters.tagId)
  ])
  const scopedBindings = getScopedBindings(groupBindings, filters.tagId)
  const scopedInviteEvents = getScopedInviteEvents(events, groupBindings, filters.tagId)
  const scopedQuitEvents = getScopedQuitEvents(events, groupBindings, filters.tagId)
  const groups = buildGroupsFromBindings(scopedBindings)
  const rankingEvents = scopedInviteEvents.filter(row => {
    if (!isEffectiveInviteEvent(row)) return false
    if (filters.rankingGroupId && String(row.group_id || '') !== filters.rankingGroupId) return false
    return withinRange(row.invite_time, filters.rankingStart, filters.rankingEnd)
  })

  return {
    cards: {
      activeRobots: 0,
      monitoredGroups: groups.length,
      totalMembers: scopedInviteEvents.filter(row => row.delete_flag !== 1).length,
      totalMembersWithQuit: scopedInviteEvents.length,
      todayNew: scopedInviteEvents.filter(row => row.delete_flag !== 1 && isToday(row.invite_time)).length,
      todayQuit: [
        ...scopedQuitEvents.filter(row => row.status === 'confirmed' && isToday(eventTime(row))),
        ...scopedInviteEvents.filter(row => row.status === 'confirmed' && row.delete_flag === 1 && isToday(eventTime(row)))
      ].length,
      pendingCount: [
        ...scopedInviteEvents,
        ...scopedQuitEvents
      ].filter(row => row.status === 'pending').length
    },
    groups,
    hourlyDistribution: buildHourlyDistribution(scopedInviteEvents),
    inviteRanking: buildInviteRanking(rankingEvents),
    groupRanking: buildGroupRanking(scopedBindings),
    recentActivities: events
      .filter(row => isEventInCurrentTag(row, groupBindings, filters.tagId))
      .filter(row => row.status !== 'ignored')
      .slice()
      .sort((a, b) => timeValue(eventTime(b)) - timeValue(eventTime(a)))
      .slice(0, 9)
      .map(row => {
        const rowIsQuit = isQuitEvent(row) || row.delete_flag === 1
        const sourceName = isQuitEvent(row) ? operatorName(row) : row.delete_flag === 1 ? '自动检查' : inviterName(row)
        const sourceLabel = rowIsQuit
          ? isQuitEvent(row) ? quitTypeText(row.quit_type) : '已退出群'
          : joinTypeText(row)
        return {
          eventType: rowIsQuit ? 'quit' as const : 'invite' as const,
          memberName: memberName(row),
          avatarUrl: memberAvatarUrl(row),
          sourceName,
          sourceLabel,
          groupName: groupName(row),
          time: eventTime(row)
        }
      })
  }
}

export async function getMemberTrace(filters: TraceFilters): Promise<MemberTraceData> {
  const events = await loadFinalEvents(filters.tagId)
  const groups = buildGroupsFromEvents(events)
  const keyword = (filters.keyword || '').trim().toLowerCase()

  const rows = events
    .filter(row => {
      const traceEventTime = eventTime(row)
      const traceStatus = toTraceStatus(row)
      const traceAttribution = toTraceAttribution(row)

      if (!isVisibleForTrace(row)) return false
      if (filters.groupId && String(row.group_id || '') !== filters.groupId) return false
      if (keyword && !memberName(row).toLowerCase().includes(keyword)) return false
      if (!withinRange(traceEventTime, filters.startTime, filters.endTime)) return false
      if (filters.status && traceStatus !== filters.status) return false
      if (filters.attribution && traceAttribution !== filters.attribution) return false
      if (filters.includeQuit === false && traceStatus === 'quit') return false
      return true
    })
    .sort((a, b) => timeValue(eventTime(b)) - timeValue(eventTime(a)))
    .map(toMemberTraceRow)

  return { rows, total: rows.length, groups }
}

export async function getRankingExportRows(filters: DashboardFilters) {
  const dashboard = await getDashboard(filters)
  return dashboard.inviteRanking.map(row => [
    row.inviterName,
    row.inviterId,
    row.count
  ])
}

export async function getMemberTraceExportRows(filters: TraceFilters) {
  const trace = await getMemberTrace(filters)
  return trace.rows.map(row => [
    row.memberName,
    row.wxid,
    row.source,
    row.groupName,
    formatDateTime(row.time),
    statusText(row.status),
    attributionText(row.attribution),
    row.rawContent
  ])
}

export async function getGroupSummaryExportRows(filters: GroupReleaseFilters) {
  const dashboard = await getDashboard({ tagId: filters.tagId })
  const memberTotal = filters.includeQuit ? dashboard.cards.totalMembersWithQuit : dashboard.cards.totalMembers
  const scopeLabel = filters.tagId === ALL_ACTIVITY_TAG_ID ? '全部活动' : '当前活动'

  return [[
    scopeLabel,
    dashboard.cards.monitoredGroups,
    memberTotal,
    filters.includeQuit ? '包含已退群的人' : '仅有效入群人数'
  ]]
}

export async function getGroupListExportRows(filters: GroupReleaseFilters) {
  const dashboard = await getDashboard({ tagId: filters.tagId })
  const counts = new Map(dashboard.groupRanking.map(row => [row.groupId, row.count]))

  return dashboard.groups.map(group => [
    group.name,
    group.id,
    counts.get(group.id) || 0
  ])
}

export async function getGroupMemberExportRows(filters: GroupMemberExportFilters) {
  const events = await loadFinalEvents(filters.tagId)
  return buildGroupMemberCsvRows(events, filters.groupId)
}

export async function getBatchGroupMemberExportFiles(filters: GroupReleaseFilters) {
  const [events, groupBindings] = await Promise.all([
    loadFinalEvents(filters.tagId),
    loadGroupBindings(filters.tagId)
  ])
  const groups = buildGroupsFromBindings(groupBindings)
  const groupedEvents = new Map<string, FinalStatEvent[]>()

  events
    .filter(isConfirmedStatEvent)
    .forEach(row => {
      const groupId = String(row.group_id || row.group_name || '')
      if (!groupId) return
      const current = groupedEvents.get(groupId) || []
      current.push(row)
      groupedEvents.set(groupId, current)
    })

  return groups.map(group => ({
    filename: `${sanitizeFilename(group.name)}.csv`,
    content: csvText(
      ['时间', '邀请人', '被邀请人', '状态'],
      buildGroupMemberCsvRows(groupedEvents.get(group.id) || [], group.id)
    )
  }))
}

async function loadFinalEvents(tagId?: string) {
  const query: Record<string, string | number> = {
    select: '*',
    order: 'id.asc'
  }

  if (tagId && tagId !== ALL_ACTIVITY_TAG_ID) query.activity_tag_id = `eq.${tagId}`

  return supabaseSelectAll<FinalStatEvent>('final_stat_events', query)
}

async function loadGroupBindings(tagId?: string) {
  const query: Record<string, string | number> = {
    select: 'group_id,group_name,activity_tag_id,enabled,member_count,updated_at,raw_json',
    enabled: 'eq.true',
    order: 'id.asc'
  }

  if (tagId && tagId !== ALL_ACTIVITY_TAG_ID) query.activity_tag_id = `eq.${tagId}`

  return supabaseSelectAll<GroupTagBinding>('group_tag_bindings', query)
}

function isConfirmedStatEvent(row: FinalStatEvent) {
  return row.status !== 'pending' && row.status !== 'ignored'
}

function isInviteEvent(row: FinalStatEvent) {
  return row.event_type === 'invite'
}

function isQuitEvent(row: FinalStatEvent) {
  return row.event_type === 'quit' || row.event_type === 'exit'
}

function isEffectiveInviteEvent(row: FinalStatEvent) {
  return isInviteEvent(row) && row.status === 'confirmed' && row.valid_flag === 1 && Boolean(memberKey(row))
}

function isVisibleForTrace(row: FinalStatEvent) {
  return row.status !== 'deleted'
}

function buildGroupsFromEvents(events: FinalStatEvent[]): GroupOption[] {
  const groups = new Map<string, GroupOption>()
  events.forEach(row => {
    const id = String(row.group_id || row.group_name || '')
    if (!id) return
    const current = groups.get(id)
    groups.set(id, { id, name: groupName(row), avatarUrl: current?.avatarUrl || '' })
  })
  return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

function buildGroupsFromBindings(bindings: GroupTagBinding[]): GroupOption[] {
  const groups = new Map<string, GroupTagBinding>()
  bindings.forEach(row => {
    const id = String(row.group_id || row.group_name || '')
    if (!id) return
    const current = groups.get(id)
    if (!current || timeValue(row.updated_at) >= timeValue(current.updated_at)) {
      groups.set(id, row)
    }
  })
  return Array.from(groups.values())
    .map(row => ({ id: String(row.group_id || row.group_name || ''), name: bindingGroupName(row), avatarUrl: groupAvatarUrl(row) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

function buildHourlyDistribution(events: FinalStatEvent[]) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))
  events.forEach(row => {
    const date = toDate(row.invite_time)
    if (date) buckets[getBeijingHour(date)].count += 1
  })
  return buckets
}

function buildInviteRanking(events: FinalStatEvent[]): InviteRankingRow[] {
  const ranking = new Map<string, { inviterId: string; inviterName: string; count: number; groups: Set<string>; recent: number }>()
  events.forEach(row => {
    const name = inviterName(row)
    const id = String(row.inviter_wx_id || row.inviter_name || name || 'unknown')
    const current = ranking.get(id) || { inviterId: id, inviterName: name || id, count: 0, groups: new Set<string>(), recent: 0 }
    current.count += 1
    current.groups.add(String(row.group_id || ''))
    current.recent = Math.max(current.recent, timeValue(row.invite_time))
    ranking.set(id, current)
  })
  return Array.from(ranking.values())
    .map(row => ({ inviterId: row.inviterId, inviterName: row.inviterName, count: row.count }))
    .sort((a, b) => b.count - a.count)
}

function buildGroupRanking(bindings: GroupTagBinding[]) {
  const groups = new Map<string, GroupTagBinding>()
  bindings.forEach(row => {
    const id = String(row.group_id || row.group_name || '')
    if (!id) return
    const current = groups.get(id)
    if (!current || timeValue(row.updated_at) >= timeValue(current.updated_at)) {
      groups.set(id, row)
    }
  })
  return Array.from(groups.entries())
    .map(([groupId, group]) => ({ groupId, groupName: bindingGroupName(group), count: normalizeCount(group.member_count) }))
    .sort((a, b) => b.count - a.count)
}

function getScopedBindings(bindings: GroupTagBinding[], tagId?: string) {
  const scoped = isAllActivityScope(tagId)
    ? bindings.filter(row => row.enabled !== false)
    : bindings.filter(row => row.enabled !== false && String(row.activity_tag_id || '') === String(tagId || ''))
  return dedupeBindingsByGroupId(scoped)
}

function getScopedInviteEvents(events: FinalStatEvent[], bindings: GroupTagBinding[], tagId?: string) {
  return events.filter(row => isInviteEvent(row) && isEventInCurrentTag(row, bindings, tagId))
}

function getScopedQuitEvents(events: FinalStatEvent[], bindings: GroupTagBinding[], tagId?: string) {
  return events.filter(row => isQuitEvent(row) && isEventInCurrentTag(row, bindings, tagId))
}

function isAllActivityScope(tagId?: string) {
  const normalized = String(tagId || '').trim()
  return !normalized || normalized === ALL_ACTIVITY_TAG_ID
}

function isEventInCurrentTag(row: FinalStatEvent, bindings: GroupTagBinding[], tagId?: string) {
  const normalizedTagId = String(tagId || '').trim()
  if (isAllActivityScope(normalizedTagId)) {
    return bindings.some(binding =>
      binding.enabled !== false &&
      String(binding.group_id || '') === String(row.group_id || '') &&
      String(binding.activity_tag_id || '') === String(row.activity_tag_id || '')
    )
  }

  return String(row.activity_tag_id || '') === normalizedTagId &&
    bindings.some(binding =>
      binding.enabled !== false &&
      String(binding.group_id || '') === String(row.group_id || '') &&
      String(binding.activity_tag_id || '') === normalizedTagId
    )
}

function dedupeBindingsByGroupId(bindings: GroupTagBinding[]) {
  const groups = new Map<string, GroupTagBinding>()
  bindings.forEach(row => {
    const id = String(row.group_id || row.group_name || '')
    if (!id) return
    const current = groups.get(id)
    if (!current || timeValue(row.updated_at) >= timeValue(current.updated_at)) {
      groups.set(id, row)
    }
  })
  return Array.from(groups.values())
}

function countUniqueMembers(events: FinalStatEvent[]) {
  return new Set(events.map(memberKey).filter(Boolean)).size
}

function memberKey(row: FinalStatEvent) {
  return normalizeIdentity(row.wx_id || row.wxid) ||
    normalizeIdentity(row.user || row.member_name) ||
    String(row.event_id || row.id || '')
}

function normalizeIdentity(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function memberName(row: FinalStatEvent) {
  return String(row.user || row.member_name || row.wx_id || row.wxid || '未知成员')
}

function inviterName(row: FinalStatEvent) {
  return String(row.inviter || row.inviter_name || '未知来源')
}

function operatorName(row: FinalStatEvent) {
  return String(row.operator_name || '系统')
}

function groupName(row: FinalStatEvent) {
  return String(row.group_name || row.group_id || '未知群')
}

function bindingGroupName(row: GroupTagBinding) {
  return String(row.group_name || row.group_id || '未知群')
}

function normalizeCount(value: unknown) {
  return Math.max(0, Math.floor(Number(value || 0)))
}

function toMemberTraceRow(row: FinalStatEvent): MemberTraceRow {
  const status = toTraceStatus(row)
  const attribution = toTraceAttribution(row)
  const sourcePrefix = isQuitEvent(row) ? quitTypeText(row.quit_type) : joinTypeText(row)
  const sourceName = isQuitEvent(row) ? operatorName(row) : inviterName(row)

  return {
    id: String(row.event_id || row.id || `${row.group_id || ''}-${memberKey(row)}-${eventTime(row) || ''}`),
    memberName: memberName(row),
    avatarUrl: memberAvatarUrl(row),
    wxid: String(row.wx_id || row.wxid || ''),
    source: `${sourcePrefix} · ${sourceName}`,
    groupId: String(row.group_id || ''),
    groupName: groupName(row),
    time: eventTime(row),
    status,
    attribution,
    rawContent: String(row.raw_content || row.source_raw_content || '')
  }
}

function toTraceStatus(row: FinalStatEvent): TraceStatus {
  if (row.status === 'pending') return 'pending'
  if (row.status !== 'ignored' && (row.delete_flag === 1 || isQuitEvent(row) || row.exit_time)) return 'quit'
  return 'active'
}

function toTraceAttribution(row: FinalStatEvent): TraceAttribution {
  if (row.status === 'pending') return 'pending'
  if (row.status === 'ignored') return 'invalid'
  if (!isInviteEvent(row)) return 'none'
  if (row.valid_flag === -1) return 'invalid'
  return 'valid'
}

function withinRange(value?: string | null, start?: string, end?: string) {
  if (!value) return false
  const current = timeValue(value)
  if (start && current < timeValue(start)) return false
  if (end && current > timeValue(end)) return false
  return true
}

function isToday(value?: string | null) {
  const date = toDate(value)
  if (!date) return false
  return beijingDateKey(date) === beijingDateKey(new Date())
}

function eventTime(row: FinalStatEvent) {
  if (isInviteEvent(row) && row.delete_flag === 1) {
    return row.updated_at || row.exit_time || row.invite_time || row.created_time || null
  }
  return row.invite_time || row.exit_time || row.created_time || null
}

function memberAvatarUrl(row: FinalStatEvent) {
  const rawJson = rawJsonRecord(row.raw_json)
  return String(
    row.head_img ||
    row.avatar_url ||
    rawJson?.head_img ||
    rawJson?.avatar_url ||
    rawJson?.avatarUrl ||
    ''
  ).trim()
}

function groupAvatarUrl(row: GroupTagBinding) {
  const rawJson = rawJsonRecord(row.raw_json)
  return String(
    rawJson?.avatar_url ||
    rawJson?.avatarUrl ||
    rawJson?.head_img ||
    ''
  ).trim()
}

function rawJsonRecord(value: unknown): AnyRecord | null {
  if (!value) return null
  if (typeof value === 'object' && !Array.isArray(value)) return value as AnyRecord
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as AnyRecord : null
  } catch {
    return null
  }
}

function joinTypeText(row: FinalStatEvent) {
  if (row.join_type === 'qrcode') return '扫码'
  if (row.join_type === 'direct') return '直接入群'
  return inviterName(row) === '未知来源' ? '扫码' : '邀请'
}

function quitTypeText(value?: string) {
  if (value === 'self_quit') return '主动退群'
  if (value === 'removed') return '被移出'
  return '退群'
}

function toDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function timeValue(value?: string | null) {
  return toDate(value)?.getTime() || 0
}

function getBeijingHour(date: Date) {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    hour12: false
  }).format(date)) % 24
}

function beijingDateKey(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

export function formatDateTime(value?: string | null) {
  const date = toDate(value)
  if (!date) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date)
}

function statusText(status: TraceStatus) {
  if (status === 'quit') return '已退出'
  if (status === 'pending') return '待确认'
  return '未退出'
}

function attributionText(attribution: TraceAttribution) {
  if (attribution === 'invalid') return '无效'
  if (attribution === 'pending') return '待确认'
  if (attribution === 'none') return '-'
  return '有效'
}

function buildGroupMemberCsvRows(events: FinalStatEvent[], groupId: string) {
  return events
    .filter(row => String(row.group_id || row.group_name || '') === groupId)
    .filter(isConfirmedStatEvent)
    .sort((a, b) => timeValue(b.invite_time || b.exit_time || b.created_time) - timeValue(a.invite_time || a.exit_time || a.created_time))
    .map(row => [
      formatDateTime(row.invite_time || row.exit_time || row.created_time),
      groupMemberSourceName(row),
      memberName(row),
      groupMemberStatusText(row)
    ])
}

function groupMemberSourceName(row: FinalStatEvent) {
  if (isQuitEvent(row)) return operatorName(row)
  return inviterName(row)
}

function groupMemberStatusText(row: FinalStatEvent) {
  if (isQuitEvent(row)) return quitTypeText(row.quit_type)
  if (row.join_type === 'qrcode') return '扫码入群'
  if (row.join_type === 'direct') return '直接入群'
  return '邀请入群'
}

function sanitizeFilename(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/[\u0000-\u001f]/g, '')
    .trim() || 'download'
}
