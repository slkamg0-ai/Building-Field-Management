import crypto from 'crypto'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
]

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64url')
}

function serviceAccountPrivateKey() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || ''
  return raw.replace(/\\n/g, '\n')
}

async function getOAuthAccessToken() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) return null

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.error_description || json?.error || 'Google OAuth 토큰 발급 실패')
  }
  return json.access_token as string
}

async function getServiceAccountAccessToken() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = serviceAccountPrivateKey()
  if (!clientEmail || !privateKey) return null

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = base64url(JSON.stringify({
    iss: clientEmail,
    scope: SCOPES.join(' '),
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  }))
  const unsigned = `${header}.${claim}`
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url')

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.error_description || json?.error || 'Google 서비스 계정 토큰 발급 실패')
  }
  return json.access_token as string
}

async function getAccessToken() {
  const oauthToken = await getOAuthAccessToken()
  if (oauthToken) return oauthToken

  const serviceAccountToken = await getServiceAccountAccessToken()
  if (serviceAccountToken) return serviceAccountToken

  throw new Error('Google 인증 환경변수가 설정되지 않았습니다. OAuth 방식은 GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN이 필요합니다.')
}

function spreadsheetUrl(id: string) {
  return `https://docs.google.com/spreadsheets/d/${id}/edit`
}

function driveFileUrl(id: string) {
  return `https://drive.google.com/file/d/${id}/view`
}

export async function readSheetValues(spreadsheetId: string, sheetName: string, range: string) {
  const token = await getAccessToken()
  const a1 = `${sheetName}!${range}`
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(a1)}?valueRenderOption=FORMATTED_VALUE`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.error?.message || 'Google Sheet 읽기 실패')
  }
  return (json.values || []) as string[][]
}

export function rowsToObjects(values: string[][]) {
  const [headers, ...rows] = values
  if (!headers?.length) return []
  return rows
    .filter(row => row.some(cell => String(cell || '').trim()))
    .map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])))
}

export async function createSpreadsheet(title: string, sheetTitle: string) {
  const token = await getAccessToken()
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: sheetTitle, gridProperties: { frozenRowCount: 4 } } }],
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message || 'Google Spreadsheet 생성 실패')
  const sheetId = json.sheets?.[0]?.properties?.sheetId as number | undefined
  return { id: json.spreadsheetId as string, url: spreadsheetUrl(json.spreadsheetId), sheetId }
}

export async function moveDriveFileToFolder(fileId: string, folderId?: string | null, removeFolderId?: string | null) {
  if (!folderId) return
  const token = await getAccessToken()
  const params = new URLSearchParams({
    addParents: folderId,
    fields: 'id,parents',
  })
  if (removeFolderId) params.set('removeParents', removeFolderId)
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message || 'Drive 폴더 이동 실패')
  return json as { id: string; parents?: string[] }
}

export async function trashDriveFile(fileId: string) {
  const token = await getAccessToken()
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,trashed`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trashed: true }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message || 'Drive 파일 휴지통 이동 실패')
  return json as { id: string; trashed: boolean }
}

export async function writeSheetValues(spreadsheetId: string, sheetName: string, values: unknown[][]) {
  const token = await getAccessToken()
  const range = `${sheetName}!A1`
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message || 'Google Sheet 쓰기 실패')
}

export async function appendSheetValues(spreadsheetId: string, sheetName: string, values: unknown[][]) {
  const token = await getAccessToken()
  const range = `${sheetName}!A1`
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message || 'Google Sheet 행 추가 실패')
  return json
}

function driveQueryLiteral(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export type DriveFile = {
  id: string
  name: string
  mimeType: string
  size?: string
  webViewLink?: string
  parents?: string[]
  modifiedTime?: string
}

export async function listDriveFolderFiles(folderId: string, pageSize: number = 50) {
  const token = await getAccessToken()
  const q = `'${driveQueryLiteral(folderId)}' in parents and trashed = false`
  const params = new URLSearchParams({
    q,
    pageSize: String(pageSize),
    fields: 'files(id,name,mimeType,size,webViewLink,parents,modifiedTime)',
    orderBy: 'modifiedTime desc',
  })
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message || 'Drive 폴더 목록 조회 실패')
  return (json.files || []) as DriveFile[]
}

export async function downloadDriveFile(fileId: string) {
  const token = await getAccessToken()
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Drive 파일 다운로드 실패')
  }
  return Buffer.from(await res.arrayBuffer())
}

export async function createDriveFolder(name: string, parentFolderId: string) {
  const token = await getAccessToken()
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message || 'Drive 폴더 생성 실패')
  return { id: json.id as string, name: json.name as string, url: (json.webViewLink as string) || `https://drive.google.com/drive/folders/${json.id}` }
}

export async function findDriveFolderByName(parentFolderId: string, name: string) {
  const token = await getAccessToken()
  const safeName = driveQueryLiteral(name)
  const q = `'${driveQueryLiteral(parentFolderId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${safeName}' and trashed = false`
  const params = new URLSearchParams({
    q,
    pageSize: '1',
    fields: 'files(id,name,webViewLink)',
  })
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message || 'Drive 폴더 검색 실패')
  const file = json.files?.[0]
  if (!file) return null
  return { id: file.id as string, name: file.name as string, url: (file.webViewLink as string) || `https://drive.google.com/drive/folders/${file.id}` }
}

export async function formatMonthlyBillingSheet(spreadsheetId: string, sheetId: number | undefined, rowCount: number) {
  const token = await getAccessToken()
  const targetSheetId = sheetId ?? 0
  const requests = [
    {
      mergeCells: {
        range: { sheetId: targetSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
        mergeType: 'MERGE_ALL',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId: targetSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 13 },
        properties: { pixelSize: 110 },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId: targetSheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 },
        properties: { pixelSize: 165 },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId: targetSheetId, dimension: 'COLUMNS', startIndex: 12, endIndex: 13 },
        properties: { pixelSize: 180 },
        fields: 'pixelSize',
      },
    },
    {
      repeatCell: {
        range: { sheetId: targetSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 13 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, fontSize: 14 },
            horizontalAlignment: 'LEFT',
          },
        },
        fields: 'userEnteredFormat(textFormat,horizontalAlignment)',
      },
    },
    {
      repeatCell: {
        range: { sheetId: targetSheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 13 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.9, green: 0.94, blue: 0.98 },
            textFormat: { bold: true },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    },
    {
      repeatCell: {
        range: { sheetId: targetSheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: 5, endColumnIndex: 7 },
        cell: {
          userEnteredFormat: {
            numberFormat: { type: 'NUMBER', pattern: '#,##0' },
            horizontalAlignment: 'RIGHT',
          },
        },
        fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
      },
    },
    {
      repeatCell: {
        range: { sheetId: targetSheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: 13 },
        cell: {
          userEnteredFormat: {
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'WRAP',
          },
        },
        fields: 'userEnteredFormat(verticalAlignment,wrapStrategy)',
      },
    },
    {
      updateSheetProperties: {
        properties: { sheetId: targetSheetId, gridProperties: { frozenRowCount: 6 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
  ]

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message || 'Google Sheet 서식 적용 실패')
}

export async function exportSpreadsheetPdf(spreadsheetId: string) {
  const token = await getAccessToken()
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}/export?mimeType=application%2Fpdf`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'PDF 내보내기 실패')
  }
  return Buffer.from(await res.arrayBuffer())
}

export async function uploadPdfToDrive(fileName: string, pdf: Buffer, folderId?: string | null) {
  const token = await getAccessToken()
  const boundary = `field-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const metadata = {
    name: fileName,
    mimeType: 'application/pdf',
    ...(folderId ? { parents: [folderId] } : {}),
  }
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
    pdf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message || 'PDF Drive 업로드 실패')
  return { id: json.id as string, url: (json.webViewLink as string) || driveFileUrl(json.id) }
}
