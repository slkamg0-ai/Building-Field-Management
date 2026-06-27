// 웹 푸시 구독 (브라우저 전용)
'use client'

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const buffer = new ArrayBuffer(raw.length)
  const out = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export interface SubResult {
  ok: boolean
  reason?: string
  sub?: { endpoint: string; p256dh: string; auth: string }
}

// 알림 권한 요청 + 서비스워커 등록 + 푸시 구독. 구독 정보를 반환.
export async function enablePush(): Promise<SubResult> {
  try {
    if (!pushSupported()) return { ok: false, reason: '이 브라우저는 푸시를 지원하지 않습니다. (iPhone은 홈화면에 추가 후 사용)' }
    if (!PUBLIC_KEY) return { ok: false, reason: '서버 푸시 키(VAPID)가 설정되지 않았습니다.' }

    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return { ok: false, reason: '알림 권한이 거부되었습니다.' }

    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY) as BufferSource,
      })
    }
    const json = sub.toJSON() as any
    return {
      ok: true,
      sub: { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    }
  } catch (e: any) {
    return { ok: false, reason: e?.message || '구독 실패' }
  }
}
