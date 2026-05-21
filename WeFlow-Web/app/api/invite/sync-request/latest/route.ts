import { NextRequest, NextResponse } from 'next/server'
import { requireSyncToken } from '@/lib/auth'
import { peekLatestWebRefreshRequest } from '@/lib/invite-sync-requests'
import { RemoteDataError } from '@/lib/supabase-rest'

export async function GET(request: NextRequest) {
  const authError = requireSyncToken(request)
  if (authError) return authError

  try {
    return NextResponse.json(await peekLatestWebRefreshRequest())
  } catch (error) {
    if (error instanceof RemoteDataError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to peek refresh request' },
      { status: 500 }
    )
  }
}
