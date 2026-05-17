import { NextRequest, NextResponse } from 'next/server'

export function requireViewerToken(request: NextRequest): NextResponse | null {
  void request
  return null
}

export function requireSyncToken(request: NextRequest): NextResponse | null {
  return requireToken(request, 'REMOTE_SYNC_TOKEN')
}

function requireToken(request: NextRequest, envName: 'REMOTE_SYNC_TOKEN') {
  const expectedToken = process.env[envName]
  if (!expectedToken) {
    return NextResponse.json(
      { error: `${envName} is not configured` },
      { status: 500 }
    )
  }

  const authHeader = request.headers.get('authorization') || ''
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  const queryToken = request.nextUrl.searchParams.get('token') || ''
  const providedToken = bearerToken || queryToken

  if (providedToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
