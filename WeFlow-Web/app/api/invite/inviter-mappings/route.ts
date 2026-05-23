import { NextRequest, NextResponse } from 'next/server'
import { requireSyncToken } from '@/lib/auth'
import { listInviterIdentityMappings } from '@/lib/invite-data'
import { RemoteDataError } from '@/lib/supabase-rest'

export async function GET(request: NextRequest) {
  const authError = requireSyncToken(request)
  if (authError) return authError

  const accountScope = request.nextUrl.searchParams.get('accountScope') || undefined

  try {
    const mappings = await listInviterIdentityMappings(accountScope)
    return NextResponse.json({ mappings })
  } catch (error) {
    if (error instanceof RemoteDataError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to load inviter mappings' }, { status: 500 })
  }
}
