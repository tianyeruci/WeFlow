import { NextRequest, NextResponse } from 'next/server'
import { requireSyncToken } from '@/lib/auth'
import { completeWebRefreshRequest } from '@/lib/invite-sync-requests'
import { RemoteDataError } from '@/lib/supabase-rest'

export async function POST(request: NextRequest) {
  const authError = requireSyncToken(request)
  if (authError) return authError

  try {
    const payload = await request.json().catch(() => ({})) as {
      requestId?: number | string
      success?: boolean
      counts?: Record<string, number>
      error?: string
    }
    const requestId = Number(payload.requestId || 0)
    if (!requestId) {
      return NextResponse.json({ error: 'requestId is required' }, { status: 400 })
    }

    await completeWebRefreshRequest({
      requestId,
      success: payload.success === true,
      counts: payload.counts,
      error: payload.error
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof RemoteDataError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to complete refresh request' },
      { status: 500 }
    )
  }
}
