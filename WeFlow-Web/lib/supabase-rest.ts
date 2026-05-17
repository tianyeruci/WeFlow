type QueryValue = string | number | boolean | null | undefined

type WriteOptions = {
  onConflict?: string[]
}

export class RemoteDataError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'RemoteDataError'
    this.status = status
  }
}

export async function supabaseSelect<T>(table: string, query: Record<string, QueryValue> = {}) {
  return requestSupabase<T[]>('GET', table, query)
}

export async function supabaseUpsert<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  options: WriteOptions = {}
) {
  if (!rows.length) return
  await requestSupabase('POST', table, options.onConflict ? { on_conflict: options.onConflict.join(',') } : {}, rows, {
    Prefer: 'resolution=merge-duplicates,return=minimal'
  })
}

export async function supabaseDelete(table: string, query: Record<string, QueryValue> = {}) {
  await requestSupabase('DELETE', table, query)
}

async function requestSupabase<T = unknown>(
  method: 'GET' | 'POST' | 'DELETE',
  table: string,
  query: Record<string, QueryValue> = {},
  body?: unknown,
  extraHeaders?: Record<string, string>
) {
  const baseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!baseUrl || !serviceRoleKey) {
    throw new RemoteDataError('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured')
  }

  const url = new URL(`/rest/v1/${table}`, baseUrl)
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })

  const response = await fetch(url, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(extraHeaders || {})
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store'
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new RemoteDataError(detail || response.statusText, response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  if (!text) {
    return undefined as T
  }

  return JSON.parse(text) as T
}
