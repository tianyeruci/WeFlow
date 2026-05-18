export function csvText(headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const lines = [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => row.map(escapeCsv).join(','))
  ]
  return `\uFEFF${lines.join('\n')}`
}

export function csvResponse(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const body = csvText(headers, rows)

  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
    }
  })
}

function escapeCsv(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}
