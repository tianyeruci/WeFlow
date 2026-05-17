import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  BarChart3,
  Check,
  Clock,
  Download,
  FileSpreadsheet,
  Loader2,
  PieChart,
  RefreshCw,
  Search,
  Sparkles,
  Tags,
  Users,
  X
} from 'lucide-react'
import type {
  InviteActivityTag,
  InviteDashboardData,
  InviteMemberTraceFilters,
  InviteMemberTraceRow,
  InviteScanLog,
  InviteStatsGroupRow
} from '../types/electron'
import './InviteStatsPage.scss'

type ViewKey = 'dashboard' | 'groups' | 'trace' | 'pending'
type ChartMode = 'bar' | 'pie'
type ScanMode = 'incremental' | 'full'
type GroupSortKey = 'member_count' | 'today_join_count' | 'today_quit_count' | 'last_scan_time' | 'recent_invite_time'

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
  { value: 'active', label: '未退出' },
  { value: 'quit', label: '退出' },
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

const inferExportFormat = (filePath: string): 'csv' | 'xlsx' => {
  return filePath.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx'
}

const fileNameDate = (): string => toDateInput(new Date()).replace(/-/g, '')

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
  const [newTagName, setNewTagName] = useState('')
  const [groupSearch, setGroupSearch] = useState('')
  const [groupSort, setGroupSort] = useState<GroupSortKey>('member_count')
  const [dashboard, setDashboard] = useState<InviteDashboardData | null>(null)
  const [traceRows, setTraceRows] = useState<InviteMemberTraceRow[]>([])
  const [traceTotal, setTraceTotal] = useState(0)
  const [pendingRows, setPendingRows] = useState<InviteMemberTraceRow[]>([])
  const [scanLogs, setScanLogs] = useState<InviteScanLog[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isDashboardLoading, setIsDashboardLoading] = useState(false)
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

  const createActivityTag = async () => {
    const tagName = newTagName.trim()
    if (!tagName) return
    const result = await window.electronAPI.inviteStats.saveActivityTag({ tagName, enabled: true })
    if (!result.success || !result.data) {
      showToast(result.error || '活动创建失败')
      return
    }
    setNewTagName('')
    showToast('活动已创建')
    await refreshMeta(result.data.tag_id)
  }

  const scanSelectedTag = async (mode: ScanMode = 'incremental') => {
    if (!selectedTagId || isScanning) return
    if (mode === 'full') {
      const confirmed = window.confirm(`全局扫描会清空「${selectedTag?.tag_name || '当前活动'}」相关的原始记录、扫描日志和人工绑定，然后重新扫描该活动下所有群。确定继续吗？`)
      if (!confirmed) return
    }
    setIsScanning(true)
    const result = await window.electronAPI.inviteStats.scanActivity(selectedTagId, mode)
    if (!result.success) {
      showToast(result.error || '扫描失败')
    } else {
      const label = mode === 'full' ? '全局扫描' : '增量扫描'
      showToast(`${label}完成：新增 ${result.log?.new_invites || 0} 条入群，${result.log?.new_quits || 0} 条退群`)
    }
    await refreshMeta(selectedTagId)
    await loadDashboard()
    if (activeView === 'trace') await loadTrace()
    if (activeView === 'pending') await loadPending()
    setIsScanning(false)
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

  const confirmPending = async (row: InviteMemberTraceRow) => {
    const wxId = window.prompt('成员 wxid', row.wx_id || '')
    if (wxId === null) return
    const payload: {
      eventType: 'invite' | 'quit'
      eventId: string
      wxId?: string
      inviterWxId?: string
      operatorWxId?: string
    } = {
      eventType: row.event_type,
      eventId: row.id,
      wxId: wxId.trim() || undefined
    }
    if (row.event_type === 'invite' && row.inviter && row.join_type === 'invite') {
      const inviterWxId = window.prompt('邀请人 wxid，可留空', row.inviter_wx_id || '')
      if (inviterWxId === null) return
      payload.inviterWxId = inviterWxId.trim() || undefined
    }
    if (row.event_type === 'quit' && row.operator) {
      const operatorWxId = window.prompt('操作人 wxid，可留空', row.operator_wx_id || '')
      if (operatorWxId === null) return
      payload.operatorWxId = operatorWxId.trim() || undefined
    }
    const result = await window.electronAPI.inviteStats.confirmPending(payload)
    if (!result.success) {
      showToast(result.error || '确认失败')
      return
    }
    showToast('记录已确认')
    await loadPending()
    await loadDashboard()
  }

  const ignorePending = async (row: InviteMemberTraceRow) => {
    const result = await window.electronAPI.inviteStats.ignorePending({
      eventType: row.event_type,
      eventId: row.id
    })
    if (!result.success) {
      showToast(result.error || '忽略失败')
      return
    }
    showToast('记录已忽略')
    await loadPending()
    await loadDashboard()
  }

  const filteredGroups = useMemo(() => {
    const keyword = groupSearch.trim().toLowerCase()
    return groups
      .filter((group) => {
        if (!keyword) return true
        return [
          group.group_name,
          group.group_id,
          group.tag_name
        ].some((value) => String(value || '').toLowerCase().includes(keyword))
      })
      .sort((a, b) => Number(b[groupSort] || 0) - Number(a[groupSort] || 0))
  }, [groupSearch, groupSort, groups])

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
  const latestScanModeLabel = latestLog?.scan_mode === 'full' ? '全局扫描' : '增量扫描'
  const latestScanText = latestLog
    ? `${latestScanModeLabel} · ${formatShortTime(latestLog.finished_at || latestLog.started_at)} · ${statusLabel(latestLog.status)}`
    : '尚未扫描'
  const pendingBadgeCount = dashboard?.cards?.pendingCount || pendingRows.length
  const groupRankRows = (dashboard?.groupRanking || []).slice(0, 6)
  const maxGroupMemberCount = Math.max(1, ...groupRankRows.map((group) => Number(group.member_count || 0)))

  return (
    <div className="invite-stats-page">
      {toast && <div className="invite-toast">{toast}</div>}

      <header className="invite-topbar">
        <div className="invite-brand">
          <div className="invite-brand-mark">邀</div>
          <div>
            <strong>WeFlow 邀请统计</strong>
            <span>本地微信群邀请归因大屏</span>
          </div>
        </div>
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
      </header>

      <main className="invite-screen">
        <section className="invite-toolbar">
          <div className="invite-field activity">
            <label>活动标签</label>
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
          </div>
          <div className="invite-scan-actions">
            <button className="invite-primary-btn" onClick={() => void scanSelectedTag('incremental')} disabled={!selectedTagId || isScanning}>
              {isScanning ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
              <span>{isScanning ? '扫描中' : '增量扫描'}</span>
            </button>
            <button className="invite-danger-btn" onClick={() => void scanSelectedTag('full')} disabled={!selectedTagId || isScanning}>
              <RefreshCw size={16} />
              <span>全局扫描</span>
            </button>
          </div>
          <div className="invite-tag-create">
            <input
              value={newTagName}
              onChange={(event) => setNewTagName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void createActivityTag()
              }}
              placeholder="新活动标签"
            />
            <button onClick={createActivityTag} disabled={!newTagName.trim()}>创建</button>
          </div>
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
              <div><strong>{formatNumber(cards?.pendingCount || 0)}</strong><span>待确认记录</span></div>
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
                <div className="invite-datetime-range" aria-label="排行榜时间范围">
                  <input
                    type="datetime-local"
                    step={1}
                    aria-label="排行榜开始时间"
                    value={rankingStartDateTime}
                    onChange={(event) => setRankingStartDateTime(event.target.value)}
                  />
                  <span aria-hidden="true">-</span>
                  <input
                    type="datetime-local"
                    step={1}
                    aria-label="排行榜结束时间"
                    value={rankingEndDateTime}
                    onChange={(event) => setRankingEndDateTime(event.target.value)}
                  />
                </div>
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
                        <span>{row.event_type === 'invite' ? `${joinTypeLabel(row.join_type)} · ${row.inviter || '未知来源'}` : quitTypeLabel(row.quit_type)}</span>
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
              <div className="invite-datetime-range" aria-label="群成员溯源时间范围">
                <input
                  type="datetime-local"
                  step={1}
                  aria-label="群成员溯源开始时间"
                  value={traceStartDateTime}
                  onChange={(event) => setTraceStartDateTime(event.target.value)}
                />
                <span aria-hidden="true">-</span>
                <input
                  type="datetime-local"
                  step={1}
                  aria-label="群成员溯源结束时间"
                  value={traceEndDateTime}
                  onChange={(event) => setTraceEndDateTime(event.target.value)}
                />
              </div>
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
              <label className="invite-check">
                <input
                  type="checkbox"
                  checked={traceFilters.includeQuit !== false}
                  onChange={(event) => setTraceFilters((prev) => ({ ...prev, includeQuit: event.target.checked }))}
                />
                <span>含退群</span>
              </label>
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
                      <div className="invite-member-cell">
                        <strong>{row.user || '未知成员'}</strong>
                        <span>{row.wx_id || '未匹配 wxid'}</span>
                      </div>
                    </td>
                    <td>{row.event_type === 'invite' ? `${joinTypeLabel(row.join_type)} · ${row.inviter || '未知来源'}` : quitTypeLabel(row.quit_type)}</td>
                    <td>{row.group_name}</td>
                    <td>{formatTime(row.event_time)}</td>
                    <td><span className={`invite-pill ${row.status}`}>{statusLabel(row.status)}</span></td>
                    <td>{row.valid_flag === 1 ? '有效' : row.valid_flag === -1 ? '无效' : '-'}</td>
                    <td className="invite-raw-cell">{row.raw_content}</td>
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
                </div>
                <div className="invite-pending-actions">
                  <button className="invite-primary-btn" onClick={() => void confirmPending(row)}>
                    <Check size={15} />保存确认
                  </button>
                  <button onClick={() => void ignorePending(row)}>
                    <X size={15} />忽略
                  </button>
                </div>
              </article>
            ))}
            {pendingRows.length === 0 && <div className="invite-empty-inline">没有待确认记录</div>}
          </div>
        </section>
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
