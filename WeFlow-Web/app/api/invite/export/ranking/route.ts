import { NextRequest } from 'next/server'
import { requireViewerToken } from '@/lib/auth'
import { csvResponse } from '@/lib/csv'
import { getRankingExportRows } from '@/lib/invite-data'
import { RemoteDataError } from '@/lib/supabase-rest'

export async function GET(request: NextRequest) {
  const authError = requireViewerToken(request)
  if (authError) return authError

  const params = request.nextUrl.searchParams

  try {
    const rows = await getRankingExportRows({
      tagId: params.get('tagId') || undefined,
      rankingGroupId: params.get('rankingGroupId') || undefined,
      rankingStart: params.get('rankingStart') || undefined,
      rankingEnd: params.get('rankingEnd') || undefined
    })
    return csvResponse('邀请排行榜.csv', ['邀请人', '邀请人 wxid', '邀请人数'], rows)
  } catch (error) {
    const message = error instanceof RemoteDataError ? error.message : 'Failed to export ranking'
    return Response.json({ error: message }, { status: error instanceof RemoteDataError ? error.status : 500 })
  }
}
