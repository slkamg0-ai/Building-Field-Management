import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { supabase } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PUBLIC = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const PRIVATE = process.env.VAPID_PRIVATE_KEY || ''
const SECRET = process.env.REMINDER_SECRET || ''

if (PUBLIC && PRIVATE) {
  try { webpush.setVapidDetails('mailto:admin@field.local', PUBLIC, PRIVATE) } catch {}
}

export async function POST(req: NextRequest) {
  // 인증: 헤더 또는 ?secret= 로 시크릿 확인
  const headerSecret = req.headers.get('x-reminder-secret') || ''
  const urlSecret = req.nextUrl.searchParams.get('secret') || ''
  if (!SECRET || (headerSecret !== SECRET && urlSecret !== SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!PUBLIC || !PRIVATE) {
    return NextResponse.json({ error: 'VAPID 키 미설정' }, { status: 500 })
  }

  let title = '일보 입력 알림'
  let body = '오늘 작업일보를 입력해 주세요.'
  let url = '/'
  try {
    const j = await req.json()
    if (j?.title) title = j.title
    if (j?.body) body = j.body
    if (j?.url) url = j.url
  } catch {}

  const { data: subs, error } = await supabase.from('PushSub').select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const payload = JSON.stringify({ title, body, url })
  let sent = 0, removed = 0, failed = 0

  await Promise.all((subs || []).map(async (s: any) => {
    const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }
    try {
      await webpush.sendNotification(subscription as any, payload)
      sent++
    } catch (e: any) {
      const code = e?.statusCode
      if (code === 404 || code === 410) {
        await supabase.from('PushSub').delete().eq('id', s.id)
        removed++
      } else {
        failed++
      }
    }
  }))

  return NextResponse.json({ ok: true, total: subs?.length || 0, sent, removed, failed })
}

// 브라우저에서 동작 확인용
export async function GET() {
  return NextResponse.json({ ok: true, hint: 'POST with x-reminder-secret header to send' })
}
