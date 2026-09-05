// Cloudflare R2(S3 호환) 업로드 헬퍼
//
// 기존에는 현장사진/서류 이미지를 Next.js 서버가 돌아가는 로컬 디스크(/uploads)에
// 저장했다. 이 방식은 시놀로지 NAS를 상시 웹서버로 계속 띄워야만 하는 이유였고,
// Vercel 같은 서버리스 환경으로 옮기면 로컬 디스크 쓰기가 영구 저장되지 않아
// 그대로는 동작하지 않는다. 그래서 모든 이미지 업로드를 Cloudflare R2로 보낸다.
//
// aws4fetch는 AWS SDK보다 훨씬 가벼운(의존성 거의 없는) SigV4 서명 라이브러리로,
// Cloudflare가 R2 공식 예제에서 권장하는 방식이다. fetch 기반이라 Vercel의
// 서버리스/엣지 런타임에서도 무겁지 않게 잘 동작한다.
//
// 필요한 환경변수:
//   R2_ACCOUNT_ID        - Cloudflare 계정 ID
//   R2_ACCESS_KEY_ID     - R2 API 토큰의 Access Key ID
//   R2_SECRET_ACCESS_KEY - R2 API 토큰의 Secret Access Key
//   R2_BUCKET_NAME       - 생성한 버킷 이름
//   R2_PUBLIC_URL        - 버킷의 공개 접근 URL (예: https://pub-xxxx.r2.dev 또는 연결한 커스텀 도메인, 끝에 / 없이)

import { AwsClient } from 'aws4fetch'

function getClient() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('R2 환경변수가 설정되지 않았습니다 (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY).')
  }
  return new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' })
}

function getEndpointBase() {
  const accountId = process.env.R2_ACCOUNT_ID
  const bucket = process.env.R2_BUCKET_NAME
  if (!accountId) throw new Error('R2_ACCOUNT_ID 환경변수가 설정되지 않았습니다.')
  if (!bucket) throw new Error('R2_BUCKET_NAME 환경변수가 설정되지 않았습니다.')
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}`
}

function getPublicUrl() {
  const url = process.env.R2_PUBLIC_URL
  if (!url) throw new Error('R2_PUBLIC_URL 환경변수가 설정되지 않았습니다.')
  return url.replace(/\/$/, '')
}

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
}
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024 // 15MB

// base64(dataURL) 이미지를 R2에 업로드하고 공개 URL을 반환한다.
export async function uploadDataUrlToR2(dataUrl: string, prefix: string) {
  const m = dataUrl.match(/^data:(.+?);base64,(.*)$/)
  if (!m) throw new Error('잘못된 이미지 형식입니다.')
  const contentType = m[1]
  const ext = ALLOWED_TYPES[contentType]
  if (!ext) throw new Error(`지원하지 않는 이미지 형식입니다: ${contentType}`)
  const buffer = Buffer.from(m[2], 'base64')
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error(`이미지 용량이 너무 큽니다 (최대 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB).`)
  }
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_')
  const key = `${safePrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

  const client = getClient()
  const res = await client.fetch(`${getEndpointBase()}/${key}`, {
    method: 'PUT',
    body: buffer,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
    },
  })
  if (!res.ok) {
    throw new Error(`R2 업로드 실패 (${res.status}): ${await res.text().catch(() => '')}`)
  }

  return `${getPublicUrl()}/${key}`
}

// R2 공개 URL에서 객체 키를 추출해 삭제한다. (사진 삭제 시 사용, 실패해도 앱 흐름은 막지 않도록 호출부에서 try/catch 권장)
export async function deleteFromR2(publicUrl: string) {
  const base = getPublicUrl()
  if (!publicUrl.startsWith(base)) return // R2가 아닌(예: 과거 로컬 경로) URL은 무시
  const key = publicUrl.slice(base.length + 1)
  if (!key) return
  const client = getClient()
  const res = await client.fetch(`${getEndpointBase()}/${key}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 삭제 실패 (${res.status})`)
  }
}
