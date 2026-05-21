import { inviteStatsService, type InviteRemoteSyncPayload } from './inviteStatsService'
import { ConfigService } from './config'
import { net } from 'electron'

export interface InviteStatsRemoteSyncOptions {
  endpoint?: string
  token?: string
  full?: boolean
}

export interface InviteStatsRemoteSyncResult {
  success: boolean
  accountScope?: string
  counts?: Record<string, number>
  skipped?: boolean
  error?: string
}

export interface InviteStatsResetResult {
  success: boolean
  remoteTables?: string[]
  error?: string
}

class InviteStatsSyncService {
  private readonly configService = ConfigService.getInstance()
  private syncPromise: Promise<InviteStatsRemoteSyncResult> | null = null
  private autoSyncTimer: ReturnType<typeof setTimeout> | null = null
  private remoteRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private autoSyncStarted = false
  private remoteRefreshStarted = false
  private remoteRefreshPolling = false
  private readonly autoSyncInitialDelayMs = 11 * 60 * 1000
  private readonly autoSyncIntervalMs = 3 * 60 * 1000
  private readonly remoteRefreshIntervalMs = 5 * 1000
  private readonly remoteRefreshCooldownMs = 30 * 1000
  private readonly maxBatchPayloadBytes = 900 * 1024
  private lastSuccessfulSyncAtMs = 0
  private syncTaskBlocker: (() => boolean) | null = null

  setSyncTaskBlocker(blocker: (() => boolean) | null): void {
    this.syncTaskBlocker = blocker
  }

  private isSyncTaskBlocked(): boolean {
    return this.syncTaskBlocker?.() === true
  }

  async syncCurrentScope(options: InviteStatsRemoteSyncOptions = {}): Promise<InviteStatsRemoteSyncResult> {
    try {
      const endpoint = this.resolveEndpoint(options.endpoint)
      const token = this.resolveToken(options.token)

      if (!endpoint) {
        return { success: false, error: '未配置远端同步地址，请提供 endpoint 或设置 WEFLOW_INVITE_SYNC_URL' }
      }

      if (!token) {
        return { success: false, error: '未配置远端同步令牌，请提供 token 或设置 WEFLOW_INVITE_SYNC_TOKEN' }
      }

      const { payload, snapshot } = await inviteStatsService.exportCurrentScopeSyncPayload({ dirtyOnly: options.full !== true })
      if (this.isPayloadEmpty(payload)) {
        return {
          success: true,
          accountScope: payload.accountScope,
          counts: this.buildCounts(payload)
        }
      }
      const batches = this.buildPayloadBatches(payload)
      for (let index = 0; index < batches.length; index += 1) {
        const response = await this.postPayload(endpoint, token, batches[index])
        const result = await this.readResponse(response)
        if (!response.ok) {
          const suffix = batches.length > 1 ? `，批次 ${index + 1}/${batches.length}` : ''
          const errorMessage = result?.error || `远端同步失败 (${response.status}${suffix})`
          inviteStatsService.markCurrentScopeSyncResult(false, errorMessage, snapshot)
          return {
            success: false,
            accountScope: payload.accountScope,
            error: errorMessage
          }
        }
      }

      inviteStatsService.markCurrentScopeSyncResult(true, '', snapshot)
      return {
        success: true,
        accountScope: payload.accountScope,
        counts: this.buildCounts(payload)
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  queueSync(options: InviteStatsRemoteSyncOptions = {}): Promise<InviteStatsRemoteSyncResult> {
    if (this.syncPromise || this.isSyncTaskBlocked()) {
      return Promise.resolve({ success: true, skipped: true })
    }
    this.syncPromise = (async () => {
      try {
        await inviteStatsService.ensureBackgroundScanComplete()
        const result = await this.syncCurrentScope(options)
        if (result.success && !result.skipped) {
          this.lastSuccessfulSyncAtMs = Date.now()
        }
        return result
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    })().finally(() => {
      this.syncPromise = null
    })
    return this.syncPromise
  }

  async resetAllData(options: InviteStatsRemoteSyncOptions = {}): Promise<InviteStatsResetResult> {
    try {
      const endpoint = this.resolveEndpoint(options.endpoint)
      const token = this.resolveToken(options.token)

      if (!endpoint) {
        return { success: false, error: '未配置远端同步地址，无法清理远端表数据' }
      }

      if (!token) {
        return { success: false, error: '未配置远端同步 Token，无法清理远端表数据' }
      }

      let response = await this.postResetPayload(this.resolveResetEndpoint(endpoint), token, false)
      let result = await this.readResponse(response, 'reset') as { error?: string; result?: { tables?: string[] } } | null

      if (response.status === 404) {
        response = await this.postResetPayload(endpoint, token, true)
        result = await this.readResponse(response, 'sync') as { error?: string; result?: { tables?: string[] } } | null
      }

      if (!response.ok) {
        return {
          success: false,
          error: result?.error || `远端恢复初始化失败 (${response.status})`
        }
      }

      const localResult = await inviteStatsService.resetAllLocalData()
      if (!localResult.success) {
        return { success: false, error: localResult.error || '本地记录清理失败' }
      }

      return {
        success: true,
        remoteTables: result?.result?.tables || []
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  startAutoSyncScheduler(): void {
    if (this.autoSyncStarted) return
    this.autoSyncStarted = true
    const firstTimer = setTimeout(() => {
      this.autoSyncTimer = null
      void this.queueSync()
      if (!this.autoSyncStarted) return
      const intervalTimer = setInterval(() => {
        void this.queueSync()
      }, this.autoSyncIntervalMs)
      if (typeof intervalTimer.unref === 'function') intervalTimer.unref()
      this.autoSyncTimer = intervalTimer
    }, this.autoSyncInitialDelayMs)
    if (typeof firstTimer.unref === 'function') firstTimer.unref()
    this.autoSyncTimer = firstTimer
  }

  stopAutoSyncScheduler(): void {
    if (this.autoSyncTimer) clearTimeout(this.autoSyncTimer)
    this.autoSyncTimer = null
    this.autoSyncStarted = false
  }

  startRemoteRefreshScheduler(): void {
    if (this.remoteRefreshStarted) return
    this.remoteRefreshStarted = true

    const scheduleNext = (delayMs: number) => {
      const timer = setTimeout(async () => {
        this.remoteRefreshTimer = null
        await this.pollRemoteRefreshRequest()
        if (this.remoteRefreshStarted) scheduleNext(this.remoteRefreshIntervalMs)
      }, delayMs)
      if (typeof timer.unref === 'function') timer.unref()
      this.remoteRefreshTimer = timer
    }

    scheduleNext(this.remoteRefreshIntervalMs)
  }

  stopRemoteRefreshScheduler(): void {
    if (this.remoteRefreshTimer) clearTimeout(this.remoteRefreshTimer)
    this.remoteRefreshTimer = null
    this.remoteRefreshStarted = false
    this.remoteRefreshPolling = false
  }

  getResolvedOptions(): Required<InviteStatsRemoteSyncOptions> {
    return {
      endpoint: this.resolveEndpoint(),
      token: this.resolveToken(),
      full: false
    }
  }

  private async pollRemoteRefreshRequest(): Promise<void> {
    if (this.remoteRefreshPolling) return
    this.remoteRefreshPolling = true
    try {
      const endpoint = this.resolveEndpoint()
      const token = this.resolveToken()
      if (!endpoint || !token) return

      const latestEndpoint = this.resolveSyncRequestEndpoint(endpoint, '/latest')
      const latestResponse = await this.fetchWithRetry(latestEndpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      }, 'Peek remote refresh request')
      const latestPayload = await this.readResponse(latestResponse) as { requestId?: number | null; error?: string } | null
      if (!latestResponse.ok) {
        console.warn('[InviteStatsSync] Remote refresh peek failed:', latestPayload?.error || latestResponse.status)
        return
      }

      const latestRequestId = Number(latestPayload?.requestId || 0)
      if (!latestRequestId) return
      if (this.syncPromise || this.isSyncTaskBlocked() || this.isRemoteRefreshCooldownActive()) return

      const nextEndpoint = this.resolveSyncRequestEndpoint(endpoint, '/next')
      const response = await this.fetchWithRetry(nextEndpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      }, '轮询远程刷新请求')
      const payload = await this.readResponse(response) as { requestId?: number | null; error?: string } | null
      if (!response.ok) {
        console.warn('[InviteStatsSync] Remote refresh polling failed:', payload?.error || response.status)
        return
      }

      const requestId = Number(payload?.requestId || 0)
      if (!requestId) return

      const result = await this.queueSync({ endpoint, token, full: true })
      await this.completeRemoteRefreshRequest(endpoint, token, requestId, result)
    } catch (error) {
      console.warn('[InviteStatsSync] Remote refresh polling error:', error)
    } finally {
      this.remoteRefreshPolling = false
    }
  }

  private isRemoteRefreshCooldownActive(): boolean {
    return this.lastSuccessfulSyncAtMs > 0 &&
      Date.now() - this.lastSuccessfulSyncAtMs < this.remoteRefreshCooldownMs
  }

  private async completeRemoteRefreshRequest(
    endpoint: string,
    token: string,
    requestId: number,
    result: InviteStatsRemoteSyncResult
  ): Promise<void> {
    try {
      await this.fetchWithRetry(this.resolveSyncRequestEndpoint(endpoint, '/complete'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          requestId,
          success: result.skipped ? false : result.success,
          counts: result.counts || {},
          error: result.skipped ? (result.error || '同步任务正在运行，已跳过') : (result.error || '')
        })
      }, '完成远程刷新请求')
    } catch (error) {
      console.warn('[InviteStatsSync] Failed to complete remote refresh request:', error)
    }
  }

  private resolveEndpoint(input?: string) {
    return String(
      input ||
      this.configService.get('inviteRemoteSyncUrl') ||
      process.env.WEFLOW_INVITE_SYNC_URL ||
      ''
    ).trim()
  }

  private resolveToken(input?: string) {
    return String(
      input ||
      this.configService.get('inviteRemoteSyncToken') ||
      process.env.WEFLOW_INVITE_SYNC_TOKEN ||
      ''
    ).trim()
  }

  private async fetchWithRetry(endpoint: string, init: RequestInit, label: string): Promise<Response> {
    let lastError: unknown = null
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await this.request(endpoint, init)
      } catch (error) {
        lastError = error
        const message = this.describeRequestError(label, endpoint, error)
        console.warn('[InviteStatsSync]', message)
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      }
    }
    throw new Error(this.describeRequestError(label, endpoint, lastError))
  }

  private async request(endpoint: string, init: RequestInit): Promise<Response> {
    if (net && typeof net.fetch === 'function') {
      return net.fetch(endpoint, init as any) as Promise<Response>
    }
    return fetch(endpoint, init)
  }

  private describeRequestError(label: string, endpoint: string, error: unknown): string {
    const err = error instanceof Error ? error : new Error(String(error))
    const cause = (err as Error & { cause?: any }).cause
    const parts = [label, endpoint, err.message]
    if (cause) {
      const causeParts: string[] = []
      if (cause.name) causeParts.push(String(cause.name))
      if (cause.code !== undefined) causeParts.push(`code=${cause.code}`)
      if (cause.errno !== undefined) causeParts.push(`errno=${cause.errno}`)
      if (cause.message && cause.message !== err.message) causeParts.push(String(cause.message))
      if (causeParts.length > 0) parts.push(`cause=${causeParts.join(' ')}`)
    }
    return parts.filter(Boolean).join(' | ')
  }

  private resolveSyncRequestEndpoint(endpoint: string, suffix: '/next' | '/complete' | '/latest') {
    try {
      const url = new URL(endpoint)
      if (/\/api\/invite\/[^/]+\/?$/.test(url.pathname)) {
        url.pathname = url.pathname.replace(/\/api\/invite\/[^/]+\/?$/, `/api/invite/sync-request${suffix}`)
      } else {
        url.pathname = `${url.pathname.replace(/\/$/, '')}/sync-request${suffix}`
      }
      url.search = ''
      return url.toString()
    } catch {
      return endpoint.replace(/\/sync(\?.*)?$/, `/sync-request${suffix}`)
    }
  }

  private async postPayload(endpoint: string, token: string, payload: InviteRemoteSyncPayload) {
    return this.fetchWithRetry(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }, '同步本地数据')
  }

  private async postResetPayload(endpoint: string, token: string, useSyncCompatibility: boolean) {
    return this.fetchWithRetry(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(useSyncCompatibility
        ? { action: 'reset', confirm: 'RESET_INVITE_STATS' }
        : { confirm: 'RESET_INVITE_STATS' })
    }, useSyncCompatibility ? '恢复初始化（兼容同步）' : '恢复初始化')
  }

  private resolveResetEndpoint(endpoint: string) {
    try {
      const url = new URL(endpoint)
      if (url.pathname.endsWith('/reset')) return url.toString()
      if (url.pathname.endsWith('/sync')) {
        url.pathname = url.pathname.replace(/\/sync$/, '/reset')
        return url.toString()
      }
      url.pathname = `${url.pathname.replace(/\/$/, '')}/reset`
      return url.toString()
    } catch {
      return endpoint.replace(/\/sync(\?.*)?$/, '/reset$1')
    }
  }

  private buildPayloadBatches(payload: InviteRemoteSyncPayload): InviteRemoteSyncPayload[] {
    const batches: InviteRemoteSyncPayload[] = []
    let current = this.createEmptyPayload(payload.accountScope)

    const appendRows = (key: keyof Omit<InviteRemoteSyncPayload, 'accountScope'>) => {
      for (const row of payload[key]) {
        const next = {
          ...current,
          [key]: [...current[key], row]
        }

        if (!this.isPayloadEmpty(current) && this.measurePayloadBytes(next) > this.maxBatchPayloadBytes) {
          batches.push(current)
          current = this.createEmptyPayload(payload.accountScope)
        }

        current[key].push(row)
      }
    }

    appendRows('activityTags')
    appendRows('groupTagBindings')
    appendRows('rawEvents')
    appendRows('inviteEvents')
    appendRows('quitEvents')
    appendRows('memberIdentityBindings')
    appendRows('scanLogs')

    if (!this.isPayloadEmpty(current)) batches.push(current)
    return batches.length ? batches : [this.createEmptyPayload(payload.accountScope)]
  }

  private createEmptyPayload(accountScope: string): InviteRemoteSyncPayload {
    return {
      accountScope,
      activityTags: [],
      groupTagBindings: [],
      rawEvents: [],
      inviteEvents: [],
      quitEvents: [],
      memberIdentityBindings: [],
      scanLogs: []
    }
  }

  private measurePayloadBytes(payload: InviteRemoteSyncPayload) {
    return Buffer.byteLength(JSON.stringify(payload), 'utf8')
  }

  private async readResponse(response: Response, expectedRoute: 'sync' | 'reset' = 'sync'): Promise<{ error?: string } | null> {
    const text = await response.text()
    if (!text) return null

    if (this.isVercelAuthPage(text)) {
      return {
        error: '远端同步地址被 Vercel 部署保护拦截。请改用未开启保护的生产域名，或在 Vercel 里关闭 Deployment Protection / 配置 bypass token。'
      }
    }

    try {
      return JSON.parse(text)
    } catch {
      return { error: this.compactResponseText(text, response.status, expectedRoute) }
    }
  }

  private isVercelAuthPage(text: string) {
    return text.includes('Authentication Required') && text.includes('Vercel')
  }

  private compactResponseText(text: string, status: number, expectedRoute: 'sync' | 'reset') {
    const trimmed = text.trim()
    const looksLikeHtml = /^<!doctype html/i.test(trimmed) || /^<html/i.test(trimmed)
    if (looksLikeHtml) {
      const routePath = expectedRoute === 'reset' ? '/api/invite/reset' : '/api/invite/sync'
      return `远端接口返回了 HTML 页面，请确认 WeFlow-Web 已部署最新代码，并且地址可访问 ${routePath} (${status})`
    }
    return trimmed.slice(0, 300)
  }

  private buildCounts(payload: InviteRemoteSyncPayload) {
    return {
      activityTags: payload.activityTags.length,
      groupTagBindings: payload.groupTagBindings.length,
      rawEvents: payload.rawEvents.length,
      inviteEvents: payload.inviteEvents.length,
      quitEvents: payload.quitEvents.length,
      memberIdentityBindings: payload.memberIdentityBindings.length,
      scanLogs: payload.scanLogs.length
    }
  }

  private isPayloadEmpty(payload: InviteRemoteSyncPayload) {
    return Object.values(this.buildCounts(payload)).every((count) => count === 0)
  }
}

export const inviteStatsSyncService = new InviteStatsSyncService()
