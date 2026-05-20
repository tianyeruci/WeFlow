'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ActivityTag, DashboardData, MemberTraceData, MemberTraceRow } from '@/types/invite'

type ViewKey = 'dashboard' | 'groups' | 'trace'
type ChartMode = 'bar' | 'pie'
const DASHBOARD_POLL_INTERVAL_MS = 10000
const REFRESH_COOLDOWN_SECONDS = 15
const GROUP_RANK_PAGE_SIZE = 10
const rankingImageColors = ['#59b8ad', '#e3c763', '#e75a6c', '#ffd8b4', '#5b9bea', '#87cba2', '#f28a42', '#586aa5', '#bf7bd7']

function downloadRankingImage(input: {
  title: string
  filename: string
  rows: Array<{ name: string; count: number }>
}) {
  if (!input.rows.length) return false

  const width = 1000
  const left = 260
  const right = 130
  const top = 74
  const rowHeight = 48
  const bottom = 44
  const chartWidth = width - left - right
  const height = Math.max(260, top + input.rows.length * rowHeight + bottom)
  const scale = Math.min(2, window.devicePixelRatio || 1)
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) return false

  ctx.scale(scale, scale)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = '#1f2937'
  ctx.font = '700 24px "Microsoft YaHei", "PingFang SC", sans-serif'
  ctx.fillText(input.title, 12, 32)

  const maxCount = Math.max(1, ...input.rows.map(row => row.count))
  ctx.strokeStyle = '#e6e8ed'
  ctx.lineWidth = 1
  for (let index = 0; index <= 4; index += 1) {
    const x = left + (chartWidth * index) / 4
    ctx.beginPath()
    ctx.moveTo(x, top - 24)
    ctx.lineTo(x, height - bottom + 4)
    ctx.stroke()
  }

  ctx.strokeStyle = '#9aa3b2'
  ctx.beginPath()
  ctx.moveTo(left, top - 24)
  ctx.lineTo(left, height - bottom + 4)
  ctx.stroke()

  input.rows.forEach((row, index) => {
    const y = top + index * rowHeight
    const barWidth = Math.max(8, (row.count / maxCount) * chartWidth)
    const barY = y + 10
    const barHeight = 18

    ctx.fillStyle = '#6f7785'
    ctx.font = '400 20px "Microsoft YaHei", "PingFang SC", sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(ellipsizeCanvasText(ctx, row.name || '未知来源', 242), left - 14, y + 19)

    ctx.fillStyle = rankingImageColors[index % rankingImageColors.length]
    drawRoundedBar(ctx, left, barY, barWidth, barHeight, 9)

    ctx.fillStyle = '#85878d'
    ctx.font = '500 22px "Microsoft YaHei", "PingFang SC", sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(formatNumber(row.count), left + barWidth + 10, y + 19)
  })

  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = input.filename
  link.click()
  return true
}

function drawRoundedBar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + safeRadius, y)
  ctx.lineTo(x + width - safeRadius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  ctx.lineTo(x + width, y + height - safeRadius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  ctx.lineTo(x + safeRadius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  ctx.lineTo(x, y + safeRadius)
  ctx.quadraticCurveTo(x, y, x + safeRadius, y)
  ctx.fill()
}

function ellipsizeCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let next = text
  while (next.length > 1 && ctx.measureText(`${next}...`).width > maxWidth) {
    next = next.slice(0, -1)
  }
  return `${next}...`
}

const emptyDashboard: DashboardData = {
  cards: {
    activeRobots: 0,
    monitoredGroups: 0,
    totalMembers: 0,
    totalMembersWithQuit: 0,
    todayNew: 0,
    todayQuit: 0,
    pendingCount: 0
  },
  groups: [],
  hourlyDistribution: Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
  inviteRanking: [],
  groupRanking: [],
  recentActivities: []
}

const emptyTrace: MemberTraceData = {
  rows: [],
  total: 0,
  groups: []
}

const ALL_ACTIVITY_TAG_ID = '__all__'

export default function RemoteViewerPage() {
  const [view, setView] = useState<ViewKey>('dashboard')
  const [tags, setTags] = useState<ActivityTag[]>([])
  const [selectedTagId, setSelectedTagId] = useState(ALL_ACTIVITY_TAG_ID)
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard)
  const [trace, setTrace] = useState<MemberTraceData>(emptyTrace)
  const [rankingGroupId, setRankingGroupId] = useState('')
  const [rankingStart, setRankingStart] = useState('')
  const [rankingEnd, setRankingEnd] = useState('')
  const [chartMode, setChartMode] = useState<ChartMode>('bar')
  const [includeQuitInTotal, setIncludeQuitInTotal] = useState(false)
  const [traceGroupId, setTraceGroupId] = useState('')
  const [traceKeyword, setTraceKeyword] = useState('')
  const [traceStart, setTraceStart] = useState('')
  const [traceEnd, setTraceEnd] = useState('')
  const [traceStatus, setTraceStatus] = useState('')
  const [traceAttribution, setTraceAttribution] = useState('')
  const [rawMessage, setRawMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [exportingAction, setExportingAction] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isRequestingLatestData, setIsRequestingLatestData] = useState(false)
  const [refreshCooldownRemaining, setRefreshCooldownRemaining] = useState(0)
  const [groupRankPage, setGroupRankPage] = useState(1)

  const selectedTag = useMemo(
    () => selectedTagId === ALL_ACTIVITY_TAG_ID ? undefined : tags.find(tag => tag.id === selectedTagId),
    [tags, selectedTagId]
  )
  const isAllActivitySelected = selectedTagId === ALL_ACTIVITY_TAG_ID
  const selectedScopeLabel = isAllActivitySelected ? '全部活动' : (selectedTag?.name || '当前活动')
  const selectedScopeFileLabel = isAllActivitySelected ? '全部活动' : (selectedTag?.name || '活动')

  const apiGet = useCallback(async <T,>(path: string) => {
    const response = await fetch(path, {
      cache: 'no-store'
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload.error || '远程数据暂不可用')
    }
    return payload as T
  }, [])

  const loadTags = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const payload = await apiGet<{ tags: ActivityTag[] }>('/api/invite/tags')
      setTags(payload.tags)
      setSelectedTagId(current => current || ALL_ACTIVITY_TAG_ID)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [apiGet])

  const loadDashboard = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    const tagId = selectedTagId || ALL_ACTIVITY_TAG_ID
    const params = new URLSearchParams({ tagId })
    if (rankingGroupId) params.set('rankingGroupId', rankingGroupId)
    if (rankingStart) params.set('rankingStart', rankingStart)
    if (rankingEnd) params.set('rankingEnd', rankingEnd)

    if (!silent) {
      setLoading(true)
      setError('')
    }
    try {
      const payload = await apiGet<{ dashboard: DashboardData }>(`/api/invite/dashboard?${params}`)
      setDashboard(payload.dashboard)
      setError('')
    } catch (err) {
      if (!silent) {
        setDashboard(emptyDashboard)
      }
      setError(errorMessage(err))
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [apiGet, rankingEnd, rankingGroupId, rankingStart, selectedTagId])

  const loadTrace = useCallback(async () => {
    const tagId = selectedTagId || ALL_ACTIVITY_TAG_ID
    const params = new URLSearchParams({ tagId })
    if (traceGroupId) params.set('groupId', traceGroupId)
    if (traceKeyword.trim()) params.set('keyword', traceKeyword.trim())
    if (traceStart) params.set('startTime', traceStart)
    if (traceEnd) params.set('endTime', traceEnd)
    if (traceStatus) params.set('status', traceStatus)
    if (traceAttribution) params.set('attribution', traceAttribution)

    setLoading(true)
    setError('')
    try {
      const payload = await apiGet<{ trace: MemberTraceData }>(`/api/invite/member-trace?${params}`)
      setTrace(payload.trace)
    } catch (err) {
      setTrace(emptyTrace)
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [apiGet, selectedTagId, traceAttribution, traceEnd, traceGroupId, traceKeyword, traceStart, traceStatus])

  useEffect(() => {
    void loadTags()
  }, [loadTags])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    if ((view !== 'dashboard' && view !== 'groups') || !selectedTagId) return

    const timer = window.setInterval(() => {
      void loadDashboard({ silent: true })
    }, DASHBOARD_POLL_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [loadDashboard, selectedTagId, view])

  useEffect(() => {
    if (view === 'trace') void loadTrace()
  }, [loadTrace, view])

  useEffect(() => {
    if (refreshCooldownRemaining <= 0) return
    const timer = window.setInterval(() => {
      setRefreshCooldownRemaining(value => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [refreshCooldownRemaining])

  useEffect(() => {
    setGroupRankPage(1)
  }, [selectedTagId])

  async function requestLatestData() {
    if (isRequestingLatestData || refreshCooldownRemaining > 0) return

    setIsRequestingLatestData(true)
    setError('')
    try {
      const response = await fetch('/api/invite/sync-request', {
        method: 'POST',
        cache: 'no-store'
      })
      const payload = await response.json().catch(() => ({})) as {
        accepted?: boolean
        cooldown?: boolean
        remainingSeconds?: number
        cooldownSeconds?: number
        error?: string
      }
      if (!response.ok) {
        throw new Error(payload.error || '刷新请求提交失败')
      }

      if (payload.cooldown) {
        const remaining = Math.max(1, Number(payload.remainingSeconds || 1))
        setRefreshCooldownRemaining(remaining)
        showNotice(`还没到冷却时间，剩余 ${remaining} 秒`)
        return
      }

      setRefreshCooldownRemaining(Number(payload.cooldownSeconds || REFRESH_COOLDOWN_SECONDS))
      showNotice('已通知本地同步，页面会自动刷新最新数据')
      void loadDashboard({ silent: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setIsRequestingLatestData(false)
    }
  }

  async function exportCsv(type: 'ranking' | 'trace') {
    const tagId = selectedTagId || ALL_ACTIVITY_TAG_ID
    const params = new URLSearchParams({ tagId })
    let endpoint = '/api/invite/export/ranking'
    let filename = '邀请排行榜.csv'
    let actionKey = 'ranking'

    if (type === 'ranking') {
      if (rankingGroupId) params.set('rankingGroupId', rankingGroupId)
      if (rankingStart) params.set('rankingStart', rankingStart)
      if (rankingEnd) params.set('rankingEnd', rankingEnd)
    } else {
      endpoint = '/api/invite/export/member-trace'
      filename = '群成员溯源.csv'
      actionKey = 'trace'
      if (traceGroupId) params.set('groupId', traceGroupId)
      if (traceKeyword.trim()) params.set('keyword', traceKeyword.trim())
      if (traceStart) params.set('startTime', traceStart)
      if (traceEnd) params.set('endTime', traceEnd)
      if (traceStatus) params.set('status', traceStatus)
      if (traceAttribution) params.set('attribution', traceAttribution)
    }

    await downloadExport(endpoint, params, filename, actionKey)
  }

  function exportInviteRankingImage() {
    const rows = dashboard.inviteRanking.map(row => ({
      name: row.inviterName || row.inviterId || '未知来源',
      count: Number(row.count || 0)
    }))
    if (!rows.length) {
      showNotice('暂无排行榜数据可下载')
      return
    }

    const selectedGroup = rankingGroupId ? dashboard.groups.find(group => group.id === rankingGroupId) : undefined
    const scopeLabel = selectedGroup?.name || '所有群'
    const total = rows.reduce((sum, row) => sum + row.count, 0)
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const ok = downloadRankingImage({
      title: `【${scopeLabel}】邀请人数排行榜（招募者 ${rows.length} 名，总人数 ${formatNumber(total)}）`,
      filename: `${sanitizeDownloadFilename(`邀请人数排行榜-${selectedScopeFileLabel}-${scopeLabel}-${date}`)}.png`,
      rows
    })
    showNotice(ok ? '排行榜图片已下载' : '图片生成失败')
  }

  async function exportGroups(mode: 'summary' | 'list' | 'batch' | 'member', group?: { groupId: string; groupName: string }) {
    const tagId = selectedTagId || ALL_ACTIVITY_TAG_ID
    const params = new URLSearchParams({ tagId, mode })
    let filename = '发售群列表.csv'
    let actionKey = `groups:${mode}`

    if (mode === 'summary') {
      params.set('includeQuit', String(includeQuitInTotal))
      filename = '发售群人数汇总.csv'
    } else if (mode === 'batch') {
      filename = '发售群员批量.zip'
    } else if (mode === 'member' && group) {
      params.set('groupId', group.groupId)
      params.set('groupName', group.groupName)
      filename = `${sanitizeDownloadFilename(group.groupName)}.csv`
      actionKey = `groups:member:${group.groupId}`
    }

    await downloadExport('/api/invite/export/groups', params, filename, actionKey)
  }

  async function downloadExport(endpoint: string, params: URLSearchParams, filename: string, actionKey: string) {
    setExportingAction(actionKey)
    setError('')
    try {
      const response = await fetch(`${endpoint}?${params}`)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || '导出失败，请检查远程数据配置')
      }
      const blob = await response.blob()
      triggerDownload(blob, filename)
      showNotice('下载已开始')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setExportingAction('')
    }
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const memberTotal = includeQuitInTotal ? dashboard.cards.totalMembersWithQuit : dashboard.cards.totalMembers
  const rankingMax = Math.max(...dashboard.inviteRanking.map(row => row.count), 1)
  const groupRankPageCount = Math.max(1, Math.ceil(dashboard.groupRanking.length / GROUP_RANK_PAGE_SIZE))
  const safeGroupRankPage = Math.min(groupRankPage, groupRankPageCount)
  const groupRankStart = (safeGroupRankPage - 1) * GROUP_RANK_PAGE_SIZE
  const groupRankRows = dashboard.groupRanking.slice(groupRankStart, groupRankStart + GROUP_RANK_PAGE_SIZE)
  const groupMax = Math.max(...groupRankRows.map(row => row.count), 1)
  const chartPoints = buildLinePoints(dashboard.hourlyDistribution)
  const groupRows = useMemo(() => {
    const counts = new Map(dashboard.groupRanking.map(row => [row.groupId, row.count]))
    return dashboard.groups.map((group, index) => ({
      index: index + 1,
      groupId: group.id,
      groupName: group.name,
      avatarUrl: group.avatarUrl,
      count: counts.get(group.id) || 0
    }))
  }, [dashboard.groupRanking, dashboard.groups])

  useEffect(() => {
    if (groupRankPage > groupRankPageCount) {
      setGroupRankPage(groupRankPageCount)
    }
  }, [groupRankPage, groupRankPageCount])

  async function copyRawMessage() {
    if (!rawMessage.trim()) {
      showNotice('暂无可复制内容')
      return
    }
    try {
      await navigator.clipboard.writeText(rawMessage)
      showNotice('原始消息已复制')
    } catch {
      showNotice('复制失败，请手动选择文本复制')
    }
  }

  function showNotice(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2400)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <nav className="screen-nav" aria-label="远程用户视图">
          <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>▥ 数据大屏</button>
          <button className={view === 'groups' ? 'active' : ''} onClick={() => setView('groups')}>▣ 发售群列表</button>
          <button className={view === 'trace' ? 'active' : ''} onClick={() => setView('trace')}>♙ 群成员溯源</button>
        </nav>
      </header>

      <main className="screen">
            <section className="toolbar" aria-label="远程用户筛选区">
              <label className="field">
                <span>活动标签</span>
                <select value={selectedTagId} onChange={event => setSelectedTagId(event.target.value)}>
                  <option value={ALL_ACTIVITY_TAG_ID}>全部活动</option>
                  {tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                </select>
              </label>
              <div className="toolbar-actions">
                <button
                  type="button"
                  className="refresh-latest-btn"
                  disabled={isRequestingLatestData || refreshCooldownRemaining > 0}
                  onClick={() => void requestLatestData()}
                >
                  <span>{isRequestingLatestData ? '请求中...' : '刷新最新数据'}</span>
                  {refreshCooldownRemaining > 0 && <em>{refreshCooldownRemaining}s</em>}
                </button>
              </div>
            </section>

            {error && <div className="error-banner">{error}</div>}
            {notice && <div className="notice-banner">{notice}</div>}
            {loading && <div className="loading-line">正在读取远程统计数据</div>}

            {view === 'dashboard' && (
              <section className="view active">
                <section className="metrics">
                  <MetricCard tone="blue" icon="机" value={formatNumber(dashboard.cards.activeRobots)} label="活跃机器人" />
                  <MetricCard tone="teal" icon="群" value={formatNumber(dashboard.cards.monitoredGroups)} label="监控群组" />
                  <article className="metric-card amber">
                    <div className="metric-icon">员</div>
                    <div>
                      <div className="metric-value">{formatNumber(memberTotal)}</div>
                      <div className="metric-label">总成员数</div>
                    </div>
                    <label className="mini-toggle">
                      <input type="checkbox" checked={includeQuitInTotal} onChange={event => setIncludeQuitInTotal(event.target.checked)} />
                      含退群
                    </label>
                  </article>
                  <MetricCard tone="violet" icon="新" value={formatNumber(dashboard.cards.todayNew)} label="今日新增" />
                  <MetricCard tone="red" icon="退" value={formatNumber(dashboard.cards.todayQuit)} label="今日退群" />
                </section>

                <section className="dashboard-main">
                  <div className="left-column">
                    <section className="panel">
                      <PanelTitle title="进群时段分布" subtitle={isAllActivitySelected ? '按全部活动记录统计' : '按当前活动标签全部有效入群记录统计'} />
                      <div className="chart-line">
                        <div className="axis-y"><span>{chartPoints.max}</span><span>{Math.ceil(chartPoints.max * 0.75)}</span><span>{Math.ceil(chartPoints.max * 0.5)}</span><span>{Math.ceil(chartPoints.max * 0.25)}</span><span>0</span></div>
                        <svg className="line-svg" viewBox="0 0 310 190" preserveAspectRatio="none" aria-hidden="true">
                          <defs>
                            <linearGradient id="hourlyArea" x1="0" x2="0" y1="0" y2="1">
                              <stop offset="0" stopColor="#3778e5" stopOpacity="0.24" />
                              <stop offset="1" stopColor="#3778e5" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          <path d={chartPoints.areaPath} fill="url(#hourlyArea)" />
                          <polyline points={chartPoints.polyline} fill="none" stroke="#3778e5" strokeWidth="4" />
                          {chartPoints.circles.map(point => <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="3.6" fill="#fff" stroke="#3778e5" strokeWidth="3" />)}
                        </svg>
                        <div className="axis-x"><span>0时</span><span>4时</span><span>8时</span><span>12时</span><span>16时</span><span>20时</span></div>
                      </div>
                    </section>

                    <section className="panel">
                      <PanelTitle title="群人数展示" subtitle={isAllActivitySelected ? '全部活动中的群成员规模' : '当前活动标签下群成员规模'} />
                      <div className="group-rank">
                        {groupRankRows.map((row, index) => (
                          <div className="group-row" key={row.groupId}>
                            <div className={`rank-no rank-${groupRankStart + index + 1}`}>{groupRankStart + index + 1}</div>
                            <div>
                              <div className="group-name">{row.groupName}</div>
                              <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(4, row.count / groupMax * 100)}%` }} /></div>
                            </div>
                            <div className="group-count">{formatNumber(row.count)} 人</div>
                          </div>
                        ))}
                        {dashboard.groupRanking.length === 0 && <EmptyState text="暂无群人数数据" />}
                        {dashboard.groupRanking.length > GROUP_RANK_PAGE_SIZE && (
                          <div className="group-rank-pagination">
                            <span>共 {formatNumber(dashboard.groupRanking.length)} 个群，{safeGroupRankPage}/{groupRankPageCount}</span>
                            <div>
                              <button type="button" disabled={safeGroupRankPage <= 1} onClick={() => setGroupRankPage(page => Math.max(1, page - 1))}>上一页</button>
                              <button type="button" disabled={safeGroupRankPage >= groupRankPageCount} onClick={() => setGroupRankPage(page => Math.min(groupRankPageCount, page + 1))}>下一页</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  </div>

                  <section className="panel ranking-panel">
                    <div className="panel-title">
                      <div>
                        <h2>邀请人数排行榜</h2>
                        <p>【{selectedScopeLabel}】招募者 {dashboard.inviteRanking.length} 名，有效入群人数 {formatNumber(memberTotal)}</p>
                      </div>
                      <div className="panel-actions">
                        <button className={`icon-btn ${chartMode === 'bar' ? 'active' : ''}`} title="柱状图" onClick={() => setChartMode('bar')}>▥</button>
                        <button className={`icon-btn ${chartMode === 'pie' ? 'active' : ''}`} title="占比图" onClick={() => setChartMode('pie')}>◔</button>
                        <button className="icon-btn" title="导出" onClick={() => void exportCsv('ranking')}>⇩</button>
                        <button className="icon-btn" title="下载图片" onClick={exportInviteRankingImage}>▧</button>
                      </div>
                    </div>
                    <div className="ranking-toolbar">
                      <select value={rankingGroupId} onChange={event => setRankingGroupId(event.target.value)}>
                        <option value="">{isAllActivitySelected ? '全部活动下全部群' : '当前活动下全部群'}</option>
                        {dashboard.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
                      </select>
                      <div className="datetime-range" aria-label="排行榜时间范围">
                        <input type="datetime-local" step="1" aria-label="排行榜开始时间" value={rankingStart} onChange={event => setRankingStart(event.target.value)} />
                        <input type="datetime-local" step="1" aria-label="排行榜结束时间" value={rankingEnd} onChange={event => setRankingEnd(event.target.value)} />
                      </div>
                      <button onClick={() => void exportCsv('ranking')}>导出</button>
                      <button onClick={exportInviteRankingImage}>下载图片</button>
                    </div>
                    {chartMode === 'bar' ? (
                      <div className="bar-chart">
                        {dashboard.inviteRanking.map((row, index) => (
                          <div className="bar-row" key={row.inviterId}>
                            <div className="bar-label">{row.inviterName}</div>
                            <div className="bar-value" style={{ width: `${Math.max(6, row.count / rankingMax * 100)}%`, background: barColor(index) }} />
                            <div className="bar-number">{formatNumber(row.count)}</div>
                          </div>
                        ))}
                        {dashboard.inviteRanking.length === 0 && <EmptyState text="暂无排行榜数据" />}
                      </div>
                    ) : (
                      <div className="pie-list">
                        {dashboard.inviteRanking.slice(0, 8).map((row, index) => (
                          <div className="pie-row" key={row.inviterId}>
                            <span style={{ background: barColor(index) }} />
                            <strong>{row.inviterName}</strong>
                            <em>{Math.round(row.count / rankingMax * 100)}%</em>
                          </div>
                        ))}
                        {dashboard.inviteRanking.length === 0 && <EmptyState text="暂无占比数据" />}
                      </div>
                    )}
                  </section>

                  <section className="panel">
                    <PanelTitle title="实时动态" subtitle="最终统计视图最近入群记录" />
                    <div className="activity-list">
                      {dashboard.recentActivities.map((row, index) => (
                        <div className="activity-item" key={`${row.memberName}-${row.time}-${index}`}>
                          <div className="avatar">
                            {row.avatarUrl ? <img src={row.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span>{row.memberName.slice(0, 1) || '成'}</span>}
                          </div>
                          <div className="activity-main">
                            <strong>{row.memberName}</strong>
                            <span>{row.sourceLabel} · {row.sourceName}<br />{row.groupName}</span>
                          </div>
                          <div className="activity-time">{formatShortTime(row.time)}</div>
                        </div>
                      ))}
                      {dashboard.recentActivities.length === 0 && <EmptyState text="暂无动态" />}
                    </div>
                  </section>
                </section>
              </section>
            )}

            {view === 'groups' && (
              <section className="view active">
                <section className="panel table-panel groups-panel">
                  <div className="groups-head">
                    <div className="trace-title">
                      <h2>发售群列表</h2>
                      <p>【{selectedScopeLabel}】共 {formatNumber(groupRows.length)} 个群，{formatNumber(memberTotal)} 人</p>
                    </div>
                    <div className="groups-summary">
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={includeQuitInTotal}
                          onChange={event => setIncludeQuitInTotal(event.target.checked)}
                        />
                        包含已退群的人
                      </label>
                      <span className="groups-total">共 {formatNumber(groupRows.length)} 个群，{formatNumber(memberTotal)} 人</span>
                    </div>
                  </div>
                  <div className="groups-actions">
                    <button
                      className="groups-action primary"
                      disabled={Boolean(exportingAction)}
                      onClick={() => void exportGroups('summary')}
                    >
                      {exportingAction === 'groups:summary' ? '导出中...' : '合计导出群人数'}
                    </button>
                    <button
                      className="groups-action success"
                      disabled={Boolean(exportingAction)}
                      onClick={() => void exportGroups('batch')}
                    >
                      {exportingAction === 'groups:batch' ? '导出中...' : '批量导出所有群员'}
                    </button>
                    <button
                      className="groups-action neutral"
                      disabled={Boolean(exportingAction)}
                      onClick={() => void exportGroups('list')}
                    >
                      {exportingAction === 'groups:list' ? '导出中...' : '合计导出群列表'}
                    </button>
                  </div>
                  <div className="table-wrap groups-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>序号</th>
                          <th>群名称</th>
                          <th>人数</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupRows.map(row => (
                          <tr key={row.groupId}>
                            <td>{row.index}</td>
                            <td>
                              <div className="group-cell">
                                <div className="avatar group-avatar">
                                  {row.avatarUrl ? <img src={row.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span>{row.groupName.slice(0, 1) || '群'}</span>}
                                </div>
                                <div>
                                  <span className="member-name">{row.groupName}</span>
                                  <span className="wxid">{row.groupId}</span>
                                </div>
                              </div>
                            </td>
                            <td>{formatNumber(row.count)}</td>
                            <td>
                              <button
                                className="row-export"
                                disabled={Boolean(exportingAction)}
                                onClick={() => void exportGroups('member', { groupId: row.groupId, groupName: row.groupName })}
                              >
                                {exportingAction === `groups:member:${row.groupId}` ? '导出中...' : '导出群员'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {groupRows.length === 0 && <EmptyState text="暂无发售群数据" />}
                  </div>
                </section>
              </section>
            )}

            {view === 'trace' && (
              <section className="view active">
                <section className="panel table-panel">
                  <div className="trace-head">
                    <div className="trace-title">
                      <h2>群成员溯源</h2>
                      <p>当前筛选 <span>{trace.total}</span> 条</p>
                    </div>
                    <select value={traceGroupId} onChange={event => setTraceGroupId(event.target.value)} aria-label="群筛选">
                      <option value="">全部群</option>
                      {trace.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
                    </select>
                    <div className="search">⌕ <input value={traceKeyword} placeholder="成员昵称" aria-label="成员昵称" onChange={event => setTraceKeyword(event.target.value)} /></div>
                    <div className="datetime-range" aria-label="群成员溯源时间范围">
                      <input type="datetime-local" step="1" value={traceStart} onChange={event => setTraceStart(event.target.value)} aria-label="溯源开始时间" />
                      <input type="datetime-local" step="1" value={traceEnd} onChange={event => setTraceEnd(event.target.value)} aria-label="溯源结束时间" />
                    </div>
                    <select value={traceStatus} onChange={event => setTraceStatus(event.target.value)} aria-label="状态筛选">
                      <option value="">全部状态</option>
                      <option value="active">未退出群</option>
                      <option value="quit">已退出群</option>
                      <option value="pending">待确认</option>
                    </select>
                    <select value={traceAttribution} onChange={event => setTraceAttribution(event.target.value)} aria-label="归因筛选">
                      <option value="">全部归因</option>
                      <option value="valid">有效</option>
                      <option value="invalid">无效</option>
                      <option value="pending">待确认</option>
                    </select>
                    <button onClick={() => void exportCsv('trace')}>导出</button>
                  </div>
                  <div className="table-wrap">
                    <table>
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
                        {trace.rows.map(row => <TraceRow key={row.id} row={row} onRaw={setRawMessage} />)}
                      </tbody>
                    </table>
                    {trace.rows.length === 0 && <EmptyState text="暂无溯源数据" />}
                  </div>
                </section>
              </section>
            )}
      </main>

      {rawMessage && (
        <div className="modal active" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>原始系统消息</h3>
            <textarea value={rawMessage} readOnly />
            <div className="modal-actions">
              <button onClick={() => void copyRawMessage()}>复制</button>
              <button onClick={() => setRawMessage('')}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ tone, icon, value, label }: { tone: string; icon: string; value: string; label: string }) {
  return (
    <article className={`metric-card ${tone}`}>
      <div className="metric-icon">{icon}</div>
      <div>
        <div className="metric-value">{value}</div>
        <div className="metric-label">{label}</div>
      </div>
    </article>
  )
}

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="panel-title">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>
}

function TraceRow({ row, onRaw }: { row: MemberTraceRow; onRaw: (raw: string) => void }) {
  return (
    <tr>
      <td>
        <div className="trace-member">
          <div className="avatar trace-avatar">
            {row.avatarUrl ? <img src={row.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span>{row.memberName.slice(0, 1) || '成'}</span>}
          </div>
          <div>
            <span className="member-name">{row.memberName}</span>
            <span className="wxid">{row.wxid || '-'}</span>
          </div>
        </div>
      </td>
      <td>{row.source}</td>
      <td>{row.groupName}</td>
      <td>{formatDateTime(row.time)}</td>
      <td><span className={`pill ${row.status}`}>{statusText(row.status)}</span></td>
      <td><span className={`pill ${row.attribution}`}>{attributionText(row.attribution)}</span></td>
      <td><button className="raw-cell" onClick={() => onRaw(row.rawContent || '暂无原始消息')}>{row.rawContent || '暂无原始消息'}</button></td>
    </tr>
  )
}

function buildLinePoints(rows: DashboardData['hourlyDistribution']) {
  const normalized = Array.from({ length: 24 }, (_, hour) => rows.find(row => row.hour === hour)?.count || 0)
  const max = Math.max(...normalized, 1)
  const points = normalized.map((count, index) => {
    const x = 12 + index * (286 / 23)
    const y = 170 - (count / max) * 150
    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) }
  })
  const polyline = points.map(point => `${point.x},${point.y}`).join(' ')
  const areaPath = `M${points[0].x} 170 L${points.map(point => `${point.x} ${point.y}`).join(' L')} L${points[points.length - 1].x} 170 Z`
  const circles = points.filter((_, index) => index % 4 === 0 || normalized[index] > 0)
  return { max, polyline, areaPath, circles }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '远程数据暂不可用'
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value || 0)
}

function formatDateTime(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
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

function formatShortTime(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function barColor(index: number) {
  return ['#586aa5', '#bf7bd7', '#59b8ad', '#e3c763', '#e75a6c', '#ffd8b4', '#5b9bea'][index % 7]
}

function statusText(status: string) {
  if (status === 'quit') return '已退出群'
  if (status === 'pending') return '待确认'
  return '未退出群'
}

function attributionText(attribution: string) {
  if (attribution === 'invalid') return '无效'
  if (attribution === 'pending') return '待确认'
  if (attribution === 'none') return '-'
  return '有效'
}

function sanitizeDownloadFilename(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/[\u0000-\u001f]/g, '')
    .trim() || 'download'
}
