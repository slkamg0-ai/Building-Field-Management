'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw, LogIn, Home } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Next.js Page Error caught by error boundary:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#f2f2f3] text-[#1d1f20] font-body">
      <div className="w-full max-w-md bg-white border border-[rgba(29,31,32,0.18)] rounded-2xl p-7 shadow-xl flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 mb-4">
          <AlertTriangle className="w-7 h-7" />
        </div>

        <span className="text-[11px] font-black text-[#5980a6] uppercase tracking-widest mb-1">
          Field Manage v2.0
        </span>
        <h2 className="text-xl font-bold text-[#1d1f20] mb-2">
          페이지를 불러오는 중 문제가 발생했습니다
        </h2>
        <p className="text-xs text-[rgba(29,31,32,0.6)] mb-6 leading-relaxed">
          일시적인 네트워크 지연 또는 데이터 동기화 문제일 수 있습니다. 아래 버튼을 눌러 다시 시도해 주세요.
        </p>

        {error?.message && (
          <div className="w-full mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-left text-xs text-red-700 font-mono break-all max-h-24 overflow-y-auto">
            {error.message}
          </div>
        )}

        <div className="flex flex-col w-full gap-2.5">
          <button
            onClick={() => reset()}
            className="w-full py-3 bg-[#5980a6] hover:bg-[#416180] text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-98"
          >
            <RefreshCw className="w-4 h-4" />
            다시 시도
          </button>

          <button
            onClick={() => { window.location.href = '/' }}
            className="w-full py-3 bg-[#ededed] hover:bg-[#e2e8f0] text-[#1d1f20] font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-all"
          >
            <Home className="w-4 h-4" />
            홈으로 새로고침
          </button>

          <button
            onClick={() => { window.location.href = '/login' }}
            className="w-full py-2.5 text-[rgba(29,31,32,0.55)] hover:text-[#1d1f20] font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" />
            로그인 화면으로 이동
          </button>
        </div>
      </div>
    </div>
  )
}
