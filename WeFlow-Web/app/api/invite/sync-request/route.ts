import { NextRequest, NextResponse } from 'next/server'
import { createWebRefreshRequest } from '@/lib/invite-sync-requests'
import { RemoteDataError } from '@/lib/supabase-rest'

export async function POST(request: NextRequest) {
  try {
    const result = await createWebRefreshRequest(request)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof RemoteDataError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create refresh request' },
      { status: 500 }
    )
  }
}
