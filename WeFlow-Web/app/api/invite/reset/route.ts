import { NextRequest, NextResponse } from 'next/server'
import { requireSyncToken } from '@/lib/auth'
import { resetInviteStatsRemoteData } from '@/lib/invite-sync'
import { RemoteDataError } from '@/lib/supabase-rest'

export async function POST(request: NextRequest) {
  const authError = requireSyncToken(request)
  if (authError) return authError

  try {
    const payload = await request.json().catch(() => ({})) as { confirm?: string }
    if (payload.confirm !== 'RESET_INVITE_STATS') {
      return NextResponse.json({ error: 'confirm must be RESET_INVITE_STATS' }, { status: 400 })
    }

    const result = await resetInviteStatsRemoteData()
    return NextResponse.json({ success: true, result })
  } catch (error) {
    if (error instanceof RemoteDataError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reset invite stats' },
      { status: 500 }
    )
  }
}
