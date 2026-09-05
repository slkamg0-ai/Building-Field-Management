'use client'

import { useState, useEffect } from 'react'
import { getDailyLog, getSites, createSite, updateSite, resetSiteData, getMonthlyStats, getSiteTotalStats, getUsers, createUser, deleteUser, toggleUserActive, updateUserPin, updateUserRole, updateDailyLogDescription, addPhotoRecord, deletePhoto, uploadPhoto, getCurrentUser, logout, getWorkers, getUserSiteIds, setUserSites } from '@/lib/actions'
import DashboardTab from './DashboardTab'
import LaborTab from './LaborTab'
import EquipmentTab from './EquipmentTab'
import OutsourcingTab from './OutsourcingTab'
import MaterialTab from './MaterialTab'
import ExpenseTab from './ExpenseTab'
import SettlementTab from './SettlementTab'
import IntegrationTab from './IntegrationTab'
import { useRouter } from 'next/navigation'
import { Users, User, LogOut, Shield, Trash2, UserPlus, Power, KeyRound, Check, X, UserCheck, Menu } from 'lucide-react'
import NotifyButton from './NotifyButton'
import BillingPanel from './BillingPanel'
import FeedbackPanel from './FeedbackPanel'
import CornerMarkers from '@/components/CornerMarkers'

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard') // dashboard, labor, equipment, material, outsourcing
  const [showMobileMenu, setShowMobileMenu] = useState(false)
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
  const [changingPinId, setChangingPinId] = useState<string | null>(null)
  const [newPinInput, setNewPinInput] = useState('')
  const [editingSitesForUserId, setEditingSitesForUserId] = useState<string | null>(null)
  const [editingSiteIds, setEditingSiteIds] = useState<string[]>([])
  const router = useRouter()

  // 폼 표시 상태
  const [showAddForm, setShowAddForm] = useState(false)
  const [workerDocMap, setWorkerDocMap] = useState<Record<string, string>>({}) // 이름(소문자) -> documentStatus, 노무 서류 경고용
  const [suggestions, setSuggestions] = useState<any[]>([])
  
  // 작업 내용 및 사진 관련 상태
  const [workDescription, setWorkDescription] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  useEffect(() => {
    initialize()
  }, [])

  async function initialize() {
    const user = await getCurrentUser()
    if (!user) {
      router.push('/login')
      return
    }
    setCurrentUser(user)
    await Promise.all([loadSites(), loadAllUsers(), loadWorkerDocMap()])
  }

  // 근로자 서류 상태 조회 (이름 기준) — 노무 입력 목록에 서류 미비 경고를 띄우기 위함
  async function loadWorkerDocMap() {
    try {
      const workers = await getWorkers(true)
      const map: Record<string, string> = {}
      for (const w of workers) map[w.name.trim().toLowerCase()] = w.documentStatus
      setWorkerDocMap(map)
    } catch {}
  }

  async function handleLogout() {
    await logout()
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
      setWorkDescription(data.description || '')
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

  // 노무/장비/자재/외주/경비 항목 삭제 공통 핸들러
  const handleDeleteItem = async (deleteFn: (id: string) => Promise<any>, id: string, label: string) => {
    if (!confirm(`${label} 항목을 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return
    try {
      await deleteFn(id)
      loadData()
      loadMonthlyData()
      loadSiteTotalStats()
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 중 오류가 발생했습니다.')
    }
  }

  // 노무/장비/자재/외주/경비 항목 추가 후 공통 새로고침
  const refreshLog = () => {
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
  
  // mode 'photo': 보관용 사진(용량 우선). mode 'document': OCR용(해상도·품질 우선 — 작은 글씨 보존)
  const optimizeImage = (file: File, mode: 'photo' | 'document' = 'photo'): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const max_size = mode === 'document' ? 1792 : 1024;

          if (width > height) {
            if (width > max_size) {
              height *= max_size / width;
              width = max_size;
            }
          } else {
            if (height > max_size) {
              width *= max_size / height;
              height = max_size;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', mode === 'document' ? 0.85 : 0.6));
        };
      };
      reader.onerror = error => reject(error);
    });
  };

  async function analyzeDocument(file: File, formType: string): Promise<Record<string, string> | null> {
    setIsAnalyzing(true)
    try {
      const base64 = await optimizeImage(file, 'document')
      const res = await fetch('/api/analyze-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, formType }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      if (Array.isArray(json.warnings) && json.warnings.length > 0) {
        alert(`인식 결과 확인 필요:\n- ${json.warnings.join('\n- ')}`)
      }
      return json.data
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(`문서 분석 실패: ${msg}`)
      return null
    } finally {
      setIsAnalyzing(false)
    }
  }

  function dataURLtoBlob(dataURL: string): Blob {
    const arr = dataURL.split(',')
    const mime = arr[0].match(/:(.*?);/)![1]
    const bstr = atob(arr[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) u8arr[n] = bstr.charCodeAt(n)
    return new Blob([u8arr], { type: mime })
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !logData) return;

    setIsUploading(true);
    try {
      const optimizedBase64 = await optimizeImage(file);
      await uploadPhoto(logData.id, optimizedBase64, currentUser?.name ?? null);

      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("Upload failed", msg);
      alert(`업로드 실패: ${msg}`);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden xl:flex flex-col h-full w-72 border-r border-[rgba(29,31,32,0.16)] bg-[#f2f2f3] transition-all">
        <div className="p-8 flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#5980a6] text-[#f2f2f3] font-black flex items-center justify-center text-sm shadow-md">
              FM
            </div>
            <div className="flex flex-col truncate">
              <span className="text-[10px] font-black text-[#5980a6] tracking-widest uppercase">Field manage</span>
              <span className="text-sm font-bold text-[#1d1f20] truncate">
                {sites.find(s => s.id === selectedSiteId)?.name || '현장 선택'}
              </span>
            </div>
          </div>
          
          <div className="pt-6 flex flex-col gap-2">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
              { id: 'labor', label: 'Labour', icon: 'groups' },
              { id: 'equipment', label: 'Equipment', icon: 'precision_manufacturing' },
              { id: 'material', label: 'Materials', icon: 'inventory_2' },
              { id: 'outsourcing', label: 'Outsourcing', icon: 'assignment' },
              { id: 'expense', label: 'Expense', icon: 'payments' },
              { id: 'billing', label: 'Billing (기성)', icon: 'request_quote' },
              { id: 'feedback', label: 'Feedback', icon: 'feedback' },
              ...(currentUser?.role === 'ADMIN' ? [{ id: 'integration', label: 'Drive Link', icon: 'hub' }] : []),
            ].map(item => (
              <div 
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-4 px-4 py-3 rounded cursor-pointer transition-all ${activeTab === item.id ? 'bg-[rgba(29,31,32,0.16)] text-[#5980a6] border-l-4 border-[#5980a6]' : 'text-[rgba(29,31,32,0.6)] hover:text-[#1d1f20] hover:bg-[rgba(29,31,32,0.16)]'}`}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span className="font-cond uppercase text-xs font-semibold">{item.label}</span>
              </div>
            ))}

            <div className="my-2 border-t border-[rgba(29,31,32,0.16)]" />
            <div onClick={() => router.push('/attendance')} className="flex items-center gap-4 px-4 py-3 rounded cursor-pointer text-[rgba(29,31,32,0.6)] hover:text-[#1d1f20] hover:bg-[rgba(29,31,32,0.16)] transition-all">
              <span className="material-symbols-outlined">how_to_reg</span>
              <span className="font-cond uppercase text-xs font-semibold">출퇴근</span>
            </div>
            <div onClick={() => router.push('/workers')} className="flex items-center gap-4 px-4 py-3 rounded cursor-pointer text-[rgba(29,31,32,0.6)] hover:text-[#1d1f20] hover:bg-[rgba(29,31,32,0.16)] transition-all">
              <span className="material-symbols-outlined">badge</span>
              <span className="font-cond uppercase text-xs font-semibold">근로자 관리</span>
            </div>
          </div>
        </div>
        
        <div className="mt-auto p-8 border-t border-[rgba(29,31,32,0.16)]">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-[#5980a6] shrink-0">
              <img alt="Profile" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAVRaBrtKh_z4Q7vJTKk4JINJs8Ij5SI9UofZu7tdp1mM3Tz-k2n0gXdfY1Db0GdG2UC-EB9EIqR6bpy6Yho0MAdFgMs0Q4FjAhLIxIPztwIis_lvFBDeAIaxBNeg7OsyeDd8RR1xLw4YwBZ7N1NqPO_g0cjKeGT1YVV6ssygQWdU9uhSdf1rq-_lMDVpG7vFicN6bG72DHUiMoiTfQSfLtVoHwUsJ-Xk3_Bp6vmx4Z_DBHYBhLZJYj5C7TLLmqpQvwUSWdrKwwFkKQ"/>
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-[#1d1f20] font-bold text-sm truncate">{currentUser?.name}</span>
              <span className="text-[rgba(29,31,32,0.55)] text-[10px] font-bold uppercase tracking-widest">{currentUser?.role}</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="xl:ml-72 flex flex-col min-h-screen">
        <header className="fixed top-0 left-0 xl:left-72 right-0 z-30 flex flex-col bg-[#181a1d] border-b border-[#2d343d] transition-all text-white">
          {/* 1행: 타이틀 / 현장 선택 + 버튼 */}
          <div className="flex justify-between items-center px-3 md:px-8 h-16">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="bg-[#5980a6] text-[#f2f2f3] font-black text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider">Field manage</span>
                </div>
                {sites.length > 0 && (
                  <div className="flex items-center gap-1 mt-1 min-w-0">
                    <select
                      value={selectedSiteId}
                      onChange={(e) => {
                        if (e.target.value === 'NEW') setShowNewSiteForm(true)
                        else setSelectedSiteId(e.target.value)
                      }}
                      className="bg-transparent text-white font-bold text-xs md:text-base outline-none cursor-pointer hover:opacity-80 truncate max-w-[130px] sm:max-w-[200px] md:max-w-xs"
                    >
                      {sites.map(s => <option key={s.id} value={s.id} className="bg-[#181a1d] text-white text-base">{s.name}</option>)}
                      <option value="NEW" className="bg-[#181a1d] text-[#5980a6] font-bold">+ 새 현장 추가</option>
                    </select>
                    {selectedSiteId && (
                      <button onClick={openEditSiteModal} className="text-[#a1a1aa] hover:text-white transition-colors p-1 shrink-0">
                        <span className="material-symbols-outlined text-xs md:text-sm">edit</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <NotifyButton userName={currentUser?.name} />

              {/* 모바일·태블릿(~lg 미만) 통합 메뉴 버튼: 아이콘 바가 잘리지 않도록 lg 미만에서는 항상 드로어로 통합 */}
              <button
                onClick={() => setShowMobileMenu(true)}
                className="lg:hidden flex items-center gap-1 bg-[#282a2d] hover:bg-[#333538] border border-[#3f434a] rounded-lg px-2 py-1.5 text-white text-xs font-medium transition-all active:scale-95"
                title="사용자 메뉴"
              >
                <div className="w-5 h-5 rounded-full bg-[#5980a6]/40 text-[#5980a6] flex items-center justify-center font-bold text-[10px] shrink-0">
                  {currentUser?.name?.slice(0, 1) || 'U'}
                </div>
                <span className="max-w-[45px] truncate text-[11px] font-semibold hidden sm:inline">{currentUser?.name || '사용자'}</span>
                <Menu className="w-4 h-4 text-slate-300 ml-0.5" />
              </button>

              {/* 데스크톱(lg 이상) 전용 풀 아이콘 바: 화면이 좁으면 잘리지 않고 위 드로어 버튼으로 대체됨 */}
              <div className="hidden lg:flex items-center gap-0.5">
                <button onClick={() => router.push('/attendance')} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg hover:bg-[#282a2d] transition-colors text-slate-300 hover:text-[#5980a6]" title="출퇴근 체크">
                  <UserCheck className="w-4 h-4" />
                </button>
                {currentUser?.role === 'ADMIN' && (
                  <button onClick={() => router.push('/workers')} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg hover:bg-[#282a2d] transition-colors text-slate-300 hover:text-[#5980a6]" title="근로자 관리">
                    <UserPlus className="w-4 h-4" />
                  </button>
                )}
                {currentUser?.role === 'ADMIN' && (
                  <button onClick={() => { loadAllUsers(); setShowUserManagement(true) }} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg hover:bg-[#282a2d] transition-colors text-slate-300 hover:text-[#5980a6]" title="사용자 관리">
                    <Users className="w-4 h-4" />
                  </button>
                )}
                <button onClick={handleLogout} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg hover:bg-[#282a2d] transition-colors text-slate-300 hover:text-red-400" title="로그아웃">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          {/* 2행: 날짜 선택 (데스크톱 전용) */}
          <div className="hidden md:flex items-center gap-2 px-4 md:px-8 py-2 border-t border-[rgba(29,31,32,0.16)]">
            <div className="flex items-center gap-1 bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-lg px-2 py-1">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="bg-transparent text-[#1d1f20] text-xs font-bold outline-none cursor-pointer p-1"
              >
                {[2024, 2025, 2026].map(y => <option key={y} value={y} className="bg-[#e9e9ea]">{y}년</option>)}
              </select>
              <select
                value={selectedMonth}
                onChange={(e) => {
                  const m = parseInt(e.target.value)
                  setSelectedMonth(m)
                  const newDate = `${selectedYear}-${String(m).padStart(2, '0')}-01`
                  setCurrentDate(newDate)
                }}
                className="bg-transparent text-[#5980a6] text-xs font-bold outline-none cursor-pointer p-1"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m} className="bg-[#e9e9ea]">{m}월</option>)}
              </select>
            </div>
            <input
              type="date"
              className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] text-[#1d1f20] px-3 py-2 rounded-lg text-xs outline-none focus:border-[#5980a6]"
              value={currentDate}
              onChange={(e) => {
                const d = new Date(e.target.value)
                setCurrentDate(e.target.value)
                setSelectedYear(d.getFullYear())
                setSelectedMonth(d.getMonth() + 1)
              }}
            />
          </div>
        </header>

        <main className="mt-16 md:mt-[104px] px-4 md:px-8 space-y-4 pb-24 xl:pb-8 max-w-7xl mx-auto pt-4 w-full">
          {/* Mobile Project & Date Selector */}
          <section className="md:hidden flex flex-col gap-3 pb-4 border-b border-[rgba(29,31,32,0.16)]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#5980a6] text-sm">location_on</span>
              <span className="text-on-surface font-bold">현장: {sites.find(s => s.id === selectedSiteId)?.name || '선택된 현장 없음'}</span>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <select 
                  value={selectedMonth}
                  onChange={(e) => {
                    const m = parseInt(e.target.value)
                    setSelectedMonth(m)
                    const newDate = `${selectedYear}-${String(m).padStart(2, '0')}-01`
                    setCurrentDate(newDate)
                  }}
                  className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] text-[#1d1f20] rounded-lg px-3 py-2 appearance-none outline-none focus:border-[#5980a6] text-sm"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m} className="bg-[#e9e9ea]">{m}월</option>)}
                </select>
                <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-[rgba(29,31,32,0.55)] pointer-events-none text-lg">expand_more</span>
              </div>
              <div className="flex-1 relative">
                <input 
                  type="date" 
                  value={currentDate}
                  onChange={(e) => {
                    const d = new Date(e.target.value)
                    setCurrentDate(e.target.value)
                    setSelectedYear(d.getFullYear())
                    setSelectedMonth(d.getMonth() + 1)
                  }}
                  className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] text-[#1d1f20] rounded-lg px-3 py-2 outline-none focus:border-[#5980a6] text-sm"
                />
              </div>
            </div>
          </section>
        
        {/* 새 현장 추가 모달 */}
        {showNewSiteForm && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
            <div className="bg-[#f2f2f3] border border-[#5980a6] p-6 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold text-[#5980a6] mb-4">
                {isEditingSite ? '현장 정보 수정' : '새 현장 추가'}
              </h3>
              <form onSubmit={handleCreateSite} className="space-y-4">
                <div>
                  <label className="block text-sm text-[rgba(29,31,32,0.6)] mb-1">현장명</label>
                  <input type="text" required className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-4 py-3 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={newSiteName} onChange={e => setNewSiteName(e.target.value)} placeholder="예: 서울 강남구 복합시설 현장" />
                </div>
                <div>
                  <label className="block text-sm text-[rgba(29,31,32,0.6)] mb-1">도급액 (예산)</label>
                  <input type="number" required className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-4 py-3 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={newSiteContractAmount} onChange={e => setNewSiteContractAmount(e.target.value)} placeholder="0" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-[rgba(29,31,32,0.6)] mb-1">착공일</label>
                    <input type="date" required className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-4 py-3 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={newSiteStartDate} onChange={e => setNewSiteStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm text-[rgba(29,31,32,0.6)] mb-1">준공예정일</label>
                    <input type="date" required className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-4 py-3 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={newSiteEndDate} onChange={e => setNewSiteEndDate(e.target.value)} />
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
                    className="flex-1 py-3 rounded border border-[rgba(29,31,32,0.16)] text-[rgba(29,31,32,0.6)] hover:text-[#1d1f20]"
                  >
                    취소
                  </button>
                  <button type="submit" className="flex-1 py-3 rounded bg-[#5980a6] text-[#f2f2f3] font-bold hover:opacity-90">
                    {isEditingSite ? '수정하기' : '생성하기'}
                  </button>
                </div>
                {isEditingSite && (
                  <div className="pt-6 border-t border-[rgba(29,31,32,0.16)] mt-6">
                    <p className="text-[10px] text-[rgba(29,31,32,0.55)] font-bold uppercase tracking-widest mb-2">위험 구역</p>
                    <button 
                      type="button" 
                      onClick={handleResetSite}
                      className="w-full py-2 rounded border border-red-500/30 text-red-500 text-xs font-bold hover:bg-red-500 hover:text-[#1d1f20] transition-all flex items-center justify-center gap-2"
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
            <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] p-6 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-[#1d1f20] flex items-center gap-2">
                  <Shield className="text-[#5980a6]" /> 사용자 및 권한 관리
                </h3>
                <button onClick={() => setShowUserManagement(false)} className="text-[rgba(29,31,32,0.6)] hover:text-[#1d1f20]">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* 새 사용자 추가 폼 */}
              <div className="bg-[#f2f2f3] p-4 rounded-lg border border-[rgba(29,31,32,0.16)] mb-6">
                <h4 className="text-sm font-bold text-[#5980a6] mb-3 flex items-center gap-2">
                  <UserPlus className="w-4 h-4" /> 신규 접속자 등록
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input 
                    type="text" 
                    placeholder="이름" 
                    className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]"
                    value={newUserForm.name}
                    onChange={e => setNewUserForm({...newUserForm, name: e.target.value})}
                  />
                  <input
                    type="text"
                    placeholder="PIN (4~8자리)"
                    maxLength={8}
                    className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]"
                    value={newUserForm.pin}
                    onChange={e => setNewUserForm({...newUserForm, pin: e.target.value.replace(/\D/g, '')})}
                  />
                  <select 
                    className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]"
                    value={newUserForm.role}
                    onChange={e => setNewUserForm({...newUserForm, role: e.target.value})}
                  >
                    <option value="WORKER">작업자 (WORKER)</option>
                    <option value="ADMIN">관리자 (ADMIN)</option>
                  </select>
                  <button 
                    onClick={async () => {
                      if (!newUserForm.name || !/^\d{4,8}$/.test(newUserForm.pin)) return
                      await createUser(newUserForm.name, newUserForm.pin, newUserForm.role)
                      setNewUserForm({ name: '', pin: '', role: 'WORKER' })
                      loadAllUsers()
                    }}
                    className="bg-[#5980a6] text-[#f2f2f3] font-bold rounded py-2 hover:opacity-90 transition-colors"
                  >
                    등록
                  </button>
                </div>
              </div>

              {/* 사용자 리스트 */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-[rgba(29,31,32,0.55)] mb-2 uppercase tracking-widest">등록된 접속자 목록</h4>
                {allUsers.map(u => (
                  <div key={u.id} className="flex items-center justify-between bg-[#f2f2f3] p-3 rounded-lg border border-[rgba(29,31,32,0.16)]">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${u.role === 'ADMIN' ? 'bg-[#5980a6]/20 text-[#5980a6]' : 'bg-[#ededed] text-[rgba(29,31,32,0.6)]'}`}>
                        {u.role === 'ADMIN' ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="text-[#1d1f20] font-bold text-sm">{u.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {u.name !== '관리자' ? (
                            <button
                              onClick={async () => {
                                const newRole = u.role === 'ADMIN' ? 'WORKER' : 'ADMIN'
                                await updateUserRole(u.id, newRole)
                                loadAllUsers()
                              }}
                              className={`text-[10px] font-bold tracking-widest px-1.5 py-0.5 rounded transition-colors ${u.role === 'ADMIN' ? 'bg-[#5980a6]/20 text-[#5980a6] hover:bg-[#5980a6]/30' : 'bg-[#ededed] text-[rgba(29,31,32,0.6)] hover:bg-[#e0e0e0]'}`}
                              title="클릭하여 역할 변경"
                            >
                              {u.role}
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold tracking-widest px-1.5 py-0.5 rounded bg-[#5980a6]/20 text-[#5980a6]">{u.role}</span>
                          )}
                          <span className="text-[10px] text-[rgba(29,31,32,0.55)]">PIN 보호됨</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {changingPinId === u.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="password"
                            maxLength={8}
                            placeholder="새 PIN (4~8자리)"
                            value={newPinInput}
                            onChange={e => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                            className="w-28 bg-[#f2f2f3] border border-[#5980a6] rounded px-2 py-1 text-[#1d1f20] text-sm outline-none text-center tracking-widest"
                            autoFocus
                          />
                          <button
                            onClick={async () => {
                              if (!/^\d{4,8}$/.test(newPinInput)) return
                              await updateUserPin(u.id, newPinInput)
                              setChangingPinId(null)
                              setNewPinInput('')
                              loadAllUsers()
                            }}
                            className="p-1.5 rounded bg-[#16a34a]/10 text-[#16a34a] hover:bg-[#16a34a]/20 transition-colors"
                            title="저장"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { setChangingPinId(null); setNewPinInput('') }}
                            className="p-1.5 rounded hover:bg-[#ededed] text-[rgba(29,31,32,0.55)] transition-colors"
                            title="취소"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setChangingPinId(u.id); setNewPinInput('') }}
                          className="p-2 rounded hover:bg-[#ededed] text-[rgba(29,31,32,0.55)] hover:text-[#5980a6] transition-colors"
                          title="PIN 변경"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          await toggleUserActive(u.id, !u.isActive)
                          loadAllUsers()
                        }}
                        className={`p-2 rounded hover:bg-[#ededed] transition-colors ${u.isActive ? 'text-[#16a34a]' : 'text-[rgba(29,31,32,0.5)]'}`}
                        title={u.isActive ? "비활성화" : "활성화"}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async () => {
                          if (editingSitesForUserId === u.id) {
                            setEditingSitesForUserId(null)
                            return
                          }
                          try {
                            const siteIds = await getUserSiteIds(u.id)
                            setEditingSiteIds(siteIds)
                            setEditingSitesForUserId(u.id)
                          } catch (e) {
                            alert('현장 배정 정보를 불러오지 못했습니다: ' + (e instanceof Error ? e.message : String(e)))
                          }
                        }}
                        className={`p-2 rounded hover:bg-[#ededed] transition-colors ${editingSitesForUserId === u.id ? 'text-[#5980a6]' : 'text-[rgba(29,31,32,0.55)]'}`}
                        title="현장 배정"
                      >
                        <span className="material-symbols-outlined text-[18px]">apartment</span>
                      </button>
                      {u.name !== '관리자' && (
                        <button
                          onClick={async () => {
                            if (confirm('정말로 이 사용자를 삭제하시겠습니까?')) {
                              await deleteUser(u.id)
                              loadAllUsers()
                            }
                          }}
                          className="p-2 rounded hover:bg-red-500/10 text-[rgba(29,31,32,0.5)] hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {editingSitesForUserId && (() => {
                  const editingUser = allUsers.find(u => u.id === editingSitesForUserId)
                  if (!editingUser) return null
                  return (
                    <div className="bg-[#f2f2f3] p-4 rounded-lg border border-[#5980a6] space-y-2">
                      <h5 className="text-xs font-bold text-[#5980a6] uppercase tracking-widest">{editingUser.name}님의 접근 가능 현장</h5>
                      <div className="space-y-1.5">
                        {sites.map(s => (
                          <label key={s.id} className="flex items-center gap-2 text-sm text-[#1d1f20] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editingSiteIds.includes(s.id)}
                              onChange={e => {
                                setEditingSiteIds(prev =>
                                  e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id)
                                )
                              }}
                            />
                            {s.name}
                          </label>
                        ))}
                        {sites.length === 0 && <p className="text-xs text-[rgba(29,31,32,0.55)]">등록된 현장이 없습니다.</p>}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={async () => {
                            try {
                              await setUserSites(editingSitesForUserId, editingSiteIds)
                              setEditingSitesForUserId(null)
                            } catch (e) {
                              alert('현장 배정 저장에 실패했습니다: ' + (e instanceof Error ? e.message : String(e)))
                            }
                          }}
                          className="bg-[#5980a6] text-[#f2f2f3] text-xs font-bold rounded px-3 py-1.5 hover:opacity-90 transition-colors"
                        >
                          저장
                        </button>
                        <button
                          onClick={() => setEditingSitesForUserId(null)}
                          className="text-xs font-bold rounded px-3 py-1.5 hover:bg-[#ededed] text-[rgba(29,31,32,0.6)] transition-colors"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        )}

        {!selectedSiteId && !showNewSiteForm ? (
          <div className="mt-20 text-center text-[rgba(29,31,32,0.55)]">
            <span className="material-symbols-outlined text-6xl mb-4">apartment</span>
            <p>선택된 현장이 없습니다. 상단에서 현장을 추가해주세요.</p>
          </div>
        ) : (
          <>
            {/* Status & Cost Summary - 항상 표시 (인포그래픽 네이비+크림 테마) */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="dash-card p-4 bg-[#fffdf7] border border-[#2e3192] space-y-2.5 relative corner-markers">
                <CornerMarkers />
                <div className="flex justify-between items-start relative z-10">
                  <div>
                    <p className="font-cond font-bold text-[#2e3192] text-[11px] tracking-wider uppercase mb-0.5">{monthName} 누적 지출</p>
                    <h2 className="text-xl md:text-2xl font-bold text-[#23255c] tracking-tight">
                      ₩{monthlyStats?.summary?.grandTotal?.toLocaleString() || 0}
                    </h2>
                  </div>
                  <span className="dash-pill px-2 py-0.5 bg-[#2e3192] text-[#fffdf7] text-[10px] font-bold flex items-center gap-1 shrink-0">
                    <span className="material-symbols-outlined text-[12px]">insights</span> 월간
                  </span>
                </div>
                <div className="dash-pill h-2 w-full bg-[#eef1ff] overflow-hidden relative z-10 border border-[#2e3192]/40">
                  <div className="h-full flex">
                    {monthlyStats?.summary?.grandTotal > 0 && (
                      <>
                        <div className="h-full bg-[#2e3192]" style={{ width: `${(monthlyStats.summary.totalLabor / monthlyStats.summary.grandTotal) * 100}%` }} title={`노무비: ${monthlyStats.summary.totalLabor}`}></div>
                        <div className="h-full bg-[#5b6fd6]" style={{ width: `${(monthlyStats.summary.totalEquipment / monthlyStats.summary.grandTotal) * 100}%` }} title={`장비대: ${monthlyStats.summary.totalEquipment}`}></div>
                        <div className="h-full bg-[#93a5f0]" style={{ width: `${(monthlyStats.summary.totalOutsourcing / monthlyStats.summary.grandTotal) * 100}%` }} title={`외주비: ${monthlyStats.summary.totalOutsourcing}`}></div>
                        <div className="h-full bg-[#c9d3fa]" style={{ width: `${(monthlyStats.summary.totalExpense / monthlyStats.summary.grandTotal) * 100}%` }} title={`경비: ${monthlyStats.summary.totalExpense}`}></div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex justify-between text-[9px] md:text-[11px] font-bold tracking-widest relative z-10">
                  <span className="text-[#2e3192] flex items-center gap-1"><span className="w-1.5 h-1.5 dash-pill bg-[#2e3192] inline-block"></span>노무: ₩{monthlyStats?.summary?.totalLabor?.toLocaleString() || 0}</span>
                  <span className="text-[#5b6fd6] flex items-center gap-1"><span className="w-1.5 h-1.5 dash-pill bg-[#5b6fd6] inline-block"></span>장비: ₩{monthlyStats?.summary?.totalEquipment?.toLocaleString() || 0}</span>
                  <span className="text-[#7885d1] flex items-center gap-1"><span className="w-1.5 h-1.5 dash-pill bg-[#93a5f0] inline-block"></span>외주: ₩{monthlyStats?.summary?.totalOutsourcing?.toLocaleString() || 0}</span>
                  <span className="text-[#9aa3c9] flex items-center gap-1"><span className="w-1.5 h-1.5 dash-pill bg-[#c9d3fa] inline-block"></span>경비: ₩{monthlyStats?.summary?.totalExpense?.toLocaleString() || 0}</span>
                </div>
              </div>

              {/* 총 예산 대비 누적 지출 분석 카드 */}
              {siteTotalStats && (
                <div className="dash-card p-4 bg-[#fffdf7] border border-[#2e3192] space-y-2.5 relative corner-markers">
                  <CornerMarkers />
                  <div className="flex justify-between items-start relative z-10">
                    <div>
                      <p className="font-cond font-bold text-[#5b6fd6] text-[11px] tracking-wider uppercase mb-0.5">전체 예산 대비 실적</p>
                      <h2 className="text-xl md:text-2xl font-bold text-[#23255c] tracking-tight">
                        ₩{siteTotalStats.totalSpent.toLocaleString()}
                        <span className="text-xs text-[#6266a8] font-normal ml-2">/ ₩{siteTotalStats.site.contractAmount.toLocaleString()}</span>
                      </h2>
                    </div>
                    <span className={`dash-pill px-2 py-0.5 text-[10px] font-bold flex items-center gap-1 shrink-0 ${siteTotalStats.progressPercent > 100 ? 'bg-red-500/20 text-red-600' : 'bg-[#5b6fd6] text-[#fffdf7]'}`}>
                      <span className="material-symbols-outlined text-[12px]">flag</span> {siteTotalStats.progressPercent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="dash-pill h-2 w-full bg-[#eef1ff] overflow-hidden relative z-10 border border-[#2e3192]/40">
                    <div className={`h-full ${siteTotalStats.progressPercent > 100 ? 'bg-red-500' : 'bg-[#5b6fd6]'}`} style={{ width: `${Math.min(siteTotalStats.progressPercent, 100)}%` }}></div>
                  </div>
                  <div className="flex justify-between text-[9px] md:text-[11px] font-bold tracking-widest relative z-10 text-[#6266a8]">
                    <span>공기: {siteTotalStats.totalDays}일 중 {siteTotalStats.passedDays}일 경과</span>
                    <span>잔여: ₩{Math.max(0, siteTotalStats.site.contractAmount - siteTotalStats.totalSpent).toLocaleString()}</span>
                  </div>
                </div>
              )}
            </section>

            {/* Dynamic Content Tabs */}
            <section className="space-y-4">
              <nav className="flex border-b border-[rgba(29,31,32,0.16)] overflow-x-auto scrollbar-hide">
                <button onClick={() => setActiveTab('dashboard')} className={`flex-1 py-2.5 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'dashboard' ? 'border-b-2 border-[#5980a6] text-[#5980a6]' : 'text-[rgba(29,31,32,0.55)] hover:text-[#1d1f20]'}`}>대시보드</button>
                <button onClick={() => setActiveTab('labor')} className={`flex-1 py-2.5 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'labor' ? 'border-b-2 border-[#5980a6] text-[#5980a6]' : 'text-[rgba(29,31,32,0.55)] hover:text-[#1d1f20]'}`}>노무</button>
                <button onClick={() => setActiveTab('equipment')} className={`flex-1 py-2.5 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'equipment' ? 'border-b-2 border-[#5980a6] text-[#5980a6]' : 'text-[rgba(29,31,32,0.55)] hover:text-[#1d1f20]'}`}>장비</button>
                <button onClick={() => setActiveTab('outsourcing')} className={`flex-1 py-2.5 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'outsourcing' ? 'border-b-2 border-[#5980a6] text-[#5980a6]' : 'text-[rgba(29,31,32,0.55)] hover:text-[#1d1f20]'}`}>외주</button>
                <button onClick={() => setActiveTab('expense')} className={`flex-1 py-2.5 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'expense' ? 'border-b-2 border-[#5980a6] text-[#5980a6]' : 'text-[rgba(29,31,32,0.55)] hover:text-[#1d1f20]'}`}>경비</button>
                <button onClick={() => setActiveTab('material')} className={`flex-1 py-2.5 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'material' ? 'border-b-2 border-[#5980a6] text-[#5980a6]' : 'text-[rgba(29,31,32,0.55)] hover:text-[#1d1f20]'}`}>자재</button>
                <button onClick={() => setActiveTab('billing')} className={`flex-1 py-2.5 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'billing' ? 'border-b-2 border-[#5980a6] text-[#5980a6]' : 'text-[rgba(29,31,32,0.55)] hover:text-[#1d1f20]'}`}>기성</button>
                <button onClick={() => setActiveTab('feedback')} className={`flex-1 py-2.5 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'feedback' ? 'border-b-2 border-[#5980a6] text-[#5980a6]' : 'text-[rgba(29,31,32,0.55)] hover:text-[#1d1f20]'}`}>건의사항</button>
                {currentUser?.role === 'ADMIN' && (
                  <button onClick={() => setActiveTab('settlement')} className={`flex-1 py-2.5 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'settlement' ? 'border-b-2 border-[#16a34a] text-[#16a34a]' : 'text-[rgba(29,31,32,0.55)] hover:text-[#1d1f20]'}`}>정산</button>
                )}
                {currentUser?.role === 'ADMIN' && (
                  <button onClick={() => setActiveTab('integration')} className={`flex-1 py-2.5 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'integration' ? 'border-b-2 border-[#0284c7] text-[#0284c7]' : 'text-[rgba(29,31,32,0.55)] hover:text-[#1d1f20]'}`}>연계</button>
                )}
              </nav>

              {/* ===================== DASHBOARD TAB ===================== */}
              {activeTab === 'dashboard' && (
                <DashboardTab
                  currentDate={currentDate}
                  isOverBudgetToday={!!isOverBudgetToday}
                  grandTotal={grandTotal}
                  siteTotalStats={siteTotalStats}
                  sites={sites}
                  selectedSiteId={selectedSiteId}
                  logData={logData}
                  monthlyStats={monthlyStats}
                  monthlyLoading={monthlyLoading}
                  monthName={monthName}
                />
              )}

              {activeTab === 'labor' && (
                <LaborTab
                  showAddForm={showAddForm}
                  setShowAddForm={setShowAddForm}
                  isAnalyzing={isAnalyzing}
                  analyzeDocument={analyzeDocument}
                  suggestions={suggestions}
                  setSuggestions={setSuggestions}
                  logData={logData}
                  loading={loading}
                  workerDocMap={workerDocMap}
                  currentUser={currentUser}
                  totalLabors={totalLabors}
                  handleDeleteItem={handleDeleteItem}
                  onChanged={refreshLog}
                />
              )}

              {activeTab === 'equipment' && (
                <EquipmentTab
                  showAddForm={showAddForm}
                  setShowAddForm={setShowAddForm}
                  isAnalyzing={isAnalyzing}
                  analyzeDocument={analyzeDocument}
                  suggestions={suggestions}
                  setSuggestions={setSuggestions}
                  logData={logData}
                  loading={loading}
                  currentUser={currentUser}
                  totalEquipments={totalEquipments}
                  handleDeleteItem={handleDeleteItem}
                  onChanged={refreshLog}
                />
              )}

              {activeTab === 'outsourcing' && (
                <OutsourcingTab
                  showAddForm={showAddForm}
                  setShowAddForm={setShowAddForm}
                  isAnalyzing={isAnalyzing}
                  analyzeDocument={analyzeDocument}
                  suggestions={suggestions}
                  setSuggestions={setSuggestions}
                  logData={logData}
                  loading={loading}
                  currentUser={currentUser}
                  totalOutsourcings={totalOutsourcings}
                  handleDeleteItem={handleDeleteItem}
                  onChanged={refreshLog}
                />
              )}

              {activeTab === 'material' && (
                <MaterialTab
                  showAddForm={showAddForm}
                  setShowAddForm={setShowAddForm}
                  isAnalyzing={isAnalyzing}
                  analyzeDocument={analyzeDocument}
                  suggestions={suggestions}
                  setSuggestions={setSuggestions}
                  logData={logData}
                  loading={loading}
                  currentUser={currentUser}
                  totalMaterials={totalMaterials}
                  handleDeleteItem={handleDeleteItem}
                  onChanged={loadData}
                />
              )}

              {activeTab === 'expense' && (
                <ExpenseTab
                  showAddForm={showAddForm}
                  setShowAddForm={setShowAddForm}
                  isAnalyzing={isAnalyzing}
                  analyzeDocument={analyzeDocument}
                  logData={logData}
                  loading={loading}
                  currentUser={currentUser}
                  allUsers={allUsers}
                  handleDeleteItem={handleDeleteItem}
                  onChanged={refreshLog}
                />
              )}

              {/* ===================== BILLING(기성) TAB ===================== */}
              {activeTab === 'billing' && selectedSiteId && (
                <BillingPanel siteId={selectedSiteId} logId={logData?.id} currentUser={currentUser} />
              )}

              {/* ===================== FEEDBACK TAB ===================== */}
              {activeTab === 'feedback' && (
                <FeedbackPanel currentUser={currentUser} />
              )}

              {/* ===================== SETTLEMENT TAB ===================== */}
              {activeTab === 'settlement' && currentUser?.role === 'ADMIN' && (
                <SettlementTab
                  selectedSiteId={selectedSiteId}
                  selectedYear={selectedYear}
                  selectedMonth={selectedMonth}
                />
              )}

              {/* ===================== INTEGRATION TAB ===================== */}
              {activeTab === 'integration' && currentUser?.role === 'ADMIN' && (
                <IntegrationTab
                  selectedSiteId={selectedSiteId}
                  selectedYear={selectedYear}
                  selectedMonth={selectedMonth}
                  currentDate={currentDate}
                  onDataChanged={loadData}
                />
              )}

            </section>
          </>
        )}
            {/* Bottom Row: Work Log & Photos - 대시보드 탭에서만 표시 */}
            {activeTab === 'dashboard' && <section className="grid grid-cols-1 xl:grid-cols-2 gap-3 pt-3 pb-6">
              <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] p-4 rounded-xl flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#5980a6] text-[18px]">edit_note</span>
                  <h4 className="font-cond font-bold text-[#1d1f20] uppercase text-xs tracking-widest">오늘의 주요 작업 내용 (WORK LOG)</h4>
                </div>
                <textarea
                  className="bg-[#e9e9ea] border border-[rgba(29,31,32,0.16)] text-sm text-[#1d1f20] p-3 h-24 focus:ring-1 focus:ring-[#5980a6] focus:border-[#5980a6] transition-all resize-none outline-none rounded-lg"
                  placeholder="오늘의 주요 작업 내용을 입력하세요..."
                  value={workDescription}
                  onChange={(e) => setWorkDescription(e.target.value)}
                  onBlur={async () => {
                    if (logData) await updateDailyLogDescription(logData.id, workDescription);
                  }}
                />
                <div className="flex justify-end">
                  <span className="text-[10px] text-[rgba(29,31,32,0.55)] font-bold uppercase tracking-widest">포커스를 벗어나면 자동 저장됩니다.</span>
                </div>
              </div>

              <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] p-4 rounded-xl flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#5980a6] text-[18px]">photo_library</span>
                    <h4 className="font-cond font-bold text-[#1d1f20] uppercase text-xs tracking-widest">현장 사진 첨부 (SITE PHOTOS)</h4>
                  </div>
                  <span className="text-[10px] text-[rgba(29,31,32,0.6)] font-label-caps uppercase">{logData?.photos?.length || 0} ATTACHMENTS</span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {logData?.photos?.map((photo: any) => (
                    <div key={photo.id} className="aspect-square bg-surface-container-high relative group cursor-pointer overflow-hidden rounded-lg border border-[rgba(29,31,32,0.16)]">
                      <img className="w-full h-full object-cover group-hover:scale-110 transition-transform" src={photo.url} alt="Site Photo" />
                      <button 
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm('사진을 삭제하시겠습니까?')) {
                            await deletePhoto(photo.id);
                            loadData();
                          }
                        }}
                        className="absolute top-1 right-1 bg-black/60 text-[#1d1f20] p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <span className="material-symbols-outlined text-xs">close</span>
                      </button>
                    </div>
                  ))}
                  <label className={`aspect-square border-2 border-dashed border-[rgba(29,31,32,0.16)] rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-[#5980a6] hover:bg-[rgba(29,31,32,0.16)]/30 transition-all ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                    {isUploading ? (
                      <span className="material-symbols-outlined text-[rgba(29,31,32,0.55)] animate-spin">sync</span>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[rgba(29,31,32,0.55)] mb-1">add_a_photo</span>
                        <span className="text-[10px] text-[rgba(29,31,32,0.55)] font-bold">ADD</span>
                      </>
                    )}
                  </label>
                </div>
              </div>
            </section>}
          </main>
        </div>

      {/* BottomNavBar */}
      <nav className="xl:hidden fixed bottom-0 left-0 w-full z-40 flex justify-around items-center bg-[#e9e9ea] border-t border-[rgba(29,31,32,0.16)] pb-safe h-16">
        <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center justify-center py-2 transition-transform active:scale-90 ${activeTab === 'dashboard' ? 'text-[#5980a6]' : 'text-[rgba(29,31,32,0.55)] hover:text-[#1d1f20]'}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'dashboard' ? "'FILL' 1" : "'FILL' 0" }}>dashboard</span>
          <span className="font-cond text-[10px] uppercase font-bold mt-1">대시보드</span>
        </button>
        <button onClick={() => setActiveTab('labor')} className={`flex flex-col items-center justify-center py-2 transition-transform active:scale-90 ${activeTab === 'labor' ? 'text-[#5980a6]' : 'text-[rgba(29,31,32,0.55)] hover:text-[#1d1f20]'}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'labor' ? "'FILL' 1" : "'FILL' 0" }}>groups</span>
          <span className="font-cond text-[10px] uppercase font-bold mt-1">노무</span>
        </button>
        <button onClick={() => setActiveTab('equipment')} className={`flex flex-col items-center justify-center py-2 transition-transform active:scale-90 ${activeTab === 'equipment' ? 'text-[#5980a6]' : 'text-[rgba(29,31,32,0.55)] hover:text-[#1d1f20]'}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'equipment' ? "'FILL' 1" : "'FILL' 0" }}>precision_manufacturing</span>
          <span className="font-cond text-[10px] uppercase font-bold mt-1">장비</span>
        </button>
        <button onClick={() => setActiveTab('outsourcing')} className={`flex flex-col items-center justify-center py-2 transition-transform active:scale-90 ${activeTab === 'outsourcing' ? 'text-[#5980a6]' : 'text-[rgba(29,31,32,0.55)] hover:text-[#1d1f20]'}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'outsourcing' ? "'FILL' 1" : "'FILL' 0" }}>handshake</span>
          <span className="font-cond text-[10px] uppercase font-bold mt-1">외주</span>
        </button>
        <button onClick={() => setActiveTab('expense')} className={`flex flex-col items-center justify-center py-2 transition-transform active:scale-90 ${activeTab === 'expense' ? 'text-[#5980a6]' : 'text-[rgba(29,31,32,0.55)] hover:text-[#1d1f20]'}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'expense' ? "'FILL' 1" : "'FILL' 0" }}>receipt_long</span>
          <span className="font-cond text-[10px] uppercase font-bold mt-1">경비</span>
        </button>
        <button onClick={() => setActiveTab('material')} className={`flex flex-col items-center justify-center py-2 transition-transform active:scale-90 ${activeTab === 'material' ? 'text-[#5980a6]' : 'text-[rgba(29,31,32,0.55)] hover:text-[#1d1f20]'}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'material' ? "'FILL' 1" : "'FILL' 0" }}>inventory_2</span>
          <span className="font-cond text-[10px] uppercase font-bold mt-1">자재</span>
        </button>
      </nav>

      {/* Floating Action Button */}
      {selectedSiteId && ['labor', 'equipment', 'material', 'outsourcing', 'expense'].includes(activeTab) && !showAddForm && !showNewSiteForm && (
        <button 
          onClick={() => setShowAddForm(true)}
          className="fixed right-6 bottom-20 w-14 h-14 bg-[#5980a6] text-[#f2f2f3] rounded-full shadow-lg shadow-[#5980a6]/20 flex items-center justify-center active:scale-90 transition-transform z-50 hover:opacity-90"
        >
          <span className="material-symbols-outlined font-bold">add</span>
        </button>
      )}

      {/* 모바일 우측 슬라이드 메뉴 드로어 */}
      {showMobileMenu && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex justify-end animate-fade-in" onClick={() => setShowMobileMenu(false)}>
          <div className="w-4/5 max-w-xs bg-[#181a1d] border-l border-[#2d343d] h-full p-6 flex flex-col justify-between shadow-2xl text-white" onClick={e => e.stopPropagation()}>
            <div>
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#2d343d]">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-full bg-[#5980a6]/30 border border-[#5980a6] flex items-center justify-center text-[#5980a6] shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="overflow-hidden">
                    <div className="font-bold text-white text-base truncate">{currentUser?.name}</div>
                    <div className="text-[11px] text-[#5980a6] font-semibold">{currentUser?.role === 'ADMIN' ? '관리자 (ADMIN)' : '일반 사용자'}</div>
                  </div>
                </div>
                <button onClick={() => setShowMobileMenu(false)} className="text-slate-400 hover:text-white p-1 shrink-0">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-2">
                <button 
                  onClick={() => { setShowMobileMenu(false); router.push('/attendance'); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#22252a] hover:bg-[#2c3036] text-white text-sm font-medium transition-all"
                >
                  <UserCheck className="w-5 h-5 text-[#5980a6]" />
                  <span>출퇴근 체크</span>
                </button>

                {currentUser?.role === 'ADMIN' && (
                  <button 
                    onClick={() => { setShowMobileMenu(false); router.push('/workers'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#22252a] hover:bg-[#2c3036] text-white text-sm font-medium transition-all"
                  >
                    <UserPlus className="w-5 h-5 text-sky-400" />
                    <span>근로자 관리</span>
                  </button>
                )}

                {currentUser?.role === 'ADMIN' && (
                  <button 
                    onClick={() => { setShowMobileMenu(false); loadAllUsers(); setShowUserManagement(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#22252a] hover:bg-[#2c3036] text-white text-sm font-medium transition-all"
                  >
                    <Users className="w-5 h-5 text-indigo-400" />
                    <span>사용자 권한 관리</span>
                  </button>
                )}

                {selectedSiteId && (
                  <button 
                    onClick={() => { setShowMobileMenu(false); openEditSiteModal(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#22252a] hover:bg-[#2c3036] text-white text-sm font-medium transition-all"
                  >
                    <span className="material-symbols-outlined text-amber-400 text-xl">edit</span>
                    <span>현재 현장 정보 수정</span>
                  </button>
                )}
              </div>
            </div>

            <button 
              onClick={() => { setShowMobileMenu(false); handleLogout(); }}
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-sm font-bold transition-all"
            >
              <LogOut className="w-5 h-5" />
              <span>로그아웃</span>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
