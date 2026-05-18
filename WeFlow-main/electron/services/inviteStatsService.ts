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
type ScanMode = 'incremental'
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
  tag_id: string
  tag_name: string
  enabled: boolean
  last_scan_time: number
  last_invite_time: number
  last_message_id: string
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
  scanLogs: Array<Record<string, unknown>>
}

interface ParsedSystemEvent {
  type: 'join' | 'quit'
  joinType?: JoinType
  quitType?: QuitType
  user: string
  inviter?: string
  operator?: string
  confidence: number
}

interface MatchResult {
  wxId: string
  displayName: string
  avatarUrl: string
  candidates: Array<{ wxId: string; displayName: string; avatarUrl?: string }>
  status: InviteEventStatus
  reason: string
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
}

const createEmptyScope = (): InviteStatsScopeData => ({
  activityTags: [],
  groupTagBindings: [],
  rawEvents: [],
  inviteEvents: [],
  quitEvents: [],
  memberIdentityBindings: [],
  scanLogs: []
})

const normalizeText = (value: unknown): string => String(value || '').trim()
const normalizeIdentityText = (value: unknown): string => normalizeText(value).replace(/\s+/g, ' ').toLowerCase()

class InviteStatsService {
  private readonly fileVersion = 1
  private readonly maxScanLogsPerScope = 80
  private readonly autoScanIntervalMs = 3 * 60 * 1000
  private configService: ConfigService
  private filePath: string | null = null
  private loaded = false
  private store: InviteStatsFile = { version: 1, scopes: {} }
  private scanPromise: Promise<any> | null = null
  private activeScanState: {
    tagId: string
    tagName: string
    scanMode: ScanMode
    startedAt: number
    groupCount: number
    scannedMessageCount: number
  } | null = null
  private autoScanTimer: ReturnType<typeof setInterval> | null = null
  private autoScanStarted = false
  private afterScanSuccess: (() => void | Promise<void>) | null = null

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
    const scope = data as InviteStatsScopeData & { rawEvents?: InviteRawEvent[] }
    if (!Array.isArray(scope.rawEvents)) scope.rawEvents = []
    if (scope.rawEvents.length === 0 && (data.inviteEvents.length > 0 || data.quitEvents.length > 0)) {
      for (const event of data.inviteEvents) this.upsertRawEventFromInvite(data, event)
      for (const event of data.quitEvents) this.upsertRawEventFromQuit(data, event)
    }
  }

  private nowSeconds(): number {
    return Math.floor(Date.now() / 1000)
  }

  private toIsoTime(timestamp?: number): string | null {
    if (!Number.isFinite(timestamp) || !timestamp || timestamp <= 0) return null
    return new Date(timestamp * 1000).toISOString()
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

  private parseSystemEvent(text: string): ParsedSystemEvent | null {
    const normalized = normalizeText(text)
      .replace(/[。.!！]+$/g, '')
      .replace(/\s+/g, ' ')
    if (!normalized) return null

    const qrcode = /^["']?(.+?)["']?通过扫描["']?(.+?)["']?分享的二维码加入(?:了)?群聊$/.exec(normalized)
    if (qrcode) {
      return {
        type: 'join',
        joinType: 'qrcode',
        user: normalizeText(qrcode[1]),
        inviter: normalizeText(qrcode[2]) || '未知来源',
        confidence: 0.94
      }
    }

    const invite = /^["']?(.+?)["']?邀请["']?(.+?)["']?加入(?:了)?群聊$/.exec(normalized)
    if (invite) {
      return {
        type: 'join',
        joinType: 'invite',
        inviter: normalizeText(invite[1]),
        user: normalizeText(invite[2]),
        confidence: 0.96
      }
    }

    const removed = /^["']?(.+?)["']?被["']?(.+?)["']?移出(?:了)?群聊$/.exec(normalized)
    if (removed) {
      return {
        type: 'quit',
        quitType: 'removed',
        user: normalizeText(removed[1]),
        operator: normalizeText(removed[2]),
        confidence: 0.94
      }
    }

    const quit = /^["']?(.+?)["']?退出(?:了)?群聊$/.exec(normalized)
    if (quit) {
      return {
        type: 'quit',
        quitType: 'self_quit',
        user: normalizeText(quit[1]),
        confidence: 0.94
      }
    }

    const direct = /^["']?(.+?)["']?加入(?:了)?群聊$/.exec(normalized)
    if (direct) {
      return {
        type: 'join',
        joinType: 'direct',
        user: normalizeText(direct[1]),
        confidence: 0.9
      }
    }

    return null
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

    const manualWxid = this.findManualBinding(data, groupId, name)
    if (manualWxid) {
      const manualMember = members.find((member) => this.cleanAccountDirName(member.username) === this.cleanAccountDirName(manualWxid))
      return {
        wxId: manualWxid,
        displayName: manualMember?.displayName || name,
        avatarUrl: manualMember?.avatarUrl || '',
        candidates: [],
        status: 'confirmed',
        reason: 'manual-binding'
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
        reason: 'unique-group-match'
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
    if (groupId && sourceMessageId && sourceMessageId !== '0') return `${groupId}:msg:${sourceMessageId}`
    if (groupId && event.source_local_id && event.source_create_time) {
      return `${groupId}:local:${event.source_local_id}:${event.source_create_time}`
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

  private isSyncDirty(row: { sync_status?: string; last_sync_at?: number; updated_at?: number; finished_at?: number; started_at?: number }): boolean {
    const updatedAt = Number(row.updated_at || row.finished_at || row.started_at || 0)
    const lastSyncAt = Number(row.last_sync_at || 0)
    return row.sync_status !== 'synced' || !lastSyncAt || (updatedAt > 0 && updatedAt > lastSyncAt)
  }

  setAfterScanSuccessCallback(callback: (() => void | Promise<void>) | null): void {
    this.afterScanSuccess = callback
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
    return event.activity_tag_id === tagId && this.isGroupBoundToTag(data, event.group_id, tagId)
  }

  private getScopedInviteEvents(data: InviteStatsScopeData, tagId: string): InviteEvent[] {
    return data.inviteEvents.filter((event) => this.isEventInCurrentTag(data, event, tagId))
  }

  private getScopedQuitEvents(data: InviteStatsScopeData, tagId: string): QuitEvent[] {
    return data.quitEvents.filter((event) => this.isEventInCurrentTag(data, event, tagId))
  }

  private getGroupLastRawCreatedTime(data: InviteStatsScopeData, groupId: string): number {
    return data.rawEvents.reduce((max, event) => {
      if (event.group_id !== groupId) return max
      return Math.max(max, event.created_time || event.source_create_time || event.invite_time || event.exit_time || 0)
    }, 0)
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
        confidence: event.confidence
      }
      let changed = false
      for (const [key, value] of Object.entries(updates)) {
        if ((existing as Record<string, unknown>)[key] !== value) {
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
        confidence: event.confidence
      }
      let changed = false
      for (const [key, value] of Object.entries(updates)) {
        if ((existing as Record<string, unknown>)[key] !== value) {
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
      confidence: event.confidence,
      sync_status: 'dirty',
      sync_error: '',
      last_sync_at: 0,
      created_at: event.created_at || now,
      updated_at: event.updated_at || now
    })
    return true
  }

  private syncRawEventsFromMaterialized(data: InviteStatsScopeData): void {
    for (const event of data.inviteEvents) this.upsertRawEventFromInvite(data, event)
    for (const event of data.quitEvents) this.upsertRawEventFromQuit(data, event)
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

  private recomputeFlags(data: InviteStatsScopeData): void {
    const nextFlags = new Map<string, number>()
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
      }
    }
    this.syncRawEventsFromMaterialized(data)
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
    const status: InviteEventStatus = userMatch.status === 'confirmed' && (parsed.joinType === 'direct' || parsed.joinType === 'qrcode' || !inviterRaw || inviterMatch.status === 'confirmed')
      ? 'confirmed'
      : 'pending'
    const now = this.nowSeconds()

    if (status === 'confirmed') {
      this.ensureIdentityBinding(data, context.groupId, parsed.user, userMatch.wxId, 'auto')
      if (inviterRaw && inviterRaw !== '未知来源' && inviterMatch.wxId) {
        this.ensureIdentityBinding(data, context.groupId, inviterRaw, inviterMatch.wxId, 'auto')
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
      if (operatorRaw && operatorMatch.wxId) {
        this.ensureIdentityBinding(data, context.groupId, operatorRaw, operatorMatch.wxId, 'auto')
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

  private getEffectiveInviteEvents(data: InviteStatsScopeData, tagId: string): InviteEvent[] {
    return this.getScopedInviteEvents(data, tagId)
      .filter((event) => event.status === 'confirmed' && event.valid_flag === 1 && this.getMemberKey(event))
      .sort((a, b) => a.invite_time - b.invite_time)
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
    groupId?: string
  ): InviteRankingRow[] {
    const normalizedGroupId = normalizeText(groupId)
    const effective = this.filterByTime(this.getEffectiveInviteEvents(data, tagId), startTime, endTime)
      .filter((event) => {
        if (normalizedGroupId && event.group_id !== normalizedGroupId) return false
        if (event.join_type === 'invite') return Boolean(event.inviter || event.inviter_wx_id)
        if (event.join_type === 'qrcode') return Boolean(event.inviter && event.inviter !== '未知来源')
        return false
      })

    const buckets = new Map<string, { inviter: string; inviter_wx_id: string; users: Set<string>; groups: Set<string>; recent: number }>()
    for (const event of effective) {
      const key = event.inviter_wx_id || normalizeIdentityText(event.inviter)
      if (!key) continue
      const bucket = buckets.get(key) || {
        inviter: event.inviter || event.inviter_wx_id,
        inviter_wx_id: event.inviter_wx_id,
        users: new Set<string>(),
        groups: new Set<string>(),
        recent: 0
      }
      bucket.users.add(this.getMemberKey(event))
      bucket.groups.add(event.group_id)
      bucket.recent = Math.max(bucket.recent, event.invite_time)
      buckets.set(key, bucket)
    }

    return Array.from(buckets.values())
      .map((bucket) => ({
        rank: 0,
        inviter: bucket.inviter,
        inviter_wx_id: bucket.inviter_wx_id,
        invite_count: bucket.users.size,
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
      if (row.inviter_wx_id) map.set(this.cleanAccountDirName(row.inviter_wx_id), row.invite_count)
      if (row.inviter) map.set(normalizeIdentityText(row.inviter), row.invite_count)
    }
    return map
  }

  async listActivityTags(): Promise<{ success: boolean; data?: InviteActivityTag[]; error?: string }> {
    try {
      const data = this.getScope()
      return { success: true, data: data.activityTags.slice().sort((a, b) => b.updated_at - a.updated_at) }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  exportCurrentScopeSyncPayload(options: { dirtyOnly?: boolean } = {}): InviteRemoteSyncPayload {
    const data = this.getScope()
    this.recomputeFlags(data)
    this.persist()
    const accountScope = this.getCurrentScopeKey()
    const shouldInclude = (row: Record<string, any>) => !options.dirtyOnly || this.isSyncDirty(row)

    return {
      accountScope,
      activityTags: data.activityTags.filter(shouldInclude).map((tag, index) => ({
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
      groupTagBindings: data.groupTagBindings
        .filter(shouldInclude)
        .map((binding) => ({
        id: binding.id,
        account_scope: accountScope,
        group_id: binding.group_id,
        group_name: binding.group_name,
        activity_tag_id: binding.tag_id,
        enabled: binding.enabled,
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
  }

  markCurrentScopeSyncResult(success: boolean, errorMessage = ''): void {
    const data = this.getScope()
    const now = this.nowSeconds()
    const rows: Array<Record<string, any>> = [
      ...data.activityTags,
      ...data.groupTagBindings,
      ...data.rawEvents,
      ...data.inviteEvents,
      ...data.quitEvents,
      ...data.memberIdentityBindings,
      ...data.scanLogs
    ]
    for (const row of rows) {
      if (!this.isSyncDirty(row)) continue
      row.sync_status = success ? 'synced' : 'failed'
      row.sync_error = success ? '' : errorMessage
      row.last_sync_at = now
    }
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
          head_img: '',
          join_type: raw.join_type || 'unknown',
          delete_flag: raw.delete_flag,
          valid_flag: raw.valid_flag,
          raw_content: raw.raw_content,
          parsed_content: raw.parsed_content,
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
          head_img: '',
          quit_type: raw.quit_type || 'unknown',
          operator: raw.related_name,
          operator_wx_id: raw.related_wxid,
          raw_content: raw.raw_content,
          parsed_content: raw.parsed_content,
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
    const bindingByGroupId = new Map(data.groupTagBindings.map((binding) => [binding.group_id, binding]))
    const tagById = new Map(data.activityTags.map((tag) => [tag.tag_id, tag]))
    const activeMembersByGroupId = new Map<string, Set<string>>()
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
      if (event.delete_flag !== 1) addMember(activeMembersByGroupId, event.group_id, memberKey)
      if (event.invite_time >= todayStart && event.invite_time <= todayEnd) {
        addMember(todayJoinByGroupId, event.group_id, memberKey)
      }
    }
    for (const event of data.quitEvents) {
      if (event.status !== 'confirmed' || event.quit_time < todayStart || event.quit_time > todayEnd) continue
      addMember(todayQuitByGroupId, event.group_id, this.getMemberKey(event))
    }

    return groups.map((group) => {
      const binding = bindingByGroupId.get(group.username)
      const tag = binding?.tag_id ? tagById.get(binding.tag_id) : undefined
      return {
        group_id: group.username,
        group_name: group.displayName || group.username,
        avatar_url: group.avatarUrl,
        member_count: activeMembersByGroupId.get(group.username)?.size || 0,
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
  }

  async listGroups(): Promise<{ success: boolean; data?: InviteStatsGroupRow[]; error?: string }> {
    try {
      const data = this.getScope()
      const groupsResult = await groupAnalyticsService.getGroupChats()
      if (!groupsResult.success || !groupsResult.data) {
        return { success: false, error: groupsResult.error || '获取微信群失败' }
      }
      const todayStart = this.startOfTodaySeconds()
      const rows = this.buildGroupRows(data, groupsResult.data, todayStart, this.nowSeconds())
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
      const groupName = groupsMap.get(normalizedGroupId)?.displayName || normalizedGroupId
      const now = this.nowSeconds()
      const existing = data.groupTagBindings.find((item) => item.group_id === normalizedGroupId)
      if (existing) {
        const previousTagId = existing.tag_id
        existing.group_name = groupName
        existing.tag_id = tag.tag_id
        existing.tag_name = tag.tag_name
        existing.enabled = true
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
          tag_id: tag.tag_id,
          tag_name: tag.tag_name,
          enabled: true,
          last_scan_time: 0,
          last_invite_time: 0,
          last_message_id: '',
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
        const context = await this.getGroupContext(data, binding)
        const result = await wcdbService.getMessagesByType(binding.group_id, 10000, true, 0, 0)
        if (!result.success || !Array.isArray(result.rows)) continue

        const messages = chatService.mapRowsToMessagesForApi(result.rows as Record<string, any>[], binding.group_id)
        const scanStart = this.getGroupLastRawCreatedTime(data, binding.group_id)
        let lastInviteTime = binding.last_invite_time || this.getGroupLastInviteTime(data, tagId, binding.group_id) || 0
        let lastMessageId = binding.last_message_id || ''

        for (const message of messages) {
          if (scanStart > 0 && message.createTime < scanStart) continue
          log.scanned_messages += 1
          if (this.activeScanState) this.activeScanState.scannedMessageCount = log.scanned_messages

          const parsedContent = this.normalizeSystemContent(message)
          const parsed = this.parseSystemEvent(parsedContent)
          if (!parsed) continue

          if (parsed.type === 'join') {
            const event = this.buildInviteEvent(data, parsed, message, context, parsedContent)
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

        binding.last_scan_time = this.nowSeconds()
        binding.last_invite_time = lastInviteTime
        binding.last_message_id = lastMessageId
        this.markSyncDirty(binding)
      }

      this.recomputeFlags(data)
      log.status = 'completed'
      log.finished_at = this.nowSeconds()
      this.markSyncDirty(log, log.finished_at)
      this.persist()
      this.notifyAfterScanSuccess()
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

  async scanActivity(tagId: string): Promise<{ success: boolean; started?: boolean; running?: boolean; log?: InviteScanLog; error?: string }> {
    if (this.scanPromise) return { success: true, running: true, error: '已有扫描任务正在运行' }
    const data = this.getScope()
    const normalizedTagId = normalizeText(tagId)
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

  async getScanStatus(): Promise<{ success: boolean; data?: { running: boolean; active?: any; logs: InviteScanLog[] }; error?: string }> {
    try {
      const data = this.getScope()
      return {
        success: true,
        data: {
          running: Boolean(this.scanPromise),
          active: this.activeScanState || undefined,
          logs: data.scanLogs.slice(0, 20)
        }
      }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async resetAllLocalData(): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.scanPromise) return { success: false, error: '扫描任务正在运行，请等待完成后再恢复初始化' }
      this.ensureLoaded()
      this.store = { version: this.fileVersion, scopes: {} }
      this.persist()
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async runBackgroundScan(): Promise<void> {
    if (this.scanPromise) return
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

  startAutoScanScheduler(): void {
    if (this.autoScanStarted) return
    this.autoScanStarted = true
    const firstScanTimer = setTimeout(() => {
      void this.runBackgroundScan()
    }, 15_000)
    if (typeof firstScanTimer.unref === 'function') firstScanTimer.unref()
    this.autoScanTimer = setInterval(() => {
      void this.runBackgroundScan()
    }, this.autoScanIntervalMs)
    if (typeof this.autoScanTimer.unref === 'function') this.autoScanTimer.unref()
  }

  stopAutoScanScheduler(): void {
    if (this.autoScanTimer) clearInterval(this.autoScanTimer)
    this.autoScanTimer = null
    this.autoScanStarted = false
  }

  async getDashboard(input: {
    tagId: string
    startTime?: number
    endTime?: number
    includeQuitMembers?: boolean
    minInviteCount?: number
    rankingGroupId?: string
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const data = this.getScope()
      this.recomputeFlags(data)
      const tagId = normalizeText(input.tagId)
      const tag = data.activityTags.find((item) => item.tag_id === tagId)
      if (!tag) return { success: false, error: '活动标签不存在' }
      const bindings = this.getEnabledBindingsForTag(data, tagId)
      const bindingGroupIds = new Set(bindings.map((binding) => binding.group_id))
      const now = this.nowSeconds()
      const todayStart = this.startOfTodaySeconds()
      const todayEnd = now
      const effective = this.getEffectiveInviteEvents(data, tagId)
      const scopedInviteEvents = this.getScopedInviteEvents(data, tagId)
      const scopedQuitEvents = this.getScopedQuitEvents(data, tagId)
      const pendingCount = scopedInviteEvents.filter((event) => event.status === 'pending').length +
        scopedQuitEvents.filter((event) => event.status === 'pending').length

      const groupsResult = await groupAnalyticsService.getGroupChats()
      const groupRows = groupsResult.success && groupsResult.data
        ? this.buildGroupRows(data, groupsResult.data, todayStart, todayEnd).filter((row) => bindingGroupIds.has(row.group_id))
        : []
      const activeMemberCount = new Set(effective
        .filter((event) => event.delete_flag !== 1)
        .map((event) => this.getMemberKey(event))
        .filter(Boolean)
      ).size
      const totalMembers = input.includeQuitMembers
        ? new Set(scopedInviteEvents.filter((event) => event.status === 'confirmed').map((event) => this.getMemberKey(event)).filter(Boolean)).size
        : activeMemberCount

      const todayNew = this.filterByTime(effective, todayStart, todayEnd)
      const todayNewCount = new Set(todayNew.map((event) => this.getMemberKey(event)).filter(Boolean)).size
      const todayQuit = scopedQuitEvents.filter((event) =>
        event.status === 'confirmed' &&
        event.quit_time >= todayStart &&
        event.quit_time <= todayEnd
      )
      const todayQuitCount = new Set(todayQuit.map((event) => {
        return this.getMemberKey(event) || `${event.group_id}:${event.user}:${event.quit_time}`
      })).size
      const activeBotCount = normalizeText(this.configService.getMyWxidCleaned()) ? 1 : 0

      const hourlyBuckets: Record<number, number> = {}
      for (let hour = 0; hour < 24; hour += 1) hourlyBuckets[hour] = 0
      for (const event of effective) {
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
      }).slice(0, 20)

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
          inviteRanking: this.buildInviteRanking(data, tagId, input.startTime, input.endTime, Math.max(0, Number(input.minInviteCount || 0)), input.rankingGroupId),
          groupRanking,
          recentActivities,
          scanStatus: {
            running: Boolean(this.scanPromise),
            active: this.activeScanState,
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
    const rows: MemberTraceRow[] = []

    for (const event of data.inviteEvents) {
      rows.push({
        id: event.id,
        event_type: 'invite',
        user: event.user,
        wx_id: event.wx_id,
        inviter: event.inviter,
        inviter_wx_id: event.inviter_wx_id,
        group_name: event.group_name,
        group_id: event.group_id,
        activity_tag_id: event.activity_tag_id,
        activity_tag_name: event.activity_tag_name,
        head_img: event.head_img,
        join_type: event.join_type,
        quit_type: '',
        operator: '',
        operator_wx_id: '',
        event_time: event.invite_time,
        delete_flag: event.delete_flag,
        valid_flag: event.valid_flag,
        status: event.status,
        invited_count: invitedCountMap.get(this.cleanAccountDirName(event.wx_id)) || invitedCountMap.get(normalizeIdentityText(event.user)) || 0,
        raw_content: event.raw_content,
        parsed_content: event.parsed_content
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
          group_name: event.group_name,
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
          parsed_content: event.parsed_content
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
        if (statusFilter === 'active' && (row.event_type !== 'invite' || row.status !== 'confirmed' || row.delete_flag === 1)) return false
        if (statusFilter === 'quit' && row.delete_flag !== 1 && row.event_type !== 'quit') return false
        if (statusFilter === 'pending' && row.status !== 'pending') return false
        if (attributionFilter === 'valid' && row.valid_flag !== 1) return false
        if (attributionFilter === 'invalid' && row.valid_flag !== -1) return false
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
        if (payload.wxId) {
          event.wx_id = normalizeText(payload.wxId)
          this.ensureIdentityBinding(data, event.group_id, event.user, event.wx_id, 'manual')
        }
        if (payload.inviterWxId) {
          event.inviter_wx_id = normalizeText(payload.inviterWxId)
          this.ensureIdentityBinding(data, event.group_id, event.inviter, event.inviter_wx_id, 'manual')
        }
        event.status = event.wx_id ? 'confirmed' : 'pending'
        this.markSyncDirty(event, now)
      } else {
        const event = data.quitEvents.find((item) => item.id === payload.eventId)
        if (!event) return { success: false, error: '未找到待确认记录' }
        if (payload.wxId) {
          event.wx_id = normalizeText(payload.wxId)
          this.ensureIdentityBinding(data, event.group_id, event.user, event.wx_id, 'manual')
        }
        if (payload.operatorWxId) {
          event.operator_wx_id = normalizeText(payload.operatorWxId)
          this.ensureIdentityBinding(data, event.group_id, event.operator, event.operator_wx_id, 'manual')
        }
        event.status = event.wx_id ? 'confirmed' : 'pending'
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
  }): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
      const data = this.getScope()
      const rows = this.buildInviteRanking(data, payload.tagId, payload.startTime, payload.endTime, payload.minInviteCount, payload.groupId)
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
        row.status !== 'confirmed' ? '待确认' : (row.event_type === 'quit' || row.delete_flag === 1 ? '已退出群' : '未退出群'),
        row.valid_flag === 1 ? '有效' : row.valid_flag === -1 ? '无效' : row.status,
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
