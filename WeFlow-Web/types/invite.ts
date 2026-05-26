export type ActivityTag = {
  id: string
  name: string
}

export type GroupOption = {
  id: string
  name: string
  accountScope?: string
  avatarUrl?: string
  remark?: string
}

export type InviteRankingRow = {
  inviterId: string
  inviterName: string
  count: number
}

export type GroupRankingRow = {
  groupId: string
  groupName: string
  count: number
}

export type HourlyDistributionRow = {
  hour: number
  count: number
}

export type RecentActivity = {
  eventType: 'invite' | 'quit'
  memberName: string
  avatarUrl?: string
  sourceName: string
  sourceLabel: string
  groupName: string
  time: string | null
}

export type DashboardData = {
  cards: {
    activeRobots: number
    monitoredGroups: number
    totalMembers: number
    totalMembersWithQuit: number
    todayNew: number
    todayQuit: number
    pendingCount: number
  }
  groups: GroupOption[]
  hourlyDistribution: HourlyDistributionRow[]
  inviteRanking: InviteRankingRow[]
  groupRanking: GroupRankingRow[]
  recentActivities: RecentActivity[]
}

export type TraceStatus = 'active' | 'quit' | 'pending'
export type TraceAttribution = 'valid' | 'invalid' | 'pending' | 'none'

export type MemberTraceRow = {
  id: string
  memberName: string
  avatarUrl?: string
  wxid: string
  source: string
  groupId: string
  groupName: string
  time: string | null
  status: TraceStatus
  attribution: TraceAttribution
  rawContent: string
}

export type MemberTraceData = {
  rows: MemberTraceRow[]
  total: number
  groups: GroupOption[]
  limit?: number
  offset?: number
  hasMore?: boolean
}

export type ApiError = {
  error: string
  detail?: string
}
