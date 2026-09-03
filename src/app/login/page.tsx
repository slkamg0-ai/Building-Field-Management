'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { bootstrapAdmin, getCurrentUser, getLoginStatus, login } from '@/lib/actions'
import { Lock, ChevronRight } from 'lucide-react'
import CornerMarkers from '@/components/CornerMarkers'

export default function LoginPage() {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [needsBootstrap, setNeedsBootstrap] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    loadLoginState()
  }, [])

  async function loadLoginState() {
    try {
      const currentUser = await getCurrentUser()
      if (currentUser) {
        router.push('/')
        return
      }
      const status = await getLoginStatus()
      setNeedsBootstrap(status.needsBootstrap)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (!name.trim() || pin.length < 4) return

    try {
      const user = needsBootstrap
        ? await bootstrapAdmin(name.trim(), pin)
        : await login(name.trim(), pin)
      if (user) {
        router.push('/')
      } else {
        setError('비밀번호가 일치하지 않거나 비활성화된 계정입니다.')
        setPin('')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '로그인 처리 중 오류가 발생했습니다.'
      setError(msg)
      setPin('')
    }
  }

  useEffect(() => {
    // 4~8자리 PIN을 지원하므로, 최대 자리수(8자리)에 도달했을 때만 자동 로그인.
    // 그보다 짧은 PIN은 '접속하기' 버튼으로 제출한다.
    if (pin.length === 8) {
      handleLogin()
    }
  }, [pin])

  const handlePinClick = (num: string) => {
    if (pin.length < 8) setPin(prev => prev + num)
  }

  const canSubmit = !!name.trim() && pin.length >= 4

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#1d1f20] font-body">
        로딩 중...
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-start justify-center p-9 px-4 font-body">
      <div className="w-full max-w-[412px] relative corner-markers">
        <CornerMarkers />
        <div className="bg-ind-panel border border-ind-border px-[30px] py-9 flex flex-col gap-[22px]">
          <div className="flex flex-col items-center gap-3.5 text-center">
            <div className="w-14 h-14 border border-ind-primary flex items-center justify-center text-ind-primary-dark">
              <Lock className="w-6 h-6" strokeWidth={1.6} />
            </div>
            <div>
              <div className="font-cond font-bold text-[10px] tracking-[0.18em] uppercase text-ind-primary mb-1.5">
                Field Manage
              </div>
              <h1 className="font-cond font-bold text-2xl m-0 tracking-tight text-ind-text">
                현장관리 시스템
              </h1>
              <p className="text-[13px] text-ind-text/60 mt-1.5">
                {needsBootstrap ? '최초 관리자 이름과 PIN을 등록하세요.' : '이름과 PIN 번호를 입력하세요.'}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-ind-text/70 mb-1.5">
              {needsBootstrap ? '관리자 이름' : '접속자 이름'}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
                setPin('')
              }}
              className="w-full min-h-[44px] px-3 py-2 text-[15px] text-ind-text bg-ind-bg border border-ind-border outline-none focus:border-ind-primary"
              placeholder={needsBootstrap ? '예: 관리자' : '이름을 입력하세요'}
              autoComplete="username"
            />
          </div>

          <div className="flex justify-center gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full corner-round ${pin.length > i ? 'bg-ind-primary' : 'bg-transparent border border-ind-border'}`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '⌫'].map((item, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (item === 'C') setPin('')
                  else if (item === '⌫') setPin(prev => prev.slice(0, -1))
                  else handlePinClick(item.toString())
                }}
                className={`h-[52px] border border-ind-border text-lg font-semibold cursor-pointer transition-colors ${
                  item === 'C' || item === '⌫'
                    ? 'bg-transparent text-ind-text/55 text-xs font-bold'
                    : 'bg-ind-bg text-ind-text hover:bg-ind-border/20'
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 p-3 text-red-600 text-center text-sm font-medium">
              {error}
            </div>
          )}

          <button
            onClick={() => handleLogin()}
            disabled={!canSubmit}
            className={`w-full py-3.5 font-cond font-bold text-[15px] tracking-wide flex items-center justify-center gap-1.5 transition-opacity ${
              canSubmit
                ? 'bg-ind-primary text-ind-panel border border-ind-primary cursor-pointer'
                : 'bg-ind-primary/35 text-ind-panel border border-ind-primary/35 cursor-not-allowed'
            }`}
          >
            {needsBootstrap ? '관리자 등록' : '접속하기'}
            <ChevronRight className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  )
}
