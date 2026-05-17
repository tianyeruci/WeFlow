import { NextRequest, NextResponse } from 'next/server'
import { requireViewerToken } from '@/lib/auth'
import { listActivityTags } from '@/lib/invite-data'
import { RemoteDataError } from '@/lib/supabase-rest'

export async function GET(request: NextRequest) {
  const authError = requireViewerToken(request)
  if (authError) return authError

  try {
    return NextResponse.json({ tags: await listActivityTags() })
  } catch (error) {
    return toErrorResponse(error)
  }
}

function toErrorResponse(error: unknown) {
  if (error instanceof RemoteDataError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  return NextResponse.json({ error: 'Failed to load activity tags' }, { status: 500 })
}
