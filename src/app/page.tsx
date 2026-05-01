'use client'

import { useState, useEffect } from 'react'
import { getDailyLog, addLabor, addEquipment, addMaterial, addOutsourcing, addExpense, searchLabors, searchEquipments, searchMaterials, searchOutsourcings, getSites, createSite, updateSite, resetSiteData, getMonthlyStats, getSiteTotalStats, getUsers, createUser, deleteUser, toggleUserActive } from '@/lib/actions'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, PieChart, Pie, Cell } from 'recharts'
import { exportMonthlyReport } from '@/lib/exportExcel'
import { useRouter } from 'next/navigation'
import { Users, User, LogOut, Shield, Trash2, UserPlus, Power } from 'lucide-react'

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard') // dashboard, labor, equipment, material, outsourcing
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  
  // 현장(Site) 상태
  const [sites, setSites] = useState<any[]>([])
  const [selectedSiteId, setSelectedSiteId] = useState<string>('')
  
  // 새 현장 폼 상태
  const [showNewSiteForm, setShowNewSiteForm] = useState(false)
  const [newSiteName, setNewSiteName] = useState('')
  const [newSiteContractAmount, setNewSiteContractAmount] = useState('0')
  const [newSiteStartDate, setNewSiteStartDate] = useState(new Date().toISOString().split('T')[0])
  const [newSiteEndDate, setNewSiteEndDate] = useState(new Date(new Date().setMonth(new Date().getMonth() + 6)).toISOString().split('T')[0])
  const [isEditingSite, setIsEditingSite] = useState(false)

  const [logData, setLogData] = useState<any>(null)
  const [monthlyStats, setMonthlyStats] = useState<any>(null)
  const [siteTotalStats, setSiteTotalStats] = useState<any>(null)
  
  const [loading, setLoading] = useState(true)
  const [monthlyLoading, setMonthlyLoading] = useState(true)

  // 사용자 및 보안 상태
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [showUserManagement, setShowUserManagement] = useState(false)
  const [newUserForm, setNewUserForm] = useState({ name: '', pin: '', role: 'WORKER' })
  const router = useRouter()

  // 폼 표시 상태
  const [showAddForm, setShowAddForm] = useState(false)
  
  // 항목별 폼 상태
  const [laborForm, setLaborForm] = useState({ name: '', jobType: '', unitPrice: '', amount: '1', note: '' })
  const [equipmentForm, setEquipmentForm] = useState({ name: '', spec: '', unitPrice: '', amount: '1', note: '' })
  const [materialForm, setMaterialForm] = useState({ name: '', spec: '', unit: '', quantity: '1', note: '' })
  const [outsourcingForm, setOutsourcingForm] = useState({ company: '', task: '', amount: '', note: '' })
  const [expenseForm, setExpenseForm] = useState({ category: '', amount: '', note: '' })
  const [suggestions, setSuggestions] = useState<any[]>([])

  useEffect(() => {
    // 로그인 체크
    const userStr = localStorage.getItem('user')
    if (!userStr) {
      router.push('/login')
      return
    }
    const user = JSON.parse(userStr)
    setCurrentUser(user)
    
    loadSites()
  }, [])

  async function handleLogout() {
    localStorage.removeItem('user')
    router.push('/login')
  }

  async function loadAllUsers() {
    const users = await getUsers()
    setAllUsers(users)
  }

  useEffect(() => {
    if (selectedSiteId) {
      loadData()
      loadMonthlyData()
      loadSiteTotalStats()
      setShowAddForm(false)
    }
  }, [currentDate, selectedSiteId, activeTab, selectedYear, selectedMonth])

  async function loadSites() {
    try {
      const fetchedSites = await getSites()
      setSites(fetchedSites)
      if (fetchedSites.length > 0 && !selectedSiteId) {
        setSelectedSiteId(fetchedSites[0].id)
      } else if (fetchedSites.length === 0) {
        setShowNewSiteForm(true)
      }
    } catch (e) {
      console.error("Failed to load sites", e)
    }
  }

  async function loadSiteTotalStats() {
    if (!selectedSiteId) return
    try {
      const data = await getSiteTotalStats(selectedSiteId)
      setSiteTotalStats(data)
    } catch (e) {
      console.error(e)
    }
  }

  async function handleCreateSite(e: React.FormEvent) {
    e.preventDefault()
    if (!newSiteName.trim()) return
    
    if (isEditingSite && selectedSiteId) {
      await updateSite(selectedSiteId, newSiteName, parseInt(newSiteContractAmount), newSiteStartDate, newSiteEndDate)
    } else {
      const newSite = await createSite(newSiteName, parseInt(newSiteContractAmount), newSiteStartDate, newSiteEndDate)
      setSelectedSiteId(newSite.id)
    }
    
    setNewSiteName('')
    setNewSiteContractAmount('0')
    setShowNewSiteForm(false)
    setIsEditingSite(false)
    await loadSites()
    loadSiteTotalStats()
    loadMonthlyData()
  }

  function openEditSiteModal() {
    const currentSite = sites.find(s => s.id === selectedSiteId)
    if (currentSite) {
      setNewSiteName(currentSite.name)
      setNewSiteContractAmount(currentSite.contractAmount.toString())
      setNewSiteStartDate(new Date(currentSite.startDate).toISOString().split('T')[0])
      setNewSiteEndDate(new Date(currentSite.endDate).toISOString().split('T')[0])
      setIsEditingSite(true)
      setShowNewSiteForm(true)
    }
  }

  async function handleResetSite() {
    if (!selectedSiteId) return
    const firstConfirm = confirm('경고: 이 현장에 입력된 모든 노무, 장비, 자재, 비용 데이터가 영구적으로 삭제됩니다. 계속하시겠습니까?')
    if (firstConfirm) {
      const secondConfirm = confirm('정말로 모든 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')
      if (secondConfirm) {
        await resetSiteData(selectedSiteId)
        setShowNewSiteForm(false)
        setIsEditingSite(false)
        loadData()
        loadMonthlyData()
        loadSiteTotalStats()
        alert('현장 데이터가 모두 초기화되었습니다.')
      }
    }
  }

  async function loadData() {
    if (!selectedSiteId) return
    setLoading(true)
    try {
      const data = await getDailyLog(currentDate, selectedSiteId)
      setLogData(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function loadMonthlyData() {
    if (!selectedSiteId) return
    setMonthlyLoading(true)
    try {
      // 시차 문제 해결: 로컬 날짜 문자열 직접 생성 (YYYY-MM-DD)
      const targetDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
      const data = await getMonthlyStats(selectedSiteId, targetDate)
      setMonthlyStats(data)
    } catch (e) {
      console.error(e)
    } finally {
      setMonthlyLoading(false)
    }
  }

  // ==== 노무 관련 로직 ====
  const handleLaborNameChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setLaborForm(prev => ({ ...prev, name: val }))
    if (val.length >= 1) setSuggestions(await searchLabors(val))
    else setSuggestions([])
  }
  const selectLaborSuggestion = (s: any) => {
    setLaborForm(prev => ({ ...prev, name: s.name, jobType: s.jobType, unitPrice: s.unitPrice.toString() }))
    setSuggestions([])
  }
  const handleLaborSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!logData || !currentUser) return
    await addLabor(logData.id, laborForm, currentUser.name)
    setLaborForm({ name: '', jobType: '', unitPrice: '', amount: '1', note: '' })
    setShowAddForm(false)
    loadData()
    loadMonthlyData()
    loadSiteTotalStats()
  }

  // ==== 장비 관련 로직 ====
  const handleEquipmentNameChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setEquipmentForm(prev => ({ ...prev, name: val }))
    if (val.length >= 1) setSuggestions(await searchEquipments(val))
    else setSuggestions([])
  }
  const selectEquipmentSuggestion = (s: any) => {
    setEquipmentForm(prev => ({ ...prev, name: s.name, spec: s.spec || '', unitPrice: s.unitPrice.toString() }))
    setSuggestions([])
  }
  const handleEquipmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!logData || !currentUser) return
    await addEquipment(logData.id, equipmentForm, currentUser.name)
    setEquipmentForm({ name: '', spec: '', unitPrice: '', amount: '1', note: '' })
    setShowAddForm(false)
    loadData()
    loadMonthlyData()
    loadSiteTotalStats()
  }

  // ==== 자재 관련 로직 ====
  const handleMaterialNameChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setMaterialForm(prev => ({ ...prev, name: val }))
    if (val.length >= 1) setSuggestions(await searchMaterials(val))
    else setSuggestions([])
  }
  const selectMaterialSuggestion = (s: any) => {
    setMaterialForm(prev => ({ ...prev, name: s.name, spec: s.spec || '', unit: s.unit }))
    setSuggestions([])
  }
  const handleMaterialSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!logData || !currentUser) return
    await addMaterial(logData.id, materialForm, currentUser.name)
    setMaterialForm({ name: '', spec: '', unit: '', quantity: '1', note: '' })
    setShowAddForm(false)
    loadData()
  }

  // ==== 외주 관련 로직 ====
  const handleOutsourcingCompanyChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setOutsourcingForm(prev => ({ ...prev, company: val }))
    if (val.length >= 1) setSuggestions(await searchOutsourcings(val))
    else setSuggestions([])
  }
  const selectOutsourcingSuggestion = (s: any) => {
    setOutsourcingForm(prev => ({ ...prev, company: s.companyName, task: s.task || '' }))
    setSuggestions([])
  }
  const handleOutsourcingSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!logData || !currentUser) return
    await addOutsourcing(logData.id, outsourcingForm, currentUser.name)
    setOutsourcingForm({ company: '', task: '', amount: '', note: '' })
    setShowAddForm(false)
    loadData()
    loadMonthlyData()
    loadSiteTotalStats()
  }

  // ==== 경비 관련 로직 ====
  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!logData || !currentUser) return
    await addExpense(logData.id, expenseForm, currentUser.name)
    setExpenseForm({ category: '', amount: '', note: '' })
    setShowAddForm(false)
    loadData()
    loadMonthlyData()
    loadSiteTotalStats()
  }

  // ==== 집계 로직 ====
  const totalLaborPrice = logData?.labors?.reduce((acc: number, cur: any) => acc + cur.totalPrice, 0) || 0
  const totalEquipmentPrice = logData?.equipments?.reduce((acc: number, cur: any) => acc + cur.totalPrice, 0) || 0
  const totalOutsourcingPrice = logData?.outsourcings?.reduce((acc: number, cur: any) => acc + cur.amount, 0) || 0
  const totalExpensePrice = logData?.expenses?.reduce((acc: number, cur: any) => acc + cur.amount, 0) || 0
  
  const grandTotal = totalLaborPrice + totalEquipmentPrice + totalOutsourcingPrice + totalExpensePrice
  
  const totalLabors = logData?.labors?.reduce((acc: number, cur: any) => acc + cur.amount, 0) || 0
  const totalEquipments = logData?.equipments?.length || 0
  const totalMaterials = logData?.materials?.length || 0
  const totalOutsourcings = logData?.outsourcings?.length || 0
 
  const monthName = `${selectedMonth}월`
  const isOverBudgetToday = siteTotalStats && grandTotal > (siteTotalStats.dailyLimit || 0)

  return (
    <>
      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-4 md:px-8 h-20 bg-[#121417] border-b border-[#2D343D] transition-all">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-10 h-10 rounded-full overflow-hidden border border-[#FF6B00] hidden sm:block shrink-0">
            <img alt="Profile" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAVRaBrtKh_z4Q7vJTKk4JINJs8Ij5SI9UofZu7tdp1mM3Tz-k2n0gXdfY1Db0GdG2UC-EB9EIqR6bpy6Yho0MAdFgMs0Q4FjAhLIxIPztwIis_lvFBDeAIaxBNeg7OsyeDd8RR1xLw4YwBZ7N1NqPO_g0cjKeGT1YVV6ssygQWdU9uhSdf1rq-_lMDVpG7vFicN6bG72DHUiMoiTfQSfLtVoHwUsJ-Xk3_Bp6vmx4Z_DBHYBhLZJYj5C7TLLmqpQvwUSWdrKwwFkKQ"/>
          </div>
          
          <div className="flex flex-col">
            <h1 className="font-['Space_Grotesk'] tracking-tight text-[#FF6B00] text-sm md:text-xl font-bold uppercase leading-none">
              현장 관리
            </h1>
            {sites.length > 0 ? (
              <select 
                value={selectedSiteId} 
                onChange={(e) => {
                  if (e.target.value === 'NEW') setShowNewSiteForm(true)
                  else setSelectedSiteId(e.target.value)
                }}
                className="bg-transparent text-white font-bold text-lg md:text-2xl outline-none appearance-none cursor-pointer hover:opacity-80 truncate max-w-[150px] md:max-w-xs mt-1"
              >
                {sites.map(s => <option key={s.id} value={s.id} className="bg-[#121417] text-base">{s.name}</option>)}
                <option value="NEW" className="bg-[#121417] text-[#FF6B00] font-bold">+ 새 현장 추가</option>
              </select>
            ) : (
              <span className="text-white font-bold text-lg mt-1">현장 없음</span>
            )}
          </div>
          
          {selectedSiteId && (
            <button 
              onClick={openEditSiteModal}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#2D343D] transition-colors ml-1 mt-4"
              title="현장 정보 수정"
            >
              <span className="material-symbols-outlined text-slate-500 text-lg">edit</span>
            </button>
          )}
        </div>
        
        <div className="flex items-center gap-2 md:gap-3">
          <div className="hidden md:flex flex-col items-end mr-2">
            <span className="text-white text-sm font-bold">{currentUser?.name}</span>
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{currentUser?.role}</span>
          </div>

          <div className="flex items-center gap-1 bg-[#1e2023] border border-[#2D343D] rounded-lg px-2 py-1">
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="bg-transparent text-white text-sm font-bold outline-none cursor-pointer p-1"
            >
              {[2024, 2025, 2026].map(y => <option key={y} value={y} className="bg-[#121417]">{y}년</option>)}
            </select>
            <select 
              value={selectedMonth} 
              onChange={(e) => {
                const m = parseInt(e.target.value)
                setSelectedMonth(m)
                // 시차 문제 없는 날짜 설정
                const newDate = `${selectedYear}-${String(m).padStart(2, '0')}-01`
                setCurrentDate(newDate)
              }}
              className="bg-transparent text-[#FF6B00] text-sm font-bold outline-none cursor-pointer p-1"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m} className="bg-[#121417]">{m}월</option>)}
            </select>
          </div>
          
          <input 
            type="date" 
            className="bg-[#1e2023] border border-[#2D343D] text-white px-2 py-2 md:px-3 rounded-lg text-[10px] md:text-xs outline-none focus:border-[#FF6B00] w-28 md:w-auto"
            value={currentDate}
            onChange={(e) => {
              const d = new Date(e.target.value)
              setCurrentDate(e.target.value)
              setSelectedYear(d.getFullYear())
              setSelectedMonth(d.getMonth() + 1)
            }}
          />
          
          {currentUser?.role === 'ADMIN' && (
            <button 
              onClick={() => {
                loadAllUsers()
                setShowUserManagement(true)
              }}
              className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[#2D343D] transition-colors active:opacity-80 group"
              title="사용자 관리"
            >
              <Users className="text-slate-400 group-hover:text-[#FF6B00] w-5 h-5" />
            </button>
          )}

          <button 
            onClick={handleLogout}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[#2D343D] transition-colors active:opacity-80 group"
            title="로그아웃"
          >
            <LogOut className="text-slate-400 group-hover:text-red-400 w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="mt-20 px-4 md:px-8 space-y-6 pb-24 max-w-7xl mx-auto pt-6">
        
        {/* 새 현장 추가 모달 */}
        {showNewSiteForm && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
            <div className="bg-[#1e2023] border border-[#FF6B00] p-6 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold text-[#FF6B00] mb-4">
                {isEditingSite ? '현장 정보 수정' : '새 현장 추가'}
              </h3>
              <form onSubmit={handleCreateSite} className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">현장명</label>
                  <input type="text" required className="w-full bg-[#111316] border border-[#2D343D] rounded px-4 py-3 text-white outline-none focus:border-[#FF6B00]" value={newSiteName} onChange={e => setNewSiteName(e.target.value)} placeholder="예: 서울 강남구 복합시설 현장" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">도급액 (예산)</label>
                  <input type="number" required className="w-full bg-[#111316] border border-[#2D343D] rounded px-4 py-3 text-white outline-none focus:border-[#FF6B00]" value={newSiteContractAmount} onChange={e => setNewSiteContractAmount(e.target.value)} placeholder="0" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">착공일</label>
                    <input type="date" required className="w-full bg-[#111316] border border-[#2D343D] rounded px-4 py-3 text-white outline-none focus:border-[#FF6B00]" value={newSiteStartDate} onChange={e => setNewSiteStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">준공예정일</label>
                    <input type="date" required className="w-full bg-[#111316] border border-[#2D343D] rounded px-4 py-3 text-white outline-none focus:border-[#FF6B00]" value={newSiteEndDate} onChange={e => setNewSiteEndDate(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button" 
                    onClick={() => {
                      setShowNewSiteForm(false)
                      setIsEditingSite(false)
                      setNewSiteName('')
                      setNewSiteContractAmount('0')
                    }} 
                    className="flex-1 py-3 rounded border border-[#2D343D] text-slate-400 hover:text-white"
                  >
                    취소
                  </button>
                  <button type="submit" className="flex-1 py-3 rounded bg-[#FF6B00] text-[#561f00] font-bold hover:opacity-90">
                    {isEditingSite ? '수정하기' : '생성하기'}
                  </button>
                </div>
                {isEditingSite && (
                  <div className="pt-6 border-t border-[#2D343D] mt-6">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">위험 구역</p>
                    <button 
                      type="button" 
                      onClick={handleResetSite}
                      className="w-full py-2 rounded border border-red-500/30 text-red-500 text-xs font-bold hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-3 h-3" /> 이 현장의 모든 데이터 초기화
                    </button>
                  </div>
                )}
              </form>
            </div>
          </div>
        )}

        {/* 사용자 관리 모달 */}
        {showUserManagement && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
            <div className="bg-[#1e2023] border border-[#2D343D] p-6 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Shield className="text-[#FF6B00]" /> 사용자 및 권한 관리
                </h3>
                <button onClick={() => setShowUserManagement(false)} className="text-slate-400 hover:text-white">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* 새 사용자 추가 폼 */}
              <div className="bg-[#111316] p-4 rounded-lg border border-[#2D343D] mb-6">
                <h4 className="text-sm font-bold text-[#FF6B00] mb-3 flex items-center gap-2">
                  <UserPlus className="w-4 h-4" /> 신규 접속자 등록
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input 
                    type="text" 
                    placeholder="이름" 
                    className="bg-[#1e2023] border border-[#2D343D] rounded px-3 py-2 text-white outline-none focus:border-[#FF6B00]"
                    value={newUserForm.name}
                    onChange={e => setNewUserForm({...newUserForm, name: e.target.value})}
                  />
                  <input 
                    type="text" 
                    placeholder="PIN (4자리)" 
                    maxLength={4}
                    className="bg-[#1e2023] border border-[#2D343D] rounded px-3 py-2 text-white outline-none focus:border-[#FF6B00]"
                    value={newUserForm.pin}
                    onChange={e => setNewUserForm({...newUserForm, pin: e.target.value})}
                  />
                  <select 
                    className="bg-[#1e2023] border border-[#2D343D] rounded px-3 py-2 text-white outline-none focus:border-[#FF6B00]"
                    value={newUserForm.role}
                    onChange={e => setNewUserForm({...newUserForm, role: e.target.value})}
                  >
                    <option value="WORKER">작업자 (WORKER)</option>
                    <option value="ADMIN">관리자 (ADMIN)</option>
                  </select>
                  <button 
                    onClick={async () => {
                      if (!newUserForm.name || newUserForm.pin.length < 4) return
                      await createUser(newUserForm.name, newUserForm.pin, newUserForm.role)
                      setNewUserForm({ name: '', pin: '', role: 'WORKER' })
                      loadAllUsers()
                    }}
                    className="bg-[#FF6B00] text-[#561f00] font-bold rounded py-2 hover:opacity-90 transition-colors"
                  >
                    등록
                  </button>
                </div>
              </div>

              {/* 사용자 리스트 */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-slate-500 mb-2 uppercase tracking-widest">등록된 접속자 목록</h4>
                {allUsers.map(u => (
                  <div key={u.id} className="flex items-center justify-between bg-[#111316] p-3 rounded-lg border border-[#2D343D]">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${u.role === 'ADMIN' ? 'bg-[#FF6B00]/20 text-[#FF6B00]' : 'bg-slate-800 text-slate-400'}`}>
                        {u.role === 'ADMIN' ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="text-white font-bold text-sm">{u.name}</div>
                        <div className="text-[10px] text-slate-500 font-bold tracking-widest">{u.role} • PIN: {u.pin}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={async () => {
                          await toggleUserActive(u.id, !u.isActive)
                          loadAllUsers()
                        }}
                        className={`p-2 rounded hover:bg-slate-800 transition-colors ${u.isActive ? 'text-[#4ae176]' : 'text-slate-600'}`}
                        title={u.isActive ? "비활성화" : "활성화"}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                      {u.name !== '관리자' && (
                        <button 
                          onClick={async () => {
                            if (confirm('정말로 이 사용자를 삭제하시겠습니까?')) {
                              await deleteUser(u.id)
                              loadAllUsers()
                            }
                          }}
                          className="p-2 rounded hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!selectedSiteId && !showNewSiteForm ? (
          <div className="mt-20 text-center text-slate-500">
            <span className="material-symbols-outlined text-6xl mb-4">apartment</span>
            <p>선택된 현장이 없습니다. 상단에서 현장을 추가해주세요.</p>
          </div>
        ) : (
          <>
            {/* Status & Cost Summary - 항상 표시 */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-6 bg-[#1e2023] rounded-lg border border-[#2D343D] space-y-4 relative overflow-hidden">
                <div className="flex justify-between items-start relative z-10">
                  <div>
                    <p className="font-bold text-[#FF6B00] text-sm tracking-wider uppercase mb-1">{monthName} 누적 지출</p>
                    <h2 className="text-3xl font-bold text-white tracking-tight">
                      ₩{monthlyStats?.summary?.grandTotal?.toLocaleString() || 0}
                    </h2>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="px-3 py-1 rounded-full bg-[#00b050]/20 text-[#4ae176] text-xs font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">insights</span> 월간 집계
                    </span>
                  </div>
                </div>
                <div className="h-3 w-full bg-[#111316] rounded-full overflow-hidden relative z-10 border border-[#2D343D]">
                  <div className="h-full flex">
                    {monthlyStats?.summary?.grandTotal > 0 && (
                      <>
                        <div className="h-full bg-[#FF6B00]" style={{ width: `${(monthlyStats.summary.totalLabor / monthlyStats.summary.grandTotal) * 100}%` }} title={`노무비: ${monthlyStats.summary.totalLabor}`}></div>
                        <div className="h-full bg-[#4cd6ff]" style={{ width: `${(monthlyStats.summary.totalEquipment / monthlyStats.summary.grandTotal) * 100}%` }} title={`장비대: ${monthlyStats.summary.totalEquipment}`}></div>
                        <div className="h-full bg-[#d64cff]" style={{ width: `${(monthlyStats.summary.totalOutsourcing / monthlyStats.summary.grandTotal) * 100}%` }} title={`외주비: ${monthlyStats.summary.totalOutsourcing}`}></div>
                        <div className="h-full bg-[#4ae176]" style={{ width: `${(monthlyStats.summary.totalExpense / monthlyStats.summary.grandTotal) * 100}%` }} title={`경비: ${monthlyStats.summary.totalExpense}`}></div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex justify-between text-[10px] md:text-xs font-bold tracking-widest relative z-10">
                  <span className="text-[#FF6B00] flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#FF6B00] inline-block"></span>노무: ₩{monthlyStats?.summary?.totalLabor?.toLocaleString() || 0}</span>
                  <span className="text-[#4cd6ff] flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#4cd6ff] inline-block"></span>장비: ₩{monthlyStats?.summary?.totalEquipment?.toLocaleString() || 0}</span>
                  <span className="text-[#d64cff] flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#d64cff] inline-block"></span>외주: ₩{monthlyStats?.summary?.totalOutsourcing?.toLocaleString() || 0}</span>
                  <span className="text-[#4ae176] flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#4ae176] inline-block"></span>경비: ₩{monthlyStats?.summary?.totalExpense?.toLocaleString() || 0}</span>
                </div>
              </div>

              {/* 총 예산 대비 누적 지출 분석 카드 */}
              {siteTotalStats && (
                <div className="p-6 bg-[#1e2023] rounded-lg border border-[#2D343D] space-y-4 relative overflow-hidden">
                  <div className="flex justify-between items-start relative z-10">
                    <div>
                      <p className="font-bold text-[#4cd6ff] text-sm tracking-wider uppercase mb-1">전체 예산 대비 실적</p>
                      <h2 className="text-3xl font-bold text-white tracking-tight">
                        ₩{siteTotalStats.totalSpent.toLocaleString()}
                        <span className="text-sm text-slate-500 font-normal ml-2">/ ₩{siteTotalStats.site.contractAmount.toLocaleString()}</span>
                      </h2>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${siteTotalStats.progressPercent > 100 ? 'bg-red-500/20 text-red-400' : 'bg-[#4cd6ff]/20 text-[#4cd6ff]'}`}>
                        <span className="material-symbols-outlined text-[14px]">flag</span> {siteTotalStats.progressPercent.toFixed(1)}% 진행
                      </span>
                    </div>
                  </div>
                  <div className="h-3 w-full bg-[#111316] rounded-full overflow-hidden relative z-10 border border-[#2D343D]">
                    <div className={`h-full ${siteTotalStats.progressPercent > 100 ? 'bg-red-500' : 'bg-[#4cd6ff]'}`} style={{ width: `${Math.min(siteTotalStats.progressPercent, 100)}%` }}></div>
                  </div>
                  <div className="flex justify-between text-[10px] md:text-xs font-bold tracking-widest relative z-10 text-slate-400">
                    <span>공기: {siteTotalStats.totalDays}일 중 {siteTotalStats.passedDays}일 경과</span>
                    <span>잔여 예산: ₩{Math.max(0, siteTotalStats.site.contractAmount - siteTotalStats.totalSpent).toLocaleString()}</span>
                  </div>
                </div>
              )}
            </section>

            {/* Dynamic Content Tabs */}
            <section className="space-y-4">
              <nav className="flex border-b border-[#2D343D] overflow-x-auto scrollbar-hide">
                <button onClick={() => setActiveTab('dashboard')} className={`flex-1 py-4 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'dashboard' ? 'border-b-2 border-[#FF6B00] text-[#FF6B00]' : 'text-slate-500 hover:text-white'}`}>대시보드</button>
                <button onClick={() => setActiveTab('labor')} className={`flex-1 py-4 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'labor' ? 'border-b-2 border-[#FF6B00] text-[#FF6B00]' : 'text-slate-500 hover:text-white'}`}>노무</button>
                <button onClick={() => setActiveTab('equipment')} className={`flex-1 py-4 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'equipment' ? 'border-b-2 border-[#FF6B00] text-[#FF6B00]' : 'text-slate-500 hover:text-white'}`}>장비</button>
                <button onClick={() => setActiveTab('outsourcing')} className={`flex-1 py-4 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'outsourcing' ? 'border-b-2 border-[#FF6B00] text-[#FF6B00]' : 'text-slate-500 hover:text-white'}`}>외주</button>
                <button onClick={() => setActiveTab('expense')} className={`flex-1 py-4 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'expense' ? 'border-b-2 border-[#FF6B00] text-[#FF6B00]' : 'text-slate-500 hover:text-white'}`}>경비</button>
                <button onClick={() => setActiveTab('material')} className={`flex-1 py-4 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'material' ? 'border-b-2 border-[#FF6B00] text-[#FF6B00]' : 'text-slate-500 hover:text-white'}`}>자재</button>
              </nav>

              {/* ===================== DASHBOARD TAB ===================== */}
              {activeTab === 'dashboard' && (
                <div className="space-y-6 animate-fade-in">
                  
                  {/* 오늘의 요약 및 한계금액 분석 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[#1e2023] border border-[#2D343D] rounded-xl p-6">
                      <h4 className="font-bold text-white mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#FF6B00]">calendar_today</span> 오늘의 지출 요약 ({currentDate})
                      </h4>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center py-2 border-b border-[#2D343D]">
                          <span className="text-slate-400">일일 총 지출</span>
                          <span className={`font-bold text-lg ${isOverBudgetToday ? 'text-red-400' : 'text-white'}`}>₩{grandTotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-[#2D343D]">
                          <span className="text-slate-400">일일 권장 투입 한계</span>
                          <span className="font-bold text-[#4cd6ff]">₩{siteTotalStats ? Math.round(siteTotalStats.dailyLimit).toLocaleString() : 0}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                          <span className="text-slate-400">상태 분석</span>
                          {isOverBudgetToday ? (
                            <span className="text-red-400 font-bold text-sm bg-red-400/10 px-2 py-1 rounded">한계선 초과 (주의)</span>
                          ) : (
                            <span className="text-[#4ae176] font-bold text-sm bg-[#4ae176]/10 px-2 py-1 rounded">안정적 (예산 내)</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-[#1e2023] border border-[#2D343D] rounded-xl p-6 flex flex-col items-center justify-center text-center">
                      <span className="material-symbols-outlined text-5xl text-slate-600 mb-4">download</span>
                      <h4 className="font-bold text-white mb-2">데이터 내보내기</h4>
                      <p className="text-sm text-slate-400 mb-6">월간 작업일보 및 투입 비용 명세서를<br/>엑셀(.xlsx) 파일로 다운로드합니다.</p>
                      <button
                        onClick={() => {
                          const selectedSite = sites.find(s => s.id === selectedSiteId)
                          const d = new Date(currentDate)
                          const monthLabel = `${d.getFullYear()}년 ${d.getMonth() + 1}월`
                          exportMonthlyReport(
                            selectedSite?.name || '현장',
                            monthLabel,
                            logData,
                            monthlyStats,
                            siteTotalStats
                          )
                        }}
                        className="w-full max-w-[200px] py-3 rounded-lg bg-[#FF6B00] text-[#561f00] font-bold transition-colors flex items-center justify-center gap-2 hover:opacity-90 active:scale-95"
                      >
                        <span className="material-symbols-outlined text-sm">file_download</span>
                        엑셀 다운로드
                      </button>
                    </div>
                  </div>

                  {/* 차트 */}
                  <div className="bg-[#1e2023] border border-[#2D343D] rounded-xl p-6">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-white text-lg flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#FF6B00]">bar_chart</span>
                        {monthName} 일자별 지출 추이
                      </h3>
                      <span className="text-xs text-slate-500">단위: 원</span>
                    </div>
                    
                    {monthlyLoading ? (
                      <div className="h-64 flex items-center justify-center text-slate-500">데이터를 불러오는 중...</div>
                    ) : monthlyStats?.dailyData?.length === 0 ? (
                      <div className="h-64 flex items-center justify-center text-slate-500">입력된 데이터가 없습니다.</div>
                    ) : (
                      <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyStats.dailyData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2D343D" vertical={false} />
                            <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#64748b" fontSize={12} tickFormatter={(val) => `₩${(val/10000).toFixed(0)}만`} tickLine={false} axisLine={false} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#111316', borderColor: '#2D343D', borderRadius: '8px' }}
                              itemStyle={{ fontSize: '14px' }}
                              formatter={(value: number) => [`₩${value.toLocaleString()}`, undefined]}
                            />
                            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                            <Bar dataKey="노무비" stackId="a" fill="#FF6B00" radius={[0, 0, 4, 4]} />
                            <Bar dataKey="장비대" stackId="a" fill="#4cd6ff" />
                            <Bar dataKey="외주비" stackId="a" fill="#d64cff" />
                            <Bar dataKey="경비" stackId="a" fill="#4ae176" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                {/* 월간 상세 분석 섹션 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 지출 비중 원형 차트 */}
                  <div className="bg-[#1e2023] border border-[#2D343D] rounded-xl p-6 flex flex-col items-center">
                    <h4 className="font-bold text-white mb-4 self-start flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#FF6B00]">pie_chart</span> 카테고리별 지출 비중
                    </h4>
                    <div className="w-full h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: '노무', value: monthlyStats?.summary?.totalLabor || 0, color: '#FF6B00' },
                              { name: '장비', value: monthlyStats?.summary?.totalEquipment || 0, color: '#4cd6ff' },
                              { name: '외주', value: monthlyStats?.summary?.totalOutsourcing || 0, color: '#d64cff' },
                              { name: '경비', value: monthlyStats?.summary?.totalExpense || 0, color: '#4ae176' },
                            ].filter(d => d.value > 0)}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {[
                              { color: '#FF6B00' },
                              { color: '#4cd6ff' },
                              { color: '#d64cff' },
                              { color: '#4ae176' },
                            ].map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#111316', border: '1px solid #2D343D', borderRadius: '8px' }}
                            itemStyle={{ color: '#fff' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 w-full">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#FF6B00]"></div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">노무 {((monthlyStats?.summary?.totalLabor / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#4cd6ff]"></div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">장비 {((monthlyStats?.summary?.totalEquipment / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#d64cff]"></div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">외주 {((monthlyStats?.summary?.totalOutsourcing / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#4ae176]"></div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">경비 {((monthlyStats?.summary?.totalExpense / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>

                  {/* 월간 상세 집계표 */}
                  <div className="md:col-span-2 bg-[#1e2023] border border-[#2D343D] rounded-xl p-6">
                    <h4 className="font-bold text-white mb-4 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#FF6B00]">analytics</span> 월간 상세 집계표 ({monthName})
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-[#2D343D] text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                            <th className="pb-3 px-2">카테고리</th>
                            <th className="pb-3 px-2 text-right">금액</th>
                            <th className="pb-3 px-2 text-right">비중</th>
                            <th className="pb-3 px-2 text-right">상태</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm">
                          <tr className="border-b border-[#2D343D]/50">
                            <td className="py-3 px-2 text-white font-medium flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B00]"></span> 노무비
                            </td>
                            <td className="py-3 px-2 text-right text-white font-bold">₩{monthlyStats?.summary?.totalLabor?.toLocaleString()}</td>
                            <td className="py-3 px-2 text-right text-slate-400">{((monthlyStats?.summary?.totalLabor / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</td>
                            <td className="py-3 px-2 text-right text-[#4ae176] font-bold text-[10px]">정상</td>
                          </tr>
                          <tr className="border-b border-[#2D343D]/50">
                            <td className="py-3 px-2 text-white font-medium flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#4cd6ff]"></span> 장비대
                            </td>
                            <td className="py-3 px-2 text-right text-white font-bold">₩{monthlyStats?.summary?.totalEquipment?.toLocaleString()}</td>
                            <td className="py-3 px-2 text-right text-slate-400">{((monthlyStats?.summary?.totalEquipment / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</td>
                            <td className="py-3 px-2 text-right text-[#4ae176] font-bold text-[10px]">정상</td>
                          </tr>
                          <tr className="border-b border-[#2D343D]/50">
                            <td className="py-3 px-2 text-white font-medium flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#d64cff]"></span> 외주비
                            </td>
                            <td className="py-3 px-2 text-right text-white font-bold">₩{monthlyStats?.summary?.totalOutsourcing?.toLocaleString()}</td>
                            <td className="py-3 px-2 text-right text-slate-400">{((monthlyStats?.summary?.totalOutsourcing / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</td>
                            <td className="py-3 px-2 text-right text-[#4ae176] font-bold text-[10px]">정상</td>
                          </tr>
                          <tr className="border-b border-[#2D343D]/50">
                            <td className="py-3 px-2 text-white font-medium flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#4ae176]"></span> 경비
                            </td>
                            <td className="py-3 px-2 text-right text-white font-bold">₩{monthlyStats?.summary?.totalExpense?.toLocaleString()}</td>
                            <td className="py-3 px-2 text-right text-slate-400">{((monthlyStats?.summary?.totalExpense / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</td>
                            <td className="py-3 px-2 text-right text-[#4ae176] font-bold text-[10px]">정상</td>
                          </tr>
                          <tr className="bg-[#FF6B00]/5">
                            <td className="py-4 px-2 text-[#FF6B00] font-bold">합계 (Grand Total)</td>
                            <td className="py-4 px-2 text-right text-[#FF6B00] font-bold">₩{monthlyStats?.summary?.grandTotal?.toLocaleString()}</td>
                            <td className="py-4 px-2 text-right text-[#FF6B00] font-bold">100%</td>
                            <td className="py-4 px-2 text-right text-[#FF6B00] font-bold text-[10px]">-</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

              {/* ===================== LABOR TAB ===================== */}
              {showAddForm && activeTab === 'labor' && (
                <div className="bg-[#282a2d] border border-[#FF6B00] p-4 rounded-xl mb-4 relative animate-fade-in shadow-xl shadow-black/50">
                  <h4 className="font-bold text-[#FF6B00] mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-sm">person_add</span> 새 노무 인력 추가</h4>
                  <button onClick={() => setShowAddForm(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><span className="material-symbols-outlined">close</span></button>
                  <form onSubmit={handleLaborSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3 relative">
                    <div className="relative">
                      <label className="text-xs text-slate-400 mb-1 block">작업자 이름</label>
                      <input type="text" required className="w-full bg-[#111316] border border-[#2D343D] rounded px-3 py-2 text-white outline-none focus:border-[#FF6B00]" value={laborForm.name} onChange={handleLaborNameChange} autoComplete="off"/>
                      {suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#333538] z-50 border border-[#2D343D] rounded max-h-48 overflow-y-auto shadow-xl">
                          {suggestions.map((s, i) => (
                            <div key={i} onClick={() => selectLaborSuggestion(s)} className="p-3 border-b border-[#2D343D] hover:bg-[#111316] cursor-pointer">
                              <div className="font-medium text-white">{s.name} <span className="text-xs text-[#FF6B00] ml-2">{s.jobType}</span></div>
                              <div className="text-xs text-slate-400 mt-1">단가: ₩{s.unitPrice.toLocaleString()}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div><label className="text-xs text-slate-400 mb-1 block">공종</label><input type="text" required className="w-full bg-[#111316] border border-[#2D343D] rounded px-3 py-2 text-white outline-none focus:border-[#FF6B00]" value={laborForm.jobType} onChange={e => setLaborForm({...laborForm, jobType: e.target.value})} /></div>
                    <div><label className="text-xs text-slate-400 mb-1 block">단가 (원)</label><input type="number" required className="w-full bg-[#111316] border border-[#2D343D] rounded px-3 py-2 text-white outline-none focus:border-[#FF6B00]" value={laborForm.unitPrice} onChange={e => setLaborForm({...laborForm, unitPrice: e.target.value})} /></div>
                    <div><label className="text-xs text-slate-400 mb-1 block">투입 공수</label><input type="number" step="0.1" required className="w-full bg-[#111316] border border-[#2D343D] rounded px-3 py-2 text-white outline-none focus:border-[#FF6B00]" value={laborForm.amount} onChange={e => setLaborForm({...laborForm, amount: e.target.value})} /></div>
                    <div className="md:col-span-2 mt-2"><button type="submit" className="w-full bg-[#FF6B00] text-[#561f00] font-bold py-2 rounded hover:opacity-90">추가하기</button></div>
                  </form>
                </div>
              )}

              {activeTab === 'labor' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="font-bold text-lg text-white">일일 투입 인력</h3>
                    <span className="text-xs font-bold text-[#FF6B00] bg-[#FF6B00]/10 px-2 py-1 rounded border border-[#FF6B00]/20">{totalLabors} 활성 공수</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {loading ? <div className="text-center py-8 text-slate-500">데이터를 불러오는 중...</div> : logData?.labors.length === 0 ? <div className="bg-[#1a1c1f] border border-[#2D343D] rounded-xl p-8 text-center text-slate-500">입력된 노무 인력이 없습니다.</div> : logData?.labors.map((labor: any) => (
                        <div key={labor.id} className="bg-[#1a1c1f] border border-[#2D343D] rounded-xl p-4 flex justify-between items-center hover:border-[#FF6B00]/50 transition-colors group">
                          <div className="flex items-center gap-3 w-2/3">
                            <div className="w-12 h-12 bg-[#2D343D] rounded-lg flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-[#a6e6ff]">engineering</span></div>
                            <div className="overflow-hidden">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-white truncate text-sm md:text-base">{labor.name}</h4>
                                {labor.createdBy && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 font-bold">BY {labor.createdBy}</span>
                                )}
                              </div>
                              <p className="text-[10px] md:text-xs text-slate-400 uppercase truncate mt-0.5">{labor.jobType} • {labor.amount}공수 • 단가₩{labor.unitPrice.toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base md:text-lg font-bold text-white">₩{labor.totalPrice.toLocaleString()}</p>
                            <p className="text-[10px] text-[#4ae176] font-bold tracking-widest mt-0.5">확인됨</p>
                          </div>
                        </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ===================== EQUIPMENT TAB ===================== */}
              {showAddForm && activeTab === 'equipment' && (
                <div className="bg-[#282a2d] border border-[#FF6B00] p-4 rounded-xl mb-4 relative animate-fade-in shadow-xl shadow-black/50">
                  <h4 className="font-bold text-[#FF6B00] mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-sm">precision_manufacturing</span> 새 장비 추가</h4>
                  <button onClick={() => setShowAddForm(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><span className="material-symbols-outlined">close</span></button>
                  <form onSubmit={handleEquipmentSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3 relative">
                    <div className="relative">
                      <label className="text-xs text-slate-400 mb-1 block">장비명</label>
                      <input type="text" required className="w-full bg-[#111316] border border-[#2D343D] rounded px-3 py-2 text-white outline-none focus:border-[#FF6B00]" value={equipmentForm.name} onChange={handleEquipmentNameChange} autoComplete="off"/>
                      {suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#333538] z-50 border border-[#2D343D] rounded max-h-48 overflow-y-auto shadow-xl">
                          {suggestions.map((s, i) => (
                            <div key={i} onClick={() => selectEquipmentSuggestion(s)} className="p-3 border-b border-[#2D343D] hover:bg-[#111316] cursor-pointer">
                              <div className="font-medium text-white">{s.name} <span className="text-xs text-[#FF6B00] ml-2">{s.spec}</span></div>
                              <div className="text-xs text-slate-400 mt-1">단가: ₩{s.unitPrice.toLocaleString()}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div><label className="text-xs text-slate-400 mb-1 block">규격</label><input type="text" className="w-full bg-[#111316] border border-[#2D343D] rounded px-3 py-2 text-white outline-none focus:border-[#FF6B00]" value={equipmentForm.spec} onChange={e => setEquipmentForm({...equipmentForm, spec: e.target.value})} /></div>
                    <div><label className="text-xs text-slate-400 mb-1 block">단가 (원)</label><input type="number" required className="w-full bg-[#111316] border border-[#2D343D] rounded px-3 py-2 text-white outline-none focus:border-[#FF6B00]" value={equipmentForm.unitPrice} onChange={e => setEquipmentForm({...equipmentForm, unitPrice: e.target.value})} /></div>
                    <div><label className="text-xs text-slate-400 mb-1 block">투입 일/시간</label><input type="number" step="0.1" required className="w-full bg-[#111316] border border-[#2D343D] rounded px-3 py-2 text-white outline-none focus:border-[#FF6B00]" value={equipmentForm.amount} onChange={e => setEquipmentForm({...equipmentForm, amount: e.target.value})} /></div>
                    <div className="md:col-span-2 mt-2"><button type="submit" className="w-full bg-[#FF6B00] text-[#561f00] font-bold py-2 rounded hover:opacity-90">추가하기</button></div>
                  </form>
                </div>
              )}

              {activeTab === 'equipment' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="font-bold text-lg text-white">투입 장비</h3>
                    <span className="text-xs font-bold text-[#FF6B00] bg-[#FF6B00]/10 px-2 py-1 rounded border border-[#FF6B00]/20">{totalEquipments} 대 투입</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {loading ? <div className="text-center py-8 text-slate-500">데이터를 불러오는 중...</div> : logData?.equipments.length === 0 ? <div className="bg-[#1a1c1f] border border-[#2D343D] rounded-xl p-8 text-center text-slate-500">입력된 투입 장비가 없습니다.</div> : logData?.equipments.map((eq: any) => (
                        <div key={eq.id} className="bg-[#1a1c1f] border border-[#2D343D] rounded-xl p-4 flex justify-between items-center hover:border-[#FF6B00]/50 transition-colors group">
                          <div className="flex items-center gap-3 w-2/3">
                            <div className="w-12 h-12 bg-[#2D343D] rounded-lg flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-[#a6e6ff]">precision_manufacturing</span></div>
                            <div className="overflow-hidden">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-white truncate text-sm md:text-base">{eq.name}</h4>
                                {eq.createdBy && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 font-bold">BY {eq.createdBy}</span>
                                )}
                              </div>
                              <p className="text-[10px] md:text-xs text-slate-400 uppercase truncate mt-0.5">{eq.spec} • {eq.amount} 시간/일</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base md:text-lg font-bold text-white">₩{eq.totalPrice.toLocaleString()}</p>
                          </div>
                        </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ===================== OUTSOURCING TAB ===================== */}
              {showAddForm && activeTab === 'outsourcing' && (
                <div className="bg-[#282a2d] border border-[#FF6B00] p-4 rounded-xl mb-4 relative animate-fade-in shadow-xl shadow-black/50">
                  <h4 className="font-bold text-[#FF6B00] mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-sm">handshake</span> 새 외주 항목 추가</h4>
                  <button onClick={() => setShowAddForm(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><span className="material-symbols-outlined">close</span></button>
                  <form onSubmit={handleOutsourcingSubmit} className="grid grid-cols-1 gap-3 relative">
                    <div className="relative">
                      <label className="text-xs text-slate-400 mb-1 block">외주 업체명</label>
                      <input type="text" required className="w-full bg-[#111316] border border-[#2D343D] rounded px-3 py-2 text-white outline-none focus:border-[#FF6B00]" value={outsourcingForm.company} onChange={handleOutsourcingCompanyChange} autoComplete="off"/>
                      {suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#333538] z-50 border border-[#2D343D] rounded max-h-48 overflow-y-auto shadow-xl">
                          {suggestions.map((s, i) => (
                            <div key={i} onClick={() => selectOutsourcingSuggestion(s)} className="p-3 border-b border-[#2D343D] hover:bg-[#111316] cursor-pointer">
                              <div className="font-medium text-white">{s.companyName} <span className="text-xs text-[#FF6B00] ml-2">{s.task}</span></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div><label className="text-xs text-slate-400 mb-1 block">작업 내용</label><input type="text" required className="w-full bg-[#111316] border border-[#2D343D] rounded px-3 py-2 text-white outline-none focus:border-[#FF6B00]" value={outsourcingForm.task} onChange={e => setOutsourcingForm({...outsourcingForm, task: e.target.value})} /></div>
                    <div><label className="text-xs text-slate-400 mb-1 block">청구 비용 (원)</label><input type="number" required className="w-full bg-[#111316] border border-[#2D343D] rounded px-3 py-2 text-white outline-none focus:border-[#FF6B00]" value={outsourcingForm.amount} onChange={e => setOutsourcingForm({...outsourcingForm, amount: e.target.value})} /></div>
                    <div className="mt-2"><button type="submit" className="w-full bg-[#FF6B00] text-[#561f00] font-bold py-2 rounded hover:opacity-90">추가하기</button></div>
                  </form>
                </div>
              )}

              {activeTab === 'outsourcing' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="font-bold text-lg text-white">외주 작업</h3>
                    <span className="text-xs font-bold text-[#FF6B00] bg-[#FF6B00]/10 px-2 py-1 rounded border border-[#FF6B00]/20">{totalOutsourcings} 건</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {loading ? <div className="text-center py-8 text-slate-500">데이터를 불러오는 중...</div> : logData?.outsourcings.length === 0 ? <div className="bg-[#1a1c1f] border border-[#2D343D] rounded-xl p-8 text-center text-slate-500">입력된 외주 항목이 없습니다.</div> : logData?.outsourcings.map((out: any) => (
                        <div key={out.id} className="bg-[#1a1c1f] border border-[#2D343D] rounded-xl p-4 flex justify-between items-center hover:border-[#FF6B00]/50 transition-colors group">
                          <div className="flex items-center gap-3 w-2/3">
                            <div className="w-12 h-12 bg-[#2D343D] rounded-lg flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-[#d64cff]">handshake</span></div>
                            <div className="overflow-hidden">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-white truncate text-sm md:text-base">{out.companyName}</h4>
                                {out.createdBy && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 font-bold">BY {out.createdBy}</span>
                                )}
                              </div>
                              <p className="text-[10px] md:text-xs text-slate-400 uppercase truncate mt-0.5">{out.task}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base md:text-lg font-bold text-white">₩{out.amount.toLocaleString()}</p>
                          </div>
                        </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ===================== MATERIAL TAB ===================== */}
              {showAddForm && activeTab === 'material' && (
                <div className="bg-[#282a2d] border border-[#FF6B00] p-4 rounded-xl mb-4 relative animate-fade-in shadow-xl shadow-black/50">
                  <h4 className="font-bold text-[#FF6B00] mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-sm">inventory_2</span> 새 자재 추가</h4>
                  <button onClick={() => setShowAddForm(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><span className="material-symbols-outlined">close</span></button>
                  <form onSubmit={handleMaterialSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3 relative">
                    <div className="relative">
                      <label className="text-xs text-slate-400 mb-1 block">자재명</label>
                      <input type="text" required className="w-full bg-[#111316] border border-[#2D343D] rounded px-3 py-2 text-white outline-none focus:border-[#FF6B00]" value={materialForm.name} onChange={handleMaterialNameChange} autoComplete="off"/>
                      {suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#333538] z-50 border border-[#2D343D] rounded max-h-48 overflow-y-auto shadow-xl">
                          {suggestions.map((s, i) => (
                            <div key={i} onClick={() => selectMaterialSuggestion(s)} className="p-3 border-b border-[#2D343D] hover:bg-[#111316] cursor-pointer">
                              <div className="font-medium text-white">{s.name} <span className="text-xs text-[#FF6B00] ml-2">{s.spec}</span></div>
                              <div className="text-xs text-slate-400 mt-1">단위: {s.unit}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div><label className="text-xs text-slate-400 mb-1 block">규격</label><input type="text" className="w-full bg-[#111316] border border-[#2D343D] rounded px-3 py-2 text-white outline-none focus:border-[#FF6B00]" value={materialForm.spec} onChange={e => setMaterialForm({...materialForm, spec: e.target.value})} /></div>
                    <div><label className="text-xs text-slate-400 mb-1 block">단위 (EA, kg, m)</label><input type="text" required className="w-full bg-[#111316] border border-[#2D343D] rounded px-3 py-2 text-white outline-none focus:border-[#FF6B00]" value={materialForm.unit} onChange={e => setMaterialForm({...materialForm, unit: e.target.value})} /></div>
                    <div><label className="text-xs text-slate-400 mb-1 block">수량</label><input type="number" step="0.1" required className="w-full bg-[#111316] border border-[#2D343D] rounded px-3 py-2 text-white outline-none focus:border-[#FF6B00]" value={materialForm.quantity} onChange={e => setMaterialForm({...materialForm, quantity: e.target.value})} /></div>
                    <div className="md:col-span-2 mt-2"><button type="submit" className="w-full bg-[#FF6B00] text-[#561f00] font-bold py-2 rounded hover:opacity-90">추가하기</button></div>
                  </form>
                </div>
              )}

              {activeTab === 'material' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="font-bold text-lg text-white">투입 자재</h3>
                    <span className="text-xs font-bold text-[#FF6B00] bg-[#FF6B00]/10 px-2 py-1 rounded border border-[#FF6B00]/20">{totalMaterials} 건 투입</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {loading ? <div className="text-center py-8 text-slate-500">데이터를 불러오는 중...</div> : logData?.materials.length === 0 ? <div className="bg-[#1a1c1f] border border-[#2D343D] rounded-xl p-8 text-center text-slate-500">입력된 자재가 없습니다.</div> : logData?.materials.map((mat: any) => (
                        <div key={mat.id} className="bg-[#1a1c1f] border border-[#2D343D] rounded-xl p-4 flex justify-between items-center hover:border-[#FF6B00]/50 transition-colors group">
                          <div className="flex items-center gap-3 w-2/3">
                            <div className="w-12 h-12 bg-[#2D343D] rounded-lg flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-[#ffc107]">inventory_2</span></div>
                            <div className="overflow-hidden">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-white truncate text-sm md:text-base">{mat.name}</h4>
                                {mat.createdBy && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 font-bold">BY {mat.createdBy}</span>
                                )}
                              </div>
                              <p className="text-[10px] md:text-xs text-slate-400 uppercase truncate mt-0.5">{mat.spec} • {mat.quantity}{mat.unit}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-slate-400">{mat.note || '메모 없음'}</p>
                          </div>
                        </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ===================== EXPENSE TAB ===================== */}
              {showAddForm && activeTab === 'expense' && (
                <div className="bg-[#282a2d] border border-[#FF6B00] p-4 rounded-xl mb-4 relative animate-fade-in shadow-xl shadow-black/50">
                  <h4 className="font-bold text-[#FF6B00] mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-sm">receipt_long</span> 새 경비 추가</h4>
                  <button onClick={() => setShowAddForm(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><span className="material-symbols-outlined">close</span></button>
                  <form onSubmit={handleExpenseSubmit} className="grid grid-cols-1 gap-3">
                    <div><label className="text-xs text-slate-400 mb-1 block">항목 (식대, 주유비, 소모품 등)</label><input type="text" required className="w-full bg-[#111316] border border-[#2D343D] rounded px-3 py-2 text-white outline-none focus:border-[#FF6B00]" value={expenseForm.category} onChange={e => setExpenseForm({...expenseForm, category: e.target.value})} /></div>
                    <div><label className="text-xs text-slate-400 mb-1 block">금액 (원)</label><input type="number" required className="w-full bg-[#111316] border border-[#2D343D] rounded px-3 py-2 text-white outline-none focus:border-[#FF6B00]" value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} /></div>
                    <div><label className="text-xs text-slate-400 mb-1 block">비고</label><input type="text" className="w-full bg-[#111316] border border-[#2D343D] rounded px-3 py-2 text-white outline-none focus:border-[#FF6B00]" value={expenseForm.note} onChange={e => setExpenseForm({...expenseForm, note: e.target.value})} /></div>
                    <div className="mt-2"><button type="submit" className="w-full bg-[#FF6B00] text-[#561f00] font-bold py-2 rounded hover:opacity-90">추가하기</button></div>
                  </form>
                </div>
              )}

              {activeTab === 'expense' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="font-bold text-lg text-white">경비 내역</h3>
                    <span className="text-xs font-bold text-[#FF6B00] bg-[#FF6B00]/10 px-2 py-1 rounded border border-[#FF6B00]/20">{logData?.expenses?.length || 0} 건</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {loading ? <div className="text-center py-8 text-slate-500">데이터를 불러오는 중...</div> : logData?.expenses?.length === 0 ? <div className="bg-[#1a1c1f] border border-[#2D343D] rounded-xl p-8 text-center text-slate-500">입력된 경비가 없습니다.</div> : logData?.expenses?.map((exp: any) => (
                        <div key={exp.id} className="bg-[#1a1c1f] border border-[#2D343D] rounded-xl p-4 flex justify-between items-center hover:border-[#FF6B00]/50 transition-colors group">
                          <div className="flex items-center gap-3 w-2/3">
                            <div className="w-12 h-12 bg-[#2D343D] rounded-lg flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-[#4ae176]">payments</span></div>
                            <div className="overflow-hidden">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-white truncate text-sm md:text-base">{exp.category}</h4>
                                {exp.createdBy && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 font-bold">BY {exp.createdBy}</span>
                                )}
                              </div>
                              <p className="text-[10px] md:text-xs text-slate-400 truncate mt-0.5">{exp.note || '메모 없음'}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base md:text-lg font-bold text-white">₩{exp.amount.toLocaleString()}</p>
                          </div>
                        </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* BottomNavBar */}
      <nav className="fixed bottom-0 left-0 w-full z-40 flex justify-around items-center bg-[#121417] border-t border-[#2D343D] pb-safe h-16">
        <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center justify-center py-2 transition-transform active:scale-90 ${activeTab === 'dashboard' ? 'text-[#FF6B00]' : 'text-slate-500 hover:text-white'}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'dashboard' ? "'FILL' 1" : "'FILL' 0" }}>dashboard</span>
          <span className="font-['Space_Grotesk'] text-[10px] uppercase font-bold mt-1">대시보드</span>
        </button>
        <button onClick={() => setActiveTab('labor')} className={`flex flex-col items-center justify-center py-2 transition-transform active:scale-90 ${activeTab === 'labor' ? 'text-[#FF6B00]' : 'text-slate-500 hover:text-white'}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'labor' ? "'FILL' 1" : "'FILL' 0" }}>groups</span>
          <span className="font-['Space_Grotesk'] text-[10px] uppercase font-bold mt-1">노무</span>
        </button>
        <button onClick={() => setActiveTab('equipment')} className={`flex flex-col items-center justify-center py-2 transition-transform active:scale-90 ${activeTab === 'equipment' ? 'text-[#FF6B00]' : 'text-slate-500 hover:text-white'}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'equipment' ? "'FILL' 1" : "'FILL' 0" }}>precision_manufacturing</span>
          <span className="font-['Space_Grotesk'] text-[10px] uppercase font-bold mt-1">장비</span>
        </button>
        <button onClick={() => setActiveTab('outsourcing')} className={`flex flex-col items-center justify-center py-2 transition-transform active:scale-90 ${activeTab === 'outsourcing' ? 'text-[#FF6B00]' : 'text-slate-500 hover:text-white'}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'outsourcing' ? "'FILL' 1" : "'FILL' 0" }}>handshake</span>
          <span className="font-['Space_Grotesk'] text-[10px] uppercase font-bold mt-1">외주</span>
        </button>
        <button onClick={() => setActiveTab('expense')} className={`flex flex-col items-center justify-center py-2 transition-transform active:scale-90 ${activeTab === 'expense' ? 'text-[#FF6B00]' : 'text-slate-500 hover:text-white'}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'expense' ? "'FILL' 1" : "'FILL' 0" }}>receipt_long</span>
          <span className="font-['Space_Grotesk'] text-[10px] uppercase font-bold mt-1">경비</span>
        </button>
        <button onClick={() => setActiveTab('material')} className={`flex flex-col items-center justify-center py-2 transition-transform active:scale-90 ${activeTab === 'material' ? 'text-[#FF6B00]' : 'text-slate-500 hover:text-white'}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'material' ? "'FILL' 1" : "'FILL' 0" }}>inventory_2</span>
          <span className="font-['Space_Grotesk'] text-[10px] uppercase font-bold mt-1">자재</span>
        </button>
      </nav>

      {/* Floating Action Button */}
      {selectedSiteId && ['labor', 'equipment', 'material', 'outsourcing', 'expense'].includes(activeTab) && !showAddForm && !showNewSiteForm && (
        <button 
          onClick={() => setShowAddForm(true)}
          className="fixed right-6 bottom-20 w-14 h-14 bg-[#FF6B00] text-[#561f00] rounded-full shadow-lg shadow-[#FF6B00]/20 flex items-center justify-center active:scale-90 transition-transform z-50 hover:opacity-90"
        >
          <span className="material-symbols-outlined font-bold">add</span>
        </button>
      )}
    </>
  )
}
