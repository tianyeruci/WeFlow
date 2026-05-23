import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import ExcelJS from 'exceljs'
import { createHash, randomUUID } from 'crypto'
import { ConfigService } from './config'
import { wcdbService } from './wcdbService'
import { chatService, type Message } from './chatService'
import { groupAnalyticsService, type GroupChatInfo, type GroupMember } from './groupAnalyticsService'

type InviteEventStatus = 'confirmed' | 'pending' | 'ignored'
type JoinType = 'invite' | 'qrcode' | 'direct' | 'unknown'
type QuitType = 'self_quit' | 'removed' | 'unknown'
type ScanStatus = 'running' | 'completed' | 'failed' | 'skipped'
type ScanMode = 'incremental' | 'quit-check'
type ExportFormat = 'csv' | 'xlsx'

export interface InviteActivityTag {
  tag_id: string
  tag_name: string
  enabled: boolean
  sync_status?: string
  sync_error?: string
  last_sync_at?: number
  created_at: number
  updated_at: number
}

export interface InviteGroupTagBinding {
  id: string
  group_id: string
  group_name: string
  avatar_url?: string
  tag_id: string
  tag_name: string
  enabled: boolean
  member_count: number
  last_scan_time: number
  last_invite_time: number
  last_message_id: string
  last_scanned_message_time?: number
  last_scanned_local_id?: number
  sync_status?: string
  sync_error?: string
  last_sync_at?: number
  created_at: number
  updated_at: number
}

export interface InviteEvent {
  id: string
  user: string
  wx_id: string
  inviter: string
  inviter_wx_id: string
  invite_time: number
  group_name: string
  group_id: string
  activity_tag_id: string
  activity_tag_name: string
  head_img: string
  join_type: JoinType
  delete_flag: number
  valid_flag: number
  raw_content: string
  parsed_content: string
  source_rule?: string
  source_context_members?: string[]
  source_message_id: string
  source_local_id: number
  source_create_time: number
  confidence: number
  status: InviteEventStatus
  dedup_key?: string
  feishu_record_id: string
  sync_status: string
  sync_error: string
  last_sync_at: number
  created_at: number
  updated_at: number
}

export interface QuitEvent {
  id: string
  user: string
  wx_id: string
  quit_time: number
  group_name: string
  group_id: string
  activity_tag_id: string
  activity_tag_name: string
  head_img: string
  quit_type: QuitType
  operator: string
  operator_wx_id: string
  raw_content: string
  parsed_content: string
  source_rule?: string
  source_context_members?: string[]
  source_message_id: string
  source_local_id: number
  source_create_time: number
  confidence: number
  status: InviteEventStatus
  dedup_key?: string
  sync_status?: string
  sync_error?: string
  last_sync_at?: number
  created_at: number
  updated_at: number
}

export interface MemberIdentityBinding {
  id: string
  group_id: string
  display_name: string
  wx_id: string
  confidence: number
  source: 'auto' | 'manual'
  sync_status?: string
  sync_error?: string
  last_sync_at?: number
  created_at: number
  updated_at: number
}

export interface InviterIdentityMapping {
  id: string
  person_key: string
  person_name: string
  wxid: string
  display_name: string
  enabled: boolean
  created_at: number
  updated_at: number
}

export interface InviteScanLog {
  id: string
  tag_id: string
  tag_name: string
  scan_mode?: ScanMode
  status: ScanStatus
  started_at: number
  finished_at: number
  scanned_groups: number
  scanned_messages: number
  new_invites: number
  new_quits: number
  pending_count: number
  error: string
  sync_status?: string
  sync_error?: string
  last_sync_at?: number
}

export interface InviteRawEvent {
  id: string
  event_type: 'invite' | 'quit'
  dedup_key: string
  group_id: string
  group_name: string
  member_name: string
  member_wxid: string
  related_name: string
  related_wxid: string
  head_img?: string
  source_rule?: string
  source_context_members?: string[]
  join_type?: JoinType
  quit_type?: QuitType
  delete_flag: number
  valid_flag: number
  status: InviteEventStatus
  invite_time: number
  exit_time: number
  created_time: number
  source_message_id: string
  source_local_id: number
  source_create_time: number
  raw_content: string
  parsed_content: string
  confidence: number
  sync_status?: string
  sync_error?: string
  last_sync_at?: number
  created_at: number
  updated_at: number
}

interface InviteStatsScopeData {
  activityTags: InviteActivityTag[]
  groupTagBindings: InviteGroupTagBinding[]
  rawEvents: InviteRawEvent[]
  inviteEvents: InviteEvent[]
  quitEvents: QuitEvent[]
  memberIdentityBindings: MemberIdentityBinding[]
  inviterIdentityMappings: InviterIdentityMapping[]
  scanLogs: InviteScanLog[]
}

interface InviteStatsFile {
  version: 1
  scopes: Record<string, InviteStatsScopeData>
}

export interface InviteRemoteSyncPayload {
  accountScope: string
  activityTags: Array<Record<string, unknown>>
  groupTagBindings: Array<Record<string, unknown>>
  rawEvents: Array<Record<string, unknown>>
  inviteEvents: Array<Record<string, unknown>>
  quitEvents: Array<Record<string, unknown>>
  memberIdentityBindings: Array<Record<string, unknown>>
  inviterIdentityMappings?: Array<Record<string, unknown>>
  scanLogs: Array<Record<string, unknown>>
}

export interface InviteSyncSnapshot {
  activityTags: Map<string, number>
  groupTagBindings: Map<string, number>
  rawEvents: Map<string, number>
  inviteEvents: Map<string, number>
  quitEvents: Map<string, number>
  memberIdentityBindings: Map<string, number>
  scanLogs: Map<string, number>
}

export interface InviteRemoteSyncPayloadBundle {
  payload: InviteRemoteSyncPayload
  snapshot: InviteSyncSnapshot
}

interface ParsedSystemEvent {
  type: 'join' | 'quit'
  joinType?: JoinType
  quitType?: QuitType
  user: string
  inviter?: string
  operator?: string
  sourceRule?: string
  sourceContextMembers?: string[]
  confidence: number
}

interface MatchResult {
  wxId: string
  displayName: string
  avatarUrl: string
  candidates: Array<{ wxId: string; displayName: string; avatarUrl?: string }>
  status: InviteEventStatus
  reason: string
  matchedMember?: GroupMember
}

interface GroupContext {
  groupId: string
  groupName: string
  tagId: string
  tagName: string
  members: GroupMember[]
}

interface InviteStatsGroupRow {
  group_id: string
  group_name: string
  avatar_url?: string
  member_count: number
  today_join_count: number
  today_quit_count: number
  recent_invite_time: number
  last_scan_time: number
  tag_id: string
  tag_name: string
  tag_enabled: boolean
  binding_enabled: boolean
}

interface InviteRankingRow {
  rank: number
  inviter: string
  inviter_wx_id: string
  invite_count: number
  group_count: number
  recent_invite_time: number
}

interface MemberTraceFilters {
  tagId?: string
  groupId?: string
  keyword?: string
  wxId?: string
  startTime?: number
  endTime?: number
  exact?: boolean
  statusFilter?: 'active' | 'quit' | 'pending'
  attributionFilter?: 'valid' | 'invalid' | 'pending'
  includeQuit?: boolean
  limit?: number
  offset?: number
}

interface ManualInviteRecordPayload {
  sourceEventId?: string
  tagId: string
  groupId: string
  user: string
  wxId: string
  inviter: string
  inviterWxId: string
  inviteTime?: number
}

interface MemberTraceRow {
  id: string
  event_type: 'invite' | 'quit'
  user: string
  wx_id: string
  inviter: string
  inviter_wx_id: string
  group_name: string
  group_id: string
  activity_tag_id: string
  activity_tag_name: string
  head_img: string
  join_type: JoinType | ''
  quit_type: QuitType | ''
  operator: string
  operator_wx_id: string
  event_time: number
  delete_flag: number | null
  valid_flag: number | null
  status: InviteEventStatus
  invited_count: number
  raw_content: string
  parsed_content: string
  source_rule?: string
  source_context_members?: string[]
}

const createEmptyScope = (): InviteStatsScopeData => ({
  activityTags: [],
  groupTagBindings: [],
  rawEvents: [],
  inviteEvents: [],
  quitEvents: [],
  memberIdentityBindings: [],
  inviterIdentityMappings: [],
  scanLogs: []
})

const normalizeText = (value: unknown): string => String(value || '').trim()
const normalizeIdentityText = (value: unknown): string => normalizeText(value).replace(/\s+/g, ' ').toLowerCase()
const ALL_ACTIVITY_TAG_ID = '__all__'
const UNKNOWN_INVITER_NAME = '未知来源'

class InviteStatsService {
  private readonly fileVersion = 1
  private readonly maxScanLogsPerScope = 80
  private readonly systemMessagePageSize = 500
  private readonly scanCursorOverlapSeconds = 24 * 60 * 60
  private readonly autoScanInitialDelayMs = 10 * 60 * 1000
  private readonly autoScanIntervalMs = 3 * 60 * 1000
  private readonly autoQuitCheckIntervalMs = 30 * 60 * 1000
  private configService: ConfigService
  private filePath: string | null = null
  private loaded = false
  private store: InviteStatsFile = { version: 1, scopes: {} }
  private scanPromise: Promise<any> | null = null
  private quitCheckPromise: Promise<any> | null = null
  private activeScanState: {
    tagId: string
    tagName: string
    scanMode: ScanMode
    startedAt: number
    groupCount: number
    scannedMessageCount: number
  } | null = null
  private activeQuitCheckState: {
    tagId: string
    tagName: string
    scanMode: ScanMode
    startedAt: number
    groupCount: number
    scannedMessageCount: number
  } | null = null
  private autoScanTimer: ReturnType<typeof setInterval> | null = null
  private autoScanStarted = false
  private autoQuitCheckTimer: ReturnType<typeof setTimeout> | null = null
  private autoQuitCheckStarted = false
  private afterScanSuccess: (() => void | Promise<void>) | null = null
  private backgroundTaskBlocker: (() => boolean) | null = null

  constructor() {
    this.configService = ConfigService.getInstance()
  }

  private resolveFilePath(): string {
    if (this.filePath) return this.filePath
    const workerUserDataPath = String(process.env.WEFLOW_USER_DATA_PATH || process.env.WEFLOW_CONFIG_CWD || '').trim()
    const userDataPath = workerUserDataPath || app?.getPath?.('userData') || process.cwd()
    fs.mkdirSync(userDataPath, { recursive: true })
    this.filePath = path.join(userDataPath, 'weflow-invite-stats.json')
    return this.filePath
  }

  private ensureLoaded(): void {
    if (this.loaded) return
    this.loaded = true
    const filePath = this.resolveFilePath()
    try {
      if (!fs.existsSync(filePath)) return
      const raw = fs.readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed && parsed.version === this.fileVersion && parsed.scopes && typeof parsed.scopes === 'object') {
        this.store = parsed as InviteStatsFile
      }
    } catch {
      this.store = { version: 1, scopes: {} }
    }
  }

  private persist(): void {
    try {
      fs.writeFileSync(this.resolveFilePath(), JSON.stringify(this.store, null, 2), 'utf-8')
    } catch (error) {
      console.error('[InviteStats] 保存本地统计数据失败:', error)
    }
  }

  private getCurrentScopeKey(): string {
    const myWxid = normalizeText(this.configService.getMyWxidCleaned())
    if (myWxid) return `wxid:${myWxid}`

    const dbPath = normalizeText(this.configService.get('dbPath'))
    if (dbPath) return `db:${createHash('sha1').update(dbPath).digest('hex').slice(0, 16)}`
    return 'default'
  }

  private getScope(): InviteStatsScopeData {
    this.ensureLoaded()
    const key = this.getCurrentScopeKey()
    if (!this.store.scopes[key]) {
      this.store.scopes[key] = createEmptyScope()
      this.persist()
    }
    const scope = this.store.scopes[key]
    this.ensureScopeShape(scope)
    return scope
  }

  private ensureScopeShape(data: InviteStatsScopeData): void {
    const scope = data as InviteStatsScopeData & { rawEvents?: InviteRawEvent[]; inviterIdentityMappings?: InviterIdentityMapping[] }
    let changed = false
    if (!Array.isArray(scope.rawEvents)) {
      scope.rawEvents = []
      changed = true
    }
    if (!Array.isArray(scope.inviterIdentityMappings)) {
      scope.inviterIdentityMappings = []
      changed = true
    }
    if (scope.rawEvents.length === 0 && (data.inviteEvents.length > 0 || data.quitEvents.length > 0)) {
      for (const event of data.inviteEvents) changed = this.upsertRawEventFromInvite(data, event) || changed
      for (const event of data.quitEvents) changed = this.upsertRawEventFromQuit(data, event) || changed
    }
    changed = this.ensureRawEventTimestamps(data) || changed
    if (changed) this.persist()
  }

  private nowSeconds(): number {
    return Math.floor(Date.now() / 1000)
  }

  private toIsoTime(timestamp?: number): string | null {
    if (!Number.isFinite(timestamp) || !timestamp || timestamp <= 0) return null
    return new Date(timestamp * 1000).toISOString()
  }

  private fromRemoteTime(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value > 100000000000 ? Math.floor(value / 1000) : Math.floor(value)
    const text = normalizeText(value)
    if (!text) return 0
    const numeric = Number(text)
    if (Number.isFinite(numeric)) return numeric > 100000000000 ? Math.floor(numeric / 1000) : Math.floor(numeric)
    const parsed = Date.parse(text)
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0
  }

  private cleanAccountDirName(name: string): string {
    const trimmed = normalizeText(name)
    if (!trimmed) return trimmed
    if (trimmed.toLowerCase().startsWith('wxid_')) {
      const match = trimmed.match(/^(wxid_[^_]+)/i)
      if (match) return match[1]
    }
    const suffixMatch = trimmed.match(/^(.+)_([a-zA-Z0-9]{4})$/)
    return suffixMatch ? suffixMatch[1] : trimmed
  }

  private startOfTodaySeconds(): number {
    const beijingOffsetMs = 8 * 60 * 60 * 1000
    const dayMs = 24 * 60 * 60 * 1000
    return Math.floor((Date.now() + beijingOffsetMs) / dayMs) * 86400 - 8 * 60 * 60
  }

  private getBeijingHour(timestamp: number): number {
    return new Date((timestamp + 8 * 60 * 60) * 1000).getUTCHours()
  }

  private formatTime(timestamp: number): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return ''
    return new Date(timestamp * 1000).toLocaleString('zh-CN', { hour12: false })
  }

  private escapeCsvValue(value: unknown): string {
    const text = String(value ?? '')
    if (!/[",\n\r]/.test(text)) return text
    return `"${text.replace(/"/g, '""')}"`
  }

  private writeCsv(filePath: string, headers: string[], rows: unknown[][]): void {
    const lines = [
      headers.map((cell) => this.escapeCsvValue(cell)).join(','),
      ...rows.map((row) => row.map((cell) => this.escapeCsvValue(cell)).join(','))
    ]
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, `\ufeff${lines.join('\n')}`, 'utf-8')
  }

  private async writeWorkbook(filePath: string, sheetName: string, headers: string[], rows: unknown[][]): Promise<void> {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet(sheetName.slice(0, 31) || '邀请统计')
    worksheet.addRow(headers)
    for (const row of rows) worksheet.addRow(row)
    worksheet.getRow(1).font = { name: 'Calibri', bold: true, size: 11 }
    headers.forEach((header, index) => {
      worksheet.getColumn(index + 1).width = Math.max(14, Math.min(42, String(header).length + 8))
    })
    await workbook.xlsx.writeFile(filePath)
  }

  private normalizeExportFormat(filePath: string, format?: string): ExportFormat {
    if (format === 'xlsx' || format === 'csv') return format
    return path.extname(filePath).toLowerCase() === '.csv' ? 'csv' : 'xlsx'
  }

  private normalizeSystemContent(message: Message): string {
    const source = normalizeText(message.parsedContent) && message.parsedContent !== '[系统消息]'
      ? message.parsedContent
      : (message.rawContent || message.content || '')
    let text = String(source || '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
    const plainMatch = /<plain>([\s\S]*?)<\/plain>/i.exec(text) || /<text>([\s\S]*?)<\/text>/i.exec(text)
    if (plainMatch?.[1]) text = plainMatch[1]
    text = text
      .replace(/<!\[CDATA\[/g, '')
      .replace(/\]\]>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/^[\s]*([a-zA-Z0-9_@-]{4,}):(?!\/\/)\s*/i, '')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
    return text
  }

  private splitInvitedUsers(text: string): string[] {
    const users: string[] = []
    let rest = normalizeText(text)
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")

    const addUser = (value: string): void => {
      const user = normalizeText(value).replace(/^["']+|["']+$/g, '').trim()
      if (user) users.push(user)
    }

    const currentUserPrefix = /^["']?你["']?和/.exec(rest)
    if (currentUserPrefix) {
      users.push('你')
      rest = rest.slice(currentUserPrefix[0].length)
    }

    rest
      .replace(/^["']+|["']+$/g, '')
      .split(/[、,，]/)
      .forEach(addUser)

    return users
  }

  private splitBackgroundInviteMembers(text: string): string[] {
    return normalizeText(text)
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .split(/[、,，\n\r]/)
      .map((item) => normalizeText(item).replace(/^[\"']+|[\"']+$/g, '').trim())
      .filter(Boolean)
  }

  private parseSystemEvents(text: string): ParsedSystemEvent[] {
    const normalized = normalizeText(text)
      .replace(/[。.!！]+$/g, '')
      .replace(/\s+/g, ' ')
    if (!normalized) return []

    const backgroundInvite = /^["']?(.+?)["']?邀请你加入了群聊[，,]\s*群聊参与人还有[:：]\s*([\s\S]+)$/u.exec(normalized)
    if (backgroundInvite) {
      return [{
        type: 'join',
        joinType: 'invite',
        user: '你',
        inviter: normalizeText(backgroundInvite[1]),
        sourceRule: 'background-invite',
        sourceContextMembers: this.splitBackgroundInviteMembers(backgroundInvite[2]),
        confidence: 0.94
      }]
    }

    const qrcode = /^["']?(.+?)["']?通过扫描["']?(.+?)["']?分享的二维码加入(?:了)?群聊$/.exec(normalized)
    if (qrcode) {
      return [{
        type: 'join',
        joinType: 'qrcode',
        user: normalizeText(qrcode[1]),
        inviter: normalizeText(qrcode[2]) || '未知来源',
        sourceRule: 'qrcode',
        confidence: 0.94
      }]
    }

    const invite = /^["']*(.+?)["']*邀请["']*(.+?)["']*加入(?:了)?群聊$/.exec(normalized)
    if (invite) {
      const inviter = normalizeText(invite[1])
      const users = this.splitInvitedUsers(invite[2])
      return users.map((user) => ({
        type: 'join',
        joinType: 'invite',
        inviter,
        user,
        sourceRule: 'invite',
        confidence: 0.96
      }))
    }

    const removed = /^["']?(.+?)["']?被["']?(.+?)["']?移出(?:了)?群聊$/.exec(normalized)
    if (removed) {
      return [{
        type: 'quit',
        quitType: 'removed',
        user: normalizeText(removed[1]),
        operator: normalizeText(removed[2]),
        sourceRule: 'removed',
        confidence: 0.94
      }]
    }

    const quit = /^["']?(.+?)["']?退出(?:了)?群聊$/.exec(normalized)
    if (quit) {
      return [{
        type: 'quit',
        quitType: 'self_quit',
        user: normalizeText(quit[1]),
        sourceRule: 'quit',
        confidence: 0.94
      }]
    }

    const direct = /^["']?(.+?)["']?加入(?:了)?群聊$/.exec(normalized)
    if (direct) {
      return [{
        type: 'join',
        joinType: 'direct',
        user: normalizeText(direct[1]),
        sourceRule: 'direct',
        confidence: 0.9
      }]
    }

    return []
  }

  private getMemberDisplayFields(member: GroupMember): string[] {
    return [
      member.displayName,
      member.groupNickname,
      member.nickname,
      member.remark,
      member.alias,
      member.username
    ].map(normalizeText).filter(Boolean)
  }

  private getGroupMemberIdentityKeys(member: GroupMember): string[] {
    const keys = [
      this.cleanAccountDirName(normalizeText(member.username)),
      ...this.getMemberDisplayFields(member).map(normalizeIdentityText)
    ].filter(Boolean)
    return Array.from(new Set(keys))
  }

  private matchCurrentAccountMember(members: GroupMember[], fallbackDisplayName: string): MatchResult {
    const myWxid = this.configService.getMyWxidCleaned()
    if (!myWxid) {
      return {
        wxId: '',
        displayName: fallbackDisplayName,
        avatarUrl: '',
        candidates: [],
        status: 'pending',
        reason: '未配置当前账号'
      }
    }

    const normalizedWxid = this.cleanAccountDirName(myWxid)
    const member = members.find((item) => this.cleanAccountDirName(item.username) === normalizedWxid)
    return {
      wxId: member?.username || normalizedWxid,
      displayName: member?.displayName || member?.groupNickname || member?.nickname || fallbackDisplayName,
      avatarUrl: member?.avatarUrl || '',
      candidates: [],
      status: 'confirmed',
      reason: member ? 'current-account-group-match' : 'current-account-config',
      matchedMember: member
    }
  }

  private findManualBinding(data: InviteStatsScopeData, groupId: string, displayName: string): string {
    const normalized = normalizeIdentityText(displayName)
    if (!normalized) return ''
    const binding = data.memberIdentityBindings
      .filter((item) => item.group_id === groupId && normalizeIdentityText(item.display_name) === normalized)
      .sort((a, b) => b.updated_at - a.updated_at)[0]
    return binding?.wx_id || ''
  }

  private matchMemberByDisplayName(
    data: InviteStatsScopeData,
    groupId: string,
    displayName: string,
    members: GroupMember[]
  ): MatchResult {
    const name = normalizeText(displayName)
    if (!name) {
      return { wxId: '', displayName: '', avatarUrl: '', candidates: [], status: 'pending', reason: '昵称为空' }
    }

    if (normalizeIdentityText(name) === '你') {
      return this.matchCurrentAccountMember(members, name)
    }

    const manualWxid = this.findManualBinding(data, groupId, name)
    if (manualWxid) {
      const manualMember = members.find((member) => this.cleanAccountDirName(member.username) === this.cleanAccountDirName(manualWxid))
      return {
        wxId: manualWxid,
        displayName: manualMember?.displayName || name,
        avatarUrl: manualMember?.avatarUrl || '',
        candidates: [],
        status: 'confirmed',
        reason: 'manual-binding',
        matchedMember: manualMember
      }
    }

    const normalized = normalizeIdentityText(name)
    const matched = members.filter((member) => {
      return this.getMemberDisplayFields(member).some((field) => normalizeIdentityText(field) === normalized)
    })

    if (matched.length === 1) {
      const member = matched[0]
      return {
        wxId: member.username,
        displayName: member.displayName || name,
        avatarUrl: member.avatarUrl || '',
        candidates: [],
        status: 'confirmed',
        reason: 'unique-group-match',
        matchedMember: member
      }
    }

    if (matched.length > 1) {
      return {
        wxId: '',
        displayName: name,
        avatarUrl: '',
        candidates: matched.map((member) => ({
          wxId: member.username,
          displayName: member.displayName || member.username,
          avatarUrl: member.avatarUrl
        })),
        status: 'pending',
        reason: '群内存在多个同名候选'
      }
    }

    return {
      wxId: '',
      displayName: name,
      avatarUrl: '',
      candidates: [],
      status: 'pending',
      reason: '群内未匹配到成员'
    }
  }

  private buildMessageDedupKey(event: {
    group_id: string
    source_message_id?: string
    source_local_id?: number
    source_create_time?: number
    wx_id?: string
    inviter_wx_id?: string
    user?: string
    inviter?: string
    raw_content?: string
  }): string {
    const groupId = normalizeText(event.group_id)
    const sourceMessageId = normalizeText(event.source_message_id)
    const member = this.cleanAccountDirName(normalizeText(event.wx_id)) || normalizeIdentityText(event.user)
    if (groupId && sourceMessageId && sourceMessageId !== '0') return `${groupId}:msg:${sourceMessageId}:${member || 'unknown'}`
    if (groupId && event.source_local_id && event.source_create_time) {
      return `${groupId}:local:${event.source_local_id}:${event.source_create_time}:${member || 'unknown'}`
    }
    if (groupId && event.wx_id && event.inviter_wx_id && event.source_create_time) {
      return `${groupId}:person:${event.wx_id}:${event.inviter_wx_id}:${event.source_create_time}`
    }
    return `${groupId}:raw:${normalizeText(event.user)}:${normalizeText(event.inviter)}:${event.source_create_time || 0}:${createHash('sha1').update(normalizeText(event.raw_content)).digest('hex').slice(0, 16)}`
  }

  private buildRawDedupKey(eventType: 'invite' | 'quit', event: {
    group_id: string
    source_message_id?: string
    source_local_id?: number
    source_create_time?: number
    wx_id?: string
    user?: string
    raw_content?: string
  }): string {
    const groupId = normalizeText(event.group_id)
    const member = this.cleanAccountDirName(normalizeText(event.wx_id)) || normalizeIdentityText(event.user)
    const sourceMessageId = normalizeText(event.source_message_id)
    const source = sourceMessageId && sourceMessageId !== '0'
      ? `msg:${sourceMessageId}`
      : event.source_local_id && event.source_create_time
        ? `local:${event.source_local_id}:${event.source_create_time}`
        : `raw:${event.source_create_time || 0}:${createHash('sha1').update(normalizeText(event.raw_content)).digest('hex').slice(0, 16)}`
    return `${groupId}:${eventType}:${source}:${member}`
  }

  private markSyncDirty<T extends { sync_status?: string; sync_error?: string; updated_at?: number }>(row: T, now = this.nowSeconds()): void {
    row.sync_status = 'dirty'
    row.sync_error = ''
    row.updated_at = now
  }

  private rawValueEquals(left: unknown, right: unknown): boolean {
    if (Array.isArray(left) || Array.isArray(right)) {
      return JSON.stringify(left || []) === JSON.stringify(right || [])
    }
    return left === right
  }

  private isKnownRelatedName(name: string): boolean {
    const normalized = normalizeText(name)
    if (!normalized) return false
    const lowered = normalized.toLowerCase()
    return lowered !== 'unknown' && normalized !== '未知来源'
  }

  private getBoundGroupBinding(
    data: InviteStatsScopeData,
    groupId: string,
    tagId: string
  ): InviteGroupTagBinding | undefined {
    return data.groupTagBindings.find((binding) =>
      binding.enabled && binding.group_id === groupId && binding.tag_id === tagId
    )
  }

  private isAllActivityScope(tagId: string): boolean {
    const normalized = normalizeText(tagId)
    return !normalized || normalized === ALL_ACTIVITY_TAG_ID
  }

  private getScopedBindings(data: InviteStatsScopeData, tagId: string): InviteGroupTagBinding[] {
    const bindings = this.isAllActivityScope(tagId)
      ? data.groupTagBindings.filter((binding) => binding.enabled)
      : this.getEnabledBindingsForTag(data, tagId)
    const byGroupId = new Map<string, InviteGroupTagBinding>()
    for (const binding of bindings) {
      if (!binding.group_id) continue
      const existing = byGroupId.get(binding.group_id)
      if (!existing || (binding.updated_at || 0) > (existing.updated_at || 0)) {
        byGroupId.set(binding.group_id, binding)
      }
    }
    return Array.from(byGroupId.values())
  }

  private dedupeInviteEventsByMemberKey(events: InviteEvent[]): InviteEvent[] {
    const buckets = new Map<string, InviteEvent>()
    for (const event of events.slice().sort((a, b) => {
      const inviteDiff = a.invite_time - b.invite_time
      if (inviteDiff !== 0) return inviteDiff
      const sourceDiff = a.source_create_time - b.source_create_time
      if (sourceDiff !== 0) return sourceDiff
      return String(a.source_message_id || a.id).localeCompare(String(b.source_message_id || b.id))
    })) {
      const key = this.getMemberKey(event)
      if (!key || buckets.has(key)) continue
      buckets.set(key, event)
    }
    return Array.from(buckets.values())
  }

  private dedupeInviteEventsByMemberWxId(events: InviteEvent[]): InviteEvent[] {
    const buckets = new Map<string, InviteEvent>()
    for (const event of events.slice().sort((a, b) => {
      const inviteDiff = a.invite_time - b.invite_time
      if (inviteDiff !== 0) return inviteDiff
      const sourceDiff = a.source_create_time - b.source_create_time
      if (sourceDiff !== 0) return sourceDiff
      return String(a.source_message_id || a.id).localeCompare(String(b.source_message_id || b.id))
    })) {
      const wxid = this.getMemberWxId(event)
      if (!wxid || buckets.has(wxid)) continue
      buckets.set(wxid, event)
    }
    return Array.from(buckets.values())
  }

  private getDashboardInviteEvents(data: InviteStatsScopeData, tagId: string, dedupeMembers: boolean): InviteEvent[] {
    const scoped = this.getScopedInviteEvents(data, tagId)
    if (!dedupeMembers) {
      return scoped.slice().sort((a, b) => a.invite_time - b.invite_time)
    }
    if (this.isAllActivityScope(tagId)) {
      return this.dedupeInviteEventsByMemberKey(
        scoped.filter((event) => event.status === 'confirmed' && event.valid_flag === 1 && this.getMemberKey(event))
      )
    }
    return this.getEffectiveInviteEvents(data, tagId)
  }

  private findGroupMemberByWxId(members: GroupMember[], wxId: string): GroupMember | undefined {
    const normalized = this.cleanAccountDirName(normalizeText(wxId))
    if (!normalized) return undefined
    return members.find((member) => this.cleanAccountDirName(normalizeText(member.username)) === normalized)
  }

  private getPreferredMemberName(member: GroupMember | undefined, fallbackName: string, fallbackWxId: string): string {
    if (!member) return normalizeText(fallbackName) || normalizeText(fallbackWxId)
    return normalizeText(member.displayName) ||
      normalizeText(member.groupNickname) ||
      normalizeText(member.remark) ||
      normalizeText(member.nickname) ||
      normalizeText(member.alias) ||
      normalizeText(member.username) ||
      normalizeText(fallbackName) ||
      normalizeText(fallbackWxId)
  }

  private async resolveManualIdentity(
    groupId: string,
    wxId: string,
    fallbackName: string,
    members?: GroupMember[]
  ): Promise<{ wxId: string; displayName: string; avatarUrl: string; member?: GroupMember }> {
    const normalizedWxId = normalizeText(wxId)
    const groupMembers = members || await this.loadGroupMembers(groupId)
    const member = this.findGroupMemberByWxId(groupMembers, normalizedWxId)
    const contact = await chatService.getContactAvatar(member?.username || normalizedWxId)
    const resolvedWxId = member?.username || normalizedWxId
    const displayName = this.getPreferredMemberName(member, contact?.displayName || fallbackName, resolvedWxId)
    return {
      wxId: resolvedWxId,
      displayName,
      avatarUrl: normalizeText(member?.avatarUrl || contact?.avatarUrl || ''),
      member
    }
  }

  private async loadGroupMembers(groupId: string): Promise<GroupMember[]> {
    const result = await groupAnalyticsService.getGroupMembers(groupId)
    return result.success && result.data ? result.data : []
  }

  private isSyncDirty(row: { sync_status?: string; last_sync_at?: number; updated_at?: number; finished_at?: number; started_at?: number }): boolean {
    const updatedAt = Number(row.updated_at || row.finished_at || row.started_at || 0)
    const lastSyncAt = Number(row.last_sync_at || 0)
    return row.sync_status !== 'synced' || !lastSyncAt || (updatedAt > 0 && updatedAt > lastSyncAt)
  }

  setAfterScanSuccessCallback(callback: (() => void | Promise<void>) | null): void {
    this.afterScanSuccess = callback
  }

  setBackgroundTaskBlocker(blocker: (() => boolean) | null): void {
    this.backgroundTaskBlocker = blocker
  }

  private isBackgroundTaskBlocked(): boolean {
    return this.backgroundTaskBlocker?.() === true
  }

  private notifyAfterScanSuccess(): void {
    if (!this.afterScanSuccess) return
    Promise.resolve(this.afterScanSuccess()).catch((error) => {
      console.warn('[InviteStats] 扫描后同步触发失败:', error)
    })
  }

  private isGroupBoundToTag(data: InviteStatsScopeData, groupId: string, tagId: string): boolean {
    return data.groupTagBindings.some((binding) =>
      binding.enabled && binding.group_id === groupId && binding.tag_id === tagId
    )
  }

  private isEventInCurrentTag(data: InviteStatsScopeData, event: { group_id: string; activity_tag_id: string }, tagId: string): boolean {
    if (this.isAllActivityScope(tagId)) {
      return data.groupTagBindings.some((binding) =>
        binding.enabled &&
        binding.group_id === event.group_id &&
        binding.tag_id === event.activity_tag_id
      )
    }
    return event.activity_tag_id === tagId && this.isGroupBoundToTag(data, event.group_id, tagId)
  }

  private getScopedInviteEvents(data: InviteStatsScopeData, tagId: string): InviteEvent[] {
    return data.inviteEvents.filter((event) => this.isEventInCurrentTag(data, event, tagId))
  }

  private getScopedQuitEvents(data: InviteStatsScopeData, tagId: string): QuitEvent[] {
    return data.quitEvents.filter((event) => this.isEventInCurrentTag(data, event, tagId))
  }

  private getRawEventFallbackTime(event: Partial<InviteRawEvent>): number {
    return Math.max(
      0,
      Number(event.created_time || 0),
      Number(event.source_create_time || 0),
      Number(event.invite_time || 0),
      Number(event.exit_time || 0)
    )
  }

  private ensureRawEventTimestamps(data: InviteStatsScopeData): boolean {
    let changed = false
    for (const event of data.rawEvents) {
      const fallbackTime = this.getRawEventFallbackTime(event)
      if (!Number(event.created_at || 0) && fallbackTime > 0) {
        event.created_at = fallbackTime
        changed = true
      }
      if (!Number(event.updated_at || 0) && fallbackTime > 0) {
        event.updated_at = fallbackTime
        changed = true
      }
    }
    return changed
  }

  private isInviteSystemMessage(message: Message, groupId: string): boolean {
    return Number(message.localType || 0) === 10000 || normalizeText(message.senderUsername) === groupId
  }

  private getBindingScanCursor(binding: InviteGroupTagBinding): { time: number; localId: number } {
    return {
      time: Number(binding.last_scanned_message_time || 0),
      localId: Number(binding.last_scanned_local_id || 0)
    }
  }

  private isAfterMessageCursor(
    createTime: number,
    localId: number,
    cursorTime: number,
    cursorLocalId: number
  ): boolean {
    if (createTime > cursorTime) return true
    return createTime === cursorTime && localId > cursorLocalId
  }

  private setBindingScanCursor(
    binding: InviteGroupTagBinding,
    createTime: number,
    localId: number
  ): void {
    if (createTime <= 0) return
    const current = this.getBindingScanCursor(binding)
    if (!this.isAfterMessageCursor(createTime, localId, current.time, current.localId)) return
    binding.last_scanned_message_time = createTime
    binding.last_scanned_local_id = localId
  }

  private upsertRawEventFromInvite(data: InviteStatsScopeData, event: InviteEvent): boolean {
    const dedupKey = event.dedup_key || this.buildRawDedupKey('invite', event)
    event.dedup_key = dedupKey
    const existing = data.rawEvents.find((item) => item.dedup_key === dedupKey)
    const now = this.nowSeconds()
    if (existing) {
      const updates: Partial<InviteRawEvent> = {
        group_name: event.group_name,
        member_name: event.user,
        member_wxid: event.wx_id,
        related_name: event.inviter,
        related_wxid: event.inviter_wx_id,
        head_img: event.head_img,
        join_type: event.join_type,
        delete_flag: event.delete_flag,
        valid_flag: event.valid_flag,
        status: event.status,
        invite_time: event.invite_time,
        created_time: event.source_create_time || event.invite_time,
        source_message_id: event.source_message_id,
        source_local_id: event.source_local_id,
        source_create_time: event.source_create_time,
        raw_content: event.raw_content,
        parsed_content: event.parsed_content,
        source_rule: event.source_rule,
        source_context_members: event.source_context_members,
        confidence: event.confidence
      }
      let changed = false
      for (const [key, value] of Object.entries(updates)) {
        if (!this.rawValueEquals((existing as Record<string, unknown>)[key], value)) {
          ;(existing as Record<string, unknown>)[key] = value
          changed = true
        }
      }
      if (changed) this.markSyncDirty(existing, now)
      return changed
    }
    data.rawEvents.push({
      id: event.id,
      event_type: 'invite',
      dedup_key: dedupKey,
      group_id: event.group_id,
      group_name: event.group_name,
      member_name: event.user,
      member_wxid: event.wx_id,
      related_name: event.inviter,
      related_wxid: event.inviter_wx_id,
      head_img: event.head_img,
      join_type: event.join_type,
      delete_flag: event.delete_flag,
      valid_flag: event.valid_flag,
      status: event.status,
      invite_time: event.invite_time,
      exit_time: 0,
      created_time: event.source_create_time || event.invite_time,
      source_message_id: event.source_message_id,
      source_local_id: event.source_local_id,
      source_create_time: event.source_create_time,
      raw_content: event.raw_content,
      parsed_content: event.parsed_content,
      source_rule: event.source_rule,
      source_context_members: event.source_context_members,
      confidence: event.confidence,
      sync_status: 'dirty',
      sync_error: '',
      last_sync_at: 0,
      created_at: event.created_at || now,
      updated_at: event.updated_at || now
    })
    return true
  }

  private upsertRawEventFromQuit(data: InviteStatsScopeData, event: QuitEvent): boolean {
    const dedupKey = event.dedup_key || this.buildRawDedupKey('quit', event)
    event.dedup_key = dedupKey
    const existing = data.rawEvents.find((item) => item.dedup_key === dedupKey)
    const now = this.nowSeconds()
    if (existing) {
      const updates: Partial<InviteRawEvent> = {
        group_name: event.group_name,
        member_name: event.user,
        member_wxid: event.wx_id,
        related_name: event.operator,
        related_wxid: event.operator_wx_id,
        head_img: event.head_img,
        quit_type: event.quit_type,
        delete_flag: 1,
        valid_flag: 0,
        status: event.status,
        exit_time: event.quit_time,
        created_time: event.source_create_time || event.quit_time,
        source_message_id: event.source_message_id,
        source_local_id: event.source_local_id,
        source_create_time: event.source_create_time,
        raw_content: event.raw_content,
        parsed_content: event.parsed_content,
        source_rule: event.source_rule,
        source_context_members: event.source_context_members,
        confidence: event.confidence
      }
      let changed = false
      for (const [key, value] of Object.entries(updates)) {
        if (!this.rawValueEquals((existing as Record<string, unknown>)[key], value)) {
          ;(existing as Record<string, unknown>)[key] = value
          changed = true
        }
      }
      if (changed) this.markSyncDirty(existing, now)
      return changed
    }
    data.rawEvents.push({
      id: event.id,
      event_type: 'quit',
      dedup_key: dedupKey,
      group_id: event.group_id,
      group_name: event.group_name,
      member_name: event.user,
      member_wxid: event.wx_id,
      related_name: event.operator,
      related_wxid: event.operator_wx_id,
      head_img: event.head_img,
      quit_type: event.quit_type,
      delete_flag: 1,
      valid_flag: 0,
      status: event.status,
      invite_time: 0,
      exit_time: event.quit_time,
      created_time: event.source_create_time || event.quit_time,
      source_message_id: event.source_message_id,
      source_local_id: event.source_local_id,
      source_create_time: event.source_create_time,
      raw_content: event.raw_content,
      parsed_content: event.parsed_content,
      source_rule: event.source_rule,
      source_context_members: event.source_context_members,
      confidence: event.confidence,
      sync_status: 'dirty',
      sync_error: '',
      last_sync_at: 0,
      created_at: event.created_at || now,
      updated_at: event.updated_at || now
    })
    return true
  }

  private syncRawEventsFromMaterialized(data: InviteStatsScopeData): boolean {
    let changed = false
    for (const event of data.inviteEvents) changed = this.upsertRawEventFromInvite(data, event) || changed
    for (const event of data.quitEvents) changed = this.upsertRawEventFromQuit(data, event) || changed
    return changed
  }

  private hasInviteEvent(data: InviteStatsScopeData, candidate: Partial<InviteEvent>): boolean {
    const key = this.buildMessageDedupKey(candidate as any)
    return data.inviteEvents.some((event) => this.buildMessageDedupKey(event) === key)
  }

  private hasQuitEvent(data: InviteStatsScopeData, candidate: Partial<QuitEvent>): boolean {
    const key = this.buildMessageDedupKey(candidate as any)
    if (data.quitEvents.some((event) => this.buildMessageDedupKey(event as any) === key)) return true
    const groupId = normalizeText(candidate.group_id)
    const wxId = normalizeText(candidate.wx_id)
    const user = normalizeText(candidate.user)
    const quitTime = Number(candidate.quit_time || 0)
    const raw = normalizeText(candidate.raw_content)
    return data.quitEvents.some((event) => {
      if (event.group_id !== groupId) return false
      if (wxId && event.wx_id === wxId && event.quit_time === quitTime) return true
      if (!wxId && event.user === user && event.quit_time === quitTime && event.raw_content === raw) return true
      return false
    })
  }

  private ensureIdentityBinding(
    data: InviteStatsScopeData,
    groupId: string,
    displayName: string,
    wxId: string,
    source: 'auto' | 'manual'
  ): void {
    const name = normalizeText(displayName)
    const normalizedWxid = normalizeText(wxId)
    if (!name || !normalizedWxid) return
    const existing = data.memberIdentityBindings.find((item) =>
      item.group_id === groupId && normalizeIdentityText(item.display_name) === normalizeIdentityText(name)
    )
    const now = this.nowSeconds()
    if (existing) {
      existing.wx_id = normalizedWxid
      existing.source = source === 'manual' ? 'manual' : existing.source
      existing.confidence = source === 'manual' ? 1 : Math.max(existing.confidence || 0, 0.85)
      this.markSyncDirty(existing, now)
      return
    }
    data.memberIdentityBindings.push({
      id: randomUUID(),
      group_id: groupId,
      display_name: name,
      wx_id: normalizedWxid,
      confidence: source === 'manual' ? 1 : 0.85,
      source,
      sync_status: 'dirty',
      sync_error: '',
      last_sync_at: 0,
      created_at: now,
      updated_at: now
    })
  }

  private ensureMemberAliasBindings(
    data: InviteStatsScopeData,
    groupId: string,
    member: GroupMember | undefined,
    source: 'auto' | 'manual' = 'auto'
  ): void {
    if (!member?.username) return
    for (const displayName of this.getMemberDisplayFields(member)) {
      this.ensureIdentityBinding(data, groupId, displayName, member.username, source)
    }
  }

  private hydrateEventIdentityBindings(data: InviteStatsScopeData): boolean {
    let changed = false
    const now = this.nowSeconds()
    for (const event of data.inviteEvents) {
      if (!event.wx_id) {
        const wxId = this.findManualBinding(data, event.group_id, event.user)
        if (wxId) {
          event.wx_id = wxId
          this.markSyncDirty(event, now)
          changed = true
        }
      }
      if (event.wx_id && event.status === 'pending') {
        event.status = 'confirmed'
        this.markSyncDirty(event, now)
        changed = true
      }
      if (!event.inviter_wx_id && event.inviter && event.inviter !== '鏈煡鏉ユ簮') {
        const inviterWxId = this.findManualBinding(data, event.group_id, event.inviter)
        if (inviterWxId) {
          event.inviter_wx_id = inviterWxId
          this.markSyncDirty(event, now)
          changed = true
        }
      }
    }
    for (const event of data.quitEvents) {
      if (!event.wx_id) {
        const wxId = this.findManualBinding(data, event.group_id, event.user)
        if (wxId) {
          event.wx_id = wxId
          this.markSyncDirty(event, now)
          changed = true
        }
      }
      if (event.wx_id && event.status === 'pending') {
        event.status = 'confirmed'
        this.markSyncDirty(event, now)
        changed = true
      }
      if (!event.operator_wx_id && event.operator) {
        const operatorWxId = this.findManualBinding(data, event.group_id, event.operator)
        if (operatorWxId) {
          event.operator_wx_id = operatorWxId
          this.markSyncDirty(event, now)
          changed = true
        }
      }
    }
    return changed
  }

  private recomputeFlags(data: InviteStatsScopeData): boolean {

    const nextFlags = new Map<string, number>()
    let changed = this.hydrateEventIdentityBindings(data)
    for (const event of data.inviteEvents) nextFlags.set(event.id, -1)
    const groupsByActivityUser = new Map<string, InviteEvent[]>()
    for (const event of data.inviteEvents) {
      const memberKey = this.getMemberKey(event)
      if (event.status !== 'confirmed' || !memberKey) continue
      const key = `${event.activity_tag_id}:${memberKey}`
      const list = groupsByActivityUser.get(key)
      if (list) list.push(event)
      else groupsByActivityUser.set(key, [event])
    }

    for (const events of groupsByActivityUser.values()) {
      const hasActiveMembership = events.some((event) => event.delete_flag !== 1)
      if (!hasActiveMembership) continue

      const sorted = events.slice().sort((a, b) => {
        const inviteDiff = a.invite_time - b.invite_time
        if (inviteDiff !== 0) return inviteDiff
        const sourceDiff = a.source_create_time - b.source_create_time
        if (sourceDiff !== 0) return sourceDiff
        return String(a.source_message_id || a.id).localeCompare(String(b.source_message_id || b.id))
      })
      const validId = sorted[0]?.id
      for (const event of events) {
        nextFlags.set(event.id, event.id === validId ? 1 : -1)
      }
    }

    for (const event of data.inviteEvents) {
      const nextValidFlag = nextFlags.get(event.id) ?? -1
      if (event.valid_flag !== nextValidFlag) {
        event.valid_flag = nextValidFlag
        this.markSyncDirty(event)
        changed = true
      }
    }
    return this.syncRawEventsFromMaterialized(data) || changed
  }

  private applyQuitEventToInviteFlags(data: InviteStatsScopeData, quitEvent: QuitEvent): void {
    if (quitEvent.status !== 'confirmed') return
    const quitMemberKey = this.getMemberKey(quitEvent)
    if (!quitMemberKey) return
    const related = data.inviteEvents.filter((event) =>
      event.activity_tag_id === quitEvent.activity_tag_id &&
      this.getMemberKey(event) === quitMemberKey &&
      event.status === 'confirmed'
    )
    if (related.length === 0) return
    if (related.length === 1) {
      if (related[0].group_id !== quitEvent.group_id) return
      related[0].delete_flag = 1
      related[0].valid_flag = -1
      this.markSyncDirty(related[0])
      return
    }
    const groupEvent = related.find((event) => event.group_id === quitEvent.group_id)
    if (groupEvent) {
      groupEvent.delete_flag = 1
      this.markSyncDirty(groupEvent)
    }
  }

  private async getGroupsMap(): Promise<Map<string, GroupChatInfo>> {
    const result = await groupAnalyticsService.getGroupChats()
    const map = new Map<string, GroupChatInfo>()
    if (result.success && result.data) {
      for (const group of result.data) map.set(group.username, group)
    }
    return map
  }

  private normalizeMemberCount(value: unknown): number {
    return Math.max(0, Math.floor(Number(value || 0)))
  }

  private refreshBindingMemberCounts(data: InviteStatsScopeData, groups: GroupChatInfo[], now = this.nowSeconds()): boolean {
    const groupById = new Map(groups.map((group) => [group.username, group]))
    let changed = false
    for (const binding of data.groupTagBindings) {
      const group = groupById.get(binding.group_id)
      if (!group) continue
      const nextCount = this.normalizeMemberCount(group.memberCount)
      const nextName = normalizeText(group.displayName || group.username || binding.group_name || binding.group_id)
      const nextAvatarUrl = normalizeText(group.avatarUrl)
      if (typeof binding.member_count !== 'number' || this.normalizeMemberCount(binding.member_count) !== nextCount) {
        binding.member_count = nextCount
        this.markSyncDirty(binding, now)
        changed = true
      }
      if (nextName && binding.group_name !== nextName) {
        binding.group_name = nextName
        this.markSyncDirty(binding, now)
        changed = true
      }
      if (nextAvatarUrl && binding.avatar_url !== nextAvatarUrl) {
        binding.avatar_url = nextAvatarUrl
        this.markSyncDirty(binding, now)
        changed = true
      }
    }
    return changed
  }

  private async refreshBindingMemberCountsFromSource(data: InviteStatsScopeData): Promise<boolean> {
    const result = await groupAnalyticsService.getGroupChats()
    if (!result.success || !result.data) return false
    return this.refreshBindingMemberCounts(data, result.data)
  }

  private async getGroupContext(data: InviteStatsScopeData, binding: InviteGroupTagBinding): Promise<GroupContext> {
    const membersResult = await groupAnalyticsService.getGroupMembers(binding.group_id)
    const members = membersResult.success && membersResult.data ? membersResult.data : []
    return {
      groupId: binding.group_id,
      groupName: binding.group_name || binding.group_id,
      tagId: binding.tag_id,
      tagName: binding.tag_name,
      members
    }
  }

  private buildInviteEvent(
    data: InviteStatsScopeData,
    parsed: ParsedSystemEvent,
    message: Message,
    context: GroupContext,
    parsedContent: string
  ): InviteEvent {
    const userMatch = this.matchMemberByDisplayName(data, context.groupId, parsed.user, context.members)
    const inviterRaw = normalizeText(parsed.inviter || '')
    const inviterMatch = inviterRaw && inviterRaw !== '未知来源'
      ? this.matchMemberByDisplayName(data, context.groupId, inviterRaw, context.members)
      : { wxId: '', displayName: inviterRaw || '', avatarUrl: '', candidates: [], status: 'confirmed' as InviteEventStatus, reason: 'no-inviter' }
    const isBackgroundInvite = parsed.sourceRule === 'background-invite'
    const status: InviteEventStatus = !isBackgroundInvite && userMatch.status === 'confirmed' && (parsed.joinType === 'direct' || parsed.joinType === 'qrcode' || !inviterRaw || inviterMatch.status === 'confirmed')
      ? 'confirmed'
      : 'pending'
    const now = this.nowSeconds()

    if (status === 'confirmed') {
      this.ensureIdentityBinding(data, context.groupId, parsed.user, userMatch.wxId, 'auto')
      this.ensureMemberAliasBindings(data, context.groupId, userMatch.matchedMember, 'auto')
      if (inviterRaw && inviterRaw !== '未知来源' && inviterMatch.wxId) {
        this.ensureIdentityBinding(data, context.groupId, inviterRaw, inviterMatch.wxId, 'auto')
        this.ensureMemberAliasBindings(data, context.groupId, inviterMatch.matchedMember, 'auto')
      }
    }

    return {
      id: randomUUID(),
      user: userMatch.displayName || parsed.user,
      wx_id: userMatch.wxId,
      inviter: inviterRaw || '',
      inviter_wx_id: inviterMatch.wxId || '',
      invite_time: message.createTime || now,
      group_name: context.groupName,
      group_id: context.groupId,
      activity_tag_id: context.tagId,
      activity_tag_name: context.tagName,
      head_img: userMatch.avatarUrl,
      join_type: parsed.joinType || 'unknown',
      delete_flag: -1,
      valid_flag: -1,
      raw_content: message.rawContent || message.content || '',
      parsed_content: parsedContent,
      source_rule: parsed.sourceRule || '',
      source_context_members: parsed.sourceContextMembers || [],
      source_message_id: message.serverIdRaw || String(message.serverId || ''),
      source_local_id: message.localId || 0,
      source_create_time: message.createTime || now,
      confidence: status === 'confirmed' ? parsed.confidence : Math.min(parsed.confidence, 0.55),
      status,
      dedup_key: '',
      feishu_record_id: '',
      sync_status: 'dirty',
      sync_error: '',
      last_sync_at: 0,
      created_at: now,
      updated_at: now
    }
  }

  private buildQuitEvent(
    data: InviteStatsScopeData,
    parsed: ParsedSystemEvent,
    message: Message,
    context: GroupContext,
    parsedContent: string
  ): QuitEvent {
    const userMatch = this.matchMemberByDisplayName(data, context.groupId, parsed.user, context.members)
    const operatorRaw = normalizeText(parsed.operator || '')
    const operatorMatch = operatorRaw
      ? this.matchMemberByDisplayName(data, context.groupId, operatorRaw, context.members)
      : { wxId: '', displayName: '', avatarUrl: '', candidates: [], status: 'confirmed' as InviteEventStatus, reason: 'no-operator' }
    const status: InviteEventStatus = userMatch.status === 'confirmed' && (!operatorRaw || operatorMatch.status === 'confirmed')
      ? 'confirmed'
      : 'pending'
    const now = this.nowSeconds()

    if (status === 'confirmed') {
      this.ensureIdentityBinding(data, context.groupId, parsed.user, userMatch.wxId, 'auto')
      this.ensureMemberAliasBindings(data, context.groupId, userMatch.matchedMember, 'auto')
      if (operatorRaw && operatorMatch.wxId) {
        this.ensureIdentityBinding(data, context.groupId, operatorRaw, operatorMatch.wxId, 'auto')
        this.ensureMemberAliasBindings(data, context.groupId, operatorMatch.matchedMember, 'auto')
      }
    }

    return {
      id: randomUUID(),
      user: userMatch.displayName || parsed.user,
      wx_id: userMatch.wxId,
      quit_time: message.createTime || now,
      group_name: context.groupName,
      group_id: context.groupId,
      activity_tag_id: context.tagId,
      activity_tag_name: context.tagName,
      head_img: userMatch.avatarUrl,
      quit_type: parsed.quitType || 'unknown',
      operator: operatorRaw,
      operator_wx_id: operatorMatch.wxId || '',
      raw_content: message.rawContent || message.content || '',
      parsed_content: parsedContent,
      source_rule: parsed.sourceRule || '',
      source_context_members: parsed.sourceContextMembers || [],
      source_message_id: message.serverIdRaw || String(message.serverId || ''),
      source_local_id: message.localId || 0,
      source_create_time: message.createTime || now,
      confidence: status === 'confirmed' ? parsed.confidence : Math.min(parsed.confidence, 0.55),
      status,
      dedup_key: '',
      sync_status: 'dirty',
      sync_error: '',
      last_sync_at: 0,
      created_at: now,
      updated_at: now
    }
  }

  private getEnabledBindingsForTag(data: InviteStatsScopeData, tagId: string): InviteGroupTagBinding[] {
    return data.groupTagBindings.filter((binding) => binding.enabled && binding.tag_id === tagId)
  }

  private getGroupLastInviteTime(data: InviteStatsScopeData, tagId: string, groupId: string): number {
    return data.inviteEvents.reduce((max, event) => {
      if (event.activity_tag_id !== tagId || event.group_id !== groupId) return max
      return Math.max(max, event.invite_time || 0)
    }, 0)
  }

  private getMemberKey(event: {
    wx_id?: string
    user?: string
    member_wxid?: string
    member_name?: string
  }): string {
    return this.cleanAccountDirName(normalizeText(event.wx_id || event.member_wxid || '')) ||
      normalizeIdentityText(event.user || event.member_name || '')
  }

  private getMemberWxId(event: { wx_id?: string; member_wxid?: string }): string {
    return this.cleanAccountDirName(normalizeText(event.wx_id || event.member_wxid || ''))
  }

  private getInviteEventTimelineTime(event: InviteEvent): number {
    if (event.delete_flag === 1) return event.updated_at || event.invite_time || 0
    return event.invite_time || 0
  }

  private isTraceQuitStatus(row: {
    event_type: 'invite' | 'quit'
    status?: InviteEventStatus
    delete_flag?: number | null
  }): boolean {
    if (row.status === 'pending' || row.status === 'ignored') return false
    return row.event_type === 'quit' || row.delete_flag === 1
  }

  private getEffectiveInviteEvents(data: InviteStatsScopeData, tagId: string): InviteEvent[] {
    return this.getScopedInviteEvents(data, tagId)
      .filter((event) => event.status === 'confirmed' && event.valid_flag === 1 && this.getMemberKey(event))
      .sort((a, b) => a.invite_time - b.invite_time)
  }

  private getInviterWxId(event: InviteEvent): string {
    return this.cleanAccountDirName(normalizeText(event.inviter_wx_id))
  }

  private isKnownInviterName(value: unknown): boolean {
    const normalized = normalizeIdentityText(value)
    return Boolean(normalized) && normalized !== '未知来源' && normalized !== 'unknown' && normalized !== '鏈煡鏉ユ簮'
  }

  private isInviteTraceEvent(event: InviteEvent): boolean {
    return event.join_type !== 'direct'
  }

  private isRankableInviteEvent(event: InviteEvent, dedupeMembers: boolean): boolean {
    if (!this.isInviteTraceEvent(event)) return false
    if (dedupeMembers && (event.status !== 'confirmed' || event.valid_flag !== 1 || event.delete_flag === 1 || !this.getMemberWxId(event))) return false
    return true
  }

  private buildInviterMappingLookup(data: InviteStatsScopeData) {
    const byWxid = new Map<string, InviterIdentityMapping>()
    const byName = new Map<string, InviterIdentityMapping>()
    for (const mapping of data.inviterIdentityMappings || []) {
      if (!mapping.enabled || !mapping.person_key) continue
      const wxid = this.cleanAccountDirName(normalizeText(mapping.wxid))
      const name = normalizeIdentityText(mapping.display_name || mapping.person_name)
      if (wxid && !byWxid.has(wxid)) byWxid.set(wxid, mapping)
      if (name && !byName.has(name)) byName.set(name, mapping)
    }
    return { byWxid, byName }
  }

  private resolveInviterIdentity(
    event: InviteEvent,
    lookup: { byWxid: Map<string, InviterIdentityMapping>; byName: Map<string, InviterIdentityMapping> }
  ) {
    const wxid = this.getInviterWxId(event)
    const inviterName = normalizeText(event.inviter)
    const mapping = (wxid ? lookup.byWxid.get(wxid) : undefined) ||
      lookup.byName.get(normalizeIdentityText(inviterName))
    if (mapping) {
      return {
        key: `person:${mapping.person_key}`,
        name: mapping.person_name || mapping.display_name || inviterName || mapping.wxid || mapping.person_key,
        wxid: wxid || this.cleanAccountDirName(normalizeText(mapping.wxid))
      }
    }
    const fallbackName = inviterName || wxid || UNKNOWN_INVITER_NAME
    return {
      key: wxid ? `wxid:${wxid}` : `name:${normalizeIdentityText(fallbackName) || 'unknown'}`,
      name: fallbackName,
      wxid
    }
  }

  private filterByTime<T extends { invite_time?: number; quit_time?: number; event_time?: number }>(
    rows: T[],
    startTime?: number,
    endTime?: number
  ): T[] {
    const start = Number(startTime || 0)
    const end = Number(endTime || 0)
    return rows.filter((row) => {
      const time = Number(row.invite_time || row.quit_time || row.event_time || 0)
      if (start > 0 && time < start) return false
      if (end > 0 && time > end) return false
      return true
    })
  }

  private buildInviteRanking(
    data: InviteStatsScopeData,
    tagId: string,
    startTime?: number,
    endTime?: number,
    minInviteCount = 0,
    groupId?: string,
    dedupeMembers = false
  ): InviteRankingRow[] {
    const normalizedGroupId = normalizeText(groupId)
    const scopedEvents = this.getScopedInviteEvents(data, tagId)
    const filteredEvents = this.filterByTime(scopedEvents, startTime, endTime)
      .filter((event) => (!normalizedGroupId || event.group_id === normalizedGroupId) && this.isRankableInviteEvent(event, dedupeMembers))
    const effective = dedupeMembers ? this.dedupeInviteEventsByMemberWxId(filteredEvents) : filteredEvents
    const lookup = this.buildInviterMappingLookup(data)
    const buckets = new Map<string, { inviter: string; wxids: Set<string>; users: Set<string>; groups: Set<string>; count: number; recent: number }>()
    for (const event of effective) {
      const identity = this.resolveInviterIdentity(event, lookup)
      if (!identity.key) continue
      const wxid = identity.wxid || this.getInviterWxId(event)
      const bucket = buckets.get(identity.key) || {
        inviter: identity.name || wxid,
        wxids: new Set<string>(),
        users: new Set<string>(),
        groups: new Set<string>(),
        count: 0,
        recent: 0
      }
      if (wxid) bucket.wxids.add(wxid)
      if (dedupeMembers) {
        const memberWxid = this.getMemberWxId(event)
        if (memberWxid) bucket.users.add(memberWxid)
      } else {
        bucket.count += 1
      }
      bucket.groups.add(event.group_id)
      bucket.recent = Math.max(bucket.recent, event.invite_time)
      buckets.set(identity.key, bucket)
    }

    return Array.from(buckets.values())
      .map((bucket) => ({
        rank: 0,
        inviter: bucket.inviter,
        inviter_wx_id: Array.from(bucket.wxids).join(', '),
        invite_count: dedupeMembers ? bucket.users.size : bucket.count,
        group_count: bucket.groups.size,
        recent_invite_time: bucket.recent
      }))
      .filter((row) => row.invite_count >= minInviteCount)
      .sort((a, b) => b.invite_count - a.invite_count || b.recent_invite_time - a.recent_invite_time)
      .map((row, index) => ({ ...row, rank: index + 1 }))
  }

  private getInvitedCountByInviter(data: InviteStatsScopeData, tagId: string): Map<string, number> {
    const ranking = this.buildInviteRanking(data, tagId)
    const map = new Map<string, number>()
    for (const row of ranking) {
      for (const wxid of String(row.inviter_wx_id || '').split(',')) {
        const normalized = this.cleanAccountDirName(wxid)
        if (normalized) map.set(normalized, row.invite_count)
      }
      if (row.inviter) map.set(normalizeIdentityText(row.inviter), row.invite_count)
    }
    return map
  }

  replaceCurrentScopeInviterIdentityMappings(rows: Array<Record<string, unknown>>): number {
    const data = this.getScope()
    const now = this.nowSeconds()
    const mappings: InviterIdentityMapping[] = []
    for (const row of rows || []) {
      const personKey = normalizeText(row.person_key)
      const wxid = this.cleanAccountDirName(normalizeText(row.wxid))
      const displayName = normalizeText(row.display_name)
      if (!personKey || (!wxid && !displayName)) continue
      mappings.push({
        id: normalizeText(row.id) || `${personKey}:${wxid || normalizeIdentityText(displayName)}`,
        person_key: personKey,
        person_name: normalizeText(row.person_name) || displayName || personKey,
        wxid,
        display_name: displayName,
        enabled: row.enabled !== false,
        created_at: this.fromRemoteTime(row.created_at) || now,
        updated_at: this.fromRemoteTime(row.updated_at) || now
      })
    }
    data.inviterIdentityMappings = mappings
    this.persist()
    return mappings.length
  }

  async listActivityTags(): Promise<{ success: boolean; data?: InviteActivityTag[]; error?: string }> {

    try {
      const data = this.getScope()
      return { success: true, data: data.activityTags.slice().sort((a, b) => b.updated_at - a.updated_at) }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async exportCurrentScopeSyncPayload(options: { dirtyOnly?: boolean } = {}): Promise<InviteRemoteSyncPayloadBundle> {
    const data = this.getScope()
    let changed = this.recomputeFlags(data)
    changed = await this.refreshBindingMemberCountsFromSource(data) || changed
    if (changed) this.persist()
    const accountScope = this.getCurrentScopeKey()
    const shouldInclude = (row: Record<string, any>) => !options.dirtyOnly || this.isSyncDirty(row)
    const includedGroupTagBindings = data.groupTagBindings.filter(shouldInclude)
    const requiredActivityTagIds = new Set(
      includedGroupTagBindings
        .map((binding) => normalizeText(binding.tag_id))
        .filter(Boolean)
    )
    const includedActivityTags = data.activityTags.filter((tag) =>
      shouldInclude(tag) || (options.dirtyOnly === true && requiredActivityTagIds.has(tag.tag_id))
    )
    const payload: InviteRemoteSyncPayload = {
      accountScope,
      activityTags: includedActivityTags.map((tag, index) => ({
        id: tag.tag_id,
        account_scope: accountScope,
        name: tag.tag_name,
        enabled: tag.enabled,
        sort_order: index,
        sync_status: tag.sync_status || '',
        sync_error: tag.sync_error || '',
        last_sync_at: this.toIsoTime(tag.last_sync_at),
        created_at: this.toIsoTime(tag.created_at),
        updated_at: this.toIsoTime(tag.updated_at),
        raw_json: tag
      })),
      groupTagBindings: includedGroupTagBindings
        .map((binding) => ({
          id: binding.id,
          account_scope: accountScope,
          group_id: binding.group_id,
          group_name: binding.group_name,
          activity_tag_id: binding.tag_id || null,
          enabled: binding.enabled,
          member_count: this.normalizeMemberCount(binding.member_count),
          last_scan_at: this.toIsoTime(binding.last_scan_time),
          last_invite_time: this.toIsoTime(binding.last_invite_time),
          sync_status: binding.sync_status || '',
          sync_error: binding.sync_error || '',
          last_sync_at: this.toIsoTime(binding.last_sync_at),
          created_at: this.toIsoTime(binding.created_at),
          updated_at: this.toIsoTime(binding.updated_at),
          raw_json: binding
        })),
      rawEvents: data.rawEvents.filter(shouldInclude).map((event) => ({
        id: event.id,
        account_scope: accountScope,
        dedup_key: event.dedup_key,
        event_type: event.event_type,
        group_id: event.group_id,
        group_name: event.group_name,
        member_name: event.member_name,
        member_wxid: event.member_wxid,
        related_name: event.related_name,
        related_wxid: event.related_wxid,
        join_type: event.join_type || '',
        quit_type: event.quit_type || '',
        status: event.status,
        valid_flag: event.valid_flag,
        delete_flag: event.delete_flag,
        created_time: this.toIsoTime(event.created_time),
        invite_time: this.toIsoTime(event.invite_time),
        exit_time: this.toIsoTime(event.exit_time),
        source_message_id: event.source_message_id,
        source_local_id: event.source_local_id ? String(event.source_local_id) : null,
        source_create_time: this.toIsoTime(event.source_create_time),
        raw_message: event.raw_content,
        parsed_content: event.parsed_content,
        confidence: event.confidence,
        sync_status: event.sync_status || '',
        sync_error: event.sync_error || '',
        last_sync_at: this.toIsoTime(event.last_sync_at),
        created_at: this.toIsoTime(event.created_at),
        updated_at: this.toIsoTime(event.updated_at),
        raw_json: event
      })),
      inviteEvents: data.inviteEvents.filter(shouldInclude).map((event) => ({
        id: event.id,
        account_scope: accountScope,
        dedup_key: event.dedup_key || this.buildRawDedupKey('invite', event),
        activity_tag_id: event.activity_tag_id,
        group_id: event.group_id,
        group_name: event.group_name,
        member_name: event.user,
        member_wxid: event.wx_id,
        inviter_name: event.inviter,
        inviter_wxid: event.inviter_wx_id,
        status: event.status,
        valid_flag: event.valid_flag,
        delete_flag: event.delete_flag,
        created_time: this.toIsoTime(event.source_create_time || event.invite_time),
        invite_time: this.toIsoTime(event.invite_time),
        exit_time: null,
        source_message_id: event.source_message_id,
        source_local_id: event.source_local_id ? String(event.source_local_id) : null,
        source_create_time: this.toIsoTime(event.source_create_time),
        raw_message: event.raw_content,
        confirm_source: event.status === 'pending' ? 'pending' : 'machine',
        feishu_record_id: event.feishu_record_id,
        sync_status: event.sync_status,
        sync_error: event.sync_error,
        last_sync_at: this.toIsoTime(event.last_sync_at),
        created_at: this.toIsoTime(event.created_at),
        updated_at: this.toIsoTime(event.updated_at),
        raw_json: event
      })),
      quitEvents: data.quitEvents.filter(shouldInclude).map((event) => ({
        id: event.id,
        account_scope: accountScope,
        dedup_key: event.dedup_key || this.buildRawDedupKey('quit', event),
        activity_tag_id: event.activity_tag_id,
        group_id: event.group_id,
        group_name: event.group_name,
        member_name: event.user,
        member_wxid: event.wx_id,
        operator_name: event.operator,
        operator_wxid: event.operator_wx_id,
        status: event.status,
        valid_flag: 0,
        delete_flag: 1,
        created_time: this.toIsoTime(event.source_create_time || event.quit_time),
        invite_time: null,
        exit_time: this.toIsoTime(event.quit_time),
        source_message_id: event.source_message_id,
        source_local_id: event.source_local_id ? String(event.source_local_id) : null,
        source_create_time: this.toIsoTime(event.source_create_time),
        raw_message: event.raw_content,
        confirm_source: event.status === 'pending' ? 'pending' : 'machine',
        feishu_record_id: '',
        sync_status: event.sync_status || '',
        sync_error: event.sync_error || '',
        last_sync_at: this.toIsoTime(event.last_sync_at),
        created_at: this.toIsoTime(event.created_at),
        updated_at: this.toIsoTime(event.updated_at),
        raw_json: event
      })),
      memberIdentityBindings: data.memberIdentityBindings.filter(shouldInclude).map((binding) => ({
        id: binding.id,
        account_scope: accountScope,
        activity_tag_id: null,
        group_id: binding.group_id,
        display_name: binding.display_name,
        wxid: binding.wx_id,
        binding_type: binding.source,
        source: binding.source,
        sync_status: binding.sync_status || '',
        sync_error: binding.sync_error || '',
        last_sync_at: this.toIsoTime(binding.last_sync_at),
        created_at: this.toIsoTime(binding.created_at),
        updated_at: this.toIsoTime(binding.updated_at),
        raw_json: binding
      })),
      scanLogs: data.scanLogs.filter(shouldInclude).map((log) => ({
        id: log.id,
        account_scope: accountScope,
        activity_tag_id: log.tag_id,
        group_id: null,
        scan_mode: log.scan_mode || 'incremental',
        status: log.status,
        started_at: this.toIsoTime(log.started_at),
        finished_at: this.toIsoTime(log.finished_at),
        scanned_messages: log.scanned_messages,
        new_invite_events: log.new_invites,
        new_quit_events: log.new_quits,
        message: '',
        error_text: log.error,
        operator_name: '',
        sync_status: log.sync_status || '',
        sync_error: log.sync_error || '',
        last_sync_at: this.toIsoTime(log.last_sync_at),
        created_at: this.toIsoTime(log.started_at),
        updated_at: this.toIsoTime(log.finished_at || log.started_at),
        raw_json: log
      }))
    }

    const snapshot: InviteSyncSnapshot = {
      activityTags: new Map<string, number>(),
      groupTagBindings: new Map<string, number>(),
      rawEvents: new Map<string, number>(),
      inviteEvents: new Map<string, number>(),
      quitEvents: new Map<string, number>(),
      memberIdentityBindings: new Map<string, number>(),
      scanLogs: new Map<string, number>()
    }

    for (const tag of includedActivityTags) {
      snapshot.activityTags.set(tag.tag_id, Number(tag.updated_at || 0))
    }
    for (const binding of includedGroupTagBindings) {
      snapshot.groupTagBindings.set(binding.id, Number(binding.updated_at || 0))
    }
    for (const event of data.rawEvents) {
      if (!shouldInclude(event)) continue
      snapshot.rawEvents.set(event.id, Number(event.updated_at || 0))
    }
    for (const event of data.inviteEvents) {
      if (!shouldInclude(event)) continue
      snapshot.inviteEvents.set(event.id, Number(event.updated_at || 0))
    }
    for (const event of data.quitEvents) {
      if (!shouldInclude(event)) continue
      snapshot.quitEvents.set(event.id, Number(event.updated_at || 0))
    }
    for (const binding of data.memberIdentityBindings) {
      if (!shouldInclude(binding)) continue
      snapshot.memberIdentityBindings.set(binding.id, Number(binding.updated_at || 0))
    }
    for (const log of data.scanLogs) {
      if (!shouldInclude(log)) continue
      snapshot.scanLogs.set(log.id, Number((log as InviteScanLog & { updated_at?: number }).updated_at || log.finished_at || log.started_at || 0))
    }

    return { payload, snapshot }
  }

  markCurrentScopeSyncResult(success: boolean, errorMessage = '', snapshot?: InviteSyncSnapshot): void {
    const data = this.getScope()
    const now = this.nowSeconds()
    const markRows = <T extends { sync_status?: string; sync_error?: string; last_sync_at?: number; updated_at?: number; finished_at?: number; started_at?: number }>(
      rows: T[],
      bucket: keyof InviteSyncSnapshot,
      getRowId: (row: T) => string,
      getRowUpdatedAt: (row: T) => number
    ) => {
      for (const row of rows) {
        if (snapshot) {
          const snapshotUpdatedAt = snapshot[bucket].get(getRowId(row))
          if (snapshotUpdatedAt === undefined) continue
          if (snapshotUpdatedAt !== getRowUpdatedAt(row)) continue
        } else if (!this.isSyncDirty(row)) {
          continue
        }
        row.sync_status = success ? 'synced' : 'failed'
        row.sync_error = success ? '' : errorMessage
        row.last_sync_at = now
      }
    }

    markRows(data.activityTags, 'activityTags', (row) => row.tag_id, (row) => row.updated_at)
    markRows(data.groupTagBindings, 'groupTagBindings', (row) => row.id, (row) => row.updated_at)
    markRows(data.rawEvents, 'rawEvents', (row) => row.id, (row) => row.updated_at)
    markRows(data.inviteEvents, 'inviteEvents', (row) => row.id, (row) => row.updated_at)
    markRows(data.quitEvents, 'quitEvents', (row) => row.id, (row) => row.updated_at)
    markRows(data.memberIdentityBindings, 'memberIdentityBindings', (row) => row.id, (row) => row.updated_at)
    markRows(data.scanLogs, 'scanLogs', (row) => row.id, (row) => Number((row as InviteScanLog & { updated_at?: number }).updated_at || row.finished_at || row.started_at || 0))
    this.persist()
  }

  async saveActivityTag(input: { tagId?: string; tagName: string; enabled?: boolean }): Promise<{ success: boolean; data?: InviteActivityTag; error?: string }> {
    try {
      const tagName = normalizeText(input.tagName)
      if (!tagName) return { success: false, error: '活动标签名称不能为空' }
      const data = this.getScope()
      const now = this.nowSeconds()
      const existing = input.tagId
        ? data.activityTags.find((tag) => tag.tag_id === input.tagId)
        : data.activityTags.find((tag) => tag.tag_name === tagName)
      if (existing) {
        existing.tag_name = tagName
        existing.enabled = input.enabled !== undefined ? Boolean(input.enabled) : existing.enabled
        this.markSyncDirty(existing, now)
        for (const binding of data.groupTagBindings) {
          if (binding.tag_id === existing.tag_id) {
            binding.tag_name = existing.tag_name
            this.markSyncDirty(binding, now)
          }
        }
        this.persist()
        return { success: true, data: existing }
      }

      const tag: InviteActivityTag = {
        tag_id: randomUUID(),
        tag_name: tagName,
        enabled: input.enabled !== false,
        sync_status: 'dirty',
        sync_error: '',
        last_sync_at: 0,
        created_at: now,
        updated_at: now
      }
      data.activityTags.push(tag)
      this.persist()
      return { success: true, data: tag }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async setActivityTagEnabled(tagId: string, enabled: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const data = this.getScope()
      const tag = data.activityTags.find((item) => item.tag_id === tagId)
      if (!tag) return { success: false, error: '活动标签不存在' }
      tag.enabled = Boolean(enabled)
      this.markSyncDirty(tag)
      this.persist()
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  private retagGroupMaterializedEvents(
    data: InviteStatsScopeData,
    groupId: string,
    tag: InviteActivityTag,
    groupName: string
  ): void {
    const now = this.nowSeconds()
    for (const event of data.inviteEvents) {
      if (event.group_id !== groupId) continue
      event.group_name = groupName
      event.activity_tag_id = tag.tag_id
      event.activity_tag_name = tag.tag_name
      this.markSyncDirty(event, now)
    }
    for (const event of data.quitEvents) {
      if (event.group_id !== groupId) continue
      event.group_name = groupName
      event.activity_tag_id = tag.tag_id
      event.activity_tag_name = tag.tag_name
      this.markSyncDirty(event, now)
    }
  }

  private materializeRawEventsForGroupTag(
    data: InviteStatsScopeData,
    groupId: string,
    tag: InviteActivityTag,
    groupName: string
  ): void {
    const now = this.nowSeconds()
    for (const raw of data.rawEvents) {
      if (raw.group_id !== groupId) continue
      if (raw.event_type === 'invite') {
        if (data.inviteEvents.some((event) => (event.dedup_key || this.buildRawDedupKey('invite', event)) === raw.dedup_key)) continue
        data.inviteEvents.push({
          id: raw.id,
          user: raw.member_name,
          wx_id: raw.member_wxid,
          inviter: raw.related_name,
          inviter_wx_id: raw.related_wxid,
          invite_time: raw.invite_time || raw.created_time,
          group_name: groupName || raw.group_name,
          group_id: raw.group_id,
          activity_tag_id: tag.tag_id,
          activity_tag_name: tag.tag_name,
          head_img: raw.head_img || '',
          join_type: raw.join_type || 'unknown',
          delete_flag: raw.delete_flag,
          valid_flag: raw.valid_flag,
          raw_content: raw.raw_content,
          parsed_content: raw.parsed_content,
          source_rule: raw.source_rule || '',
          source_context_members: raw.source_context_members || [],
          source_message_id: raw.source_message_id,
          source_local_id: raw.source_local_id,
          source_create_time: raw.source_create_time,
          confidence: raw.confidence,
          status: raw.status,
          dedup_key: raw.dedup_key,
          feishu_record_id: '',
          sync_status: 'dirty',
          sync_error: '',
          last_sync_at: 0,
          created_at: raw.created_at || now,
          updated_at: now
        })
      } else {
        if (data.quitEvents.some((event) => (event.dedup_key || this.buildRawDedupKey('quit', event)) === raw.dedup_key)) continue
        data.quitEvents.push({
          id: raw.id,
          user: raw.member_name,
          wx_id: raw.member_wxid,
          quit_time: raw.exit_time || raw.created_time,
          group_name: groupName || raw.group_name,
          group_id: raw.group_id,
          activity_tag_id: tag.tag_id,
          activity_tag_name: tag.tag_name,
          head_img: raw.head_img || '',
          quit_type: raw.quit_type || 'unknown',
          operator: raw.related_name,
          operator_wx_id: raw.related_wxid,
          raw_content: raw.raw_content,
          parsed_content: raw.parsed_content,
          source_rule: raw.source_rule || '',
          source_context_members: raw.source_context_members || [],
          source_message_id: raw.source_message_id,
          source_local_id: raw.source_local_id,
          source_create_time: raw.source_create_time,
          confidence: raw.confidence,
          status: raw.status,
          dedup_key: raw.dedup_key,
          sync_status: 'dirty',
          sync_error: '',
          last_sync_at: 0,
          created_at: raw.created_at || now,
          updated_at: now
        })
      }
    }
  }

  async deleteActivityTag(tagId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const normalizedTagId = normalizeText(tagId)
      if (!normalizedTagId) return { success: false, error: '活动标签不能为空' }
      const data = this.getScope()
      const tag = data.activityTags.find((item) => item.tag_id === normalizedTagId)
      if (!tag) return { success: false, error: '活动标签不存在' }

      const bindings = data.groupTagBindings.filter((binding) => binding.tag_id === normalizedTagId)
      const boundGroupIds = new Set(bindings.map((binding) => binding.group_id))
      data.rawEvents = data.rawEvents.filter((event) => !boundGroupIds.has(event.group_id))
      data.inviteEvents = data.inviteEvents.filter((event) => event.activity_tag_id !== normalizedTagId)
      data.quitEvents = data.quitEvents.filter((event) => event.activity_tag_id !== normalizedTagId)
      data.memberIdentityBindings = data.memberIdentityBindings.filter((binding) => !boundGroupIds.has(binding.group_id))
      data.scanLogs = data.scanLogs.filter((log) => log.tag_id !== normalizedTagId)
      data.groupTagBindings = data.groupTagBindings.filter((binding) => binding.tag_id !== normalizedTagId)
      data.activityTags = data.activityTags.filter((item) => item.tag_id !== normalizedTagId)
      this.recomputeFlags(data)
      this.persist()
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  private buildGroupRows(
    data: InviteStatsScopeData,
    groups: GroupChatInfo[],
    todayStart: number,
    todayEnd: number
  ): InviteStatsGroupRow[] {
    const bindingByGroupId = new Map<string, InviteGroupTagBinding>()
    for (const binding of data.groupTagBindings) {
      if (!binding.group_id) continue
      const existing = bindingByGroupId.get(binding.group_id)
      if (
        !existing ||
        (binding.enabled && !existing.enabled) ||
        (binding.enabled === existing.enabled && Number(binding.updated_at || 0) >= Number(existing.updated_at || 0))
      ) {
        bindingByGroupId.set(binding.group_id, binding)
      }
    }
    const tagById = new Map(data.activityTags.map((tag) => [tag.tag_id, tag]))
    const todayJoinByGroupId = new Map<string, Set<string>>()
    const todayQuitByGroupId = new Map<string, Set<string>>()
    const addMember = (map: Map<string, Set<string>>, groupId: string, memberKey: string) => {
      if (!memberKey) return
      const bucket = map.get(groupId) || new Set<string>()
      bucket.add(memberKey)
      map.set(groupId, bucket)
    }

    for (const event of data.inviteEvents) {
      if (event.status !== 'confirmed') continue
      const memberKey = this.getMemberKey(event)
      if (event.invite_time >= todayStart && event.invite_time <= todayEnd) {
        addMember(todayJoinByGroupId, event.group_id, memberKey)
      }
      const traceTime = this.getInviteEventTimelineTime(event)
      if (event.delete_flag === 1 && traceTime >= todayStart && traceTime <= todayEnd) {
        addMember(todayQuitByGroupId, event.group_id, memberKey)
      }
    }
    for (const event of data.quitEvents) {
      if (event.status !== 'confirmed' || event.quit_time < todayStart || event.quit_time > todayEnd) continue
      addMember(todayQuitByGroupId, event.group_id, this.getMemberKey(event))
    }

    const rows = groups.map((group) => {
      const binding = bindingByGroupId.get(group.username)
      const tag = binding?.tag_id ? tagById.get(binding.tag_id) : undefined
      return {
        group_id: group.username,
        group_name: group.displayName || group.username,
        avatar_url: group.avatarUrl,
        member_count: this.normalizeMemberCount(group.memberCount),
        today_join_count: todayJoinByGroupId.get(group.username)?.size || 0,
        today_quit_count: todayQuitByGroupId.get(group.username)?.size || 0,
        recent_invite_time: binding?.last_invite_time || 0,
        last_scan_time: binding?.last_scan_time || 0,
        tag_id: binding?.enabled ? binding.tag_id : '',
        tag_name: binding?.enabled ? binding.tag_name : '',
        tag_enabled: Boolean(tag?.enabled),
        binding_enabled: Boolean(binding?.enabled && binding.tag_id)
      }
    })
    const listedGroupIds = new Set(groups.map((group) => group.username))
    for (const binding of data.groupTagBindings) {
      if (!binding.enabled || !binding.tag_id || listedGroupIds.has(binding.group_id)) continue
      const tag = tagById.get(binding.tag_id)
      rows.push({
        group_id: binding.group_id,
        group_name: binding.group_name || binding.group_id,
        avatar_url: binding.avatar_url,
        member_count: this.normalizeMemberCount(binding.member_count),
        today_join_count: todayJoinByGroupId.get(binding.group_id)?.size || 0,
        today_quit_count: todayQuitByGroupId.get(binding.group_id)?.size || 0,
        recent_invite_time: binding.last_invite_time || 0,
        last_scan_time: binding.last_scan_time || 0,
        tag_id: binding.tag_id,
        tag_name: binding.tag_name,
        tag_enabled: Boolean(tag?.enabled),
        binding_enabled: true
      })
    }
    return rows
  }

  private async countUniqueCurrentGroupMembers(groupIds: Set<string>): Promise<number | null> {
    const ids = Array.from(groupIds).filter(Boolean)
    if (ids.length === 0) return 0
    try {
      const memberGroups = await Promise.all(ids.map((groupId) => this.loadGroupMembers(groupId)))
      const members = new Set<string>()
      for (const groupMembers of memberGroups) {
        for (const member of groupMembers) {
          const key = this.cleanAccountDirName(normalizeText(member.username))
          if (key) members.add(key)
        }
      }
      return members.size
    } catch {
      return null
    }
  }

  async listGroups(): Promise<{ success: boolean; data?: InviteStatsGroupRow[]; error?: string }> {
    try {
      const data = this.getScope()
      const groupsResult = await groupAnalyticsService.getGroupChats()
      if (!groupsResult.success || !groupsResult.data) {
        return { success: false, error: groupsResult.error || '获取微信群失败' }
      }
      const todayStart = this.startOfTodaySeconds()
      const changed = this.refreshBindingMemberCounts(data, groupsResult.data)
      const rows = this.buildGroupRows(data, groupsResult.data, todayStart, this.nowSeconds())
      if (changed) this.persist()
      return { success: true, data: rows }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async setGroupTag(groupId: string, tagId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const normalizedGroupId = normalizeText(groupId)
      const normalizedTagId = normalizeText(tagId)
      if (!normalizedGroupId) return { success: false, error: '群 ID 不能为空' }
      if (!normalizedTagId) return { success: false, error: '活动标签不能为空' }
      const data = this.getScope()
      const tag = data.activityTags.find((item) => item.tag_id === normalizedTagId)
      if (!tag) return { success: false, error: '活动标签不存在' }

      const groupsMap = await this.getGroupsMap()
      const groupInfo = groupsMap.get(normalizedGroupId)
      const groupName = groupInfo?.displayName || normalizedGroupId
      const memberCount = this.normalizeMemberCount(groupInfo?.memberCount)
      const now = this.nowSeconds()
      const existing = data.groupTagBindings.find((item) => item.group_id === normalizedGroupId)
      if (existing) {
        const previousTagId = existing.tag_id
        existing.group_name = groupName
        existing.avatar_url = groupInfo?.avatarUrl || existing.avatar_url || ''
        existing.tag_id = tag.tag_id
        existing.tag_name = tag.tag_name
        existing.enabled = true
        existing.member_count = memberCount
        this.markSyncDirty(existing, now)
        if (previousTagId !== tag.tag_id) {
          this.retagGroupMaterializedEvents(data, normalizedGroupId, tag, groupName)
        }
        this.materializeRawEventsForGroupTag(data, normalizedGroupId, tag, groupName)
      } else {
        data.groupTagBindings.push({
          id: randomUUID(),
          group_id: normalizedGroupId,
          group_name: groupName,
          avatar_url: groupInfo?.avatarUrl || '',
          tag_id: tag.tag_id,
          tag_name: tag.tag_name,
          enabled: true,
          member_count: memberCount,
          last_scan_time: 0,
          last_invite_time: 0,
          last_message_id: '',
          last_scanned_message_time: 0,
          last_scanned_local_id: 0,
          sync_status: 'dirty',
          sync_error: '',
          last_sync_at: 0,
          created_at: now,
          updated_at: now
        })
        this.retagGroupMaterializedEvents(data, normalizedGroupId, tag, groupName)
        this.materializeRawEventsForGroupTag(data, normalizedGroupId, tag, groupName)
      }
      this.recomputeFlags(data)
      this.persist()
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async clearGroupTag(groupId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const data = this.getScope()
      const binding = data.groupTagBindings.find((item) => item.group_id === normalizeText(groupId))
      if (!binding) return { success: true }
      binding.enabled = false
      binding.tag_id = ''
      binding.tag_name = ''
      this.markSyncDirty(binding)
      this.persist()
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  private async scanActivityInternal(tagId: string): Promise<{ success: boolean; log?: InviteScanLog; error?: string }> {
    const data = this.getScope()
    const tag = data.activityTags.find((item) => item.tag_id === tagId && item.enabled)
    if (!tag) return { success: false, error: '活动标签不存在或未启用' }
    const bindings = this.getEnabledBindingsForTag(data, tagId)
    if (bindings.length === 0) return { success: false, error: '当前活动标签没有绑定微信群' }

    const startedAt = this.nowSeconds()
    const log: InviteScanLog = {
      id: randomUUID(),
      tag_id: tag.tag_id,
      tag_name: tag.tag_name,
      scan_mode: 'incremental',
      status: 'running',
      started_at: startedAt,
      finished_at: 0,
      scanned_groups: bindings.length,
      scanned_messages: 0,
      new_invites: 0,
      new_quits: 0,
      pending_count: 0,
      error: '',
      sync_status: 'dirty',
      sync_error: '',
      last_sync_at: 0
    }
    data.scanLogs.unshift(log)
    data.scanLogs = data.scanLogs.slice(0, this.maxScanLogsPerScope)
    this.activeScanState = {
      tagId: tag.tag_id,
      tagName: tag.tag_name,
      scanMode: 'incremental',
      startedAt,
      groupCount: bindings.length,
      scannedMessageCount: 0
    }
    this.persist()

    try {
      for (const binding of bindings) {
        const scanCursor = this.getBindingScanCursor(binding)
        const effectiveScanStart = scanCursor.time > 0
          ? Math.max(0, scanCursor.time - this.scanCursorOverlapSeconds)
          : 0
        let nextCursorTime = scanCursor.time
        let nextCursorLocalId = scanCursor.localId
        let lastInviteTime = binding.last_invite_time || this.getGroupLastInviteTime(data, tagId, binding.group_id) || 0
        let lastMessageId = binding.last_message_id || ''
        const messages: Message[] = []
        let offset = 0
        let reachedWatermark = false

        while (!reachedWatermark) {
          const result = await wcdbService.getMessagesByType(binding.group_id, 10000, false, this.systemMessagePageSize, offset)
          if (!result.success || !Array.isArray(result.rows) || result.rows.length === 0) break

          const pageMessages = chatService.mapRowsToMessagesForApi(result.rows as Record<string, any>[], binding.group_id)
            .filter((message) => this.isInviteSystemMessage(message, binding.group_id))
          let oldestMessageTime = Number.POSITIVE_INFINITY

          for (const message of pageMessages) {
            const createTime = Number(message.createTime || 0)
            const localId = Number(message.localId || 0)
            if (createTime > 0) oldestMessageTime = Math.min(oldestMessageTime, createTime)
            if (createTime > startedAt) continue
            if (createTime > 0 && this.isAfterMessageCursor(createTime, localId, nextCursorTime, nextCursorLocalId)) {
              nextCursorTime = createTime
              nextCursorLocalId = localId
            }
            if (effectiveScanStart > 0 && createTime > 0 && createTime < effectiveScanStart) continue
            messages.push(message)
          }

          if (effectiveScanStart > 0 && oldestMessageTime < effectiveScanStart) reachedWatermark = true
          if (result.rows.length < this.systemMessagePageSize) break
          offset += result.rows.length
        }

        messages.sort((a, b) => {
          const timeDiff = Number(a.createTime || 0) - Number(b.createTime || 0)
          if (timeDiff !== 0) return timeDiff
          return Number(a.localId || 0) - Number(b.localId || 0)
        })

        const parsedMessages: Array<{ message: Message; parsedContent: string; parsedEvents: ParsedSystemEvent[] }> = []
        for (const message of messages) {
          log.scanned_messages += 1
          if (this.activeScanState) this.activeScanState.scannedMessageCount = log.scanned_messages

          const parsedContent = this.normalizeSystemContent(message)
          const parsedEvents = this.parseSystemEvents(parsedContent)
          if (parsedEvents.length === 0) continue
          parsedMessages.push({ message, parsedContent, parsedEvents })
        }

        if (parsedMessages.length > 0) {
          const context = await this.getGroupContext(data, binding)

          for (const parsedMessage of parsedMessages) {
            const { message, parsedContent, parsedEvents } = parsedMessage
            for (const parsed of parsedEvents) {
              if (parsed.type === 'join') {
                const event = this.buildInviteEvent(data, parsed, message, context, parsedContent)
                const eventTime = Number(event.source_create_time || event.invite_time || startedAt)
                event.created_at = eventTime
                event.updated_at = eventTime
                this.upsertRawEventFromInvite(data, event)
                if (!this.hasInviteEvent(data, event)) {
                  data.inviteEvents.push(event)
                  log.new_invites += 1
                  if (event.status === 'pending') log.pending_count += 1
                  lastInviteTime = Math.max(lastInviteTime, event.invite_time)
                  lastMessageId = event.source_message_id || lastMessageId
                }
              } else {
                const event = this.buildQuitEvent(data, parsed, message, context, parsedContent)
                const eventTime = Number(event.source_create_time || event.quit_time || startedAt)
                event.created_at = eventTime
                event.updated_at = eventTime
                this.upsertRawEventFromQuit(data, event)
                if (!this.hasQuitEvent(data, event)) {
                  data.quitEvents.push(event)
                  log.new_quits += 1
                  if (event.status === 'pending') log.pending_count += 1
                  if (event.status === 'confirmed') this.applyQuitEventToInviteFlags(data, event)
                  lastMessageId = event.source_message_id || lastMessageId
                }
              }
            }
          }
        }

        binding.last_scan_time = startedAt
        binding.last_invite_time = lastInviteTime
        binding.last_message_id = lastMessageId
        this.setBindingScanCursor(binding, nextCursorTime, nextCursorLocalId)
        this.markSyncDirty(binding, startedAt)
      }

      this.recomputeFlags(data)
      log.status = 'completed'
      log.finished_at = this.nowSeconds()
      this.markSyncDirty(log, log.finished_at)
      this.persist()
      return { success: true, log }
    } catch (error) {
      log.status = 'failed'
      log.finished_at = this.nowSeconds()
      log.error = String(error)
      this.markSyncDirty(log, log.finished_at)
      this.persist()
      return { success: false, log, error: String(error) }
    } finally {
      this.activeScanState = null
    }
  }

  private async checkQuitGroupsInternal(tagId: string): Promise<{ success: boolean; log?: InviteScanLog; error?: string }> {
    const data = this.getScope()
    const tag = data.activityTags.find((item) => item.tag_id === tagId && item.enabled)
    if (!tag) return { success: false, error: '活动标签不存在或未启用' }
    const bindings = this.getEnabledBindingsForTag(data, tagId)
    if (bindings.length === 0) return { success: false, error: '当前活动标签没有绑定微信群' }

    const startedAt = this.nowSeconds()
    const log: InviteScanLog = {
      id: randomUUID(),
      tag_id: tag.tag_id,
      tag_name: tag.tag_name,
      scan_mode: 'quit-check',
      status: 'running',
      started_at: startedAt,
      finished_at: 0,
      scanned_groups: bindings.length,
      scanned_messages: 0,
      new_invites: 0,
      new_quits: 0,
      pending_count: 0,
      error: '',
      sync_status: 'dirty',
      sync_error: '',
      last_sync_at: 0
    }
    data.scanLogs.unshift(log)
    data.scanLogs = data.scanLogs.slice(0, this.maxScanLogsPerScope)
    this.activeQuitCheckState = {
      tagId: tag.tag_id,
      tagName: tag.tag_name,
      scanMode: 'quit-check',
      startedAt,
      groupCount: bindings.length,
      scannedMessageCount: 0
    }
    this.persist()

    try {
      for (const binding of bindings) {
        const membersResult = await groupAnalyticsService.getGroupMembers(binding.group_id)
        if (!membersResult.success || !Array.isArray(membersResult.data) || membersResult.data.length === 0) continue

        const currentMemberKeys = new Set<string>()
        for (const member of membersResult.data) {
          for (const key of this.getGroupMemberIdentityKeys(member)) currentMemberKeys.add(key)
        }
        if (currentMemberKeys.size === 0) continue

        const now = this.nowSeconds()
        const groupInviteEvents = data.inviteEvents.filter((event) =>
          event.activity_tag_id === tagId &&
          event.group_id === binding.group_id &&
          event.status === 'confirmed'
        )
        for (const event of groupInviteEvents) {
          const memberKey = this.getMemberKey(event)
          if (!memberKey || currentMemberKeys.has(memberKey) || event.delete_flag === 1) continue
          event.delete_flag = 1
          this.markSyncDirty(event, now)
          log.new_quits += 1
        }

        binding.last_scan_time = now
        this.markSyncDirty(binding, now)
      }

      this.recomputeFlags(data)
      log.status = 'completed'
      log.finished_at = this.nowSeconds()
      this.markSyncDirty(log, log.finished_at)
      this.persist()
      return { success: true, log }
    } catch (error) {
      log.status = 'failed'
      log.finished_at = this.nowSeconds()
      log.error = String(error)
      this.markSyncDirty(log, log.finished_at)
      this.persist()
      return { success: false, log, error: String(error) }
    } finally {
      this.activeQuitCheckState = null
    }
  }

  private clearActivityScanData(data: InviteStatsScopeData, tagId: string): void {
    const bindings = this.getEnabledBindingsForTag(data, tagId)
    const groupIds = new Set(bindings.map((binding) => binding.group_id))
    const now = this.nowSeconds()

    data.rawEvents = data.rawEvents.filter((event) => !groupIds.has(event.group_id))
    data.inviteEvents = data.inviteEvents.filter((event) => event.activity_tag_id !== tagId)
    data.quitEvents = data.quitEvents.filter((event) => event.activity_tag_id !== tagId)

    for (const binding of bindings) {
      binding.last_scan_time = 0
      binding.last_invite_time = 0
      binding.last_message_id = ''
      binding.last_scanned_message_time = 0
      binding.last_scanned_local_id = 0
      this.markSyncDirty(binding, now)
    }
    this.recomputeFlags(data)
  }

  async scanActivity(tagId: string): Promise<{ success: boolean; started?: boolean; skipped?: boolean; running?: boolean; log?: InviteScanLog; error?: string }> {
    if (this.scanPromise) return { success: true, skipped: true }
    const data = this.getScope()
    const normalizedTagId = normalizeText(tagId)
    if (this.isAllActivityScope(normalizedTagId)) {
      void this.runBackgroundScan()
      return { success: true, started: true }
    }
    const tag = data.activityTags.find((item) => item.tag_id === normalizedTagId && item.enabled)
    if (!tag) return { success: false, error: '活动标签不存在或未启用' }
    if (this.getEnabledBindingsForTag(data, normalizedTagId).length === 0) {
      return { success: false, error: '当前活动标签没有绑定微信群' }
    }
    this.scanPromise = this.scanActivityInternal(normalizedTagId).catch((error) => ({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })).finally(() => {
      this.scanPromise = null
    })
    return { success: true, started: true }
  }

  async rescanActivity(tagId: string): Promise<{ success: boolean; started?: boolean; skipped?: boolean; running?: boolean; log?: InviteScanLog; error?: string }> {
    if (this.scanPromise) return { success: true, skipped: true }
    const data = this.getScope()
    const normalizedTagId = normalizeText(tagId)
    if (this.isAllActivityScope(normalizedTagId)) {
      return { success: false, error: '全量回扫只允许选择单个活动标签' }
    }
    const tag = data.activityTags.find((item) => item.tag_id === normalizedTagId && item.enabled)
    if (!tag) return { success: false, error: '活动标签不存在或未启用' }
    if (this.getEnabledBindingsForTag(data, normalizedTagId).length === 0) {
      return { success: false, error: '当前活动标签没有绑定微信群' }
    }
    this.scanPromise = (async () => {
      const scope = this.getScope()
      this.clearActivityScanData(scope, normalizedTagId)
      this.persist()
      return this.scanActivityInternal(normalizedTagId)
    })().catch((error) => ({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })).finally(() => {
      this.scanPromise = null
    })
    return { success: true, started: true }
  }

  async checkQuitGroups(tagId: string): Promise<{ success: boolean; started?: boolean; skipped?: boolean; running?: boolean; log?: InviteScanLog; error?: string }> {
    if (this.quitCheckPromise) return { success: true, skipped: true }
    const data = this.getScope()
    const normalizedTagId = normalizeText(tagId)
    if (this.isAllActivityScope(normalizedTagId)) {
      void this.runBackgroundQuitCheck()
      return { success: true, started: true }
    }
    const tag = data.activityTags.find((item) => item.tag_id === normalizedTagId && item.enabled)
    if (!tag) return { success: false, error: '活动标签不存在或未启用' }
    if (this.getEnabledBindingsForTag(data, normalizedTagId).length === 0) {
      return { success: false, error: '当前活动标签没有绑定微信群' }
    }
    this.quitCheckPromise = this.checkQuitGroupsInternal(normalizedTagId).catch((error) => ({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })).finally(() => {
      this.quitCheckPromise = null
    })
    return { success: true, started: true }
  }

  async getScanStatus(): Promise<{ success: boolean; data?: { running: boolean; scanRunning: boolean; quitCheckRunning: boolean; active?: any; scanActive?: any; quitCheckActive?: any; logs: InviteScanLog[] }; error?: string }> {
    try {
      const data = this.getScope()
      const scanRunning = Boolean(this.scanPromise)
      const quitCheckRunning = Boolean(this.quitCheckPromise)
      return {
        success: true,
        data: {
          running: scanRunning || quitCheckRunning,
          scanRunning,
          quitCheckRunning,
          active: this.activeScanState || this.activeQuitCheckState || undefined,
          scanActive: this.activeScanState || undefined,
          quitCheckActive: this.activeQuitCheckState || undefined,
          logs: data.scanLogs.slice(0, 20)
        }
      }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async resetAllLocalData(): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.scanPromise || this.quitCheckPromise) return { success: false, error: '扫描或退群任务正在运行，请等待完成后再恢复初始化' }
      this.ensureLoaded()
      this.store = { version: this.fileVersion, scopes: {} }
      this.persist()
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async runBackgroundScan(): Promise<void> {
    if (this.scanPromise || this.isBackgroundTaskBlocked()) return
    const data = this.getScope()
    const tagIds = data.activityTags
      .filter((tag) => tag.enabled && this.getEnabledBindingsForTag(data, tag.tag_id).length > 0)
      .map((tag) => tag.tag_id)
    if (tagIds.length === 0) return
    this.scanPromise = (async () => {
      for (const tagId of tagIds) {
        await this.scanActivityInternal(tagId).catch(() => undefined)
      }
    })().finally(() => {
      this.scanPromise = null
    })
    await this.scanPromise
  }

  async ensureBackgroundScanComplete(maxWaitMs = 0): Promise<void> {
    const scanTask = this.scanPromise || this.runBackgroundScan()
    if (!maxWaitMs || maxWaitMs <= 0) {
      await scanTask
      return
    }
    await Promise.race([
      scanTask.catch(() => undefined),
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, maxWaitMs)
        if (typeof timer.unref === 'function') timer.unref()
      })
    ])
  }

  async waitForBackgroundTasksIdle(maxWaitMs = 0): Promise<boolean> {
    const tasks = [this.scanPromise, this.quitCheckPromise].filter(Boolean) as Promise<any>[]
    if (tasks.length === 0) return true
    const waitAll = Promise.all(tasks.map((task) => task.catch(() => undefined))).then(() => true)
    if (!maxWaitMs || maxWaitMs <= 0) return waitAll
    return Promise.race([
      waitAll,
      new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), maxWaitMs)
        if (typeof timer.unref === 'function') timer.unref()
      })
    ])
  }

  async runBackgroundQuitCheck(): Promise<void> {
    if (this.quitCheckPromise || this.isBackgroundTaskBlocked()) return
    const data = this.getScope()
    const tagIds = data.activityTags
      .filter((tag) => tag.enabled && this.getEnabledBindingsForTag(data, tag.tag_id).length > 0)
      .map((tag) => tag.tag_id)
    if (tagIds.length === 0) return
    this.quitCheckPromise = (async () => {
      for (const tagId of tagIds) {
        await this.checkQuitGroupsInternal(tagId).catch(() => undefined)
      }
    })().finally(() => {
      this.quitCheckPromise = null
    })
    await this.quitCheckPromise
  }

  private getNextBeijingMidnightDelayMs(nowMs = Date.now()): number {
    const dayMs = 24 * 60 * 60 * 1000
    const beijingOffsetMs = 8 * 60 * 60 * 1000
    const beijingNowMs = nowMs + beijingOffsetMs
    const nextBeijingMidnightMs = Math.floor(beijingNowMs / dayMs) * dayMs + dayMs
    return Math.max(1_000, nextBeijingMidnightMs - beijingNowMs)
  }

  startAutoScanScheduler(): void {
    if (this.autoScanStarted) return
    this.autoScanStarted = true
    const firstScanTimer = setTimeout(() => {
      this.autoScanTimer = null
      void this.runBackgroundScan()
      if (!this.autoScanStarted) return
      const intervalTimer = setInterval(() => {
        void this.runBackgroundScan()
      }, this.autoScanIntervalMs)
      if (typeof intervalTimer.unref === 'function') intervalTimer.unref()
      this.autoScanTimer = intervalTimer
    }, this.autoScanInitialDelayMs)
    if (typeof firstScanTimer.unref === 'function') firstScanTimer.unref()
    this.autoScanTimer = firstScanTimer
  }

  stopAutoScanScheduler(): void {
    if (this.autoScanTimer) clearTimeout(this.autoScanTimer)
    this.autoScanTimer = null
    this.autoScanStarted = false
  }

  startAutoQuitCheckScheduler(): void {
    if (this.autoQuitCheckStarted) return
    this.autoQuitCheckStarted = true
    const firstTimer = setTimeout(() => {
      this.autoQuitCheckTimer = null
      void this.runBackgroundQuitCheck()
      if (!this.autoQuitCheckStarted) return
      const intervalTimer = setInterval(() => {
        void this.runBackgroundQuitCheck()
      }, this.autoQuitCheckIntervalMs)
      if (typeof intervalTimer.unref === 'function') intervalTimer.unref()
      this.autoQuitCheckTimer = intervalTimer
    }, this.autoQuitCheckIntervalMs)
    if (typeof firstTimer.unref === 'function') firstTimer.unref()
    this.autoQuitCheckTimer = firstTimer
  }

  stopAutoQuitCheckScheduler(): void {
    if (this.autoQuitCheckTimer) clearTimeout(this.autoQuitCheckTimer)
    this.autoQuitCheckTimer = null
    this.autoQuitCheckStarted = false
  }

  async getDashboard(input: {
    tagId: string
    startTime?: number
    endTime?: number
    includeQuitMembers?: boolean
    minInviteCount?: number
    rankingGroupId?: string
    dedupeMembers?: boolean
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const data = this.getScope()
      let changed = this.recomputeFlags(data)
      const tagId = normalizeText(input.tagId) || ALL_ACTIVITY_TAG_ID
      const dedupeMembers = input.dedupeMembers === true
      const tag = this.isAllActivityScope(tagId)
        ? undefined
        : data.activityTags.find((item) => item.tag_id === tagId)
      if (!this.isAllActivityScope(tagId) && !tag) return { success: false, error: '活动标签不存在' }
      const bindings = this.getScopedBindings(data, tagId)
      const bindingGroupIds = new Set(bindings.map((binding) => binding.group_id))
      const now = this.nowSeconds()
      const todayStart = this.startOfTodaySeconds()
      const todayEnd = now
      const inviteEventsForDashboard = this.getDashboardInviteEvents(data, tagId, dedupeMembers)
      const scopedInviteEvents = this.getScopedInviteEvents(data, tagId)
      const scopedQuitEvents = this.getScopedQuitEvents(data, tagId)
      const pendingCount = scopedInviteEvents.filter((event) => event.status === 'pending').length +
        scopedQuitEvents.filter((event) => event.status === 'pending').length

      const groupsResult = await groupAnalyticsService.getGroupChats()
      const groupRows = groupsResult.success && groupsResult.data
        ? (() => {
            changed = this.refreshBindingMemberCounts(data, groupsResult.data) || changed
            return this.buildGroupRows(data, groupsResult.data, todayStart, todayEnd).filter((row) => bindingGroupIds.has(row.group_id))
          })()
        : []

      const groupMemberTotal = groupRows.reduce((sum, row) => sum + this.normalizeMemberCount(row.member_count), 0)
      const uniqueCurrentGroupMembers = dedupeMembers && !input.includeQuitMembers
        ? await this.countUniqueCurrentGroupMembers(bindingGroupIds)
        : null
      const activeMemberCount = dedupeMembers
        ? uniqueCurrentGroupMembers ?? new Set(inviteEventsForDashboard
            .filter((event) => event.status === 'confirmed' && event.delete_flag !== 1)
            .map((event) => this.getMemberKey(event))
            .filter(Boolean)
          ).size
        : groupMemberTotal
      const todayQuitMembers = new Set<string>()
      for (const event of scopedQuitEvents) {
        if (event.status !== 'confirmed' || event.quit_time < todayStart || event.quit_time > todayEnd) continue
        todayQuitMembers.add(this.getMemberKey(event) || (event.group_id + ':' + event.user + ':' + event.quit_time))
      }
      for (const event of scopedInviteEvents) {
        const traceTime = this.getInviteEventTimelineTime(event)
        if (event.status !== 'confirmed' || event.delete_flag !== 1 || traceTime < todayStart || traceTime > todayEnd) continue
        todayQuitMembers.add(this.getMemberKey(event) || (event.group_id + ':' + event.user + ':' + traceTime))
      }
      const todayQuitCount = todayQuitMembers.size
      const quitTraceCount = scopedInviteEvents.filter((event) => this.isTraceQuitStatus({
        event_type: 'invite',
        status: event.status,
        delete_flag: event.delete_flag
      })).length + scopedQuitEvents.filter((event) => this.isTraceQuitStatus({
        event_type: 'quit',
        status: event.status
      })).length
      const totalMembers = input.includeQuitMembers
        ? (dedupeMembers
            ? new Set(inviteEventsForDashboard
                .filter((event) => event.status === 'confirmed')
                .map((event) => this.getMemberKey(event))
                .filter(Boolean)
              ).size
            : groupMemberTotal + quitTraceCount + todayQuitCount)
        : activeMemberCount

      const todayInviteEvents = this.filterByTime(inviteEventsForDashboard, todayStart, todayEnd)
      const todayNewCount = dedupeMembers
        ? new Set(todayInviteEvents.map((event) => this.getMemberKey(event)).filter(Boolean)).size
        : todayInviteEvents.length
      const activeBotCount = normalizeText(this.configService.getMyWxidCleaned()) ? 1 : 0

      const hourlyBuckets: Record<number, number> = {}
      for (let hour = 0; hour < 24; hour += 1) hourlyBuckets[hour] = 0
      for (const event of inviteEventsForDashboard) {
        const hour = this.getBeijingHour(event.invite_time)
        hourlyBuckets[hour] = (hourlyBuckets[hour] || 0) + 1
      }

      const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        count: hourlyBuckets[hour] || 0
      }))

      const groupRanking = groupRows.map((group) => ({
        group_id: group.group_id,
        group_name: group.group_name,
        member_count: group.member_count,
        today_join_count: group.today_join_count,
        today_quit_count: group.today_quit_count,
        recent_invite_time: group.recent_invite_time
      })).sort((a, b) => b.member_count - a.member_count)

      const recentActivities = this.buildMemberTraceRows(data, {
        tagId,
        includeQuit: true
      }).filter((row) => row.status !== 'ignored').slice(0, 20)
      if (changed) this.persist()

      return {
        success: true,
        data: {
          tag,
          cards: {
            activeBotCount,
            groupCount: bindings.length,
            totalMembers,
            todayNewMembers: todayNewCount,
            todayQuitMembers: todayQuitCount,
            pendingCount
          },
          hourlyDistribution,
          inviteRanking: this.buildInviteRanking(data, tagId, input.startTime, input.endTime, Math.max(0, Number(input.minInviteCount || 0)), input.rankingGroupId, dedupeMembers),
          groupRanking,
          recentActivities,
          scanStatus: {
            running: Boolean(this.scanPromise || this.quitCheckPromise),
            scanRunning: Boolean(this.scanPromise),
            quitCheckRunning: Boolean(this.quitCheckPromise),
            active: this.activeScanState || this.activeQuitCheckState,
            scanActive: this.activeScanState,
            quitCheckActive: this.activeQuitCheckState,
            logs: data.scanLogs.slice(0, 8)
          }
        }
      }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  private buildMemberTraceRows(data: InviteStatsScopeData, filters: MemberTraceFilters): MemberTraceRow[] {

    const tagId = normalizeText(filters.tagId)
    const groupId = normalizeText(filters.groupId)
    const keyword = normalizeText(filters.keyword).toLowerCase()
    const wxId = this.cleanAccountDirName(normalizeText(filters.wxId))
    const statusFilter = normalizeText(filters.statusFilter)
    const attributionFilter = normalizeText(filters.attributionFilter)
    const invitedCountMap = tagId ? this.getInvitedCountByInviter(data, tagId) : new Map<string, number>()
    const groupNameById = new Map(
      data.groupTagBindings
        .filter((binding) => binding.enabled)
        .map((binding) => [binding.group_id, binding.group_name || binding.group_id] as const)
    )
    const rows: MemberTraceRow[] = []

    for (const event of data.inviteEvents) {
      rows.push({
        id: event.id,
        event_type: 'invite',
        user: event.user,
        wx_id: event.wx_id,
        inviter: event.inviter,
        inviter_wx_id: event.inviter_wx_id,
        group_name: groupNameById.get(event.group_id) || event.group_name || event.group_id,
        group_id: event.group_id,
        activity_tag_id: event.activity_tag_id,
        activity_tag_name: event.activity_tag_name,
        head_img: event.head_img,
        join_type: event.join_type,
        quit_type: '',
        operator: '',
        operator_wx_id: '',
        event_time: this.getInviteEventTimelineTime(event),
        delete_flag: event.delete_flag,
        valid_flag: event.valid_flag,
        status: event.status,
        invited_count: invitedCountMap.get(this.cleanAccountDirName(event.wx_id)) || invitedCountMap.get(normalizeIdentityText(event.user)) || 0,
        raw_content: event.raw_content,
        parsed_content: event.parsed_content,
        source_rule: event.source_rule || '',
        source_context_members: event.source_context_members || []
      })
    }

    if (filters.includeQuit !== false) {
      for (const event of data.quitEvents) {
        rows.push({
          id: event.id,
          event_type: 'quit',
          user: event.user,
          wx_id: event.wx_id,
          inviter: '',
          inviter_wx_id: '',
          group_name: groupNameById.get(event.group_id) || event.group_name || event.group_id,
          group_id: event.group_id,
          activity_tag_id: event.activity_tag_id,
          activity_tag_name: event.activity_tag_name,
          head_img: event.head_img,
          join_type: '',
          quit_type: event.quit_type,
          operator: event.operator,
          operator_wx_id: event.operator_wx_id,
          event_time: event.quit_time,
          delete_flag: null,
          valid_flag: null,
          status: event.status,
          invited_count: 0,
          raw_content: event.raw_content,
          parsed_content: event.parsed_content,
          source_rule: event.source_rule || '',
          source_context_members: event.source_context_members || []
        })
      }
    }

    return rows
      .filter((row) => {
        if (tagId && !this.isEventInCurrentTag(data, row, tagId)) return false
        if (groupId && row.group_id !== groupId) return false
        if (wxId && this.cleanAccountDirName(row.wx_id) !== wxId) return false
        if (filters.startTime && row.event_time < filters.startTime) return false
        if (filters.endTime && row.event_time > filters.endTime) return false
        const rowIsQuit = row.status !== 'ignored' && (row.delete_flag === 1 || row.event_type === 'quit')
        const rowIsActive = row.status !== 'pending' && !rowIsQuit
        if (statusFilter === 'active' && !rowIsActive) return false
        if (statusFilter === 'quit' && !rowIsQuit) return false
        if (statusFilter === 'pending' && row.status !== 'pending') return false
        if (attributionFilter === 'valid' && (row.event_type !== 'invite' || row.status !== 'confirmed' || row.valid_flag !== 1)) return false
        if (attributionFilter === 'invalid') {
          const isIgnored = row.status === 'ignored'
          const isInvalidInvite = row.event_type === 'invite' && row.status === 'confirmed' && row.valid_flag === -1
          if (!isIgnored && !isInvalidInvite) return false
        }
        if (attributionFilter === 'pending' && row.status !== 'pending') return false
        if (keyword) {
          const fields = [row.user, row.wx_id, row.inviter, row.inviter_wx_id, row.group_name, row.group_id]
            .join('\n')
            .toLowerCase()
          if (filters.exact) {
            const exactFields = [row.user, row.wx_id, row.inviter, row.inviter_wx_id]
              .map((item) => normalizeText(item).toLowerCase())
            if (!exactFields.includes(keyword)) return false
          } else if (!fields.includes(keyword)) {
            return false
          }
        }
        return true
      })
      .sort((a, b) => b.event_time - a.event_time)
  }

  async getMemberTrace(filters: MemberTraceFilters): Promise<{ success: boolean; data?: { rows: MemberTraceRow[]; total: number }; error?: string }> {
    try {
      const data = this.getScope()
      let changed = this.recomputeFlags(data)
      changed = await this.refreshBindingMemberCountsFromSource(data) || changed
      if (changed) this.persist()
      const offset = Math.max(0, Number(filters.offset || 0))
      const limit = Math.min(500, Math.max(1, Number(filters.limit || 100)))
      const rows = this.buildMemberTraceRows(data, filters)
      return { success: true, data: { rows: rows.slice(offset, offset + limit), total: rows.length } }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async listPending(filters: { tagId?: string } = {}): Promise<{ success: boolean; data?: MemberTraceRow[]; error?: string }> {
    try {
      const data = this.getScope()
      let changed = this.recomputeFlags(data)
      changed = await this.refreshBindingMemberCountsFromSource(data) || changed
      if (changed) this.persist()
      const rows = this.buildMemberTraceRows(data, {
        tagId: filters.tagId,
        includeQuit: true,
        limit: 500
      }).filter((row) => row.status === 'pending')
      return { success: true, data: rows }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async confirmPending(payload: {
    eventType: 'invite' | 'quit'
    eventId: string
    groupId?: string
    wxId?: string
    inviterWxId?: string
    operatorWxId?: string
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const data = this.getScope()
      const now = this.nowSeconds()
      if (payload.eventType === 'invite') {
        const event = data.inviteEvents.find((item) => item.id === payload.eventId)
        if (!event) return { success: false, error: '未找到待确认记录' }
        const previousDedupKey = event.dedup_key || this.buildRawDedupKey('invite', event)
        const nextGroupId = normalizeText(payload.groupId || event.group_id)
        const binding = this.getBoundGroupBinding(data, nextGroupId, event.activity_tag_id)
        if (!binding) return { success: false, error: '群 ID 必须存在，并且属于当前活动标签' }

        const nextWxId = normalizeText(payload.wxId || event.wx_id)
        if (!nextWxId) return { success: false, error: '有效邀请必须补充被邀请人微信 ID' }

        const nextInviterWxId = normalizeText(payload.inviterWxId || event.inviter_wx_id)
        const hasKnownInviter = this.isKnownRelatedName(event.inviter)
        if (hasKnownInviter && !nextInviterWxId) {
          return { success: false, error: '有效邀请必须补充邀请人微信 ID' }
        }

        const duplicateKey = this.buildMessageDedupKey({
          ...event,
          group_id: nextGroupId,
          wx_id: nextWxId
        })
        const duplicateEvents = data.inviteEvents.filter((item) =>
          item.id !== event.id && this.buildMessageDedupKey(item) === duplicateKey
        )

        const members = await this.loadGroupMembers(nextGroupId)
        const userIdentity = await this.resolveManualIdentity(nextGroupId, nextWxId, event.user, members)
        const inviterIdentity = hasKnownInviter
          ? await this.resolveManualIdentity(nextGroupId, nextInviterWxId, event.inviter, members)
          : null

        event.group_id = nextGroupId
        event.group_name = binding.group_name || event.group_name || nextGroupId
        event.wx_id = userIdentity.wxId
        event.user = userIdentity.displayName || event.user
        event.head_img = userIdentity.avatarUrl || event.head_img
        if (inviterIdentity) {
          event.inviter_wx_id = inviterIdentity.wxId
          event.inviter = inviterIdentity.displayName || event.inviter
        }
        event.status = 'confirmed'
        event.confidence = Math.max(Number(event.confidence || 0), 0.99)
        event.dedup_key = this.buildRawDedupKey('invite', event)
        if (previousDedupKey !== event.dedup_key) {
          data.rawEvents = data.rawEvents.filter((raw) => raw.dedup_key !== previousDedupKey || raw.id !== event.id)
        }
        if (duplicateEvents.length > 0) {
          const duplicateIds = new Set(duplicateEvents.map((item) => item.id))
          data.inviteEvents = data.inviteEvents.filter((item) => item.id === event.id || !duplicateIds.has(item.id))
          data.rawEvents = data.rawEvents.filter((raw) => !duplicateIds.has(raw.id))
        }
        this.ensureIdentityBinding(data, event.group_id, event.user, event.wx_id, 'manual')
        this.ensureMemberAliasBindings(data, event.group_id, userIdentity.member, 'manual')
        if (inviterIdentity) {
          this.ensureIdentityBinding(data, event.group_id, event.inviter, event.inviter_wx_id, 'manual')
          this.ensureMemberAliasBindings(data, event.group_id, inviterIdentity.member, 'manual')
        }
        this.markSyncDirty(event, now)
      } else {
        const event = data.quitEvents.find((item) => item.id === payload.eventId)
        if (!event) return { success: false, error: '未找到待确认记录' }
        const previousDedupKey = event.dedup_key || this.buildRawDedupKey('quit', event)
        const nextGroupId = normalizeText(payload.groupId || event.group_id)
        const binding = this.getBoundGroupBinding(data, nextGroupId, event.activity_tag_id)
        if (!binding) return { success: false, error: '群 ID 必须存在，并且属于当前活动标签' }
        const members = await this.loadGroupMembers(nextGroupId)

        event.group_id = nextGroupId
        event.group_name = binding.group_name || event.group_name || nextGroupId
        const nextWxId = normalizeText(payload.wxId || event.wx_id)
        if (nextWxId) {
          const userIdentity = await this.resolveManualIdentity(nextGroupId, nextWxId, event.user, members)
          event.wx_id = userIdentity.wxId
          event.user = userIdentity.displayName || event.user
          event.head_img = userIdentity.avatarUrl || event.head_img
          this.ensureIdentityBinding(data, event.group_id, event.user, event.wx_id, 'manual')
          this.ensureMemberAliasBindings(data, event.group_id, userIdentity.member, 'manual')
        }
        if (payload.operatorWxId) {
          const operatorIdentity = await this.resolveManualIdentity(nextGroupId, payload.operatorWxId, event.operator, members)
          event.operator_wx_id = operatorIdentity.wxId
          event.operator = operatorIdentity.displayName || event.operator
          this.ensureIdentityBinding(data, event.group_id, event.operator, event.operator_wx_id, 'manual')
          this.ensureMemberAliasBindings(data, event.group_id, operatorIdentity.member, 'manual')
        }
        event.status = 'confirmed'
        event.confidence = Math.max(Number(event.confidence || 0), 0.99)
        event.dedup_key = this.buildRawDedupKey('quit', event)
        if (previousDedupKey !== event.dedup_key) {
          data.rawEvents = data.rawEvents.filter((raw) => raw.dedup_key !== previousDedupKey || raw.id !== event.id)
        }
        this.markSyncDirty(event, now)
        if (event.status === 'confirmed') this.applyQuitEventToInviteFlags(data, event)
      }
      this.recomputeFlags(data)
      this.persist()
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async addManualInviteRecord(payload: ManualInviteRecordPayload): Promise<{ success: boolean; data?: MemberTraceRow; error?: string }> {

    try {
      const data = this.getScope()
      const tagId = normalizeText(payload.tagId)
      const groupId = normalizeText(payload.groupId)
      const userName = normalizeText(payload.user)
      const wxId = normalizeText(payload.wxId)
      const inviterName = normalizeText(payload.inviter)
      const inviterWxId = normalizeText(payload.inviterWxId)
      if (!tagId) return { success: false, error: '活动标签不能为空' }
      if (!groupId) return { success: false, error: '群 ID 不能为空' }
      if (!userName) return { success: false, error: '被邀请人名称不能为空' }
      if (!wxId) return { success: false, error: '被邀请人微信 ID 不能为空' }
      if (!inviterName) return { success: false, error: '邀请人名称不能为空' }
      if (!inviterWxId) return { success: false, error: '邀请人微信 ID 不能为空' }

      const tag = data.activityTags.find((item) => item.tag_id === tagId)
      if (!tag) return { success: false, error: '活动标签不存在' }
      const binding = this.getBoundGroupBinding(data, groupId, tagId)
      if (!binding) return { success: false, error: '群 ID 必须存在，并且属于当前活动标签' }

      const source = payload.sourceEventId
        ? data.inviteEvents.find((event) => event.id === payload.sourceEventId)
        : undefined
      if (payload.sourceEventId && !source) return { success: false, error: '未找到来源待确认记录' }
      if (source && source.activity_tag_id !== tagId) return { success: false, error: '来源记录不属于当前活动标签' }

      const sourceCreateTime = source?.source_create_time || Number(payload.inviteTime || 0) || this.nowSeconds()
      const duplicateKey = this.buildMessageDedupKey({
        group_id: groupId,
        source_message_id: source?.source_message_id || '',
        source_local_id: source?.source_local_id || 0,
        source_create_time: sourceCreateTime,
        wx_id: wxId,
        inviter_wx_id: inviterWxId,
        user: userName,
        inviter: inviterName,
        raw_content: source?.raw_content || ''
      })
      if (data.inviteEvents.some((event) => this.buildMessageDedupKey(event) === duplicateKey)) {
        return { success: false, error: '同一源消息、群 ID 和被邀请人微信 ID 已存在，不能重复统计' }
      }

      const members = await this.loadGroupMembers(groupId)
      const userIdentity = await this.resolveManualIdentity(groupId, wxId, userName, members)
      const inviterIdentity = await this.resolveManualIdentity(groupId, inviterWxId, inviterName, members)
      const now = this.nowSeconds()
      const event: InviteEvent = {
        id: randomUUID(),
        user: userIdentity.displayName || userName,
        wx_id: userIdentity.wxId,
        inviter: inviterIdentity.displayName || inviterName,
        inviter_wx_id: inviterIdentity.wxId,
        invite_time: Number(payload.inviteTime || 0) || source?.invite_time || sourceCreateTime,
        group_name: binding.group_name || groupId,
        group_id: groupId,
        activity_tag_id: tag.tag_id,
        activity_tag_name: tag.tag_name,
        head_img: userIdentity.avatarUrl,
        join_type: 'invite',
        delete_flag: -1,
        valid_flag: -1,
        raw_content: source?.raw_content || '',
        parsed_content: source?.parsed_content || source?.raw_content || '',
        source_rule: source?.source_rule || 'manual-add',
        source_context_members: source?.source_context_members || [],
        source_message_id: source?.source_message_id || '',
        source_local_id: source?.source_local_id || 0,
        source_create_time: sourceCreateTime,
        confidence: 1,
        status: 'confirmed',
        dedup_key: '',
        feishu_record_id: '',
        sync_status: 'dirty',
        sync_error: '',
        last_sync_at: 0,
        created_at: now,
        updated_at: now
      }
      event.dedup_key = this.buildRawDedupKey('invite', event)
      data.inviteEvents.push(event)
      this.ensureIdentityBinding(data, groupId, userName, event.wx_id, 'manual')
      this.ensureIdentityBinding(data, groupId, event.user, event.wx_id, 'manual')
      this.ensureMemberAliasBindings(data, groupId, userIdentity.member, 'manual')
      this.ensureIdentityBinding(data, groupId, inviterName, event.inviter_wx_id, 'manual')
      this.ensureIdentityBinding(data, groupId, event.inviter, event.inviter_wx_id, 'manual')
      this.ensureMemberAliasBindings(data, groupId, inviterIdentity.member, 'manual')
      this.recomputeFlags(data)
      this.persist()
      const row = this.buildMemberTraceRows(data, { tagId, includeQuit: true })
        .find((item) => item.event_type === 'invite' && item.id === event.id)
      return { success: true, data: row }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async ignorePending(payload: { eventType: 'invite' | 'quit'; eventId: string }): Promise<{ success: boolean; error?: string }> {
    try {
      const data = this.getScope()
      const now = this.nowSeconds()
      const list = payload.eventType === 'invite' ? data.inviteEvents : data.quitEvents
      const event = list.find((item) => item.id === payload.eventId)
      if (!event) return { success: false, error: '未找到待确认记录' }
      event.status = 'ignored'
      this.markSyncDirty(event, now)
      this.recomputeFlags(data)
      this.persist()
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async exportInviteRanking(payload: {
    filePath: string
    format?: ExportFormat
    tagId: string
    startTime?: number
    endTime?: number
    minInviteCount?: number
    groupId?: string
    dedupeMembers?: boolean
  }): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
      const data = this.getScope()
      const rows = this.buildInviteRanking(data, payload.tagId, payload.startTime, payload.endTime, payload.minInviteCount, payload.groupId, payload.dedupeMembers === true)
      const headers = ['排名', '活动标签', '邀请人', '邀请人 wxid', '邀请人数', '关联群数量', '最近邀请时间']
      const tagName = data.activityTags.find((tag) => tag.tag_id === payload.tagId)?.tag_name || ''
      const body = rows.map((row) => [
        row.rank,
        tagName,
        row.inviter,
        row.inviter_wx_id,
        row.invite_count,
        row.group_count,
        this.formatTime(row.recent_invite_time)
      ])
      const format = this.normalizeExportFormat(payload.filePath, payload.format)
      if (format === 'csv') this.writeCsv(payload.filePath, headers, body)
      else await this.writeWorkbook(payload.filePath, '邀请排行榜', headers, body)
      return { success: true, count: rows.length }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async exportMemberTrace(payload: MemberTraceFilters & { filePath: string; format?: ExportFormat }): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
      const data = this.getScope()
      if (this.recomputeFlags(data)) this.persist()
      const rows = this.buildMemberTraceRows(data, payload)
      const headers = ['事件类型', '活动标签', '成员昵称', '成员 wxid', '邀请者', '邀请者 wxid', '所在群', '群 ID', '时间', '状态', '是否有效', '类型']
      const body = rows.map((row) => [
        row.event_type === 'invite' ? '入群' : '退群',
        row.activity_tag_name,
        row.user,
        row.wx_id,
        row.inviter || row.operator,
        row.inviter_wx_id || row.operator_wx_id,
        row.group_name,
        row.group_id,
        this.formatTime(row.event_time),
        row.status === 'pending' ? '待确认' : (row.status !== 'ignored' && (row.event_type === 'quit' || row.delete_flag === 1) ? '已退出群' : '未退出群'),
        row.status === 'ignored' ? '无效' : row.status !== 'confirmed' ? '待确认' : row.event_type !== 'invite' ? '-' : row.valid_flag === 1 ? '有效' : row.valid_flag === -1 ? '无效' : '-',
        row.join_type || row.quit_type
      ])
      const format = this.normalizeExportFormat(payload.filePath, payload.format)
      if (format === 'csv') this.writeCsv(payload.filePath, headers, body)
      else await this.writeWorkbook(payload.filePath, '成员溯源', headers, body)
      return { success: true, count: rows.length }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async exportRawEvents(payload: { filePath: string; format?: ExportFormat; tagId?: string }): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
      const data = this.getScope()
      const tagId = normalizeText(payload.tagId)
      const inviteRows = data.inviteEvents
        .filter((event) => !tagId || this.isEventInCurrentTag(data, event, tagId))
        .map((event) => [
          'invite',
          event.id,
          event.activity_tag_name,
          event.group_name,
          event.group_id,
          event.user,
          event.wx_id,
          event.inviter,
          event.inviter_wx_id,
          event.join_type,
          this.formatTime(event.invite_time),
          event.delete_flag,
          event.valid_flag,
          event.status,
          event.source_message_id,
          event.source_local_id,
          event.raw_content
        ])
      const quitRows = data.quitEvents
        .filter((event) => !tagId || this.isEventInCurrentTag(data, event, tagId))
        .map((event) => [
          'quit',
          event.id,
          event.activity_tag_name,
          event.group_name,
          event.group_id,
          event.user,
          event.wx_id,
          event.operator,
          event.operator_wx_id,
          event.quit_type,
          this.formatTime(event.quit_time),
          '',
          '',
          event.status,
          event.source_message_id,
          event.source_local_id,
          event.raw_content
        ])
      const headers = ['事件表', 'ID', '活动标签', '群名', '群 ID', '用户', '用户 wxid', '关联人', '关联人 wxid', '类型', '时间', 'delete_flag', 'valid_flag', '状态', '消息 ID', '本地 ID', '原始消息']
      const body = [...inviteRows, ...quitRows]
      const format = this.normalizeExportFormat(payload.filePath, payload.format)
      if (format === 'csv') this.writeCsv(payload.filePath, headers, body)
      else await this.writeWorkbook(payload.filePath, '原始事件', headers, body)
      return { success: true, count: body.length }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }
}

export const inviteStatsService = new InviteStatsService()
