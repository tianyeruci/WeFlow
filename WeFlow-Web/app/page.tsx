'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ActivityTag, DashboardData, MemberTraceData, MemberTraceRow } from '@/types/invite'

type ViewKey = 'dashboard' | 'trace'
type ChartMode = 'bar' | 'pie'
const DASHBOARD_POLL_INTERVAL_MS = 10000

const emptyDashboard: DashboardData = {
  cards: {
    activeRobots: 0,
    monitoredGroups: 0,
    totalMembers: 0,
    totalMembersWithQuit: 0,
    todayNew: 0,
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

export default function RemoteViewerPage() {
  const [view, setView] = useState<ViewKey>('dashboard')
  const [tags, setTags] = useState<ActivityTag[]>([])
  const [selectedTagId, setSelectedTagId] = useState('')
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
  const [traceIncludeQuit, setTraceIncludeQuit] = useState(true)
  const [rawMessage, setRawMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedTag = useMemo(
    () => tags.find(tag => tag.id === selectedTagId),
    [tags, selectedTagId]
  )

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
      setSelectedTagId(current => current || payload.tags[0]?.id || '')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [apiGet])

  const loadDashboard = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!selectedTagId) return
    const params = new URLSearchParams({ tagId: selectedTagId })
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
    if (!selectedTagId) return
    const params = new URLSearchParams({ tagId: selectedTagId })
    if (traceGroupId) params.set('groupId', traceGroupId)
    if (traceKeyword.trim()) params.set('keyword', traceKeyword.trim())
    if (traceStart) params.set('startTime', traceStart)
    if (traceEnd) params.set('endTime', traceEnd)
    if (traceStatus) params.set('status', traceStatus)
    if (traceAttribution) params.set('attribution', traceAttribution)
    params.set('includeQuit', String(traceIncludeQuit))

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
  }, [apiGet, selectedTagId, traceAttribution, traceEnd, traceGroupId, traceIncludeQuit, traceKeyword, traceStart, traceStatus])

  useEffect(() => {
    void loadTags()
  }, [loadTags])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    if (view !== 'dashboard' || !selectedTagId) return

    const timer = window.setInterval(() => {
      void loadDashboard({ silent: true })
    }, DASHBOARD_POLL_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [loadDashboard, selectedTagId, view])

  useEffect(() => {
    if (view === 'trace') void loadTrace()
  }, [loadTrace, view])

  async function exportCsv(type: 'ranking' | 'trace') {
    if (!selectedTagId) return
    const params = new URLSearchParams({ tagId: selectedTagId })
    let endpoint = '/api/invite/export/ranking'

    if (type === 'ranking') {
      if (rankingGroupId) params.set('rankingGroupId', rankingGroupId)
      if (rankingStart) params.set('rankingStart', rankingStart)
      if (rankingEnd) params.set('rankingEnd', rankingEnd)
    } else {
      endpoint = '/api/invite/export/member-trace'
      if (traceGroupId) params.set('groupId', traceGroupId)
      if (traceKeyword.trim()) params.set('keyword', traceKeyword.trim())
      if (traceStart) params.set('startTime', traceStart)
      if (traceEnd) params.set('endTime', traceEnd)
      if (traceStatus) params.set('status', traceStatus)
      if (traceAttribution) params.set('attribution', traceAttribution)
      params.set('includeQuit', String(traceIncludeQuit))
    }

    const response = await fetch(`${endpoint}?${params}`)
    if (!response.ok) {
      setError('导出失败，请检查远程数据配置')
      return
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = type === 'ranking' ? '邀请排行榜.csv' : '群成员溯源.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const memberTotal = includeQuitInTotal ? dashboard.cards.totalMembersWithQuit : dashboard.cards.totalMembers
  const rankingMax = Math.max(...dashboard.inviteRanking.map(row => row.count), 1)
  const groupMax = Math.max(...dashboard.groupRanking.map(row => row.count), 1)
  const chartPoints = buildLinePoints(dashboard.hourlyDistribution)

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <strong>WeFlow 邀请统计</strong>
          <span>远程用户大屏</span>
        </div>
        <nav className="screen-nav" aria-label="远程用户视图">
          <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>▥ 数据大屏</button>
          <button className={view === 'trace' ? 'active' : ''} onClick={() => setView('trace')}>♙ 群成员溯源</button>
        </nav>
        <div className="topbar-spacer" aria-hidden="true" />
      </header>

      <main className="screen">
            <section className="toolbar" aria-label="远程用户筛选区">
              <label className="field">
                <span>活动标签</span>
                <select value={selectedTagId} onChange={event => setSelectedTagId(event.target.value)}>
                  {tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                </select>
              </label>
            </section>

            {error && <div className="error-banner">{error}</div>}
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
                  <MetricCard tone="red" icon="待" value={formatNumber(dashboard.cards.pendingCount)} label="待处理数" />
                </section>

                <section className="dashboard-main">
                  <div className="left-column">
                    <section className="panel">
                      <PanelTitle title="进群时段分布" subtitle="按当前活动标签全部有效入群记录统计" />
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
                      <PanelTitle title="群人数展示" subtitle="当前活动标签下群成员规模" />
                      <div className="group-rank">
                        {dashboard.groupRanking.slice(0, 6).map((row, index) => (
                          <div className="group-row" key={row.groupId}>
                            <div className={`rank-no rank-${index + 1}`}>{index + 1}</div>
                            <div>
                              <div className="group-name">{row.groupName}</div>
                              <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(4, row.count / groupMax * 100)}%` }} /></div>
                            </div>
                            <div className="group-count">{formatNumber(row.count)} 人</div>
                          </div>
                        ))}
                        {dashboard.groupRanking.length === 0 && <EmptyState text="暂无群人数数据" />}
                      </div>
                    </section>
                  </div>

                  <section className="panel ranking-panel">
                    <div className="panel-title">
                      <div>
                        <h2>邀请人数排行榜</h2>
                        <p>【{selectedTag?.name || '当前活动'}】招募者 {dashboard.inviteRanking.length} 名，有效入群人数 {formatNumber(memberTotal)}</p>
                      </div>
                      <div className="panel-actions">
                        <button className={`icon-btn ${chartMode === 'bar' ? 'active' : ''}`} title="柱状图" onClick={() => setChartMode('bar')}>▥</button>
                        <button className={`icon-btn ${chartMode === 'pie' ? 'active' : ''}`} title="占比图" onClick={() => setChartMode('pie')}>◔</button>
                        <button className="icon-btn" title="导出" onClick={() => void exportCsv('ranking')}>⇩</button>
                      </div>
                    </div>
                    <div className="ranking-toolbar">
                      <select value={rankingGroupId} onChange={event => setRankingGroupId(event.target.value)}>
                        <option value="">当前活动下全部群</option>
                        {dashboard.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
                      </select>
                      <div className="datetime-range" aria-label="排行榜时间范围">
                        <input type="datetime-local" step="1" aria-label="排行榜开始时间" value={rankingStart} onChange={event => setRankingStart(event.target.value)} />
                        <input type="datetime-local" step="1" aria-label="排行榜结束时间" value={rankingEnd} onChange={event => setRankingEnd(event.target.value)} />
                      </div>
                      <button onClick={() => void exportCsv('ranking')}>导出</button>
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
                          <div className="avatar">{row.memberName.slice(0, 1) || '成'}</div>
                          <div className="activity-main">
                            <strong>{row.memberName}</strong>
                            <span>邀请 · {row.inviterName}<br />{row.groupName}</span>
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
                      <option value="active">未退出</option>
                      <option value="quit">退出</option>
                      <option value="pending">待确认</option>
                    </select>
                    <select value={traceAttribution} onChange={event => setTraceAttribution(event.target.value)} aria-label="归因筛选">
                      <option value="">全部归因</option>
                      <option value="valid">有效</option>
                      <option value="invalid">无效</option>
                      <option value="pending">待确认</option>
                    </select>
                    <label className="check"><input type="checkbox" checked={traceIncludeQuit} onChange={event => setTraceIncludeQuit(event.target.checked)} /> 含退群</label>
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
            <div className="modal-actions"><button onClick={() => setRawMessage('')}>关闭</button></div>
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
      <td><span className="member-name">{row.memberName}</span><span className="wxid">{row.wxid || '-'}</span></td>
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
  if (status === 'quit') return '已退出'
  if (status === 'pending') return '待确认'
  return '未退出'
}

function attributionText(attribution: string) {
  if (attribution === 'invalid') return '无效'
  if (attribution === 'pending') return '待确认'
  return '有效'
}
