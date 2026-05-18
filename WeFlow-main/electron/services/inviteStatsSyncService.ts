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

class InviteStatsSyncService {
  private readonly configService = ConfigService.getInstance()
  private syncPromise: Promise<InviteStatsRemoteSyncResult> | null = null
  private autoSyncTimer: ReturnType<typeof setInterval> | null = null
  private readonly autoSyncIntervalMs = 5 * 60 * 1000

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

      const payload = inviteStatsService.exportCurrentScopeSyncPayload({ dirtyOnly: true })
      if (this.isPayloadEmpty(payload)) {
        return {
          success: true,
          accountScope: payload.accountScope,
          counts: this.buildCounts(payload)
        }
      }
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      const result = await this.readResponse(response)
      if (!response.ok) {
        inviteStatsService.markCurrentScopeSyncResult(false, result?.error || `远端同步失败 (${response.status})`)
        return {
          success: false,
          accountScope: payload.accountScope,
          error: result?.error || `远端同步失败 (${response.status})`
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

  private async readResponse(response: Response) {
    const text = await response.text()
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      return { error: text }
    }
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
