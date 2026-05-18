import { inviteStatsService, type InviteRemoteSyncPayload } from './inviteStatsService'
import { ConfigService } from './config'

export interface InviteStatsRemoteSyncOptions {
  endpoint?: string
  token?: string
}

export interface InviteStatsRemoteSyncResult {
  success: boolean
  accountScope?: string
  counts?: Record<string, number>
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
  private autoSyncTimer: ReturnType<typeof setInterval> | null = null
  private readonly autoSyncIntervalMs = 3 * 60 * 1000
  private readonly maxBatchPayloadBytes = 900 * 1024

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

      const payload = await inviteStatsService.exportCurrentScopeSyncPayload({ dirtyOnly: true })
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
          inviteStatsService.markCurrentScopeSyncResult(false, errorMessage)
          return {
            success: false,
            accountScope: payload.accountScope,
            error: errorMessage
          }
        }
      }

      inviteStatsService.markCurrentScopeSyncResult(true)
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
    if (this.syncPromise) return this.syncPromise
    this.syncPromise = this.syncCurrentScope(options).finally(() => {
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
    if (this.autoSyncTimer) return
    this.autoSyncTimer = setInterval(() => {
      void this.queueSync()
    }, this.autoSyncIntervalMs)
    if (typeof this.autoSyncTimer.unref === 'function') this.autoSyncTimer.unref()
  }

  stopAutoSyncScheduler(): void {
    if (!this.autoSyncTimer) return
    clearInterval(this.autoSyncTimer)
    this.autoSyncTimer = null
  }

  getResolvedOptions(): Required<InviteStatsRemoteSyncOptions> {
    return {
      endpoint: this.resolveEndpoint(),
      token: this.resolveToken()
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

  private async postPayload(endpoint: string, token: string, payload: InviteRemoteSyncPayload) {
    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })
  }

  private async postResetPayload(endpoint: string, token: string, useSyncCompatibility: boolean) {
    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(useSyncCompatibility
        ? { action: 'reset', confirm: 'RESET_INVITE_STATS' }
        : { confirm: 'RESET_INVITE_STATS' })
    })
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
