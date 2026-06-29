'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { bootstrapAdmin, getCurrentUser, getLoginStatus, login } from '@/lib/actions'
import { Lock, User, ChevronRight } from 'lucide-react'

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
    if (pin.length === 4) {
      handleLogin()
    }
  }, [pin])

  const handlePinClick = (num: string) => {
    if (pin.length < 4) setPin(prev => prev + num)
  }

  if (loading) return <div className="min-h-screen bg-[#f9f9f9] flex items-center justify-center text-[#1a1c1c]">로딩 중...</div>

  return (
    <div className="min-h-screen bg-[#f9f9f9] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#ffffff] border border-[#e5e5e5] rounded-2xl p-8 shadow-2xl animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-[#556b2f]/10 border border-[#556b2f]/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="text-[#556b2f] w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-[#1a1c1c] mb-2 font-['Inter'] tracking-tight uppercase">
            현장 관리 시스템
          </h1>
          <p className="text-[#6b6b6b] text-sm">
            {needsBootstrap ? '최초 관리자 이름과 PIN을 등록하세요.' : '이름과 PIN 번호를 입력하세요.'}
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#737373] uppercase tracking-widest ml-1">
              {needsBootstrap ? '관리자 이름' : '접속자 이름'}
            </label>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setError('')
                  setPin('')
                }}
                className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded-xl px-4 py-4 text-[#1a1c1c] outline-none focus:border-[#556b2f] appearance-none cursor-pointer"
                placeholder={needsBootstrap ? '예: 관리자' : '이름을 입력하세요'}
                autoComplete="username"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <User className="text-[#737373] w-5 h-5" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-center gap-4 mb-6">
              {[0, 1, 2, 3].map(i => (
                <div 
                  key={i} 
                  className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${pin.length > i ? 'bg-[#556b2f] border-[#556b2f] scale-110 shadow-[0_0_10px_rgba(85,107,47,0.5)]' : 'border-[#e5e5e5]'}`}
                ></div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '←'].map((item, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (item === 'C') setPin('')
                    else if (item === '←') setPin(prev => prev.slice(0, -1))
                    else handlePinClick(item.toString())
                  }}
                  className="h-16 rounded-xl bg-[#f3f3f3] border border-[#e5e5e5] text-[#1a1c1c] text-xl font-bold hover:bg-[#e5e5e5] hover:border-[#556b2f]/50 active:scale-95 transition-all flex items-center justify-center"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg text-red-600 text-center text-sm font-medium animate-shake">
              {error}
            </div>
          )}

          <button
            onClick={() => handleLogin()}
            disabled={!name.trim() || pin.length < 4}
            className="w-full bg-[#556b2f] text-[#ffffff] font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale"
          >
            {needsBootstrap ? '관리자 등록' : '접속하기'}
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
