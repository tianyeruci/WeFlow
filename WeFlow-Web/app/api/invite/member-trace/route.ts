import { NextRequest, NextResponse } from 'next/server'
import { requireViewerToken } from '@/lib/auth'
import { getMemberTrace } from '@/lib/invite-data'
import { RemoteDataError } from '@/lib/supabase-rest'

export async function GET(request: NextRequest) {
  const authError = requireViewerToken(request)
  if (authError) return authError

  const params = request.nextUrl.searchParams

  try {
    const trace = await getMemberTrace({
      tagId: params.get('tagId') || undefined,
      groupId: params.get('groupId') || undefined,
      keyword: params.get('keyword') || undefined,
      startTime: params.get('startTime') || undefined,
      endTime: params.get('endTime') || undefined,
      status: params.get('status') || undefined,
      attribution: params.get('attribution') || undefined,
      includeQuit: params.get('includeQuit') !== 'false',
      limit: boundedNumber(params.get('limit'), 200, 1, 500),
      offset: boundedNumber(params.get('offset'), 0, 0, 1000000)
    })
    return NextResponse.json({ trace })
  } catch (error) {
    if (error instanceof RemoteDataError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to load member trace' }, { status: 500 })
  }
}

function boundedNumber(value: string | null, fallback: number, min: number, max: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.floor(numeric)))
}
