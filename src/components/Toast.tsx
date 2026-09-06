'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastMessage {
  id: string
  message: string
  type: ToastType
  duration?: number
}

// 전역 호출 헬퍼
export const toast = {
  success: (msg: string, duration = 3000) => emitToast(msg, 'success', duration),
  error: (msg: string, duration = 4000) => emitToast(msg, 'error', duration),
  warning: (msg: string, duration = 3500) => emitToast(msg, 'warning', duration),
  info: (msg: string, duration = 3000) => emitToast(msg, 'info', duration),
}

function emitToast(message: string, type: ToastType, duration: number) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('app-toast', {
        detail: { message, type, duration, id: Math.random().toString(36).slice(2, 9) },
      })
    )
  }
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => {
    const handleToast = (e: Event) => {
      const customEvent = e as CustomEvent<ToastMessage>
      const newToast = customEvent.detail
      setToasts(prev => [...prev, newToast])

      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== newToast.id))
      }, newToast.duration || 3000)
    }

    window.addEventListener('app-toast', handleToast)
    return () => window.removeEventListener('app-toast', handleToast)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full px-4 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-lg shadow-lg border backdrop-blur-md transition-all animate-slide-up ${
            t.type === 'success'
              ? 'bg-[#181a1d]/95 text-emerald-300 border-emerald-500/40'
              : t.type === 'error'
              ? 'bg-[#181a1d]/95 text-rose-300 border-rose-500/40'
              : t.type === 'warning'
              ? 'bg-[#181a1d]/95 text-amber-300 border-amber-500/40'
              : 'bg-[#181a1d]/95 text-sky-300 border-sky-500/40'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            {t.type === 'error' && <XCircle className="w-5 h-5 text-rose-400 shrink-0" />}
            {t.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />}
            {t.type === 'info' && <Info className="w-5 h-5 text-sky-400 shrink-0" />}
            <span className="text-xs font-semibold leading-snug break-words text-white">{t.message}</span>
          </div>
          <button
            onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
            className="text-slate-400 hover:text-white p-1 ml-2 shrink-0 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
