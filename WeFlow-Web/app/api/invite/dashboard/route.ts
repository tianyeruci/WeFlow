import { NextRequest, NextResponse } from 'next/server'
import { requireViewerToken } from '@/lib/auth'
import { getDashboard } from '@/lib/invite-data'
import { RemoteDataError } from '@/lib/supabase-rest'

export async function GET(request: NextRequest) {
  const authError = requireViewerToken(request)
  if (authError) return authError

  const params = request.nextUrl.searchParams

  try {
    const dashboard = await getDashboard({
      tagId: params.get('tagId') || undefined,
      rankingGroupId: params.get('rankingGroupId') || undefined,
      rankingStart: params.get('rankingStart') || undefined,
      rankingEnd: params.get('rankingEnd') || undefined
    })
    return NextResponse.json(
      { dashboard },
      {
        headers: {
          'Cache-Control': 's-maxage=10, stale-while-revalidate=60, stale-if-error=300'
        }
      }
    )
  } catch (error) {
    if (error instanceof RemoteDataError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 })
  }
}
