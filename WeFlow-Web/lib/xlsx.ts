import { buildZipArchive, ZipFileEntry } from './zip'

export type GroupMemberXlsxRow = {
  time: string
  inviterName: string
  avatarUrl: string
  memberName: string
  status: string
}

type WorkbookImage = {
  rowIndex: number
  filename: string
  content: Uint8Array
}

type LoadedImage = {
  extension: 'png' | 'jpg' | 'gif'
  content: Uint8Array
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const IMAGE_FETCH_TIMEOUT_MS = 6000
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_SIZE_EMU = 32 * 9525
const IMAGE_COL_OFFSET_EMU = 12 * 9525
const IMAGE_ROW_OFFSET_EMU = 4 * 9525

export async function buildGroupMemberXlsx(rows: GroupMemberXlsxRow[]) {
  const images = await loadWorkbookImages(rows)
  const files: ZipFileEntry[] = [
    { filename: '[Content_Types].xml', content: contentTypesXml(images.length > 0) },
    { filename: '_rels/.rels', content: packageRelsXml() },
    { filename: 'docProps/app.xml', content: appPropertiesXml() },
    { filename: 'docProps/core.xml', content: corePropertiesXml() },
    { filename: 'xl/workbook.xml', content: workbookXml() },
    { filename: 'xl/_rels/workbook.xml.rels', content: workbookRelsXml() },
    { filename: 'xl/styles.xml', content: stylesXml() },
    { filename: 'xl/worksheets/sheet1.xml', content: worksheetXml(rows, images.length > 0) }
  ]

  if (images.length > 0) {
    files.push(
      { filename: 'xl/worksheets/_rels/sheet1.xml.rels', content: worksheetRelsXml() },
      { filename: 'xl/drawings/drawing1.xml', content: drawingXml(images) },
      { filename: 'xl/drawings/_rels/drawing1.xml.rels', content: drawingRelsXml(images) },
      ...images.map(image => ({
        filename: `xl/media/${image.filename}`,
        content: image.content
      }))
    )
  }

  return buildZipArchive(files, { preservePaths: true })
}

export function xlsxResponse(filename: string, body: Uint8Array) {
  return new Response(body, {
    headers: {
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
    }
  })
}

async function loadWorkbookImages(rows: GroupMemberXlsxRow[]) {
  const loaded = await mapWithConcurrency(rows, 6, async (row, index) => {
    const image = await loadImage(row.avatarUrl)
    if (!image) return null

    return {
      rowIndex: index,
      filename: `image${index + 1}.${image.extension}`,
      content: image.content
    }
  })

  return loaded.filter((image): image is WorkbookImage => image !== null)
}

async function loadImage(url: string): Promise<LoadedImage | null> {
  const trimmed = String(url || '').trim()
  if (!trimmed) return null

  const dataImage = loadDataImage(trimmed)
  if (dataImage) return dataImage

  if (!/^https?:\/\//i.test(trimmed)) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(trimmed, {
      signal: controller.signal,
      headers: { Accept: 'image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1' }
    })
    if (!response.ok) return null

    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > MAX_IMAGE_BYTES) return null

    const content = new Uint8Array(await response.arrayBuffer())
    if (content.byteLength === 0 || content.byteLength > MAX_IMAGE_BYTES) return null

    const extension = inferImageExtension(content, response.headers.get('content-type'))
    if (!extension) return null

    return { extension, content }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function loadDataImage(value: string): LoadedImage | null {
  const match = /^data:(image\/(?:png|jpe?g|gif));base64,(.+)$/i.exec(value)
  if (!match) return null

  const extension = imageExtensionFromContentType(match[1])
  if (!extension) return null

  try {
    const content = Buffer.from(match[2], 'base64')
    if (content.byteLength === 0 || content.byteLength > MAX_IMAGE_BYTES) return null
    return { extension, content }
  } catch {
    return null
  }
}

function inferImageExtension(content: Uint8Array, contentType: string | null) {
  if (content[0] === 0x89 && content[1] === 0x50 && content[2] === 0x4e && content[3] === 0x47) return 'png'
  if (content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return 'jpg'
  if (content[0] === 0x47 && content[1] === 0x49 && content[2] === 0x46 && content[3] === 0x38) return 'gif'
  return imageExtensionFromContentType(contentType)
}

function imageExtensionFromContentType(contentType: string | null): LoadedImage['extension'] | null {
  const normalized = String(contentType || '').split(';')[0].trim().toLowerCase()
  if (normalized === 'image/png') return 'png'
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg'
  if (normalized === 'image/gif') return 'gif'
  return null
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.min(limit, items.length)

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }))

  return results
}

function contentTypesXml(hasImages: boolean) {
  return xml([
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    hasImages ? '<Default Extension="png" ContentType="image/png"/>' : '',
    hasImages ? '<Default Extension="jpg" ContentType="image/jpeg"/>' : '',
    hasImages ? '<Default Extension="gif" ContentType="image/gif"/>' : '',
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    hasImages ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : '',
    '</Types>'
  ])
}

function packageRelsXml() {
  return xml([
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>',
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>',
    '</Relationships>'
  ])
}

function workbookRelsXml() {
  return xml([
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '</Relationships>'
  ])
}

function worksheetRelsXml() {
  return xml([
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>',
    '</Relationships>'
  ])
}

function workbookXml() {
  return xml([
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<sheets><sheet name="群成员列表" sheetId="1" r:id="rId1"/></sheets>',
    '</workbook>'
  ])
}

function appPropertiesXml() {
  return xml([
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">',
    '<Application>WeFlow-Web</Application>',
    '</Properties>'
  ])
}

function corePropertiesXml() {
  const timestamp = new Date().toISOString()
  return xml([
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    '<dc:creator>WeFlow-Web</dc:creator>',
    `<dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>`,
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>`,
    '</cp:coreProperties>'
  ])
}

function stylesXml() {
  return xml([
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<fonts count="2">',
    '<font><sz val="11"/><name val="Calibri"/></font>',
    '<font><b/><sz val="11"/><name val="Calibri"/></font>',
    '</fonts>',
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>',
    '<borders count="2">',
    '<border><left/><right/><top/><bottom/><diagonal/></border>',
    '<border><left style="thin"><color rgb="FFD9E2EF"/></left><right style="thin"><color rgb="FFD9E2EF"/></right><top style="thin"><color rgb="FFD9E2EF"/></top><bottom style="thin"><color rgb="FFD9E2EF"/></bottom><diagonal/></border>',
    '</borders>',
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    '<cellXfs count="3">',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"><alignment vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>',
    '</cellXfs>',
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
    '</styleSheet>'
  ])
}

function worksheetXml(rows: GroupMemberXlsxRow[], hasImages: boolean) {
  const lastRow = rows.length + 1
  const bodyRows = rows.map((row, index) => {
    const excelRow = index + 2
    return xml([
      `<row r="${excelRow}" ht="34" customHeight="1">`,
      inlineStringCell(`A${excelRow}`, row.time, 2),
      inlineStringCell(`B${excelRow}`, row.inviterName, 2),
      `<c r="C${excelRow}" s="2"/>`,
      inlineStringCell(`D${excelRow}`, row.memberName, 2),
      inlineStringCell(`E${excelRow}`, row.status, 2),
      '</row>'
    ])
  }).join('')

  return xml([
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    `<dimension ref="A1:E${lastRow}"/>`,
    '<sheetViews><sheetView workbookViewId="0"/></sheetViews>',
    '<sheetFormatPr defaultRowHeight="18"/>',
    '<cols>',
    '<col min="1" max="1" width="20" customWidth="1"/>',
    '<col min="2" max="2" width="24" customWidth="1"/>',
    '<col min="3" max="3" width="10" customWidth="1"/>',
    '<col min="4" max="4" width="24" customWidth="1"/>',
    '<col min="5" max="5" width="16" customWidth="1"/>',
    '</cols>',
    '<sheetData>',
    '<row r="1" ht="22" customHeight="1">',
    inlineStringCell('A1', '时间', 1),
    inlineStringCell('B1', '邀请人', 1),
    inlineStringCell('C1', '头像', 1),
    inlineStringCell('D1', '被邀请人', 1),
    inlineStringCell('E1', '状态', 1),
    '</row>',
    bodyRows,
    '</sheetData>',
    hasImages ? '<drawing r:id="rId1"/>' : '',
    '</worksheet>'
  ])
}

function drawingXml(images: WorkbookImage[]) {
  const anchors = images.map((image, index) => {
    const excelRow = image.rowIndex + 2
    const zeroBasedRow = excelRow - 1
    const relationshipId = `rId${index + 1}`
    const pictureId = index + 2

    return xml([
      '<xdr:oneCellAnchor>',
      '<xdr:from>',
      '<xdr:col>2</xdr:col>',
      `<xdr:colOff>${IMAGE_COL_OFFSET_EMU}</xdr:colOff>`,
      `<xdr:row>${zeroBasedRow}</xdr:row>`,
      `<xdr:rowOff>${IMAGE_ROW_OFFSET_EMU}</xdr:rowOff>`,
      '</xdr:from>',
      `<xdr:ext cx="${IMAGE_SIZE_EMU}" cy="${IMAGE_SIZE_EMU}"/>`,
      '<xdr:pic>',
      '<xdr:nvPicPr>',
      `<xdr:cNvPr id="${pictureId}" name="Avatar ${pictureId}"/>`,
      '<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>',
      '</xdr:nvPicPr>',
      '<xdr:blipFill>',
      `<a:blip r:embed="${relationshipId}"/>`,
      '<a:stretch><a:fillRect/></a:stretch>',
      '</xdr:blipFill>',
      '<xdr:spPr>',
      `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${IMAGE_SIZE_EMU}" cy="${IMAGE_SIZE_EMU}"/></a:xfrm>`,
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
      '</xdr:spPr>',
      '</xdr:pic>',
      '<xdr:clientData/>',
      '</xdr:oneCellAnchor>'
    ])
  }).join('')

  return xml([
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    anchors,
    '</xdr:wsDr>'
  ])
}

function drawingRelsXml(images: WorkbookImage[]) {
  return xml([
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    ...images.map((image, index) => (
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${escapeXmlAttribute(image.filename)}"/>`
    )),
    '</Relationships>'
  ])
}

function inlineStringCell(ref: string, value: string, styleId: number) {
  const text = String(value ?? '')
  return `<c r="${ref}" t="inlineStr" s="${styleId}"><is><t${spaceAttribute(text)}>${escapeXmlText(text)}</t></is></c>`
}

function spaceAttribute(value: string) {
  return /^\s|\s$/.test(value) ? ' xml:space="preserve"' : ''
}

function xml(parts: string[]) {
  return parts.filter(Boolean).join('')
}

function escapeXmlText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeXmlAttribute(value: string) {
  return escapeXmlText(value)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
