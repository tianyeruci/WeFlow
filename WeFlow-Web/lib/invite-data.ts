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
import { supabaseSelect } from './supabase-rest'

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
}

type GroupTagBinding = {
  group_id?: string
  group_name?: string
  activity_tag_id?: string
  enabled?: boolean
  member_count?: number | null
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
  const confirmedEvents = events.filter(isConfirmedStatEvent)
  const inviteEvents = confirmedEvents.filter(isInviteEvent)
  const effectiveInviteEvents = inviteEvents.filter(isEffectiveInviteEvent)
  const quitEvents = confirmedEvents.filter(isQuitEvent)
  const groups = buildGroupsFromBindings(groupBindings)
  const rankingEvents = effectiveInviteEvents.filter(row => {
    if (filters.rankingGroupId && String(row.group_id || '') !== filters.rankingGroupId) return false
    return withinRange(row.invite_time, filters.rankingStart, filters.rankingEnd)
  })

  return {
    cards: {
      activeRobots: 0,
      monitoredGroups: groups.length,
      totalMembers: countUniqueMembers(effectiveInviteEvents.filter(row => row.delete_flag !== 1)),
      totalMembersWithQuit: countUniqueMembers(inviteEvents),
      todayNew: countUniqueMembers(effectiveInviteEvents.filter(row => isToday(row.invite_time))),
      todayQuit: countUniqueMembers(quitEvents.filter(row => isToday(eventTime(row)))),
      pendingCount: events.filter(row => row.status === 'pending').length
    },
    groups,
    hourlyDistribution: buildHourlyDistribution(effectiveInviteEvents),
    inviteRanking: buildInviteRanking(rankingEvents),
    groupRanking: buildGroupRanking(groupBindings),
    recentActivities: confirmedEvents
      .slice()
      .sort((a, b) => timeValue(eventTime(b)) - timeValue(eventTime(a)))
      .slice(0, 9)
      .map(row => ({
        eventType: isQuitEvent(row) ? 'quit' as const : 'invite' as const,
        memberName: memberName(row),
        sourceName: isQuitEvent(row) ? operatorName(row) : inviterName(row),
        sourceLabel: isQuitEvent(row) ? quitTypeText(row.quit_type) : joinTypeText(row),
        groupName: groupName(row),
        time: eventTime(row)
      }))
  }
}

export async function getMemberTrace(filters: TraceFilters): Promise<MemberTraceData> {
  const events = await loadFinalEvents(filters.tagId)
  const groups = buildGroupsFromEvents(events)
  const keyword = (filters.keyword || '').trim().toLowerCase()

  const rows = events
    .filter(row => {
      const eventTime = row.invite_time || row.exit_time || row.created_time || null
      const traceStatus = toTraceStatus(row)
      const traceAttribution = toTraceAttribution(row)

      if (!isVisibleForTrace(row)) return false
      if (filters.groupId && String(row.group_id || '') !== filters.groupId) return false
      if (keyword && !memberName(row).toLowerCase().includes(keyword)) return false
      if (!withinRange(eventTime, filters.startTime, filters.endTime)) return false
      if (filters.status && traceStatus !== filters.status) return false
      if (filters.attribution && traceAttribution !== filters.attribution) return false
      if (filters.includeQuit === false && traceStatus === 'quit') return false
      return true
    })
    .sort((a, b) => timeValue(b.invite_time || b.exit_time || b.created_time) - timeValue(a.invite_time || a.exit_time || a.created_time))
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

  return [[
    '当前活动',
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
    limit: 10000
  }

  if (tagId) query.activity_tag_id = `eq.${tagId}`

  return supabaseSelect<FinalStatEvent>('final_stat_events', query)
}

async function loadGroupBindings(tagId?: string) {
  const query: Record<string, string | number> = {
    select: 'group_id,group_name,activity_tag_id,enabled,member_count',
    enabled: 'eq.true',
    limit: 10000
  }

  if (tagId) query.activity_tag_id = `eq.${tagId}`

  return supabaseSelect<GroupTagBinding>('group_tag_bindings', query)
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
  return row.status !== 'ignored'
}

function buildGroupsFromEvents(events: FinalStatEvent[]): GroupOption[] {
  const groups = new Map<string, GroupOption>()
  events.forEach(row => {
    const id = String(row.group_id || row.group_name || '')
    if (!id) return
    groups.set(id, { id, name: groupName(row) })
  })
  return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

function buildGroupsFromBindings(bindings: GroupTagBinding[]): GroupOption[] {
  const groups = new Map<string, GroupOption>()
  bindings.forEach(row => {
    const id = String(row.group_id || row.group_name || '')
    if (!id) return
    groups.set(id, { id, name: bindingGroupName(row) })
  })
  return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

function buildHourlyDistribution(events: FinalStatEvent[]) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))
  events.forEach(row => {
    const date = toDate(row.invite_time)
    if (date) buckets[date.getHours()].count += 1
  })
  return buckets
}

function buildInviteRanking(events: FinalStatEvent[]): InviteRankingRow[] {
  const ranking = new Map<string, { inviterId: string; inviterName: string; members: Set<string> }>()
  events.forEach(row => {
    const name = inviterName(row)
    if (!name || name === '未知来源') return
    const id = String(row.inviter_wx_id || name)
    const current = ranking.get(id) || { inviterId: id, inviterName: name, members: new Set<string>() }
    const key = memberKey(row)
    if (key) current.members.add(key)
    ranking.set(id, current)
  })
  return Array.from(ranking.values())
    .map(row => ({ inviterId: row.inviterId, inviterName: row.inviterName, count: row.members.size }))
    .sort((a, b) => b.count - a.count)
}

function buildGroupRanking(bindings: GroupTagBinding[]) {
  const groups = new Map<string, { groupName: string; count: number }>()
  bindings.forEach(row => {
    const id = String(row.group_id || row.group_name || '')
    if (!id) return
    groups.set(id, {
      groupName: bindingGroupName(row),
      count: normalizeCount(row.member_count)
    })
  })
  return Array.from(groups.entries())
    .map(([groupId, group]) => ({ groupId, groupName: group.groupName, count: group.count }))
    .sort((a, b) => b.count - a.count)
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
  if (row.delete_flag === 1 || isQuitEvent(row) || row.exit_time) return 'quit'
  return 'active'
}

function toTraceAttribution(row: FinalStatEvent): TraceAttribution {
  if (row.status === 'pending') return 'pending'
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
  const now = new Date()
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
}

function eventTime(row: FinalStatEvent) {
  return row.invite_time || row.exit_time || row.created_time || null
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
