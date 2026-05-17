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
  invite_time?: string | null
  exit_time?: string | null
  created_time?: string | null
  status?: string
  valid_flag?: number
  delete_flag?: number
  raw_content?: string
  source_raw_content?: string
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
  const events = await loadFinalEvents(filters.tagId)
  const confirmedEvents = events.filter(isConfirmedStatEvent)
  const inviteEvents = confirmedEvents.filter(row => row.event_type === 'invite' && row.invite_time)
  const groups = buildGroups(confirmedEvents)
  const rankingEvents = inviteEvents.filter(row => {
    if (filters.rankingGroupId && String(row.group_id || '') !== filters.rankingGroupId) return false
    return withinRange(row.invite_time, filters.rankingStart, filters.rankingEnd)
  })

  return {
    cards: {
      activeRobots: 0,
      monitoredGroups: groups.length,
      totalMembers: countUniqueMembers(inviteEvents.filter(row => row.delete_flag !== 1)),
      totalMembersWithQuit: countUniqueMembers(inviteEvents),
      todayNew: inviteEvents.filter(row => isToday(row.invite_time)).length,
      pendingCount: events.filter(row => row.status === 'pending').length
    },
    groups,
    hourlyDistribution: buildHourlyDistribution(inviteEvents),
    inviteRanking: buildInviteRanking(rankingEvents),
    groupRanking: buildGroupRanking(inviteEvents),
    recentActivities: inviteEvents
      .slice()
      .sort((a, b) => timeValue(b.invite_time) - timeValue(a.invite_time))
      .slice(0, 9)
      .map(row => ({
        memberName: memberName(row),
        inviterName: inviterName(row),
        groupName: groupName(row),
        time: row.invite_time || null
      }))
  }
}

export async function getMemberTrace(filters: TraceFilters): Promise<MemberTraceData> {
  const events = await loadFinalEvents(filters.tagId)
  const groups = buildGroups(events)
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

async function loadFinalEvents(tagId?: string) {
  const query: Record<string, string | number> = {
    select: '*',
    limit: 10000
  }

  if (tagId) query.activity_tag_id = `eq.${tagId}`

  return supabaseSelect<FinalStatEvent>('final_stat_events', query)
}

function isConfirmedStatEvent(row: FinalStatEvent) {
  return row.status !== 'pending' && row.status !== 'ignored'
}

function isVisibleForTrace(row: FinalStatEvent) {
  return row.status !== 'ignored'
}

function buildGroups(events: FinalStatEvent[]): GroupOption[] {
  const groups = new Map<string, GroupOption>()
  events.forEach(row => {
    const id = String(row.group_id || row.group_name || '')
    if (!id) return
    groups.set(id, { id, name: groupName(row) })
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
  const ranking = new Map<string, InviteRankingRow>()
  events.forEach(row => {
    const name = inviterName(row)
    if (!name || name === '未知来源') return
    const id = String(row.inviter_wx_id || name)
    const current = ranking.get(id) || { inviterId: id, inviterName: name, count: 0 }
    current.count += 1
    ranking.set(id, current)
  })
  return Array.from(ranking.values()).sort((a, b) => b.count - a.count)
}

function buildGroupRanking(events: FinalStatEvent[]) {
  const groups = new Map<string, Set<string>>()
  const names = new Map<string, string>()
  events.forEach(row => {
    const id = String(row.group_id || row.group_name || '')
    if (!id) return
    if (!groups.has(id)) groups.set(id, new Set())
    groups.get(id)?.add(memberKey(row))
    names.set(id, groupName(row))
  })
  return Array.from(groups.entries())
    .map(([groupId, members]) => ({ groupId, groupName: names.get(groupId) || groupId, count: members.size }))
    .sort((a, b) => b.count - a.count)
}

function countUniqueMembers(events: FinalStatEvent[]) {
  return new Set(events.map(memberKey)).size
}

function memberKey(row: FinalStatEvent) {
  return String(row.wx_id || row.wxid || row.user || row.member_name || row.event_id || row.id || '')
}

function memberName(row: FinalStatEvent) {
  return String(row.user || row.member_name || row.wx_id || row.wxid || '未知成员')
}

function inviterName(row: FinalStatEvent) {
  return String(row.inviter || row.inviter_name || '未知来源')
}

function groupName(row: FinalStatEvent) {
  return String(row.group_name || row.group_id || '未知群')
}

function toMemberTraceRow(row: FinalStatEvent): MemberTraceRow {
  const status = toTraceStatus(row)
  const attribution = toTraceAttribution(row)
  const sourcePrefix = row.event_type === 'exit' ? '退出' : inviterName(row) === '未知来源' ? '扫码' : '邀请'
  const sourceName = row.event_type === 'exit' ? memberName(row) : inviterName(row)

  return {
    id: String(row.event_id || row.id || `${row.group_id || ''}-${memberKey(row)}-${row.invite_time || row.exit_time || row.created_time || ''}`),
    memberName: memberName(row),
    wxid: String(row.wx_id || row.wxid || ''),
    source: `${sourcePrefix} · ${sourceName}`,
    groupId: String(row.group_id || ''),
    groupName: groupName(row),
    time: row.invite_time || row.exit_time || row.created_time || null,
    status,
    attribution,
    rawContent: String(row.raw_content || row.source_raw_content || '')
  }
}

function toTraceStatus(row: FinalStatEvent): TraceStatus {
  if (row.status === 'pending') return 'pending'
  if (row.delete_flag === 1 || row.event_type === 'exit' || row.exit_time) return 'quit'
  return 'active'
}

function toTraceAttribution(row: FinalStatEvent): TraceAttribution {
  if (row.status === 'pending') return 'pending'
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
  return '有效'
}
