'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { login, getUsers } from '@/lib/actions'
import { Lock, User, ChevronRight } from 'lucide-react'

export default function LoginPage() {
  const [users, setUsers] = useState<any[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    loadUsers()
    // 이미 로그인되어 있는지 확인
    const savedUser = localStorage.getItem('user')
    if (savedUser) {
      router.push('/')
    }
  }, [])

  async function loadUsers() {
    try {
      const fetchedUsers = await getUsers()
      setUsers(fetchedUsers)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (!selectedUser || pin.length < 4) return

    const user = await login(selectedUser, pin)
    if (user) {
      localStorage.setItem('user', JSON.stringify(user))
      router.push('/')
    } else {
      setError('비밀번호가 일치하지 않거나 비활성화된 계정입니다.')
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

  if (loading) return <div className="min-h-screen bg-[#121417] flex items-center justify-center text-white">로딩 중...</div>

  return (
    <div className="min-h-screen bg-[#121417] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#1e2023] border border-[#2D343D] rounded-2xl p-8 shadow-2xl animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-[#FF6B00]/10 border border-[#FF6B00]/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="text-[#FF6B00] w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2 font-['Space_Grotesk'] tracking-tight uppercase">
            현장 관리 시스템
          </h1>
          <p className="text-slate-400 text-sm">접속자를 선택하고 PIN 번호를 입력하세요.</p>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">접속자 선택</label>
            <div className="relative">
              <select
                value={selectedUser}
                onChange={(e) => {
                  setSelectedUser(e.target.value)
                  setError('')
                  setPin('')
                }}
                className="w-full bg-[#111316] border border-[#2D343D] rounded-xl px-4 py-4 text-white outline-none focus:border-[#FF6B00] appearance-none cursor-pointer"
              >
                <option value="">접속자를 선택해 주세요</option>
                {users.map(u => (
                  <option key={u.id} value={u.name}>{u.name}</option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <User className="text-slate-500 w-5 h-5" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-center gap-4 mb-6">
              {[0, 1, 2, 3].map(i => (
                <div 
                  key={i} 
                  className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${pin.length > i ? 'bg-[#FF6B00] border-[#FF6B00] scale-110 shadow-[0_0_10px_rgba(255,107,0,0.5)]' : 'border-[#2D343D]'}`}
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
                  className="h-16 rounded-xl bg-[#111316] border border-[#2D343D] text-white text-xl font-bold hover:bg-[#2D343D] hover:border-[#FF6B00]/50 active:scale-95 transition-all flex items-center justify-center"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg text-red-400 text-center text-sm font-medium animate-shake">
              {error}
            </div>
          )}

          <button
            onClick={() => handleLogin()}
            disabled={!selectedUser || pin.length < 4}
            className="w-full bg-[#FF6B00] text-[#561f00] font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale"
          >
            접속하기
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
