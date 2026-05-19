import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  AlertTriangle,
  Ban,
  BarChart3,
  Check,
  Clock,
  Copy,
  Download,
  FileSpreadsheet,
  Loader2,
  PieChart,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Tags,
  Trash2,
  Upload,
  Users,
  X
} from 'lucide-react'
import type {
  InviteActivityTag,
  InviteDashboardData,
  InviteManualRecordPayload,
  InviteMemberTraceFilters,
  InviteMemberTraceRow,
  InviteScanLog,
  InviteStatsGroupRow
} from '../types/electron'
import * as configService from '../services/config'
import './InviteStatsPage.scss'

type ViewKey = 'dashboard' | 'groups' | 'trace' | 'pending'
type ChartMode = 'bar' | 'pie'
type GroupSortKey = 'member_count' | 'today_join_count' | 'today_quit_count' | 'last_scan_time' | 'recent_invite_time'
type ManualInviteMode = 'confirm' | 'add'

type ManualInviteFormState = {
  groupId: string
  user: string
  wxId: string
  inviter: string
  inviterWxId: string
}

const viewItems: Array<{ key: ViewKey; label: string; icon: typeof BarChart3 }> = [
  { key: 'dashboard', label: '数据大屏', icon: BarChart3 },
  { key: 'groups', label: '发售群列表', icon: Tags },
  { key: 'trace', label: '群成员溯源', icon: Users },
  { key: 'pending', label: '待确认记录', icon: Check }
]

const groupSortOptions: Array<{ value: GroupSortKey; label: string }> = [
  { value: 'member_count', label: '成员数' },
  { value: 'today_join_count', label: '今日新增' },
  { value: 'today_quit_count', label: '今日退群' },
  { value: 'recent_invite_time', label: '最近邀请' },
  { value: 'last_scan_time', label: '最近扫描' }
]

const traceStatusOptions = [
  { value: '', label: '全部状态' },
  { value: 'active', label: '未退出群' },
  { value: 'quit', label: '已退出群' },
  { value: 'pending', label: '待确认' }
]

const traceAttributionOptions = [
  { value: '', label: '全部归因' },
  { value: 'valid', label: '有效' },
  { value: 'invalid', label: '无效' },
  { value: 'pending', label: '待确认' }
]

const toDateInput = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const dateTimeSeconds = (date: string): number | undefined => {
  if (!date) return undefined
  const time = new Date(date).getTime()
  return Number.isNaN(time) ? undefined : Math.floor(time / 1000)
}

const formatNumber = (value?: number): string => {
  return new Intl.NumberFormat('zh-CN').format(Number(value || 0))
}

const formatTime = (seconds?: number): string => {
  if (!seconds) return '-'
  return new Date(seconds * 1000).toLocaleString('zh-CN', { hour12: false })
}

const formatShortTime = (seconds?: number): string => {
  if (!seconds) return '-'
  return new Date(seconds * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

const joinTypeLabel = (value?: string): string => {
  if (value === 'invite') return '邀请'
  if (value === 'qrcode') return '扫码'
  if (value === 'direct') return '直接入群'
  return '未知'
}

const quitTypeLabel = (value?: string): string => {
  if (value === 'self_quit') return '主动退群'
  if (value === 'removed') return '被移出'
  return '退群'
}

const statusLabel = (value?: string): string => {
  if (value === 'confirmed') return '已确认'
  if (value === 'pending') return '待确认'
  if (value === 'ignored') return '已忽略'
  return value || '-'
}

const scanModeLabel = (value?: string): string => {
  if (value === 'quit-check') return '检查是否退出群'
  return '增量扫描'
}

const isTraceQuitRow = (row: InviteMemberTraceRow): boolean => {
  return row.status !== 'ignored' && (row.event_type === 'quit' || row.delete_flag === 1)
}

const traceStatusLabel = (row: InviteMemberTraceRow): string => {
  if (row.status === 'pending') return '待确认'
  if (isTraceQuitRow(row)) return '已退出群'
  return '未退出群'
}

const traceStatusClass = (row: InviteMemberTraceRow): string => {
  if (row.status === 'pending') return 'pending'
  if (isTraceQuitRow(row)) return 'quit'
  return 'active'
}

const traceAttributionLabel = (row: InviteMemberTraceRow): string => {
  if (row.status === 'ignored') return '无效'
  if (row.status !== 'confirmed') return '待确认'
  if (row.event_type !== 'invite') return '-'
  if (row.valid_flag === 1) return '有效'
  if (row.valid_flag === -1) return '无效'
  return '-'
}

const inferExportFormat = (filePath: string): 'csv' | 'xlsx' => {
  return filePath.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx'
}

const fileNameDate = (): string => toDateInput(new Date()).replace(/-/g, '')

const formatCompactDateTime = (value: string): string => {
  if (!value) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value)
  if (!match) return ''
  return `${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6] || '00'}`
}

function CompactDateTimeRange(props: {
  start: string
  end: string
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  ariaLabel: string
}) {
  const [open, setOpen] = useState(false)
  const display = props.start || props.end
    ? `${formatCompactDateTime(props.start) || '开始'} - ${formatCompactDateTime(props.end) || '结束'}`
    : '选择时间段'

  return (
    <div className="invite-compact-range">
      <button
        type="button"
        className={props.start || props.end ? 'has-value' : ''}
        onClick={() => setOpen((value) => !value)}
        aria-label={props.ariaLabel}
      >
        <Clock size={14} />
        <span>{display}</span>
      </button>
      {open && (
        <div className="invite-compact-range-popover">
          <input
            type="datetime-local"
            step={1}
            value={props.start}
            onChange={(event) => props.onStartChange(event.target.value)}
            aria-label={`${props.ariaLabel} start`}
          />
          <span aria-hidden="true">-</span>
          <input
            type="datetime-local"
            step={1}
            value={props.end}
            onChange={(event) => props.onEndChange(event.target.value)}
            aria-label={`${props.ariaLabel} end`}
          />
          {(props.start || props.end) && (
            <button
              type="button"
              className="invite-compact-range-clear"
              onClick={() => {
                props.onStartChange('')
                props.onEndChange('')
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function InviteStatsPage() {
  const [activeView, setActiveView] = useState<ViewKey>('dashboard')
  const [tags, setTags] = useState<InviteActivityTag[]>([])
  const [groups, setGroups] = useState<InviteStatsGroupRow[]>([])
  const [selectedTagId, setSelectedTagId] = useState('')
  const [includeQuitMembers, setIncludeQuitMembers] = useState(false)
  const [chartMode, setChartMode] = useState<ChartMode>('bar')
  const [rankingGroupId, setRankingGroupId] = useState('')
  const [rankingStartDateTime, setRankingStartDateTime] = useState('')
  const [rankingEndDateTime, setRankingEndDateTime] = useState('')
  const [traceStartDateTime, setTraceStartDateTime] = useState('')
  const [traceEndDateTime, setTraceEndDateTime] = useState('')
  const [groupSearch, setGroupSearch] = useState('')
  const [groupSort, setGroupSort] = useState<GroupSortKey>('member_count')
  const [groupUnitTagFilter, setGroupUnitTagFilter] = useState('')
  const [dashboard, setDashboard] = useState<InviteDashboardData | null>(null)
  const [traceRows, setTraceRows] = useState<InviteMemberTraceRow[]>([])
  const [traceTotal, setTraceTotal] = useState(0)
  const [pendingRows, setPendingRows] = useState<InviteMemberTraceRow[]>([])
  const [scanLogs, setScanLogs] = useState<InviteScanLog[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isDashboardLoading, setIsDashboardLoading] = useState(false)
  const [rawPreview, setRawPreview] = useState<InviteMemberTraceRow | null>(null)
  const [manualInviteDialog, setManualInviteDialog] = useState<{ mode: ManualInviteMode; row: InviteMemberTraceRow } | null>(null)
  const [manualInviteForm, setManualInviteForm] = useState<ManualInviteFormState>({
    groupId: '',
    user: '',
    wxId: '',
    inviter: '',
    inviterWxId: ''
  })
  const [isSavingManualInvite, setIsSavingManualInvite] = useState(false)
  const [createTagDialogOpen, setCreateTagDialogOpen] = useState(false)
  const [createTagName, setCreateTagName] = useState('')
  const [isCreatingTag, setIsCreatingTag] = useState(false)
  const [remoteSyncDialogOpen, setRemoteSyncDialogOpen] = useState(false)
  const [remoteSyncUrl, setRemoteSyncUrl] = useState('')
  const [remoteSyncToken, setRemoteSyncToken] = useState('')
  const [isSavingRemoteSync, setIsSavingRemoteSync] = useState(false)
  const [isRemoteSyncing, setIsRemoteSyncing] = useState(false)
  const [isResettingInviteStats, setIsResettingInviteStats] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [traceFilters, setTraceFilters] = useState<InviteMemberTraceFilters>({
    includeQuit: true,
    limit: 200
  })
  const [toast, setToast] = useState('')

  const selectedTag = useMemo(
    () => tags.find((tag) => tag.tag_id === selectedTagId),
    [tags, selectedTagId]
  )

  const rankingStartTime = useMemo(() => dateTimeSeconds(rankingStartDateTime), [rankingStartDateTime])
  const rankingEndTime = useMemo(() => dateTimeSeconds(rankingEndDateTime), [rankingEndDateTime])
  const traceStartTime = useMemo(() => dateTimeSeconds(traceStartDateTime), [traceStartDateTime])
  const traceEndTime = useMemo(() => dateTimeSeconds(traceEndDateTime), [traceEndDateTime])

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }, [])

  const openRemoteSyncSettings = useCallback(async () => {
    const config = await window.electronAPI.inviteStats.getRemoteSyncConfig()
    setRemoteSyncUrl(config.endpoint || '')
    setRemoteSyncToken(config.token || '')
    setResetConfirmText('')
    setRemoteSyncDialogOpen(true)
  }, [])

  const resolveRemoteSyncOptions = useCallback(async () => {
    const cachedEndpoint = remoteSyncUrl.trim()
    const cachedToken = remoteSyncToken.trim()
    if (cachedEndpoint && cachedToken) {
      return { endpoint: cachedEndpoint, token: cachedToken }
    }

    const config = await window.electronAPI.inviteStats.getRemoteSyncConfig()
    const endpoint = cachedEndpoint || config.endpoint || ''
    const token = cachedToken || config.token || ''
    if (!cachedEndpoint && config.endpoint) setRemoteSyncUrl(config.endpoint)
    if (!cachedToken && config.token) setRemoteSyncToken(config.token)
    return { endpoint: endpoint.trim(), token: token.trim() }
  }, [remoteSyncToken, remoteSyncUrl])

  const saveRemoteSyncSettings = async () => {
    setIsSavingRemoteSync(true)
    try {
      await Promise.all([
        configService.setInviteRemoteSyncUrl(remoteSyncUrl),
        configService.setInviteRemoteSyncToken(remoteSyncToken)
      ])
      showToast('远程同步设置已保存')
      setRemoteSyncDialogOpen(false)
    } finally {
      setIsSavingRemoteSync(false)
    }
  }

  const syncRemoteNow = async (closeDialog = true) => {
    setIsRemoteSyncing(true)
    try {
      const options = await resolveRemoteSyncOptions()
      await Promise.all([
        configService.setInviteRemoteSyncUrl(options.endpoint),
        configService.setInviteRemoteSyncToken(options.token)
      ])
      const result = await window.electronAPI.inviteStats.syncRemote(options)
      if (!result.success) {
        showToast(result.error || '远程同步失败')
        return
      }
      const total = Object.values(result.counts || {}).reduce((sum, count) => sum + Number(count || 0), 0)
      showToast(total > 0 ? `远程同步完成：${total} 条变更` : '远程同步完成，暂无新变更')
      if (closeDialog) setRemoteSyncDialogOpen(false)
    } finally {
      setIsRemoteSyncing(false)
    }
  }

  const copyRawPreview = async () => {
    const text = rawPreview?.raw_content || ''
    if (!text.trim()) {
      showToast('暂无可复制内容')
      return
    }

    try {
      await navigator.clipboard.writeText(text)
      showToast('原始消息已复制')
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.setAttribute('readonly', 'true')
      textarea.style.position = 'fixed'
      textarea.style.top = '-9999px'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      const copied = document.execCommand('copy')
      document.body.removeChild(textarea)
      showToast(copied ? '原始消息已复制' : '复制失败，请手动选择文本复制')
    }
  }

  const resetInviteStatsData = async () => {
    if (resetConfirmText !== 'RESET') {
      showToast('请输入 RESET 后再恢复初始化')
      return
    }

    const confirmed = window.confirm('恢复初始化会删除本地邀请统计记录，并清空远端邀请统计相关表数据。该操作不可撤销，确定继续吗？')
    if (!confirmed) return

    setIsResettingInviteStats(true)
    try {
      await Promise.all([
        configService.setInviteRemoteSyncUrl(remoteSyncUrl),
        configService.setInviteRemoteSyncToken(remoteSyncToken)
      ])
      const result = await window.electronAPI.inviteStats.resetAllData({
        endpoint: remoteSyncUrl.trim(),
        token: remoteSyncToken.trim()
      })
      if (!result.success) {
        showToast(result.error || '恢复初始化失败')
        return
      }
      setRemoteSyncDialogOpen(false)
      setResetConfirmText('')
      setSelectedTagId('')
      setDashboard(null)
      setTraceRows([])
      setTraceTotal(0)
      setPendingRows([])
      setScanLogs([])
      setRankingGroupId('')
      setTraceFilters((prev) => ({ ...prev, groupId: undefined, keyword: '' }))
      showToast('已恢复初始化')
      await refreshMeta()
    } finally {
      setIsResettingInviteStats(false)
    }
  }

  const refreshMeta = useCallback(async (preferredTagId?: string) => {
    setIsLoading(true)
    try {
      const [tagResult, groupResult, scanResult] = await Promise.all([
        window.electronAPI.inviteStats.listActivityTags(),
        window.electronAPI.inviteStats.listGroups(),
        window.electronAPI.inviteStats.getScanStatus()
      ])
      const nextTags = tagResult.success ? (tagResult.data || []) : []
      const nextGroups = groupResult.success ? (groupResult.data || []) : []
      setTags(nextTags)
      setGroups(nextGroups)
      if (scanResult.success && scanResult.data) {
        setIsScanning(scanResult.data.running)
        setScanLogs(scanResult.data.logs || [])
      }

      const candidateTagId = preferredTagId || selectedTagId
      const stillExists = nextTags.some((tag) => tag.tag_id === candidateTagId)
      const fallbackTag = nextTags.find((tag) => tag.enabled) || nextTags[0]
      setSelectedTagId(stillExists ? candidateTagId : (fallbackTag?.tag_id || ''))

      if (!tagResult.success) showToast(tagResult.error || '活动标签读取失败')
      if (!groupResult.success) showToast(groupResult.error || '群列表读取失败')
    } finally {
      setIsLoading(false)
    }
  }, [selectedTagId, showToast])

  const loadDashboard = useCallback(async () => {
    if (!selectedTagId) {
      setDashboard(null)
      return
    }
    setIsDashboardLoading(true)
    try {
      const result = await window.electronAPI.inviteStats.getDashboard({
        tagId: selectedTagId,
        startTime: rankingStartTime,
        endTime: rankingEndTime,
        includeQuitMembers,
        rankingGroupId: rankingGroupId || undefined
      })
      if (result.success) {
        setDashboard(result.data || null)
        if (result.data?.scanStatus) {
          setIsScanning(result.data.scanStatus.running)
          setScanLogs(result.data.scanStatus.logs || [])
        }
      } else {
        showToast(result.error || '数据大屏读取失败')
      }
    } finally {
      setIsDashboardLoading(false)
    }
  }, [includeQuitMembers, rankingEndTime, rankingGroupId, rankingStartTime, selectedTagId, showToast])

  const loadTrace = useCallback(async () => {
    if (!selectedTagId) {
      setTraceRows([])
      setTraceTotal(0)
      return
    }
    const result = await window.electronAPI.inviteStats.getMemberTrace({
      ...traceFilters,
      tagId: selectedTagId,
      startTime: traceStartTime,
      endTime: traceEndTime
    })
    if (result.success) {
      setTraceRows(result.data?.rows || [])
      setTraceTotal(result.data?.total || 0)
    } else {
      showToast(result.error || '成员溯源读取失败')
    }
  }, [selectedTagId, showToast, traceEndTime, traceFilters, traceStartTime])

  const loadPending = useCallback(async () => {
    const result = await window.electronAPI.inviteStats.listPending({ tagId: selectedTagId || undefined })
    if (result.success) {
      setPendingRows(result.data || [])
    } else {
      showToast(result.error || '待确认记录读取失败')
    }
  }, [selectedTagId, showToast])

  const openManualInviteDialog = useCallback((
    row: InviteMemberTraceRow,
    mode: ManualInviteMode,
    memberName?: string
  ) => {
    const fallbackGroup = groups.find((group) => group.tag_id === selectedTagId && group.binding_enabled)
    const contextMember = (row.source_context_members || []).find((name) => name && name !== row.user)
    setManualInviteDialog({ mode, row })
    setManualInviteForm({
      groupId: row.group_id || fallbackGroup?.group_id || '',
      user: mode === 'add' ? (memberName || contextMember || '') : (row.user || ''),
      wxId: mode === 'add' ? '' : (row.wx_id || ''),
      inviter: row.inviter || '',
      inviterWxId: row.inviter_wx_id || ''
    })
  }, [groups, selectedTagId])

  const closeManualInviteDialog = useCallback(() => {
    if (isSavingManualInvite) return
    setManualInviteDialog(null)
    setManualInviteForm({
      groupId: '',
      user: '',
      wxId: '',
      inviter: '',
      inviterWxId: ''
    })
  }, [isSavingManualInvite])

  const submitManualInviteForm = useCallback(async () => {
    if (!manualInviteDialog) return
    const groupId = manualInviteForm.groupId.trim()
    const wxId = manualInviteForm.wxId.trim()
    const inviterWxId = manualInviteForm.inviterWxId.trim()
    const user = manualInviteForm.user.trim()
    const inviter = manualInviteForm.inviter.trim()
    const requiresInviterWxId = manualInviteDialog.mode === 'add' || (inviter && inviter !== '未知来源')
    if (!groupId || !wxId || (requiresInviterWxId && !inviterWxId) || (manualInviteDialog.mode === 'add' && (!user || !inviter))) {
      showToast(manualInviteDialog.mode === 'add' ? '请补齐新增记录所需的信息' : '请补齐群 ID、被邀请人微信 ID')
      return
    }

    setIsSavingManualInvite(true)
    try {
      const row = manualInviteDialog.row
      const result = manualInviteDialog.mode === 'confirm'
        ? await window.electronAPI.inviteStats.confirmPending({
          eventType: 'invite',
          eventId: row.id,
          groupId,
          wxId,
          inviterWxId
        })
        : await window.electronAPI.inviteStats.addManualInviteRecord({
          sourceEventId: row.id,
          tagId: selectedTagId || row.activity_tag_id,
          groupId,
          user,
          wxId,
          inviter,
          inviterWxId,
          inviteTime: row.event_time
        } satisfies InviteManualRecordPayload)

      if (!result.success) {
        showToast(result.error || '补充信息保存失败')
        return
      }
      showToast(manualInviteDialog.mode === 'confirm' ? '待确认邀请已标记有效' : '补充邀请记录已添加')
      setManualInviteDialog(null)
      await Promise.all([
        loadPending(),
        loadDashboard(),
        loadTrace()
      ])
    } finally {
      setIsSavingManualInvite(false)
    }
  }, [loadDashboard, loadPending, loadTrace, manualInviteDialog, manualInviteForm, selectedTagId, showToast])

  useEffect(() => {
    void refreshMeta()
  }, [])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    if (activeView === 'trace') void loadTrace()
    if (activeView === 'pending') void loadPending()
  }, [activeView, loadPending, loadTrace])

  useEffect(() => {
    const timer = window.setInterval(async () => {
      const result = await window.electronAPI.inviteStats.getScanStatus()
      if (result.success && result.data) {
        const wasScanning = isScanning
        setIsScanning(result.data.running)
        setScanLogs(result.data.logs || [])
        if (wasScanning && !result.data.running) {
          void refreshMeta(selectedTagId)
          void loadDashboard()
          if (activeView === 'trace') void loadTrace()
          if (activeView === 'pending') void loadPending()
        }
      }
    }, 5000)
    return () => window.clearInterval(timer)
  }, [activeView, isScanning, loadDashboard, loadPending, loadTrace, refreshMeta, selectedTagId])

  const createActivityTag = () => {
    setCreateTagName('')
    setCreateTagDialogOpen(true)
  }

  const closeCreateTagDialog = () => {
    if (isCreatingTag) return
    setCreateTagDialogOpen(false)
    setCreateTagName('')
  }

  const submitCreateActivityTag = async () => {
    const tagName = createTagName.trim()
    if (!tagName) return
    setIsCreatingTag(true)
    const result = await window.electronAPI.inviteStats.saveActivityTag({ tagName, enabled: true })
    setIsCreatingTag(false)
    if (!result.success || !result.data) {
      showToast(result.error || '活动创建失败')
      return
    }
    setCreateTagDialogOpen(false)
    setCreateTagName('')
    showToast('活动已创建')
    await refreshMeta(result.data.tag_id)
  }

  const deleteActivityTag = async () => {
    if (!selectedTag) return
    const confirmed = window.confirm(`删除「${selectedTag.tag_name}」会同时清除该活动标签下的群绑定、邀请记录、退群记录、扫描日志和人工绑定。确定删除吗？`)
    if (!confirmed) return
    const result = await window.electronAPI.inviteStats.deleteActivityTag(selectedTag.tag_id)
    if (!result.success) {
      showToast(result.error || '活动标签删除失败')
      return
    }
    setRankingGroupId('')
    setTraceFilters((prev) => ({ ...prev, groupId: undefined }))
    showToast('活动标签已删除')
    await refreshMeta()
  }

  const scanSelectedTag = async () => {
    if (!selectedTagId || isScanning) return
    setIsScanning(true)
    const result = await window.electronAPI.inviteStats.scanActivity(selectedTagId)
    if (!result.success) {
      showToast(result.error || '扫描失败')
      setIsScanning(false)
      await refreshMeta(selectedTagId)
      return
    }
    if (result.running) {
      showToast('已有扫描任务正在运行')
    } else {
      showToast('增量扫描已开始，后台异步执行')
    }
    await refreshMeta(selectedTagId)
    await loadDashboard()
    if (activeView === 'trace') await loadTrace()
    if (activeView === 'pending') await loadPending()
  }

  const checkQuitSelectedTag = async () => {
    if (!selectedTagId || isScanning) return
    setIsScanning(true)
    const result = await window.electronAPI.inviteStats.checkQuitGroups(selectedTagId)
    if (!result.success) {
      showToast(result.error || '退出群检查失败')
      setIsScanning(false)
      await refreshMeta(selectedTagId)
      return
    }
    showToast(result.running ? '已有扫描任务正在运行' : '退出群检查已开始，后台异步执行')
    await refreshMeta(selectedTagId)
    await loadDashboard()
    if (activeView === 'trace') await loadTrace()
    if (activeView === 'pending') await loadPending()
  }

  const updateGroupTag = async (groupId: string, tagId: string) => {
    const result = tagId
      ? await window.electronAPI.inviteStats.setGroupTag(groupId, tagId)
      : await window.electronAPI.inviteStats.clearGroupTag(groupId)
    if (!result.success) {
      showToast(result.error || '群标签更新失败')
      return
    }
    await refreshMeta(selectedTagId)
    await loadDashboard()
  }

  const chooseExportPath = async (title: string, defaultPath: string) => {
    const result = await window.electronAPI.dialog.saveFile({
      title,
      defaultPath,
      filters: [
        { name: 'Excel 工作簿', extensions: ['xlsx'] },
        { name: 'CSV 文件', extensions: ['csv'] }
      ]
    })
    return result.canceled ? '' : (result.filePath || '')
  }

  const exportInviteRanking = async () => {
    if (!selectedTagId) return
    const filePath = await chooseExportPath('导出邀请排行榜', `邀请排行榜-${selectedTag?.tag_name || '活动'}-${fileNameDate()}.xlsx`)
    if (!filePath) return
    const result = await window.electronAPI.inviteStats.exportInviteRanking({
      filePath,
      format: inferExportFormat(filePath),
      tagId: selectedTagId,
      startTime: rankingStartTime,
      endTime: rankingEndTime,
      groupId: rankingGroupId || undefined
    })
    showToast(result.success ? `已导出 ${result.count || 0} 条排行榜` : (result.error || '导出失败'))
  }

  const exportTrace = async () => {
    if (!selectedTagId) return
    const filePath = await chooseExportPath('导出成员溯源', `成员溯源-${selectedTag?.tag_name || '活动'}-${fileNameDate()}.xlsx`)
    if (!filePath) return
    const result = await window.electronAPI.inviteStats.exportMemberTrace({
      ...traceFilters,
      filePath,
      format: inferExportFormat(filePath),
      tagId: selectedTagId,
      startTime: traceStartTime,
      endTime: traceEndTime
    })
    showToast(result.success ? `已导出 ${result.count || 0} 条明细` : (result.error || '导出失败'))
  }

  const exportRawEvents = async () => {
    const filePath = await chooseExportPath('导出原始事件', `原始事件-${selectedTag?.tag_name || '全部'}-${fileNameDate()}.xlsx`)
    if (!filePath) return
    const result = await window.electronAPI.inviteStats.exportRawEvents({
      filePath,
      format: inferExportFormat(filePath),
      tagId: selectedTagId || undefined
    })
    showToast(result.success ? `已导出 ${result.count || 0} 条原始事件` : (result.error || '导出失败'))
  }

  const markPendingValid = async (row: InviteMemberTraceRow) => {
    if (row.event_type === 'invite') {
      openManualInviteDialog(row, 'confirm')
      return
    }
    const payload: {
      eventType: 'invite' | 'quit'
      eventId: string
      groupId?: string
      wxId?: string
      inviterWxId?: string
      operatorWxId?: string
    } = {
      eventType: row.event_type,
      eventId: row.id,
      groupId: row.group_id || undefined,
      wxId: row.wx_id || undefined
    }
    if (row.inviter_wx_id) {
      payload.inviterWxId = row.inviter_wx_id
    }
    if (row.operator_wx_id) {
      payload.operatorWxId = row.operator_wx_id
    }
    const result = await window.electronAPI.inviteStats.confirmPending(payload)
    if (!result.success) {
      showToast(result.error || '标记有效失败')
      return
    }
    showToast('记录已标记为有效')
    await loadPending()
    await loadDashboard()
    await loadTrace()
  }

  const markPendingInvalid = async (row: InviteMemberTraceRow) => {
    const result = await window.electronAPI.inviteStats.ignorePending({
      eventType: row.event_type,
      eventId: row.id
    })
    if (!result.success) {
      showToast(result.error || '标记无效失败')
      return
    }
    showToast('记录已标记为无效')
    await loadPending()
    await loadDashboard()
  }

  const filteredGroups = useMemo(() => {
    const keyword = groupSearch.trim().toLowerCase()
    return groups
      .filter((group) => {
        let unitMatches = true
        if (groupUnitTagFilter === '__unset') unitMatches = !group.binding_enabled
        else if (groupUnitTagFilter && groupUnitTagFilter !== '__all') {
          unitMatches = group.binding_enabled && group.tag_id === groupUnitTagFilter
        }
        if (!unitMatches) return false
        if (!keyword) return true
        return [
          group.group_name,
          group.group_id,
          group.tag_name
        ].some((value) => String(value || '').toLowerCase().includes(keyword))
      })
      .sort((a, b) => Number(b[groupSort] || 0) - Number(a[groupSort] || 0))
  }, [groupSearch, groupSort, groupUnitTagFilter, groups])

  const tagGroups = useMemo(
    () => groups.filter((group) => group.tag_id === selectedTagId && group.binding_enabled),
    [groups, selectedTagId]
  )

  useEffect(() => {
    const tagGroupIds = new Set(tagGroups.map((group) => group.group_id))
    if (rankingGroupId && !tagGroupIds.has(rankingGroupId)) setRankingGroupId('')
    if (traceFilters.groupId && !tagGroupIds.has(traceFilters.groupId)) {
      setTraceFilters((prev) => ({ ...prev, groupId: undefined }))
    }
  }, [rankingGroupId, tagGroups, traceFilters.groupId])

  useEffect(() => {
    setGroupUnitTagFilter(selectedTagId || '__all')
  }, [selectedTagId])

  const hourlyOption = useMemo(() => {
    const rows = dashboard?.hourlyDistribution || []
    return {
      color: ['#3b82f6'],
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 18, top: 24, bottom: 32 },
      xAxis: {
        type: 'category',
        data: rows.map((item) => `${item.hour}时`),
        axisLine: { lineStyle: { color: '#d5dbea' } },
        axisLabel: { color: '#7a8499' }
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#7a8499' },
        splitLine: { lineStyle: { color: '#edf1f7' } }
      },
      series: [{
        type: 'line',
        smooth: true,
        data: rows.map((item) => item.count),
        symbolSize: 6,
        areaStyle: { color: 'rgba(59, 130, 246, 0.12)' },
        lineStyle: { width: 3 }
      }]
    }
  }, [dashboard])

  const rankingOption = useMemo(() => {
    const rows = dashboard?.inviteRanking || []
    if (chartMode === 'pie') {
      return {
        color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'],
        tooltip: { trigger: 'item' },
        series: [{
          type: 'pie',
          radius: ['46%', '72%'],
          center: ['50%', '52%'],
          label: { formatter: '{b}\n{c}' },
          data: rows.map((row) => ({ name: row.inviter || '未知来源', value: row.invite_count }))
        }]
      }
    }
    return {
      color: ['#10b981'],
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 96, right: 28, top: 18, bottom: 28 },
      xAxis: {
        type: 'value',
        axisLabel: { color: '#7a8499' },
        splitLine: { lineStyle: { color: '#edf1f7' } }
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: rows.map((row) => row.inviter || '未知来源'),
        axisLabel: { color: '#4b5563', width: 84, overflow: 'truncate' }
      },
      series: [{
        type: 'bar',
        data: rows.map((row) => row.invite_count),
        barWidth: 12,
        itemStyle: { borderRadius: [0, 8, 8, 0] },
        label: { show: true, position: 'right' }
      }]
    }
  }, [chartMode, dashboard])

  const cards = dashboard?.cards
  const latestLog = scanLogs[0]
  const latestScanModeLabel = scanModeLabel(latestLog?.scan_mode)
  const latestScanText = latestLog
    ? `${latestScanModeLabel} · ${formatShortTime(latestLog.finished_at || latestLog.started_at)} · ${statusLabel(latestLog.status)}`
    : '尚未扫描'
  const pendingBadgeCount = dashboard?.cards?.pendingCount || pendingRows.length
  const groupRankRows = (dashboard?.groupRanking || []).slice(0, 6)
  const maxGroupMemberCount = Math.max(1, ...groupRankRows.map((group) => Number(group.member_count || 0)))
  const canManageTags = activeView === 'groups'
  const manualSelectedGroupExists = tagGroups.some((group) => group.group_id === manualInviteForm.groupId)

  return (
    <div className="invite-stats-page">
      {toast && <div className="invite-toast">{toast}</div>}

      <header className="invite-topbar">
        <nav className="invite-screen-nav" aria-label="邀请统计视图">
          {viewItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.key}
                className={activeView === item.key ? 'active' : ''}
                onClick={() => setActiveView(item.key)}
              >
                <Icon size={16} />
                <span>{item.label}</span>
                {item.key === 'pending' && pendingBadgeCount > 0 && <strong>{pendingBadgeCount}</strong>}
              </button>
            )
          })}
        </nav>
        <button
          type="button"
          className="invite-sync-settings-btn"
          onClick={() => void openRemoteSyncSettings()}
          title="远程同步设置"
          aria-label="远程同步设置"
        >
          <Settings size={17} />
        </button>
      </header>

      <main className="invite-screen">
        <section className={`invite-toolbar ${canManageTags ? 'with-management' : 'compact'}`}>
          <div className="invite-field activity">
            <label>活动标签</label>
            <div className={`invite-tag-control ${canManageTags ? 'with-delete' : ''}`}>
              <select
                value={selectedTagId}
                onChange={(event) => {
                  setSelectedTagId(event.target.value)
                  setRankingGroupId('')
                  setTraceFilters((prev) => ({ ...prev, groupId: undefined }))
                }}
              >
                <option value="">请选择活动标签</option>
                {tags.map((tag) => (
                  <option key={tag.tag_id} value={tag.tag_id}>{tag.tag_name}</option>
                ))}
              </select>
              {canManageTags && (
                <button type="button" onClick={deleteActivityTag} disabled={!selectedTagId || isScanning} title="删除活动标签" className="danger">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
          <div className="invite-scan-actions">
            <button className="invite-primary-btn" onClick={() => void scanSelectedTag()} disabled={!selectedTagId || isScanning}>
              {isScanning ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
              <span>{isScanning ? '扫描中' : '增量扫描'}</span>
            </button>
            <button className="invite-sync-now-btn" onClick={() => void syncRemoteNow(false)} disabled={isRemoteSyncing || isResettingInviteStats}>
              {isRemoteSyncing ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
              <span>{isRemoteSyncing ? '同步中' : '同步本地数据'}</span>
            </button>
            <button className="invite-quit-check-btn" onClick={() => void checkQuitSelectedTag()} disabled={!selectedTagId || isScanning}>
              {isScanning ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
              <span>检查是否退出群</span>
            </button>
          </div>
          {canManageTags && (
            <button className="invite-create-tag-btn" type="button" onClick={createActivityTag}>
              <Plus size={16} />
              <span>创建活动标签</span>
            </button>
          )}
        </section>

      {!selectedTagId && (
        <div className="invite-empty-state">
          <Tags size={38} />
          <h2>先创建一个活动标签</h2>
          <p>活动标签会把多个微信群归为同一次发售或活动统计口径。</p>
        </div>
      )}

      {selectedTagId && activeView === 'dashboard' && (
        <>
          <section className="invite-metrics">
            <article className="invite-metric-card blue">
              <div className="invite-metric-icon"><Sparkles size={24} /></div>
              <div><strong>{formatNumber(cards?.activeBotCount || 0)}</strong><span>活跃机器人</span></div>
            </article>
            <article className="invite-metric-card green">
              <div className="invite-metric-icon"><Tags size={24} /></div>
              <div><strong>{formatNumber(cards?.groupCount || tagGroups.length)}</strong><span>监控群组</span></div>
            </article>
            <article className="invite-metric-card amber">
              <div className="invite-metric-icon"><Users size={24} /></div>
              <div>
                <strong>{formatNumber(cards?.totalMembers || 0)}</strong>
                <span>{includeQuitMembers ? '总成员数含退群' : '总成员数仅在群'}</span>
              </div>
              <label className="invite-metric-toggle">
                <input
                  type="checkbox"
                  checked={includeQuitMembers}
                  onChange={(event) => setIncludeQuitMembers(event.target.checked)}
                />
                <span>含退群</span>
              </label>
            </article>
            <article className="invite-metric-card violet">
              <div className="invite-metric-icon"><BarChart3 size={24} /></div>
              <div><strong>{formatNumber(cards?.todayNewMembers || 0)}</strong><span>今日新增</span></div>
            </article>
            <article className="invite-metric-card red">
              <div className="invite-metric-icon"><Check size={24} /></div>
              <div><strong>{formatNumber(cards?.todayQuitMembers || 0)}</strong><span>今日退群</span></div>
            </article>
          </section>

          <section className="invite-dashboard-main">
            <div className="invite-left-column">
              <section className="invite-panel invite-hour-panel">
                <div className="invite-panel-title">
                  <div>
                    <h2>进群时段分布</h2>
                    <p>按当前活动标签全部有效入群记录统计</p>
                  </div>
                  {isDashboardLoading && <Loader2 size={16} className="spin" />}
                </div>
                <ReactECharts option={hourlyOption} style={{ height: 260 }} />
              </section>

              <section className="invite-panel invite-group-rank">
                <div className="invite-panel-title">
                  <div>
                    <h2>群人数展示</h2>
                    <p>按当前活动标签下监控群组排序</p>
                  </div>
                  <button onClick={exportRawEvents} title="导出原始事件"><FileSpreadsheet size={15} /></button>
                </div>
                <div className="invite-list">
                  {groupRankRows.map((group, index) => (
                    <div className="invite-rank-line" key={group.group_id}>
                      <b className={index > 0 ? 'muted' : ''}>{index + 1}</b>
                      <div>
                        <span>{group.group_name}</span>
                        <div className="invite-mini-bar"><i style={{ width: `${Math.max(8, Math.round((Number(group.member_count || 0) / maxGroupMemberCount) * 100))}%` }} /></div>
                      </div>
                      <strong>{formatNumber(group.member_count)} 人</strong>
                    </div>
                  ))}
                  {groupRankRows.length === 0 && <div className="invite-muted">暂无群人数数据</div>}
                </div>
              </section>
            </div>

            <section className="invite-panel invite-ranking-panel">
              <div className="invite-panel-title">
                <div>
                  <h2>邀请人数排行榜</h2>
                  <p>【{selectedTag?.tag_name || '当前活动'}】招募者 {dashboard?.inviteRanking?.length || 0} 名，有效入群人数 {formatNumber(cards?.totalMembers || 0)}</p>
                </div>
                <div className="invite-segment">
                  <button className={chartMode === 'bar' ? 'active' : ''} onClick={() => setChartMode('bar')} title="柱状图">
                    <BarChart3 size={15} />
                  </button>
                  <button className={chartMode === 'pie' ? 'active' : ''} onClick={() => setChartMode('pie')} title="饼图">
                    <PieChart size={15} />
                  </button>
                  <button onClick={exportInviteRanking} title="导出排行榜">
                    <Download size={15} />
                  </button>
                </div>
              </div>
              <div className="invite-ranking-tools">
                <select value={rankingGroupId} onChange={(event) => setRankingGroupId(event.target.value)}>
                  <option value="">当前活动下全部群</option>
                  {tagGroups.map((group) => (
                    <option key={group.group_id} value={group.group_id}>{group.group_name}</option>
                  ))}
                </select>
                <CompactDateTimeRange
                  start={rankingStartDateTime}
                  end={rankingEndDateTime}
                  onStartChange={setRankingStartDateTime}
                  onEndChange={setRankingEndDateTime}
                  ariaLabel="ranking time range"
                />
              </div>
              <ReactECharts option={rankingOption} style={{ height: 390 }} />
            </section>

            <aside className="invite-right-column">
              <section className="invite-panel invite-activity-panel">
                <div className="invite-panel-title">
                  <h2>实时动态</h2>
                  <span className={isScanning ? 'invite-status running' : 'invite-status'}>{isScanning ? '扫描中' : '空闲'}</span>
                </div>
                <div className="invite-activity-list">
                  {(dashboard?.recentActivities || []).slice(0, 9).map((row) => (
                    <div className="invite-activity-line" key={`${row.event_type}-${row.id}`}>
                      <div className="invite-activity-avatar">{row.head_img ? <img src={row.head_img} alt="" /> : <Clock size={15} />}</div>
                      <div>
                        <strong>{row.user || '未知成员'}</strong>
                        <span>{isTraceQuitRow(row) ? '已退出群' : row.event_type === 'invite' ? `${joinTypeLabel(row.join_type)} · ${row.inviter || '未知来源'}` : quitTypeLabel(row.quit_type)}</span>
                        <em>{row.group_name}</em>
                      </div>
                      <time>{formatShortTime(row.event_time)}</time>
                    </div>
                  ))}
                  {(!dashboard?.recentActivities || dashboard.recentActivities.length === 0) && <div className="invite-muted">暂无动态</div>}
                </div>
                <div className="invite-scan-foot">
                  <span>最近扫描</span>
                  <strong>{latestScanText}</strong>
                </div>
              </section>
            </aside>
          </section>
        </>
      )}

      {selectedTagId && activeView === 'groups' && (
        <section className="invite-panel invite-table-panel">
          <div className="invite-panel-title">
            <div>
              <h2>发售群列表</h2>
              <p>{formatNumber(filteredGroups.length)} 个微信群</p>
            </div>
            <div className="invite-table-tools">
              <div className="invite-search">
                <Search size={15} />
                <input value={groupSearch} onChange={(event) => setGroupSearch(event.target.value)} placeholder="搜索群名 / 群 ID" />
                {groupSearch && <button onClick={() => setGroupSearch('')}><X size={14} /></button>}
              </div>
              <select
                value={groupUnitTagFilter || '__all'}
                onChange={(event) => setGroupUnitTagFilter(event.target.value)}
                aria-label="单元标签筛选"
              >
                <option value="__all">全部单元</option>
                <option value="__unset">未设置</option>
                {tags.map((tag) => <option key={tag.tag_id} value={tag.tag_id}>{tag.tag_name}</option>)}
              </select>
              <select value={groupSort} onChange={(event) => setGroupSort(event.target.value as GroupSortKey)}>
                {groupSortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <button onClick={exportRawEvents}><Download size={15} />导出</button>
            </div>
          </div>

          <div className="invite-table-wrap">
            <table className="invite-table">
              <thead>
                <tr>
                  <th>微信群</th>
                  <th>成员数</th>
                  <th>今日新增</th>
                  <th>今日退群</th>
                  <th>活动标签</th>
                  <th>最近扫描</th>
                  <th>最近邀请</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map((group) => (
                  <tr key={group.group_id}>
                    <td>
                      <div className="invite-group-cell">
                        <div className="invite-avatar">{group.avatar_url ? <img src={group.avatar_url} alt="" /> : <Users size={16} />}</div>
                        <div>
                          <strong>{group.group_name || group.group_id}</strong>
                          <span>{group.group_id}</span>
                        </div>
                      </div>
                    </td>
                    <td>{formatNumber(group.member_count)}</td>
                    <td>{formatNumber(group.today_join_count)}</td>
                    <td>{formatNumber(group.today_quit_count)}</td>
                    <td>
                      <select value={group.tag_id || ''} onChange={(event) => void updateGroupTag(group.group_id, event.target.value)}>
                        <option value="">未设置</option>
                        {tags.map((tag) => <option key={tag.tag_id} value={tag.tag_id}>{tag.tag_name}</option>)}
                      </select>
                    </td>
                    <td>{formatShortTime(group.last_scan_time)}</td>
                    <td>{formatShortTime(group.recent_invite_time)}</td>
                    <td>
                      <button className="invite-text-btn" onClick={() => void updateGroupTag(group.group_id, '')}>清除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selectedTagId && activeView === 'trace' && (
        <section className="invite-panel invite-table-panel">
          <div className="invite-panel-title">
            <div>
              <h2>群成员溯源</h2>
              <p>当前筛选 {formatNumber(traceTotal)} 条</p>
            </div>
            <div className="invite-table-tools">
              <select
                value={traceFilters.groupId || ''}
                onChange={(event) => setTraceFilters((prev) => ({ ...prev, groupId: event.target.value || undefined }))}
              >
                <option value="">全部群</option>
                {tagGroups.map((group) => <option key={group.group_id} value={group.group_id}>{group.group_name}</option>)}
              </select>
              <div className="invite-search">
                <Search size={15} />
                <input
                  value={traceFilters.keyword || ''}
                  onChange={(event) => setTraceFilters((prev) => ({ ...prev, keyword: event.target.value }))}
                  placeholder="成员昵称"
                />
              </div>
              <CompactDateTimeRange
                start={traceStartDateTime}
                end={traceEndDateTime}
                onStartChange={setTraceStartDateTime}
                onEndChange={setTraceEndDateTime}
                ariaLabel="member trace time range"
              />
              <select
                value={traceFilters.statusFilter || ''}
                onChange={(event) => setTraceFilters((prev) => ({
                  ...prev,
                  statusFilter: (event.target.value || undefined) as InviteMemberTraceFilters['statusFilter']
                }))}
                aria-label="成员状态筛选"
              >
                {traceStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select
                value={traceFilters.attributionFilter || ''}
                onChange={(event) => setTraceFilters((prev) => ({
                  ...prev,
                  attributionFilter: (event.target.value || undefined) as InviteMemberTraceFilters['attributionFilter']
                }))}
                aria-label="归因筛选"
              >
                {traceAttributionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <button onClick={() => void loadTrace()}><RefreshCw size={15} />查询</button>
              <button onClick={exportTrace}><Download size={15} />导出</button>
            </div>
          </div>

          <div className="invite-table-wrap">
            <table className="invite-table">
              <thead>
                <tr>
                  <th>成员</th>
                  <th>来源</th>
                  <th>所在群</th>
                  <th>时间</th>
                  <th>状态</th>
                  <th>归因</th>
                  <th>原始消息</th>
                </tr>
              </thead>
              <tbody>
                {traceRows.map((row) => (
                  <tr key={`${row.event_type}-${row.id}`}>
                    <td>
                      <div className="invite-trace-member-cell">
                        <div className="invite-avatar">
                          {row.head_img ? <img src={row.head_img} alt="" /> : <span>{(row.user || '成').slice(0, 1)}</span>}
                        </div>
                        <div className="invite-member-cell">
                          <strong>{row.user || '未知成员'}</strong>
                          <span>{row.wx_id || '未匹配 wxid'}</span>
                        </div>
                      </div>
                    </td>
                    <td>{row.event_type === 'invite' ? `${joinTypeLabel(row.join_type)} · ${row.inviter || '未知来源'}` : quitTypeLabel(row.quit_type)}</td>
                    <td>{row.group_name}</td>
                    <td>{formatTime(row.event_time)}</td>
                    <td><span className={`invite-pill ${traceStatusClass(row)}`}>{traceStatusLabel(row)}</span></td>
                    <td>{traceAttributionLabel(row)}</td>
                    <td className="invite-raw-cell" title={row.raw_content} onDoubleClick={() => setRawPreview(row)}>
                      <span>{row.raw_content}</span>
                      {row.raw_content && <button type="button" onClick={() => setRawPreview(row)}>查看</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selectedTagId && activeView === 'pending' && (
        <section className="invite-panel invite-table-panel">
          <div className="invite-panel-title">
            <div>
              <h2>待确认记录</h2>
              <p>{formatNumber(pendingRows.length)} 条需要人工处理</p>
            </div>
            <div className="invite-table-tools">
              <button onClick={() => void loadPending()}><RefreshCw size={15} />刷新</button>
              <button onClick={exportRawEvents}><Download size={15} />导出原始事件</button>
            </div>
          </div>

          <div className="invite-pending-list">
            {pendingRows.map((row) => (
              <article className="invite-pending-card" key={`${row.event_type}-${row.id}`}>
                <div className="invite-pending-main">
                  <span className={`invite-pill ${row.event_type}`}>{row.event_type === 'invite' ? '入群' : '退群'}</span>
                  <h3>{row.user || '未知成员'}</h3>
                  <p>{row.raw_content}</p>
                  <div className="invite-pending-meta">
                    <span>{row.group_name}</span>
                    <span>{formatTime(row.event_time)}</span>
                    <span>置信度 {Math.round((row.confidence || 0) * 100)}%</span>
                  </div>
                  {row.source_context_members && row.source_context_members.length > 0 && (
                    <div className="invite-pending-context">
                      {row.source_context_members.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => openManualInviteDialog(row, 'add', name)}
                          title="用该成员补充一条邀请记录"
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="invite-pending-actions">
                  <button className="invite-primary-btn" onClick={() => void markPendingValid(row)}>
                    <Check size={15} />有效
                  </button>
                  {row.event_type === 'invite' && (
                    <button type="button" onClick={() => openManualInviteDialog(row, 'add')}>
                      <Plus size={15} />添加信息
                    </button>
                  )}
                  <button className="invite-invalid-btn" onClick={() => void markPendingInvalid(row)}>
                    <Ban size={15} />无效
                  </button>
                </div>
              </article>
            ))}
            {pendingRows.length === 0 && <div className="invite-empty-inline">没有待确认记录</div>}
          </div>
        </section>
      )}

      {manualInviteDialog && (
        <div className="invite-modal-mask" role="dialog" aria-modal="true" aria-label="补充邀请信息" onMouseDown={closeManualInviteDialog}>
          <form
            className="invite-manual-modal"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault()
              void submitManualInviteForm()
            }}
          >
            <div className="invite-modal-title">
              <div>
                <h2>{manualInviteDialog.mode === 'confirm' ? '补充有效邀请' : '添加邀请信息'}</h2>
                <p>{manualInviteDialog.mode === 'confirm' ? '补齐微信 ID 后，这条待确认记录会进入真实统计。' : '从这条背景消息拆出一条真实邀请记录，并参与统计。'}</p>
              </div>
              <button type="button" onClick={closeManualInviteDialog} title="关闭" disabled={isSavingManualInvite}>
                <X size={16} />
              </button>
            </div>
            <div className="invite-manual-source">
              <strong>{manualInviteDialog.row.raw_content || '无原始消息'}</strong>
              <span>{manualInviteDialog.row.group_name} · {formatTime(manualInviteDialog.row.event_time)}</span>
            </div>
            <div className="invite-manual-grid">
              <label className="invite-manual-field">
                <span>群 ID</span>
                <select
                  value={manualInviteForm.groupId}
                  onChange={(event) => setManualInviteForm((prev) => ({ ...prev, groupId: event.target.value }))}
                  disabled={isSavingManualInvite}
                >
                  {!manualSelectedGroupExists && manualInviteForm.groupId && (
                    <option value={manualInviteForm.groupId}>{manualInviteForm.groupId}</option>
                  )}
                  <option value="">请选择群</option>
                  {tagGroups.map((group) => (
                    <option key={group.group_id} value={group.group_id}>
                      {group.group_name || group.group_id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="invite-manual-field">
                <span>被邀请人</span>
                <input
                  value={manualInviteForm.user}
                  onChange={(event) => setManualInviteForm((prev) => ({ ...prev, user: event.target.value }))}
                  placeholder="成员昵称"
                  disabled={isSavingManualInvite || manualInviteDialog.mode === 'confirm'}
                />
              </label>
              <label className="invite-manual-field">
                <span>被邀请人微信 ID</span>
                <input
                  value={manualInviteForm.wxId}
                  onChange={(event) => setManualInviteForm((prev) => ({ ...prev, wxId: event.target.value }))}
                  placeholder="wxid_xxx"
                  disabled={isSavingManualInvite}
                />
              </label>
              <label className="invite-manual-field">
                <span>邀请人</span>
                <input
                  value={manualInviteForm.inviter}
                  onChange={(event) => setManualInviteForm((prev) => ({ ...prev, inviter: event.target.value }))}
                  placeholder="邀请人昵称"
                  disabled={isSavingManualInvite || manualInviteDialog.mode === 'confirm'}
                />
              </label>
              <label className="invite-manual-field">
                <span>邀请人微信 ID</span>
                <input
                  value={manualInviteForm.inviterWxId}
                  onChange={(event) => setManualInviteForm((prev) => ({ ...prev, inviterWxId: event.target.value }))}
                  placeholder="wxid_xxx"
                  disabled={isSavingManualInvite}
                />
              </label>
            </div>
            <div className="invite-modal-actions">
              <button type="button" onClick={closeManualInviteDialog} disabled={isSavingManualInvite}>
                取消
              </button>
              <button className="invite-primary-btn" type="submit" disabled={isSavingManualInvite}>
                {isSavingManualInvite ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
                <span>{manualInviteDialog.mode === 'confirm' ? '保存为有效' : '添加信息'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {createTagDialogOpen && (
        <div className="invite-modal-mask" role="dialog" aria-modal="true" aria-label="创建活动标签" onMouseDown={closeCreateTagDialog}>
          <form
            className="invite-tag-modal"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault()
              void submitCreateActivityTag()
            }}
          >
            <div className="invite-modal-title">
              <div>
                <h2>创建活动标签</h2>
                <p>输入标签名字后确认创建，取消不会保存。</p>
              </div>
              <button type="button" onClick={closeCreateTagDialog} title="关闭" disabled={isCreatingTag}>
                <X size={16} />
              </button>
            </div>
            <label className="invite-tag-modal-field">
              <span>标签名称</span>
              <input
                autoFocus
                value={createTagName}
                onChange={(event) => setCreateTagName(event.target.value)}
                placeholder="例如：拉新、自动、其他"
                maxLength={32}
                disabled={isCreatingTag}
              />
            </label>
            <div className="invite-modal-actions">
              <button type="button" onClick={closeCreateTagDialog} disabled={isCreatingTag}>取消</button>
              <button className="invite-primary-btn" type="submit" disabled={!createTagName.trim() || isCreatingTag}>
                {isCreatingTag ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                <span>确认创建</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {remoteSyncDialogOpen && (
        <div
          className="invite-modal-mask"
          role="dialog"
          aria-modal="true"
          aria-label="远程同步设置"
          onMouseDown={() => {
            if (!isSavingRemoteSync && !isRemoteSyncing && !isResettingInviteStats) setRemoteSyncDialogOpen(false)
          }}
        >
          <form
            className="invite-remote-sync-modal"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault()
              void saveRemoteSyncSettings()
            }}
          >
            <div className="invite-modal-title">
              <div>
                <h2>远程同步设置</h2>
                <p>本地邀请统计会通过这个接口写入 Supabase，留空则继续使用环境变量。</p>
              </div>
              <button
                type="button"
                onClick={() => setRemoteSyncDialogOpen(false)}
                title="关闭"
                disabled={isSavingRemoteSync || isRemoteSyncing || isResettingInviteStats}
              >
                <X size={16} />
              </button>
            </div>
            <div className="invite-remote-sync-fields">
              <label className="invite-tag-modal-field">
                <span>同步接口地址</span>
                <input
                  autoFocus
                  value={remoteSyncUrl}
                  onChange={(event) => setRemoteSyncUrl(event.target.value)}
                  placeholder="https://你的-weflow-web域名/api/invite/sync"
                  disabled={isSavingRemoteSync || isRemoteSyncing || isResettingInviteStats}
                />
              </label>
              <label className="invite-tag-modal-field">
                <span>同步 Token</span>
                <input
                  type="password"
                  value={remoteSyncToken}
                  onChange={(event) => setRemoteSyncToken(event.target.value)}
                  placeholder="和 WeFlow-Web 的 REMOTE_SYNC_TOKEN 一样"
                  disabled={isSavingRemoteSync || isRemoteSyncing || isResettingInviteStats}
                />
              </label>
            </div>
            <div className="invite-reset-zone">
              <div className="invite-reset-copy">
                <AlertTriangle size={18} />
                <div>
                  <strong>恢复初始化</strong>
                  <p>删除本地邀请统计记录，并清空远端邀请统计相关表。测试脏数据清完后，生产数据再同步进来。</p>
                </div>
              </div>
              <div className="invite-reset-controls">
                <input
                  value={resetConfirmText}
                  onChange={(event) => setResetConfirmText(event.target.value)}
                  placeholder="输入 RESET"
                  disabled={isSavingRemoteSync || isRemoteSyncing || isResettingInviteStats}
                />
                <button
                  type="button"
                  className="invite-danger-btn"
                  onClick={() => void resetInviteStatsData()}
                  disabled={isSavingRemoteSync || isRemoteSyncing || isResettingInviteStats || resetConfirmText !== 'RESET'}
                >
                  {isResettingInviteStats ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                  <span>恢复初始化</span>
                </button>
              </div>
            </div>
            <div className="invite-modal-actions">
              <button
                type="button"
                onClick={() => setRemoteSyncDialogOpen(false)}
                disabled={isSavingRemoteSync || isRemoteSyncing || isResettingInviteStats}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void syncRemoteNow()}
                disabled={isSavingRemoteSync || isRemoteSyncing || isResettingInviteStats}
              >
                {isRemoteSyncing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                <span>保存并同步</span>
              </button>
              <button className="invite-primary-btn" type="submit" disabled={isSavingRemoteSync || isRemoteSyncing || isResettingInviteStats}>
                {isSavingRemoteSync ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
                <span>保存设置</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {rawPreview && (
        <div className="invite-modal-mask" role="dialog" aria-modal="true" aria-label="完整原始消息">
          <div className="invite-raw-modal">
            <div className="invite-modal-title">
              <div>
                <h2>完整原始消息</h2>
              </div>
              <div className="invite-modal-title-actions">
                <button type="button" onClick={() => void copyRawPreview()} title="复制原始消息">
                  <Copy size={16} />
                </button>
                <button type="button" onClick={() => setRawPreview(null)} title="关闭">
                  <X size={16} />
                </button>
              </div>
            </div>
            <textarea className="invite-raw-content" value={rawPreview.raw_content || '无原始消息'} readOnly />
          </div>
        </div>
      )}

      {isLoading && (
        <div className="invite-loading-cover">
          <Loader2 size={24} className="spin" />
          <span>正在读取邀请统计数据</span>
        </div>
      )}
      </main>
    </div>
  )
}

export default InviteStatsPage
