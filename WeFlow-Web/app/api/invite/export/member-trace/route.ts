import { NextRequest } from 'next/server'
import { requireViewerToken } from '@/lib/auth'
import { csvResponse } from '@/lib/csv'
import { getMemberTraceExportRows } from '@/lib/invite-data'
import { RemoteDataError } from '@/lib/supabase-rest'

export async function GET(request: NextRequest) {
  const authError = requireViewerToken(request)
  if (authError) return authError

  const params = request.nextUrl.searchParams

  try {
    const rows = await getMemberTraceExportRows({
      tagId: params.get('tagId') || undefined,
      groupId: params.get('groupId') || undefined,
      keyword: params.get('keyword') || undefined,
      startTime: params.get('startTime') || undefined,
      endTime: params.get('endTime') || undefined,
      status: params.get('status') || undefined,
      attribution: params.get('attribution') || undefined,
      includeQuit: params.get('includeQuit') !== 'false'
    })
    return csvResponse('群成员溯源.csv', ['成员', 'wxid', '来源', '所在群', '时间', '状态', '归因', '原始消息'], rows)
  } catch (error) {
    const message = error instanceof RemoteDataError ? error.message : 'Failed to export member trace'
    return Response.json({ error: message }, { status: error instanceof RemoteDataError ? error.status : 500 })
  }
}
