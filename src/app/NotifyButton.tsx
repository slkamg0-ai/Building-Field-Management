'use client'

import { useState, useEffect } from 'react'
import { Bell, BellRing, Loader2 } from 'lucide-react'
import { enablePush, pushSupported } from '@/lib/push'
import { savePushSub } from '@/lib/actions'

export default function NotifyButton({ userName }: { userName?: string }) {
  const [state, setState] = useState<'idle' | 'on' | 'loading'>('idle')

  useEffect(() => {
    if (pushSupported() && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      setState('on')
    }
  }, [])

  async function turnOn() {
    setState('loading')
    const res = await enablePush()
    if (!res.ok || !res.sub) {
      alert(res.reason || '알림을 켤 수 없습니다.')
      setState('idle')
      return
    }
    try {
      await savePushSub(res.sub, navigator.userAgent.slice(0, 60), userName)
      setState('on')
      alert('알림이 켜졌습니다. 매일 지정 시간에 일보 입력 알림을 받습니다.')
    } catch (e: any) {
      alert(e?.message || '구독 저장 실패')
      setState('idle')
    }
  }

  if (state === 'on') {
    return (
      <button disabled className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-[#5980a6]" title="알림 켜짐">
        <BellRing className="w-4 h-4" />
      </button>
    )
  }
  return (
    <button onClick={turnOn} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg hover:bg-[#282a2d] transition-colors text-slate-300 hover:text-[#5980a6]" title="알림 받기">
      {state === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
    </button>
  )
}
