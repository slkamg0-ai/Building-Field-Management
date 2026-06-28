import { readFile } from 'fs/promises'
import path from 'path'

// 로컬 /app/uploads 폴더의 이미지를 제공
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params
  const safe = path.basename(file) // 경로 탈출 방지
  try {
    const buf = await readFile(path.join(process.cwd(), 'uploads', safe))
    const ext = safe.split('.').pop()?.toLowerCase()
    const type =
      ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
