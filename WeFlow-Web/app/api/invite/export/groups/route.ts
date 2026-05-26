import { NextRequest } from 'next/server'
import { requireViewerToken } from '@/lib/auth'
import { csvResponse } from '@/lib/csv'
import {
  getBatchGroupMemberExportFiles,
  getGroupListExportRows,
  getGroupMemberExportRows,
  getGroupSummaryExportRows
} from '@/lib/invite-data'
import { buildZipArchive } from '@/lib/zip'
import { RemoteDataError } from '@/lib/supabase-rest'

export async function GET(request: NextRequest) {
  const authError = requireViewerToken(request)
  if (authError) return authError

  const params = request.nextUrl.searchParams
  const mode = params.get('mode') || 'summary'

  try {
    if (mode === 'summary') {
      const rows = await getGroupSummaryExportRows({
        tagId: params.get('tagId') || undefined,
        includeQuit: params.get('includeQuit') !== 'false'
      })
      return csvResponse('发售群人数汇总.csv', ['范围', '群数量', '人数', '统计口径'], rows)
    }

    if (mode === 'list') {
      const rows = await getGroupListExportRows({
        tagId: params.get('tagId') || undefined,
        sort: toGroupSort(params.get('sort'))
      })
      return csvResponse('发售群列表.csv', ['群名称', '群ID', '群备注', '人数'], rows)
    }

    if (mode === 'member') {
      const groupId = params.get('groupId') || ''
      if (!groupId) {
        return Response.json({ error: 'groupId is required' }, { status: 400 })
      }
      const rows = await getGroupMemberExportRows({
        tagId: params.get('tagId') || undefined,
        groupId
      })
      const groupName = sanitizeFilename(params.get('groupName') || groupId)
      return csvResponse(`${groupName}.csv`, ['时间', '邀请人', '被邀请人', '状态'], rows)
    }

    if (mode === 'batch') {
      const files = await getBatchGroupMemberExportFiles({
        tagId: params.get('tagId') || undefined
      })
      const archive = buildZipArchive(files)
      return new Response(archive, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('发售群员批量.zip')}`
        }
      })
    }

    return Response.json({ error: 'Unsupported export mode' }, { status: 400 })
  } catch (error) {
    const message = error instanceof RemoteDataError ? error.message : 'Failed to export groups'
    return Response.json({ error: message }, { status: error instanceof RemoteDataError ? error.status : 500 })
  }
}

function toGroupSort(value: string | null) {
  if (value === 'count_asc' || value === 'count_desc') return value
  return undefined
}

function sanitizeFilename(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/[\u0000-\u001f]/g, '')
    .trim() || 'download'
}
