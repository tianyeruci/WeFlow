import { NextRequest, NextResponse } from 'next/server'
import { requireRemarkToken } from '@/lib/auth'
import { saveGroupRemark } from '@/lib/invite-data'
import { RemoteDataError } from '@/lib/supabase-rest'

const MAX_REMARK_LENGTH = 300

export async function PUT(request: NextRequest) {
  const authError = requireRemarkToken(request)
  if (authError) return authError

  try {
    const payload = await request.json().catch(() => ({})) as {
      accountScope?: unknown
      groupId?: unknown
      remark?: unknown
    }
    const accountScope = String(payload.accountScope || '').trim()
    const groupId = String(payload.groupId || '').trim()
    const remark = String(payload.remark || '').trim()

    if (!accountScope || !groupId) {
      return NextResponse.json({ error: 'accountScope and groupId are required' }, { status: 400 })
    }
    if (remark.length > MAX_REMARK_LENGTH) {
      return NextResponse.json({ error: `群备注不能超过 ${MAX_REMARK_LENGTH} 字` }, { status: 400 })
    }

    const result = await saveGroupRemark({ accountScope, groupId, remark })
    return NextResponse.json({ remark: result })
  } catch (error) {
    if (error instanceof RemoteDataError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to save group remark' }, { status: 500 })
  }
}
