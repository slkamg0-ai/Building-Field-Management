'use client'

import { useState, useEffect } from 'react'
import { getDailyLog, addLabor, addEquipment, addMaterial, addOutsourcing, addExpense, searchLabors, searchEquipments, searchMaterials, searchOutsourcings, getSites, createSite, updateSite, resetSiteData, getMonthlyStats, getSiteTotalStats, getUsers, createUser, deleteUser, toggleUserActive, updateUserPin, updateUserRole, updateDailyLogDescription, addPhotoRecord, deletePhoto, getMonthlyExpensesByPerson, settleExpenses, uploadPhoto, getCurrentUser, logout, syncWorkersFromConfiguredDriveMaster, processPendingWorkerDocuments, generateMonthlyLaborBilling, exportMonthlyLaborBillingToDrive } from '@/lib/actions'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, PieChart, Pie, Cell } from 'recharts'
import { exportMonthlyReport } from '@/lib/exportExcel'
import { useRouter } from 'next/navigation'
import { Users, User, LogOut, Shield, Trash2, UserPlus, Power, KeyRound, Check, X, UserCheck } from 'lucide-react'
import NotifyButton from './NotifyButton'

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
  const [changingPinId, setChangingPinId] = useState<string | null>(null)
  const [newPinInput, setNewPinInput] = useState('')
  const router = useRouter()

  // 폼 표시 상태
  const [showAddForm, setShowAddForm] = useState(false)
  
  // 항목별 폼 상태
  const [laborForm, setLaborForm] = useState({ name: '', jobType: '', unitPrice: '', amount: '1', note: '' })
  const [equipmentForm, setEquipmentForm] = useState({ name: '', spec: '', unitPrice: '', amount: '1', note: '' })
  const [materialForm, setMaterialForm] = useState({ name: '', spec: '', unit: '', quantity: '1', note: '' })
  const [outsourcingForm, setOutsourcingForm] = useState({ company: '', task: '', amount: '', note: '' })
  const [expenseForm, setExpenseForm] = useState({ category: '', amount: '', note: '', assignedTo: '' })
  const [settlementData, setSettlementData] = useState<any[]>([])
  const [settlementLoading, setSettlementLoading] = useState(false)
  const [settlementError, setSettlementError] = useState<string | null>(null)
  const [integrationLoading, setIntegrationLoading] = useState<string | null>(null)
  const [integrationError, setIntegrationError] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<any>(null)
  const [documentScanResult, setDocumentScanResult] = useState<any>(null)
  const [billingResult, setBillingResult] = useState<any>(null)
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
    await loadSites()
    await loadAllUsers()
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
      if (activeTab === 'settlement') loadSettlementData()
    }
  }, [currentDate, selectedSiteId, activeTab, selectedYear, selectedMonth])

  async function loadSettlementData() {
    if (!selectedSiteId) return
    setSettlementLoading(true)
    setSettlementError(null)
    try {
      const data = await getMonthlyExpensesByPerson(selectedSiteId, selectedYear, selectedMonth)
      setSettlementData(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setSettlementError(msg)
    } finally { setSettlementLoading(false) }
  }

  async function handleDriveWorkerSync() {
    setIntegrationLoading('sync')
    setIntegrationError(null)
    try {
      const result = await syncWorkersFromConfiguredDriveMaster()
      setSyncResult(result)
      await loadData()
    } catch (e) {
      setIntegrationError(e instanceof Error ? e.message : String(e))
    } finally {
      setIntegrationLoading(null)
    }
  }

  async function handleProcessWorkerDocuments() {
    setIntegrationLoading('documents')
    setIntegrationError(null)
    try {
      const result = await processPendingWorkerDocuments(10)
      setDocumentScanResult(result)
      await loadData()
    } catch (e) {
      setIntegrationError(e instanceof Error ? e.message : String(e))
    } finally {
      setIntegrationLoading(null)
    }
  }

  async function handleGenerateMonthlyBilling() {
    if (!selectedSiteId) return
    setIntegrationLoading('billing')
    setIntegrationError(null)
    try {
      const result = await generateMonthlyLaborBilling(selectedSiteId, selectedYear, selectedMonth)
      setBillingResult(result)
    } catch (e) {
      setIntegrationError(e instanceof Error ? e.message : String(e))
    } finally {
      setIntegrationLoading(null)
    }
  }

  async function handleExportMonthlyBilling() {
    if (!selectedSiteId) return
    setIntegrationLoading('export')
    setIntegrationError(null)
    try {
      const result = await exportMonthlyLaborBillingToDrive(selectedSiteId, selectedYear, selectedMonth)
      setBillingResult(result)
    } catch (e) {
      setIntegrationError(e instanceof Error ? e.message : String(e))
    } finally {
      setIntegrationLoading(null)
    }
  }

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
    setExpenseForm({ category: '', amount: '', note: '', assignedTo: '' })
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
  
  const optimizeImage = (file: File): Promise<string> => {
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
          const max_size = 1024;

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
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
      };
      reader.onerror = error => reject(error);
    });
  };

  async function analyzeDocument(file: File, formType: string): Promise<Record<string, string> | null> {
    setIsAnalyzing(true)
    try {
      const base64 = await optimizeImage(file)
      const res = await fetch('/api/analyze-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, formType }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
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
      <aside className="fixed inset-y-0 left-0 z-40 hidden xl:flex flex-col h-full w-72 border-r border-[#e5e5e5] bg-[#ffffff] transition-all">
        <div className="p-8 flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-[#556b2f] flex items-center justify-center">
              <span className="material-symbols-outlined text-black">construction</span>
            </div>
            <h1 className="text-xl font-black text-[#1a1c1c] font-['Inter'] tracking-widest uppercase truncate">
              {sites.find(s => s.id === selectedSiteId)?.name || 'SITE ALPHA'}
            </h1>
          </div>
          
          <div className="pt-6 flex flex-col gap-2">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
              { id: 'labor', label: 'Labour', icon: 'groups' },
              { id: 'equipment', label: 'Equipment', icon: 'precision_manufacturing' },
              { id: 'material', label: 'Materials', icon: 'inventory_2' },
              { id: 'outsourcing', label: 'Outsourcing', icon: 'assignment' },
              { id: 'expense', label: 'Expense', icon: 'payments' },
              ...(currentUser?.role === 'ADMIN' ? [{ id: 'integration', label: 'Drive Link', icon: 'hub' }] : []),
            ].map(item => (
              <div 
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-4 px-4 py-3 rounded cursor-pointer transition-all ${activeTab === item.id ? 'bg-[#e5e5e5] text-[#556b2f] border-l-4 border-[#556b2f]' : 'text-[#6b6b6b] hover:text-[#1a1c1c] hover:bg-[#e5e5e5]'}`}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span className="font-['Inter'] uppercase text-xs font-semibold">{item.label}</span>
              </div>
            ))}

            <div className="my-2 border-t border-[#e5e5e5]" />
            <div onClick={() => router.push('/attendance')} className="flex items-center gap-4 px-4 py-3 rounded cursor-pointer text-[#6b6b6b] hover:text-[#1a1c1c] hover:bg-[#e5e5e5] transition-all">
              <span className="material-symbols-outlined">how_to_reg</span>
              <span className="font-['Inter'] uppercase text-xs font-semibold">출퇴근</span>
            </div>
            <div onClick={() => router.push('/workers')} className="flex items-center gap-4 px-4 py-3 rounded cursor-pointer text-[#6b6b6b] hover:text-[#1a1c1c] hover:bg-[#e5e5e5] transition-all">
              <span className="material-symbols-outlined">badge</span>
              <span className="font-['Inter'] uppercase text-xs font-semibold">근로자 관리</span>
            </div>
          </div>
        </div>
        
        <div className="mt-auto p-8 border-t border-[#e5e5e5]">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-[#556b2f] shrink-0">
              <img alt="Profile" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAVRaBrtKh_z4Q7vJTKk4JINJs8Ij5SI9UofZu7tdp1mM3Tz-k2n0gXdfY1Db0GdG2UC-EB9EIqR6bpy6Yho0MAdFgMs0Q4FjAhLIxIPztwIis_lvFBDeAIaxBNeg7OsyeDd8RR1xLw4YwBZ7N1NqPO_g0cjKeGT1YVV6ssygQWdU9uhSdf1rq-_lMDVpG7vFicN6bG72DHUiMoiTfQSfLtVoHwUsJ-Xk3_Bp6vmx4Z_DBHYBhLZJYj5C7TLLmqpQvwUSWdrKwwFkKQ"/>
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-[#1a1c1c] font-bold text-sm truncate">{currentUser?.name}</span>
              <span className="text-[#737373] text-[10px] font-bold uppercase tracking-widest">{currentUser?.role}</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="xl:ml-72 flex flex-col min-h-screen">
        <header className="fixed top-0 left-0 xl:left-72 right-0 z-30 flex flex-col bg-[#f9f9f9] border-b border-[#e5e5e5] transition-all">
          {/* 1행: 타이틀 / 현장 선택 + 버튼 */}
          <div className="flex justify-between items-center px-4 md:px-8 h-16">
            <div className="flex items-center gap-3 md:gap-4">
              <div className="flex flex-col">
                <h1 className="font-['Inter'] tracking-tight text-[#556b2f] text-sm md:text-xl font-bold uppercase leading-none">
                  현장 분석 대시보드
                </h1>
                {sites.length > 0 && (
                  <div className="flex items-center gap-2 mt-1">
                    <select
                      value={selectedSiteId}
                      onChange={(e) => {
                        if (e.target.value === 'NEW') setShowNewSiteForm(true)
                        else setSelectedSiteId(e.target.value)
                      }}
                      className="bg-transparent text-[#1a1c1c] font-bold text-xs md:text-lg outline-none appearance-none cursor-pointer hover:opacity-80 truncate max-w-[120px] md:max-w-xs"
                    >
                      {sites.map(s => <option key={s.id} value={s.id} className="bg-[#f9f9f9] text-base">{s.name}</option>)}
                      <option value="NEW" className="bg-[#f9f9f9] text-[#556b2f] font-bold">+ 새 현장 추가</option>
                    </select>
                    {selectedSiteId && (
                      <button onClick={openEditSiteModal} className="text-[#737373] hover:text-[#1a1c1c] transition-colors">
                        <span className="material-symbols-outlined text-sm md:text-lg">edit</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <NotifyButton userName={currentUser?.name} />
              <button onClick={() => router.push('/attendance')} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[#e5e5e5] transition-colors text-[#6b6b6b] hover:text-[#556b2f]" title="출퇴근 체크">
                <UserCheck className="w-5 h-5" />
              </button>
              {currentUser?.role === 'ADMIN' && (
                <button onClick={() => router.push('/workers')} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[#e5e5e5] transition-colors text-[#6b6b6b] hover:text-[#556b2f]" title="근로자 관리">
                  <UserPlus className="w-5 h-5" />
                </button>
              )}
              {currentUser?.role === 'ADMIN' && (
                <button onClick={() => { loadAllUsers(); setShowUserManagement(true) }} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[#e5e5e5] transition-colors text-[#6b6b6b] hover:text-[#556b2f]" title="사용자 관리">
                  <Users className="w-5 h-5" />
                </button>
              )}
              <button onClick={handleLogout} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[#e5e5e5] transition-colors text-[#6b6b6b] hover:text-red-600" title="로그아웃">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
          {/* 2행: 날짜 선택 (데스크톱 전용) */}
          <div className="hidden md:flex items-center gap-2 px-4 md:px-8 py-2 border-t border-[#e5e5e5]">
            <div className="flex items-center gap-1 bg-[#ffffff] border border-[#e5e5e5] rounded-lg px-2 py-1">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="bg-transparent text-[#1a1c1c] text-xs font-bold outline-none cursor-pointer p-1"
              >
                {[2024, 2025, 2026].map(y => <option key={y} value={y} className="bg-[#f9f9f9]">{y}년</option>)}
              </select>
              <select
                value={selectedMonth}
                onChange={(e) => {
                  const m = parseInt(e.target.value)
                  setSelectedMonth(m)
                  const newDate = `${selectedYear}-${String(m).padStart(2, '0')}-01`
                  setCurrentDate(newDate)
                }}
                className="bg-transparent text-[#556b2f] text-xs font-bold outline-none cursor-pointer p-1"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m} className="bg-[#f9f9f9]">{m}월</option>)}
              </select>
            </div>
            <input
              type="date"
              className="bg-[#ffffff] border border-[#e5e5e5] text-[#1a1c1c] px-3 py-2 rounded-lg text-xs outline-none focus:border-[#556b2f]"
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

        <main className="mt-16 md:mt-[104px] px-4 md:px-8 space-y-6 pb-24 xl:pb-8 max-w-7xl mx-auto pt-6 w-full">
          {/* Mobile Project & Date Selector */}
          <section className="md:hidden flex flex-col gap-3 pb-4 border-b border-[#e5e5e5]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#556b2f] text-sm">location_on</span>
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
                  className="w-full bg-[#ffffff] border border-[#e5e5e5] text-[#1a1c1c] rounded-lg px-3 py-2 appearance-none outline-none focus:border-[#556b2f] text-sm"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m} className="bg-[#f9f9f9]">{m}월</option>)}
                </select>
                <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-[#737373] pointer-events-none text-lg">expand_more</span>
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
                  className="w-full bg-[#ffffff] border border-[#e5e5e5] text-[#1a1c1c] rounded-lg px-3 py-2 outline-none focus:border-[#556b2f] text-sm"
                />
              </div>
            </div>
          </section>
        
        {/* 새 현장 추가 모달 */}
        {showNewSiteForm && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
            <div className="bg-[#ffffff] border border-[#556b2f] p-6 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold text-[#556b2f] mb-4">
                {isEditingSite ? '현장 정보 수정' : '새 현장 추가'}
              </h3>
              <form onSubmit={handleCreateSite} className="space-y-4">
                <div>
                  <label className="block text-sm text-[#6b6b6b] mb-1">현장명</label>
                  <input type="text" required className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-4 py-3 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={newSiteName} onChange={e => setNewSiteName(e.target.value)} placeholder="예: 서울 강남구 복합시설 현장" />
                </div>
                <div>
                  <label className="block text-sm text-[#6b6b6b] mb-1">도급액 (예산)</label>
                  <input type="number" required className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-4 py-3 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={newSiteContractAmount} onChange={e => setNewSiteContractAmount(e.target.value)} placeholder="0" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-[#6b6b6b] mb-1">착공일</label>
                    <input type="date" required className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-4 py-3 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={newSiteStartDate} onChange={e => setNewSiteStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm text-[#6b6b6b] mb-1">준공예정일</label>
                    <input type="date" required className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-4 py-3 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={newSiteEndDate} onChange={e => setNewSiteEndDate(e.target.value)} />
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
                    className="flex-1 py-3 rounded border border-[#e5e5e5] text-[#6b6b6b] hover:text-[#1a1c1c]"
                  >
                    취소
                  </button>
                  <button type="submit" className="flex-1 py-3 rounded bg-[#556b2f] text-[#ffffff] font-bold hover:opacity-90">
                    {isEditingSite ? '수정하기' : '생성하기'}
                  </button>
                </div>
                {isEditingSite && (
                  <div className="pt-6 border-t border-[#e5e5e5] mt-6">
                    <p className="text-[10px] text-[#737373] font-bold uppercase tracking-widest mb-2">위험 구역</p>
                    <button 
                      type="button" 
                      onClick={handleResetSite}
                      className="w-full py-2 rounded border border-red-500/30 text-red-500 text-xs font-bold hover:bg-red-500 hover:text-[#1a1c1c] transition-all flex items-center justify-center gap-2"
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
            <div className="bg-[#ffffff] border border-[#e5e5e5] p-6 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-[#1a1c1c] flex items-center gap-2">
                  <Shield className="text-[#556b2f]" /> 사용자 및 권한 관리
                </h3>
                <button onClick={() => setShowUserManagement(false)} className="text-[#6b6b6b] hover:text-[#1a1c1c]">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* 새 사용자 추가 폼 */}
              <div className="bg-[#f3f3f3] p-4 rounded-lg border border-[#e5e5e5] mb-6">
                <h4 className="text-sm font-bold text-[#556b2f] mb-3 flex items-center gap-2">
                  <UserPlus className="w-4 h-4" /> 신규 접속자 등록
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input 
                    type="text" 
                    placeholder="이름" 
                    className="bg-[#ffffff] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]"
                    value={newUserForm.name}
                    onChange={e => setNewUserForm({...newUserForm, name: e.target.value})}
                  />
                  <input 
                    type="text" 
                    placeholder="PIN (4자리)" 
                    maxLength={4}
                    className="bg-[#ffffff] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]"
                    value={newUserForm.pin}
                    onChange={e => setNewUserForm({...newUserForm, pin: e.target.value})}
                  />
                  <select 
                    className="bg-[#ffffff] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]"
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
                    className="bg-[#556b2f] text-[#ffffff] font-bold rounded py-2 hover:opacity-90 transition-colors"
                  >
                    등록
                  </button>
                </div>
              </div>

              {/* 사용자 리스트 */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-[#737373] mb-2 uppercase tracking-widest">등록된 접속자 목록</h4>
                {allUsers.map(u => (
                  <div key={u.id} className="flex items-center justify-between bg-[#f3f3f3] p-3 rounded-lg border border-[#e5e5e5]">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${u.role === 'ADMIN' ? 'bg-[#556b2f]/20 text-[#556b2f]' : 'bg-[#ededed] text-[#6b6b6b]'}`}>
                        {u.role === 'ADMIN' ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="text-[#1a1c1c] font-bold text-sm">{u.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {u.name !== '관리자' ? (
                            <button
                              onClick={async () => {
                                const newRole = u.role === 'ADMIN' ? 'WORKER' : 'ADMIN'
                                await updateUserRole(u.id, newRole)
                                loadAllUsers()
                              }}
                              className={`text-[10px] font-bold tracking-widest px-1.5 py-0.5 rounded transition-colors ${u.role === 'ADMIN' ? 'bg-[#556b2f]/20 text-[#556b2f] hover:bg-[#556b2f]/30' : 'bg-[#ededed] text-[#6b6b6b] hover:bg-[#e0e0e0]'}`}
                              title="클릭하여 역할 변경"
                            >
                              {u.role}
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold tracking-widest px-1.5 py-0.5 rounded bg-[#556b2f]/20 text-[#556b2f]">{u.role}</span>
                          )}
                          <span className="text-[10px] text-[#737373]">PIN 보호됨</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {changingPinId === u.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="password"
                            maxLength={4}
                            placeholder="새 PIN"
                            value={newPinInput}
                            onChange={e => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                            className="w-20 bg-[#ffffff] border border-[#556b2f] rounded px-2 py-1 text-[#1a1c1c] text-sm outline-none text-center tracking-widest"
                            autoFocus
                          />
                          <button
                            onClick={async () => {
                              if (newPinInput.length !== 4) return
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
                            className="p-1.5 rounded hover:bg-[#ededed] text-[#737373] transition-colors"
                            title="취소"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setChangingPinId(u.id); setNewPinInput('') }}
                          className="p-2 rounded hover:bg-[#ededed] text-[#737373] hover:text-[#556b2f] transition-colors"
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
                        className={`p-2 rounded hover:bg-[#ededed] transition-colors ${u.isActive ? 'text-[#16a34a]' : 'text-[#8a8a8a]'}`}
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
                          className="p-2 rounded hover:bg-red-500/10 text-[#8a8a8a] hover:text-red-600 transition-colors"
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
          <div className="mt-20 text-center text-[#737373]">
            <span className="material-symbols-outlined text-6xl mb-4">apartment</span>
            <p>선택된 현장이 없습니다. 상단에서 현장을 추가해주세요.</p>
          </div>
        ) : (
          <>
            {/* Status & Cost Summary - 항상 표시 */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-6 bg-[#ffffff] rounded-lg border border-[#e5e5e5] space-y-4 relative overflow-hidden">
                <div className="flex justify-between items-start relative z-10">
                  <div>
                    <p className="font-bold text-[#556b2f] text-sm tracking-wider uppercase mb-1">{monthName} 누적 지출</p>
                    <h2 className="text-3xl font-bold text-[#1a1c1c] tracking-tight">
                      ₩{monthlyStats?.summary?.grandTotal?.toLocaleString() || 0}
                    </h2>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="px-3 py-1 rounded-full bg-[#15803d]/20 text-[#16a34a] text-xs font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">insights</span> 월간 집계
                    </span>
                  </div>
                </div>
                <div className="h-3 w-full bg-[#f3f3f3] rounded-full overflow-hidden relative z-10 border border-[#e5e5e5]">
                  <div className="h-full flex">
                    {monthlyStats?.summary?.grandTotal > 0 && (
                      <>
                        <div className="h-full bg-[#556b2f]" style={{ width: `${(monthlyStats.summary.totalLabor / monthlyStats.summary.grandTotal) * 100}%` }} title={`노무비: ${monthlyStats.summary.totalLabor}`}></div>
                        <div className="h-full bg-[#0284c7]" style={{ width: `${(monthlyStats.summary.totalEquipment / monthlyStats.summary.grandTotal) * 100}%` }} title={`장비대: ${monthlyStats.summary.totalEquipment}`}></div>
                        <div className="h-full bg-[#7c3aed]" style={{ width: `${(monthlyStats.summary.totalOutsourcing / monthlyStats.summary.grandTotal) * 100}%` }} title={`외주비: ${monthlyStats.summary.totalOutsourcing}`}></div>
                        <div className="h-full bg-[#16a34a]" style={{ width: `${(monthlyStats.summary.totalExpense / monthlyStats.summary.grandTotal) * 100}%` }} title={`경비: ${monthlyStats.summary.totalExpense}`}></div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex justify-between text-[10px] md:text-xs font-bold tracking-widest relative z-10">
                  <span className="text-[#556b2f] flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#556b2f] inline-block"></span>노무: ₩{monthlyStats?.summary?.totalLabor?.toLocaleString() || 0}</span>
                  <span className="text-[#0284c7] flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#0284c7] inline-block"></span>장비: ₩{monthlyStats?.summary?.totalEquipment?.toLocaleString() || 0}</span>
                  <span className="text-[#7c3aed] flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#7c3aed] inline-block"></span>외주: ₩{monthlyStats?.summary?.totalOutsourcing?.toLocaleString() || 0}</span>
                  <span className="text-[#16a34a] flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#16a34a] inline-block"></span>경비: ₩{monthlyStats?.summary?.totalExpense?.toLocaleString() || 0}</span>
                </div>
              </div>

              {/* 총 예산 대비 누적 지출 분석 카드 */}
              {siteTotalStats && (
                <div className="p-6 bg-[#ffffff] rounded-lg border border-[#e5e5e5] space-y-4 relative overflow-hidden">
                  <div className="flex justify-between items-start relative z-10">
                    <div>
                      <p className="font-bold text-[#0284c7] text-sm tracking-wider uppercase mb-1">전체 예산 대비 실적</p>
                      <h2 className="text-3xl font-bold text-[#1a1c1c] tracking-tight">
                        ₩{siteTotalStats.totalSpent.toLocaleString()}
                        <span className="text-sm text-[#737373] font-normal ml-2">/ ₩{siteTotalStats.site.contractAmount.toLocaleString()}</span>
                      </h2>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${siteTotalStats.progressPercent > 100 ? 'bg-red-500/20 text-red-600' : 'bg-[#0284c7]/20 text-[#0284c7]'}`}>
                        <span className="material-symbols-outlined text-[14px]">flag</span> {siteTotalStats.progressPercent.toFixed(1)}% 진행
                      </span>
                    </div>
                  </div>
                  <div className="h-3 w-full bg-[#f3f3f3] rounded-full overflow-hidden relative z-10 border border-[#e5e5e5]">
                    <div className={`h-full ${siteTotalStats.progressPercent > 100 ? 'bg-red-500' : 'bg-[#0284c7]'}`} style={{ width: `${Math.min(siteTotalStats.progressPercent, 100)}%` }}></div>
                  </div>
                  <div className="flex justify-between text-[10px] md:text-xs font-bold tracking-widest relative z-10 text-[#6b6b6b]">
                    <span>공기: {siteTotalStats.totalDays}일 중 {siteTotalStats.passedDays}일 경과</span>
                    <span>잔여 예산: ₩{Math.max(0, siteTotalStats.site.contractAmount - siteTotalStats.totalSpent).toLocaleString()}</span>
                  </div>
                </div>
              )}
            </section>

            {/* Dynamic Content Tabs */}
            <section className="space-y-4">
              <nav className="flex border-b border-[#e5e5e5] overflow-x-auto scrollbar-hide">
                <button onClick={() => setActiveTab('dashboard')} className={`flex-1 py-4 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'dashboard' ? 'border-b-2 border-[#556b2f] text-[#556b2f]' : 'text-[#737373] hover:text-[#1a1c1c]'}`}>대시보드</button>
                <button onClick={() => setActiveTab('labor')} className={`flex-1 py-4 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'labor' ? 'border-b-2 border-[#556b2f] text-[#556b2f]' : 'text-[#737373] hover:text-[#1a1c1c]'}`}>노무</button>
                <button onClick={() => setActiveTab('equipment')} className={`flex-1 py-4 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'equipment' ? 'border-b-2 border-[#556b2f] text-[#556b2f]' : 'text-[#737373] hover:text-[#1a1c1c]'}`}>장비</button>
                <button onClick={() => setActiveTab('outsourcing')} className={`flex-1 py-4 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'outsourcing' ? 'border-b-2 border-[#556b2f] text-[#556b2f]' : 'text-[#737373] hover:text-[#1a1c1c]'}`}>외주</button>
                <button onClick={() => setActiveTab('expense')} className={`flex-1 py-4 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'expense' ? 'border-b-2 border-[#556b2f] text-[#556b2f]' : 'text-[#737373] hover:text-[#1a1c1c]'}`}>경비</button>
                <button onClick={() => setActiveTab('material')} className={`flex-1 py-4 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'material' ? 'border-b-2 border-[#556b2f] text-[#556b2f]' : 'text-[#737373] hover:text-[#1a1c1c]'}`}>자재</button>
                {currentUser?.role === 'ADMIN' && (
                  <button onClick={() => setActiveTab('settlement')} className={`flex-1 py-4 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'settlement' ? 'border-b-2 border-[#16a34a] text-[#16a34a]' : 'text-[#737373] hover:text-[#1a1c1c]'}`}>정산</button>
                )}
                {currentUser?.role === 'ADMIN' && (
                  <button onClick={() => setActiveTab('integration')} className={`flex-1 py-4 px-3 whitespace-nowrap text-center text-xs md:text-sm font-bold tracking-wider transition-all ${activeTab === 'integration' ? 'border-b-2 border-[#0284c7] text-[#0284c7]' : 'text-[#737373] hover:text-[#1a1c1c]'}`}>연계</button>
                )}
              </nav>

              {/* ===================== DASHBOARD TAB ===================== */}
              {activeTab === 'dashboard' && (
                <div className="space-y-6 animate-fade-in">
                  
                  {/* 오늘의 요약 및 한계금액 분석 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[#ffffff] border border-[#e5e5e5] rounded-xl p-6">
                      <h4 className="font-bold text-[#1a1c1c] mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#556b2f]">calendar_today</span> 오늘의 지출 요약 ({currentDate})
                      </h4>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center py-2 border-b border-[#e5e5e5]">
                          <span className="text-[#6b6b6b]">일일 총 지출</span>
                          <span className={`font-bold text-lg ${isOverBudgetToday ? 'text-red-600' : 'text-[#1a1c1c]'}`}>₩{grandTotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-[#e5e5e5]">
                          <span className="text-[#6b6b6b]">일일 권장 투입 한계</span>
                          <span className="font-bold text-[#0284c7]">₩{siteTotalStats ? Math.round(siteTotalStats.dailyLimit).toLocaleString() : 0}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                          <span className="text-[#6b6b6b]">상태 분석</span>
                          {isOverBudgetToday ? (
                            <span className="text-red-600 font-bold text-sm bg-red-400/10 px-2 py-1 rounded">한계선 초과 (주의)</span>
                          ) : (
                            <span className="text-[#16a34a] font-bold text-sm bg-[#16a34a]/10 px-2 py-1 rounded">안정적 (예산 내)</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-[#ffffff] border border-[#e5e5e5] rounded-xl p-6 flex flex-col items-center justify-center text-center">
                      <span className="material-symbols-outlined text-5xl text-[#8a8a8a] mb-4">download</span>
                      <h4 className="font-bold text-[#1a1c1c] mb-2">데이터 내보내기</h4>
                      <p className="text-sm text-[#6b6b6b] mb-6">월간 작업일보 및 투입 비용 명세서를<br/>엑셀(.xlsx) 파일로 다운로드합니다.</p>
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
                        className="w-full max-w-[200px] py-3 rounded-lg bg-[#556b2f] text-[#ffffff] font-bold transition-colors flex items-center justify-center gap-2 hover:opacity-90 active:scale-95"
                      >
                        <span className="material-symbols-outlined text-sm">file_download</span>
                        엑셀 다운로드
                      </button>
                    </div>
                  </div>

                  {/* 차트 */}
                  <div className="bg-[#ffffff] border border-[#e5e5e5] rounded-xl p-6">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-[#1a1c1c] text-lg flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#556b2f]">bar_chart</span>
                        {monthName} 일자별 지출 추이
                      </h3>
                      <span className="text-xs text-[#737373]">단위: 원</span>
                    </div>
                    
                    {monthlyLoading ? (
                      <div className="h-64 flex items-center justify-center text-[#737373]">데이터를 불러오는 중...</div>
                    ) : monthlyStats?.dailyData?.length === 0 ? (
                      <div className="h-64 flex items-center justify-center text-[#737373]">입력된 데이터가 없습니다.</div>
                    ) : (
                      <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyStats.dailyData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                            <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#64748b" fontSize={12} tickFormatter={(val) => `₩${(val/10000).toFixed(0)}만`} tickLine={false} axisLine={false} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#f3f3f3', borderColor: '#e5e5e5', borderRadius: '8px' }}
                              itemStyle={{ fontSize: '14px' }}
                              formatter={(value: unknown) => [`₩${Number(value).toLocaleString()}`, undefined]}
                            />
                            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                            <Bar dataKey="노무비" stackId="a" fill="#556b2f" radius={[0, 0, 4, 4]} />
                            <Bar dataKey="장비대" stackId="a" fill="#0284c7" />
                            <Bar dataKey="외주비" stackId="a" fill="#7c3aed" />
                            <Bar dataKey="경비" stackId="a" fill="#16a34a" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                {/* 월간 상세 분석 섹션 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 지출 비중 원형 차트 */}
                  <div className="bg-[#ffffff] border border-[#e5e5e5] rounded-xl p-6 flex flex-col items-center">
                    <h4 className="font-bold text-[#1a1c1c] mb-4 self-start flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#556b2f]">pie_chart</span> 카테고리별 지출 비중
                    </h4>
                    <div className="w-full h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: '노무', value: monthlyStats?.summary?.totalLabor || 0, color: '#556b2f' },
                              { name: '장비', value: monthlyStats?.summary?.totalEquipment || 0, color: '#0284c7' },
                              { name: '외주', value: monthlyStats?.summary?.totalOutsourcing || 0, color: '#7c3aed' },
                              { name: '경비', value: monthlyStats?.summary?.totalExpense || 0, color: '#16a34a' },
                            ].filter(d => d.value > 0)}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {[
                              { color: '#556b2f' },
                              { color: '#0284c7' },
                              { color: '#7c3aed' },
                              { color: '#16a34a' },
                            ].map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#f3f3f3', border: '1px solid #e5e5e5', borderRadius: '8px' }}
                            itemStyle={{ color: '#fff' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 w-full">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#556b2f]"></div>
                        <span className="text-[10px] text-[#6b6b6b] font-bold uppercase">노무 {((monthlyStats?.summary?.totalLabor / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#0284c7]"></div>
                        <span className="text-[10px] text-[#6b6b6b] font-bold uppercase">장비 {((monthlyStats?.summary?.totalEquipment / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#7c3aed]"></div>
                        <span className="text-[10px] text-[#6b6b6b] font-bold uppercase">외주 {((monthlyStats?.summary?.totalOutsourcing / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#16a34a]"></div>
                        <span className="text-[10px] text-[#6b6b6b] font-bold uppercase">경비 {((monthlyStats?.summary?.totalExpense / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>

                  {/* 월간 상세 집계표 */}
                  <div className="md:col-span-2 bg-[#ffffff] border border-[#e5e5e5] rounded-xl p-6">
                    <h4 className="font-bold text-[#1a1c1c] mb-4 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#556b2f]">analytics</span> 월간 상세 집계표 ({monthName})
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-[#e5e5e5] text-[10px] text-[#737373] font-bold uppercase tracking-widest">
                            <th className="pb-3 px-2">카테고리</th>
                            <th className="pb-3 px-2 text-right">금액</th>
                            <th className="pb-3 px-2 text-right">비중</th>
                            <th className="pb-3 px-2 text-right">상태</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm">
                          <tr className="border-b border-[#e5e5e5]/50">
                            <td className="py-3 px-2 text-[#1a1c1c] font-medium flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#556b2f]"></span> 노무비
                            </td>
                            <td className="py-3 px-2 text-right text-[#1a1c1c] font-bold">₩{monthlyStats?.summary?.totalLabor?.toLocaleString()}</td>
                            <td className="py-3 px-2 text-right text-[#6b6b6b]">{((monthlyStats?.summary?.totalLabor / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</td>
                            <td className="py-3 px-2 text-right text-[#16a34a] font-bold text-[10px]">정상</td>
                          </tr>
                          <tr className="border-b border-[#e5e5e5]/50">
                            <td className="py-3 px-2 text-[#1a1c1c] font-medium flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#0284c7]"></span> 장비대
                            </td>
                            <td className="py-3 px-2 text-right text-[#1a1c1c] font-bold">₩{monthlyStats?.summary?.totalEquipment?.toLocaleString()}</td>
                            <td className="py-3 px-2 text-right text-[#6b6b6b]">{((monthlyStats?.summary?.totalEquipment / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</td>
                            <td className="py-3 px-2 text-right text-[#16a34a] font-bold text-[10px]">정상</td>
                          </tr>
                          <tr className="border-b border-[#e5e5e5]/50">
                            <td className="py-3 px-2 text-[#1a1c1c] font-medium flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#7c3aed]"></span> 외주비
                            </td>
                            <td className="py-3 px-2 text-right text-[#1a1c1c] font-bold">₩{monthlyStats?.summary?.totalOutsourcing?.toLocaleString()}</td>
                            <td className="py-3 px-2 text-right text-[#6b6b6b]">{((monthlyStats?.summary?.totalOutsourcing / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</td>
                            <td className="py-3 px-2 text-right text-[#16a34a] font-bold text-[10px]">정상</td>
                          </tr>
                          <tr className="border-b border-[#e5e5e5]/50">
                            <td className="py-3 px-2 text-[#1a1c1c] font-medium flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a]"></span> 경비
                            </td>
                            <td className="py-3 px-2 text-right text-[#1a1c1c] font-bold">₩{monthlyStats?.summary?.totalExpense?.toLocaleString()}</td>
                            <td className="py-3 px-2 text-right text-[#6b6b6b]">{((monthlyStats?.summary?.totalExpense / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</td>
                            <td className="py-3 px-2 text-right text-[#16a34a] font-bold text-[10px]">정상</td>
                          </tr>
                          <tr className="bg-[#556b2f]/5">
                            <td className="py-4 px-2 text-[#556b2f] font-bold">합계 (Grand Total)</td>
                            <td className="py-4 px-2 text-right text-[#556b2f] font-bold">₩{monthlyStats?.summary?.grandTotal?.toLocaleString()}</td>
                            <td className="py-4 px-2 text-right text-[#556b2f] font-bold">100%</td>
                            <td className="py-4 px-2 text-right text-[#556b2f] font-bold text-[10px]">-</td>
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
                <div className="bg-[#ededed] border border-[#556b2f] p-4 rounded-xl mb-4 relative animate-fade-in shadow-xl shadow-black/50">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-[#556b2f] flex items-center gap-2"><span className="material-symbols-outlined text-sm">person_add</span> 새 노무 인력 추가</h4>
                    <div className="flex items-center gap-2">
                      <label className={`flex items-center gap-1 cursor-pointer text-xs font-bold px-2 py-1 rounded border transition-colors ${isAnalyzing ? 'text-[#8a8a8a] border-[#e5e5e5] pointer-events-none' : 'text-[#6b6b6b] border-[#e5e5e5] hover:text-[#556b2f] hover:border-[#556b2f]'}`}>
                        <span className="material-symbols-outlined text-sm">document_scanner</span>
                        {isAnalyzing ? '분석 중...' : '문서 스캔'}
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0]; if (!file) return
                          const data = await analyzeDocument(file, 'labor')
                          if (data) setLaborForm(prev => ({ ...prev, name: data.name || prev.name, jobType: data.jobType || prev.jobType, unitPrice: data.unitPrice || prev.unitPrice, amount: data.amount || prev.amount, note: data.note || prev.note }))
                          e.target.value = ''
                        }} />
                      </label>
                      <button onClick={() => setShowAddForm(false)} className="text-[#6b6b6b] hover:text-[#1a1c1c]"><span className="material-symbols-outlined">close</span></button>
                    </div>
                  </div>
                  <form onSubmit={handleLaborSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3 relative">
                    <div className="relative">
                      <label className="text-xs text-[#6b6b6b] mb-1 block">작업자 이름</label>
                      <input type="text" required className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={laborForm.name} onChange={handleLaborNameChange} autoComplete="off"/>
                      {suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#e8e8e8] z-50 border border-[#e5e5e5] rounded max-h-48 overflow-y-auto shadow-xl">
                          {suggestions.map((s, i) => (
                            <div key={i} onClick={() => selectLaborSuggestion(s)} className="p-3 border-b border-[#e5e5e5] hover:bg-[#f3f3f3] cursor-pointer">
                              <div className="font-medium text-[#1a1c1c]">{s.name} <span className="text-xs text-[#556b2f] ml-2">{s.jobType}</span></div>
                              <div className="text-xs text-[#6b6b6b] mt-1">단가: ₩{s.unitPrice.toLocaleString()}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div><label className="text-xs text-[#6b6b6b] mb-1 block">공종</label><input type="text" required className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={laborForm.jobType} onChange={e => setLaborForm({...laborForm, jobType: e.target.value})} /></div>
                    <div><label className="text-xs text-[#6b6b6b] mb-1 block">단가 (원)</label><input type="number" required className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={laborForm.unitPrice} onChange={e => setLaborForm({...laborForm, unitPrice: e.target.value})} /></div>
                    <div><label className="text-xs text-[#6b6b6b] mb-1 block">투입 공수</label><input type="number" step="0.1" required className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={laborForm.amount} onChange={e => setLaborForm({...laborForm, amount: e.target.value})} /></div>
                    <div className="md:col-span-2 mt-2"><button type="submit" className="w-full bg-[#556b2f] text-[#ffffff] font-bold py-2 rounded hover:opacity-90">추가하기</button></div>
                  </form>
                </div>
              )}

              {activeTab === 'labor' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="font-bold text-lg text-[#1a1c1c]">일일 투입 인력</h3>
                    <span className="text-xs font-bold text-[#556b2f] bg-[#556b2f]/10 px-2 py-1 rounded border border-[#556b2f]/20">{totalLabors} 활성 공수</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {loading ? <div className="text-center py-8 text-[#737373]">데이터를 불러오는 중...</div> : logData?.labors.length === 0 ? <div className="bg-[#f3f3f3] border border-[#e5e5e5] rounded-xl p-8 text-center text-[#737373]">입력된 노무 인력이 없습니다.</div> : logData?.labors.map((labor: any) => (
                        <div key={labor.id} className="bg-[#f3f3f3] border border-[#e5e5e5] rounded-xl p-4 flex justify-between items-center hover:border-[#556b2f]/50 transition-colors group">
                          <div className="flex items-center gap-3 w-2/3">
                            <div className="w-12 h-12 bg-[#e5e5e5] rounded-lg flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-[#0369a1]">engineering</span></div>
                            <div className="overflow-hidden">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-[#1a1c1c] truncate text-sm md:text-base">{labor.name}</h4>
                                {labor.createdBy && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#ededed] text-[#737373] font-bold">BY {labor.createdBy}</span>
                                )}
                              </div>
                              <p className="text-[10px] md:text-xs text-[#6b6b6b] uppercase truncate mt-0.5">{labor.jobType} • {labor.amount}공수 • 단가₩{labor.unitPrice.toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base md:text-lg font-bold text-[#1a1c1c]">₩{labor.totalPrice.toLocaleString()}</p>
                            <p className="text-[10px] text-[#16a34a] font-bold tracking-widest mt-0.5">확인됨</p>
                          </div>
                        </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ===================== EQUIPMENT TAB ===================== */}
              {showAddForm && activeTab === 'equipment' && (
                <div className="bg-[#ededed] border border-[#556b2f] p-4 rounded-xl mb-4 relative animate-fade-in shadow-xl shadow-black/50">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-[#556b2f] flex items-center gap-2"><span className="material-symbols-outlined text-sm">precision_manufacturing</span> 새 장비 추가</h4>
                    <div className="flex items-center gap-2">
                      <label className={`flex items-center gap-1 cursor-pointer text-xs font-bold px-2 py-1 rounded border transition-colors ${isAnalyzing ? 'text-[#8a8a8a] border-[#e5e5e5] pointer-events-none' : 'text-[#ffffff] bg-[#556b2f] border-[#556b2f] hover:opacity-90'}`}>
                        <span className="material-symbols-outlined text-sm">photo_camera</span>
                        {isAnalyzing ? '인식 중...' : '장비 촬영'}
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0]; if (!file) return
                          const data = await analyzeDocument(file, 'equipment_photo')
                          if (data) setEquipmentForm(prev => ({ ...prev, name: data.name || prev.name, spec: data.spec || prev.spec, note: data.note || prev.note }))
                          e.target.value = ''
                        }} />
                      </label>
                      <label className={`flex items-center gap-1 cursor-pointer text-xs font-bold px-2 py-1 rounded border transition-colors ${isAnalyzing ? 'text-[#8a8a8a] border-[#e5e5e5] pointer-events-none' : 'text-[#6b6b6b] border-[#e5e5e5] hover:text-[#556b2f] hover:border-[#556b2f]'}`}>
                        <span className="material-symbols-outlined text-sm">document_scanner</span>
                        {isAnalyzing ? '분석 중...' : '문서 스캔'}
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0]; if (!file) return
                          const data = await analyzeDocument(file, 'equipment')
                          if (data) setEquipmentForm(prev => ({ ...prev, name: data.name || prev.name, spec: data.spec || prev.spec, unitPrice: data.unitPrice || prev.unitPrice, amount: data.amount || prev.amount, note: data.note || prev.note }))
                          e.target.value = ''
                        }} />
                      </label>
                      <button onClick={() => setShowAddForm(false)} className="text-[#6b6b6b] hover:text-[#1a1c1c]"><span className="material-symbols-outlined">close</span></button>
                    </div>
                  </div>
                  <form onSubmit={handleEquipmentSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3 relative">
                    <div className="relative">
                      <label className="text-xs text-[#6b6b6b] mb-1 block">장비명</label>
                      <input type="text" required className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={equipmentForm.name} onChange={handleEquipmentNameChange} autoComplete="off"/>
                      {suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#e8e8e8] z-50 border border-[#e5e5e5] rounded max-h-48 overflow-y-auto shadow-xl">
                          {suggestions.map((s, i) => (
                            <div key={i} onClick={() => selectEquipmentSuggestion(s)} className="p-3 border-b border-[#e5e5e5] hover:bg-[#f3f3f3] cursor-pointer">
                              <div className="font-medium text-[#1a1c1c]">{s.name} <span className="text-xs text-[#556b2f] ml-2">{s.spec}</span></div>
                              <div className="text-xs text-[#6b6b6b] mt-1">단가: ₩{s.unitPrice.toLocaleString()}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div><label className="text-xs text-[#6b6b6b] mb-1 block">규격 / 장비번호</label><input type="text" className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={equipmentForm.spec} onChange={e => setEquipmentForm({...equipmentForm, spec: e.target.value})} /></div>
                    <div><label className="text-xs text-[#6b6b6b] mb-1 block">단가 (원)</label><input type="number" required className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={equipmentForm.unitPrice} onChange={e => setEquipmentForm({...equipmentForm, unitPrice: e.target.value})} /></div>
                    <div><label className="text-xs text-[#6b6b6b] mb-1 block">투입 일/시간</label><input type="number" step="0.1" required className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={equipmentForm.amount} onChange={e => setEquipmentForm({...equipmentForm, amount: e.target.value})} /></div>
                    <div className="md:col-span-2 mt-2"><button type="submit" className="w-full bg-[#556b2f] text-[#ffffff] font-bold py-2 rounded hover:opacity-90">추가하기</button></div>
                  </form>
                </div>
              )}

              {activeTab === 'equipment' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="font-bold text-lg text-[#1a1c1c]">투입 장비</h3>
                    <span className="text-xs font-bold text-[#556b2f] bg-[#556b2f]/10 px-2 py-1 rounded border border-[#556b2f]/20">{totalEquipments} 대 투입</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {loading ? <div className="text-center py-8 text-[#737373]">데이터를 불러오는 중...</div> : logData?.equipments.length === 0 ? <div className="bg-[#f3f3f3] border border-[#e5e5e5] rounded-xl p-8 text-center text-[#737373]">입력된 투입 장비가 없습니다.</div> : logData?.equipments.map((eq: any) => (
                        <div key={eq.id} className="bg-[#f3f3f3] border border-[#e5e5e5] rounded-xl p-4 flex justify-between items-center hover:border-[#556b2f]/50 transition-colors group">
                          <div className="flex items-center gap-3 w-2/3">
                            <div className="w-12 h-12 bg-[#e5e5e5] rounded-lg flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-[#0369a1]">precision_manufacturing</span></div>
                            <div className="overflow-hidden">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-[#1a1c1c] truncate text-sm md:text-base">{eq.name}</h4>
                                {eq.createdBy && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#ededed] text-[#737373] font-bold">BY {eq.createdBy}</span>
                                )}
                              </div>
                              <p className="text-[10px] md:text-xs text-[#6b6b6b] uppercase truncate mt-0.5">{eq.spec} • {eq.amount} 시간/일</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base md:text-lg font-bold text-[#1a1c1c]">₩{eq.totalPrice.toLocaleString()}</p>
                          </div>
                        </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ===================== OUTSOURCING TAB ===================== */}
              {showAddForm && activeTab === 'outsourcing' && (
                <div className="bg-[#ededed] border border-[#556b2f] p-4 rounded-xl mb-4 relative animate-fade-in shadow-xl shadow-black/50">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-[#556b2f] flex items-center gap-2"><span className="material-symbols-outlined text-sm">handshake</span> 새 외주 항목 추가</h4>
                    <div className="flex items-center gap-2">
                      <label className={`flex items-center gap-1 cursor-pointer text-xs font-bold px-2 py-1 rounded border transition-colors ${isAnalyzing ? 'text-[#8a8a8a] border-[#e5e5e5] pointer-events-none' : 'text-[#6b6b6b] border-[#e5e5e5] hover:text-[#556b2f] hover:border-[#556b2f]'}`}>
                        <span className="material-symbols-outlined text-sm">document_scanner</span>
                        {isAnalyzing ? '분석 중...' : '문서 스캔'}
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0]; if (!file) return
                          const data = await analyzeDocument(file, 'outsourcing')
                          if (data) setOutsourcingForm(prev => ({ ...prev, company: data.company || prev.company, task: data.task || prev.task, amount: data.amount || prev.amount, note: data.note || prev.note }))
                          e.target.value = ''
                        }} />
                      </label>
                      <button onClick={() => setShowAddForm(false)} className="text-[#6b6b6b] hover:text-[#1a1c1c]"><span className="material-symbols-outlined">close</span></button>
                    </div>
                  </div>
                  <form onSubmit={handleOutsourcingSubmit} className="grid grid-cols-1 gap-3 relative">
                    <div className="relative">
                      <label className="text-xs text-[#6b6b6b] mb-1 block">외주 업체명</label>
                      <input type="text" required className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={outsourcingForm.company} onChange={handleOutsourcingCompanyChange} autoComplete="off"/>
                      {suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#e8e8e8] z-50 border border-[#e5e5e5] rounded max-h-48 overflow-y-auto shadow-xl">
                          {suggestions.map((s, i) => (
                            <div key={i} onClick={() => selectOutsourcingSuggestion(s)} className="p-3 border-b border-[#e5e5e5] hover:bg-[#f3f3f3] cursor-pointer">
                              <div className="font-medium text-[#1a1c1c]">{s.companyName} <span className="text-xs text-[#556b2f] ml-2">{s.task}</span></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div><label className="text-xs text-[#6b6b6b] mb-1 block">작업 내용</label><input type="text" required className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={outsourcingForm.task} onChange={e => setOutsourcingForm({...outsourcingForm, task: e.target.value})} /></div>
                    <div><label className="text-xs text-[#6b6b6b] mb-1 block">청구 비용 (원)</label><input type="number" required className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={outsourcingForm.amount} onChange={e => setOutsourcingForm({...outsourcingForm, amount: e.target.value})} /></div>
                    <div className="mt-2"><button type="submit" className="w-full bg-[#556b2f] text-[#ffffff] font-bold py-2 rounded hover:opacity-90">추가하기</button></div>
                  </form>
                </div>
              )}

              {activeTab === 'outsourcing' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="font-bold text-lg text-[#1a1c1c]">외주 작업</h3>
                    <span className="text-xs font-bold text-[#556b2f] bg-[#556b2f]/10 px-2 py-1 rounded border border-[#556b2f]/20">{totalOutsourcings} 건</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {loading ? <div className="text-center py-8 text-[#737373]">데이터를 불러오는 중...</div> : logData?.outsourcings.length === 0 ? <div className="bg-[#f3f3f3] border border-[#e5e5e5] rounded-xl p-8 text-center text-[#737373]">입력된 외주 항목이 없습니다.</div> : logData?.outsourcings.map((out: any) => (
                        <div key={out.id} className="bg-[#f3f3f3] border border-[#e5e5e5] rounded-xl p-4 flex justify-between items-center hover:border-[#556b2f]/50 transition-colors group">
                          <div className="flex items-center gap-3 w-2/3">
                            <div className="w-12 h-12 bg-[#e5e5e5] rounded-lg flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-[#7c3aed]">handshake</span></div>
                            <div className="overflow-hidden">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-[#1a1c1c] truncate text-sm md:text-base">{out.companyName}</h4>
                                {out.createdBy && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#ededed] text-[#737373] font-bold">BY {out.createdBy}</span>
                                )}
                              </div>
                              <p className="text-[10px] md:text-xs text-[#6b6b6b] uppercase truncate mt-0.5">{out.task}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base md:text-lg font-bold text-[#1a1c1c]">₩{out.amount.toLocaleString()}</p>
                          </div>
                        </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ===================== MATERIAL TAB ===================== */}
              {showAddForm && activeTab === 'material' && (
                <div className="bg-[#ededed] border border-[#556b2f] p-4 rounded-xl mb-4 relative animate-fade-in shadow-xl shadow-black/50">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-[#556b2f] flex items-center gap-2"><span className="material-symbols-outlined text-sm">inventory_2</span> 새 자재 추가</h4>
                    <div className="flex items-center gap-2">
                      <label className={`flex items-center gap-1 cursor-pointer text-xs font-bold px-2 py-1 rounded border transition-colors ${isAnalyzing ? 'text-[#8a8a8a] border-[#e5e5e5] pointer-events-none' : 'text-[#6b6b6b] border-[#e5e5e5] hover:text-[#556b2f] hover:border-[#556b2f]'}`}>
                        <span className="material-symbols-outlined text-sm">document_scanner</span>
                        {isAnalyzing ? '분석 중...' : '문서 스캔'}
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0]; if (!file) return
                          const data = await analyzeDocument(file, 'material')
                          if (data) setMaterialForm(prev => ({ ...prev, name: data.name || prev.name, spec: data.spec || prev.spec, unit: data.unit || prev.unit, quantity: data.quantity || prev.quantity, note: data.note || prev.note }))
                          e.target.value = ''
                        }} />
                      </label>
                      <button onClick={() => setShowAddForm(false)} className="text-[#6b6b6b] hover:text-[#1a1c1c]"><span className="material-symbols-outlined">close</span></button>
                    </div>
                  </div>
                  <form onSubmit={handleMaterialSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3 relative">
                    <div className="relative">
                      <label className="text-xs text-[#6b6b6b] mb-1 block">자재명</label>
                      <input type="text" required className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={materialForm.name} onChange={handleMaterialNameChange} autoComplete="off"/>
                      {suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#e8e8e8] z-50 border border-[#e5e5e5] rounded max-h-48 overflow-y-auto shadow-xl">
                          {suggestions.map((s, i) => (
                            <div key={i} onClick={() => selectMaterialSuggestion(s)} className="p-3 border-b border-[#e5e5e5] hover:bg-[#f3f3f3] cursor-pointer">
                              <div className="font-medium text-[#1a1c1c]">{s.name} <span className="text-xs text-[#556b2f] ml-2">{s.spec}</span></div>
                              <div className="text-xs text-[#6b6b6b] mt-1">단위: {s.unit}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div><label className="text-xs text-[#6b6b6b] mb-1 block">규격</label><input type="text" className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={materialForm.spec} onChange={e => setMaterialForm({...materialForm, spec: e.target.value})} /></div>
                    <div><label className="text-xs text-[#6b6b6b] mb-1 block">단위 (EA, kg, m)</label><input type="text" required className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={materialForm.unit} onChange={e => setMaterialForm({...materialForm, unit: e.target.value})} /></div>
                    <div><label className="text-xs text-[#6b6b6b] mb-1 block">수량</label><input type="number" step="0.1" required className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={materialForm.quantity} onChange={e => setMaterialForm({...materialForm, quantity: e.target.value})} /></div>
                    <div className="md:col-span-2 mt-2"><button type="submit" className="w-full bg-[#556b2f] text-[#ffffff] font-bold py-2 rounded hover:opacity-90">추가하기</button></div>
                  </form>
                </div>
              )}

              {activeTab === 'material' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="font-bold text-lg text-[#1a1c1c]">투입 자재</h3>
                    <span className="text-xs font-bold text-[#556b2f] bg-[#556b2f]/10 px-2 py-1 rounded border border-[#556b2f]/20">{totalMaterials} 건 투입</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {loading ? <div className="text-center py-8 text-[#737373]">데이터를 불러오는 중...</div> : logData?.materials.length === 0 ? <div className="bg-[#f3f3f3] border border-[#e5e5e5] rounded-xl p-8 text-center text-[#737373]">입력된 자재가 없습니다.</div> : logData?.materials.map((mat: any) => (
                        <div key={mat.id} className="bg-[#f3f3f3] border border-[#e5e5e5] rounded-xl p-4 flex justify-between items-center hover:border-[#556b2f]/50 transition-colors group">
                          <div className="flex items-center gap-3 w-2/3">
                            <div className="w-12 h-12 bg-[#e5e5e5] rounded-lg flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-[#d97706]">inventory_2</span></div>
                            <div className="overflow-hidden">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-[#1a1c1c] truncate text-sm md:text-base">{mat.name}</h4>
                                {mat.createdBy && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#ededed] text-[#737373] font-bold">BY {mat.createdBy}</span>
                                )}
                              </div>
                              <p className="text-[10px] md:text-xs text-[#6b6b6b] uppercase truncate mt-0.5">{mat.spec} • {mat.quantity}{mat.unit}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-[#6b6b6b]">{mat.note || '메모 없음'}</p>
                          </div>
                        </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ===================== EXPENSE TAB ===================== */}
              {showAddForm && activeTab === 'expense' && (
                <div className="bg-[#ededed] border border-[#556b2f] p-4 rounded-xl mb-4 relative animate-fade-in shadow-xl shadow-black/50">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-[#556b2f] flex items-center gap-2"><span className="material-symbols-outlined text-sm">receipt_long</span> 새 경비 추가</h4>
                    <div className="flex items-center gap-2">
                      <label className={`flex items-center gap-1 cursor-pointer text-xs font-bold px-2 py-1 rounded border transition-colors ${isAnalyzing ? 'text-[#8a8a8a] border-[#e5e5e5] pointer-events-none' : 'text-[#6b6b6b] border-[#e5e5e5] hover:text-[#556b2f] hover:border-[#556b2f]'}`}>
                        <span className="material-symbols-outlined text-sm">document_scanner</span>
                        {isAnalyzing ? '분석 중...' : '문서 스캔'}
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0]; if (!file) return
                          const data = await analyzeDocument(file, 'expense')
                          if (data) setExpenseForm(prev => ({ ...prev, category: data.category || prev.category, amount: data.amount || prev.amount, note: data.note || prev.note }))
                          e.target.value = ''
                        }} />
                      </label>
                      <button onClick={() => setShowAddForm(false)} className="text-[#6b6b6b] hover:text-[#1a1c1c]"><span className="material-symbols-outlined">close</span></button>
                    </div>
                  </div>
                  <form onSubmit={handleExpenseSubmit} className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-xs text-[#6b6b6b] mb-1 block">담당자</label>
                      <select required className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={expenseForm.assignedTo || currentUser?.name || ''} onChange={e => setExpenseForm({...expenseForm, assignedTo: e.target.value})}>
                        {allUsers.filter(u => u.isActive !== false).map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                      </select>
                    </div>
                    <div><label className="text-xs text-[#6b6b6b] mb-1 block">항목 (식대, 주유비, 소모품 등)</label><input type="text" required className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={expenseForm.category} onChange={e => setExpenseForm({...expenseForm, category: e.target.value})} /></div>
                    <div><label className="text-xs text-[#6b6b6b] mb-1 block">금액 (원)</label><input type="number" required className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} /></div>
                    <div><label className="text-xs text-[#6b6b6b] mb-1 block">비고</label><input type="text" className="w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded px-3 py-2 text-[#1a1c1c] outline-none focus:border-[#556b2f]" value={expenseForm.note} onChange={e => setExpenseForm({...expenseForm, note: e.target.value})} /></div>
                    <div className="mt-2"><button type="submit" className="w-full bg-[#556b2f] text-[#ffffff] font-bold py-2 rounded hover:opacity-90">추가하기</button></div>
                  </form>
                </div>
              )}

              {activeTab === 'expense' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="font-bold text-lg text-[#1a1c1c]">경비 내역</h3>
                    <span className="text-xs font-bold text-[#556b2f] bg-[#556b2f]/10 px-2 py-1 rounded border border-[#556b2f]/20">{logData?.expenses?.length || 0} 건</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {loading ? <div className="text-center py-8 text-[#737373]">데이터를 불러오는 중...</div> : logData?.expenses?.length === 0 ? <div className="bg-[#f3f3f3] border border-[#e5e5e5] rounded-xl p-8 text-center text-[#737373]">입력된 경비가 없습니다.</div> : logData?.expenses?.map((exp: any) => (
                        <div key={exp.id} className="bg-[#f3f3f3] border border-[#e5e5e5] rounded-xl p-4 flex justify-between items-center hover:border-[#556b2f]/50 transition-colors group">
                          <div className="flex items-center gap-3 w-2/3">
                            <div className="w-12 h-12 bg-[#e5e5e5] rounded-lg flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-[#16a34a]">payments</span></div>
                            <div className="overflow-hidden">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-[#1a1c1c] truncate text-sm md:text-base">{exp.category}</h4>
                                {exp.createdBy && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#ededed] text-[#737373] font-bold">BY {exp.createdBy}</span>
                                )}
                              </div>
                              <p className="text-[10px] md:text-xs text-[#6b6b6b] truncate mt-0.5">{exp.note || '메모 없음'}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base md:text-lg font-bold text-[#1a1c1c]">₩{exp.amount.toLocaleString()}</p>
                          </div>
                        </div>
                    ))}
                  </div>
                </div>
              )}
              {/* ===================== SETTLEMENT TAB ===================== */}
              {activeTab === 'settlement' && currentUser?.role === 'ADMIN' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="font-bold text-lg text-[#1a1c1c] flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#16a34a]">account_balance_wallet</span>
                      {selectedMonth}월 경비 정산
                    </h3>
                    <button onClick={loadSettlementData} className="text-xs text-[#6b6b6b] hover:text-[#1a1c1c] flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">refresh</span> 새로고침
                    </button>
                  </div>

                  {settlementLoading ? (
                    <div className="text-center py-12 text-[#737373]">데이터를 불러오는 중...</div>
                  ) : settlementError ? (
                    <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 text-center">
                      <p className="text-red-600 text-sm font-bold mb-1">오류가 발생했습니다</p>
                      <p className="text-red-500 text-xs">{settlementError}</p>
                    </div>
                  ) : settlementData.length === 0 ? (
                    <div className="bg-[#f3f3f3] border border-[#e5e5e5] rounded-xl p-8 text-center text-[#737373]">이달 경비 내역이 없습니다.</div>
                  ) : (
                    <div className="space-y-4">
                      {settlementData.map((person) => (
                        <div key={person.person} className="bg-[#ffffff] border border-[#e5e5e5] rounded-xl overflow-hidden">
                          {/* 담당자 헤더 */}
                          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e5e5]">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-[#e5e5e5] flex items-center justify-center">
                                <span className="material-symbols-outlined text-[#6b6b6b] text-sm">person</span>
                              </div>
                              <div>
                                <p className="font-bold text-[#1a1c1c]">{person.person}</p>
                                <p className="text-[10px] text-[#737373] mt-0.5">총 {person.items.length}건 · ₩{person.total.toLocaleString()}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                {person.unsettledTotal > 0 && (
                                  <p className="text-sm font-bold text-red-600">미정산 ₩{person.unsettledTotal.toLocaleString()}</p>
                                )}
                                {person.settledTotal > 0 && (
                                  <p className="text-xs text-[#16a34a]">정산완료 ₩{person.settledTotal.toLocaleString()}</p>
                                )}
                              </div>
                              {person.unsettledTotal > 0 && (
                                <button
                                  onClick={async () => {
                                    if (!confirm(`${person.person}의 미정산 경비 ₩${person.unsettledTotal.toLocaleString()}을 정산 처리하시겠습니까?`)) return
                                    const ids = person.items.filter((i: any) => !i.isSettled).map((i: any) => i.id)
                                    try {
                                      await settleExpenses(ids)
                                      loadSettlementData()
                                    } catch (e) {
                                      alert('정산 처리 실패: ' + (e instanceof Error ? e.message : String(e)))
                                    }
                                  }}
                                  className="px-3 py-1.5 rounded bg-[#16a34a]/10 text-[#16a34a] border border-[#16a34a]/30 text-xs font-bold hover:bg-[#16a34a]/20 transition-colors whitespace-nowrap"
                                >
                                  정산 처리
                                </button>
                              )}
                            </div>
                          </div>
                          {/* 경비 상세 목록 */}
                          <div className="divide-y divide-[#e5e5e5]">
                            {person.items.map((item: any) => (
                              <div key={item.id} className="flex items-center justify-between px-5 py-3">
                                <div className="flex items-center gap-3">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${item.isSettled ? 'bg-[#16a34a]' : 'bg-red-400'}`}></span>
                                  <div>
                                    <p className="text-sm text-[#1a1c1c]">{item.category}</p>
                                    <p className="text-[10px] text-[#737373]">{item.note || ''}</p>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-bold text-[#1a1c1c]">₩{item.amount.toLocaleString()}</p>
                                  <p className={`text-[10px] font-bold ${item.isSettled ? 'text-[#16a34a]' : 'text-red-600'}`}>
                                    {item.isSettled ? '정산완료' : '미정산'}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ===================== INTEGRATION TAB ===================== */}
              {activeTab === 'integration' && currentUser?.role === 'ADMIN' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="font-bold text-lg text-[#1a1c1c] flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#0284c7]">hub</span>
                      Drive 노무관리 연계
                    </h3>
                    <span className="text-xs text-[#737373]">{selectedYear}년 {selectedMonth}월</span>
                  </div>

                  {integrationError && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-600">
                      {integrationError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-[#ffffff] border border-[#e5e5e5] rounded-xl p-5 space-y-4">
                      <div>
                        <p className="text-xs font-bold tracking-widest text-[#0284c7] uppercase">Worker Master</p>
                        <h4 className="font-bold text-[#1a1c1c] mt-1">근로자마스터 동기화</h4>
                        <p className="text-sm text-[#6b6b6b] mt-2">Google Drive의 노무관리 마스터 시트에서 근로자 서류 상태, 계좌, 안전교육 정보를 앱 DB로 반영합니다.</p>
                      </div>
                      <button
                        onClick={handleDriveWorkerSync}
                        disabled={integrationLoading !== null}
                        className="w-full bg-[#0284c7] text-white font-bold py-3 rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-sm">{integrationLoading === 'sync' ? 'sync' : 'cloud_sync'}</span>
                        {integrationLoading === 'sync' ? '동기화 중...' : 'Drive 근로자 동기화'}
                      </button>
                      <button
                        onClick={handleProcessWorkerDocuments}
                        disabled={integrationLoading !== null}
                        className="w-full border border-[#0284c7] text-[#0284c7] font-bold py-3 rounded-lg hover:bg-[#0284c7]/10 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-sm">{integrationLoading === 'documents' ? 'sync' : 'document_scanner'}</span>
                        {integrationLoading === 'documents' ? '서류 분석 중...' : '대기 서류 분석'}
                      </button>
                      {syncResult && (
                        <div className="grid grid-cols-4 gap-2 text-center">
                          <div className="bg-[#f3f3f3] rounded-lg p-3"><p className="text-[10px] text-[#737373]">신규</p><p className="font-bold">{syncResult.created}</p></div>
                          <div className="bg-[#f3f3f3] rounded-lg p-3"><p className="text-[10px] text-[#737373]">갱신</p><p className="font-bold">{syncResult.updated}</p></div>
                          <div className="bg-[#f3f3f3] rounded-lg p-3"><p className="text-[10px] text-[#737373]">건너뜀</p><p className="font-bold">{syncResult.skipped}</p></div>
                          <div className="bg-[#f3f3f3] rounded-lg p-3"><p className="text-[10px] text-[#737373]">전체</p><p className="font-bold">{syncResult.total}</p></div>
                        </div>
                      )}
                      {documentScanResult && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-4 gap-2 text-center">
                            <div className="bg-[#f3f3f3] rounded-lg p-3"><p className="text-[10px] text-[#737373]">처리</p><p className="font-bold">{documentScanResult.processed}</p></div>
                            <div className="bg-[#f3f3f3] rounded-lg p-3"><p className="text-[10px] text-[#737373]">완료</p><p className="font-bold text-[#16a34a]">{documentScanResult.completed}</p></div>
                            <div className="bg-[#f3f3f3] rounded-lg p-3"><p className="text-[10px] text-[#737373]">검토</p><p className="font-bold text-amber-600">{documentScanResult.review}</p></div>
                            <div className="bg-[#f3f3f3] rounded-lg p-3"><p className="text-[10px] text-[#737373]">실패</p><p className="font-bold text-red-600">{documentScanResult.failed}</p></div>
                          </div>
                          <div className="border border-[#e5e5e5] rounded-lg overflow-hidden">
                            <div className="max-h-40 overflow-auto divide-y divide-[#e5e5e5]">
                              {documentScanResult.details?.slice(0, 10).map((item: any, idx: number) => (
                                <div key={`${item.fileName}-${idx}`} className="px-3 py-2 text-xs">
                                  <p className="font-bold text-[#1a1c1c]">{item.workerName || item.fileName}</p>
                                  <p className="text-[#737373]">{item.status}{item.reason ? ` · ${item.reason}` : ''}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="bg-[#ffffff] border border-[#e5e5e5] rounded-xl p-5 space-y-4">
                      <div>
                        <p className="text-xs font-bold tracking-widest text-[#16a34a] uppercase">Monthly Billing</p>
                        <h4 className="font-bold text-[#1a1c1c] mt-1">월별 노무 기성 초안</h4>
                        <p className="text-sm text-[#6b6b6b] mt-2">앱에 입력된 일일 노무 투입 내역과 근로자 서류 상태를 합쳐 월별투입명세 초안을 생성합니다.</p>
                      </div>
                      <button
                        onClick={handleGenerateMonthlyBilling}
                        disabled={integrationLoading !== null || !selectedSiteId}
                        className="w-full bg-[#16a34a] text-white font-bold py-3 rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-sm">{integrationLoading === 'billing' ? 'sync' : 'request_quote'}</span>
                        {integrationLoading === 'billing' ? '생성 중...' : '월별투입명세 생성'}
                      </button>
                      <button
                        onClick={handleExportMonthlyBilling}
                        disabled={integrationLoading !== null || !selectedSiteId}
                        className="w-full border border-[#16a34a] text-[#16a34a] font-bold py-3 rounded-lg hover:bg-[#16a34a]/10 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-sm">{integrationLoading === 'export' ? 'sync' : 'drive_file_move'}</span>
                        {integrationLoading === 'export' ? '출력 중...' : 'Google Sheets/PDF 출력'}
                      </button>
                      {billingResult && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-[#f3f3f3] rounded-lg p-3"><p className="text-[10px] text-[#737373]">인원</p><p className="font-bold">{billingResult.billing.workerCount}</p></div>
                            <div className="bg-[#f3f3f3] rounded-lg p-3"><p className="text-[10px] text-[#737373]">지급가능</p><p className="font-bold text-[#16a34a]">{billingResult.billing.readyWorkerCount}</p></div>
                            <div className="bg-[#f3f3f3] rounded-lg p-3"><p className="text-[10px] text-[#737373]">보류</p><p className="font-bold text-red-600">{billingResult.billing.holdWorkerCount}</p></div>
                          </div>
                          <div className="border border-[#e5e5e5] rounded-lg overflow-hidden">
                            <div className="max-h-64 overflow-auto divide-y divide-[#e5e5e5]">
                              {billingResult.items.slice(0, 20).map((item: any, idx: number) => (
                                <div key={`${item.name}-${idx}`} className="flex items-center justify-between px-3 py-2 text-sm">
                                  <div>
                                    <p className="font-bold text-[#1a1c1c]">{item.name}</p>
                                    <p className="text-[10px] text-[#737373]">{item.jobType} · {item.amount}공수 · {item.documentStatus}</p>
                                  </div>
                                  <p className="font-bold">₩{item.totalPrice.toLocaleString()}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                          {(billingResult.spreadsheetUrl || billingResult.pdfUrl) && (
                            <div className="flex flex-wrap gap-2">
                              {billingResult.spreadsheetUrl && (
                                <a href={billingResult.spreadsheetUrl} target="_blank" className="text-xs font-bold text-[#0284c7] border border-[#0284c7]/30 rounded px-3 py-2 hover:bg-[#0284c7]/10">
                                  Google Sheets 열기
                                </a>
                              )}
                              {billingResult.pdfUrl && (
                                <a href={billingResult.pdfUrl} target="_blank" className="text-xs font-bold text-[#16a34a] border border-[#16a34a]/30 rounded px-3 py-2 hover:bg-[#16a34a]/10">
                                  PDF 열기
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </section>
          </>
        )}
            {/* Bottom Row: Work Log & Photos - 대시보드 탭에서만 표시 */}
            {activeTab === 'dashboard' && <section className="grid grid-cols-1 xl:grid-cols-2 gap-6 pt-10 pb-10">
              <div className="bg-[#ffffff] border border-[#e5e5e5] p-6 rounded-xl flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#556b2f]">edit_note</span>
                  <h4 className="font-['Inter'] font-bold text-[#1a1c1c] uppercase text-xs tracking-widest">오늘의 주요 작업 내용 (WORK LOG)</h4>
                </div>
                <textarea 
                  className="bg-[#f9f9f9] border border-[#e5e5e5] text-sm text-[#1a1c1c] p-4 h-40 focus:ring-1 focus:ring-[#556b2f] focus:border-[#556b2f] transition-all resize-none outline-none rounded-lg" 
                  placeholder="오늘의 주요 작업 내용을 입력하세요..."
                  value={workDescription}
                  onChange={(e) => setWorkDescription(e.target.value)}
                  onBlur={async () => {
                    if (logData) await updateDailyLogDescription(logData.id, workDescription);
                  }}
                />
                <div className="flex justify-end">
                  <span className="text-[10px] text-[#737373] font-bold uppercase tracking-widest">포커스를 벗어나면 자동 저장됩니다.</span>
                </div>
              </div>

              <div className="bg-[#ffffff] border border-[#e5e5e5] p-6 rounded-xl flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#556b2f]">photo_library</span>
                    <h4 className="font-['Inter'] font-bold text-[#1a1c1c] uppercase text-xs tracking-widest">현장 사진 첨부 (SITE PHOTOS)</h4>
                  </div>
                  <span className="text-[10px] text-[#6b6b6b] font-label-caps uppercase">{logData?.photos?.length || 0} ATTACHMENTS</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {logData?.photos?.map((photo: any) => (
                    <div key={photo.id} className="aspect-square bg-surface-container-high relative group cursor-pointer overflow-hidden rounded-lg border border-[#e5e5e5]">
                      <img className="w-full h-full object-cover group-hover:scale-110 transition-transform" src={photo.url} alt="Site Photo" />
                      <button 
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm('사진을 삭제하시겠습니까?')) {
                            await deletePhoto(photo.id);
                            loadData();
                          }
                        }}
                        className="absolute top-1 right-1 bg-black/60 text-[#1a1c1c] p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <span className="material-symbols-outlined text-xs">close</span>
                      </button>
                    </div>
                  ))}
                  <label className={`aspect-square border-2 border-dashed border-[#e5e5e5] rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-[#556b2f] hover:bg-[#e5e5e5]/30 transition-all ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                    {isUploading ? (
                      <span className="material-symbols-outlined text-[#737373] animate-spin">sync</span>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[#737373] mb-1">add_a_photo</span>
                        <span className="text-[10px] text-[#737373] font-bold">ADD</span>
                      </>
                    )}
                  </label>
                </div>
              </div>
            </section>}
          </main>
        </div>

      {/* BottomNavBar */}
      <nav className="xl:hidden fixed bottom-0 left-0 w-full z-40 flex justify-around items-center bg-[#f9f9f9] border-t border-[#e5e5e5] pb-safe h-16">
        <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center justify-center py-2 transition-transform active:scale-90 ${activeTab === 'dashboard' ? 'text-[#556b2f]' : 'text-[#737373] hover:text-[#1a1c1c]'}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'dashboard' ? "'FILL' 1" : "'FILL' 0" }}>dashboard</span>
          <span className="font-['Inter'] text-[10px] uppercase font-bold mt-1">대시보드</span>
        </button>
        <button onClick={() => setActiveTab('labor')} className={`flex flex-col items-center justify-center py-2 transition-transform active:scale-90 ${activeTab === 'labor' ? 'text-[#556b2f]' : 'text-[#737373] hover:text-[#1a1c1c]'}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'labor' ? "'FILL' 1" : "'FILL' 0" }}>groups</span>
          <span className="font-['Inter'] text-[10px] uppercase font-bold mt-1">노무</span>
        </button>
        <button onClick={() => setActiveTab('equipment')} className={`flex flex-col items-center justify-center py-2 transition-transform active:scale-90 ${activeTab === 'equipment' ? 'text-[#556b2f]' : 'text-[#737373] hover:text-[#1a1c1c]'}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'equipment' ? "'FILL' 1" : "'FILL' 0" }}>precision_manufacturing</span>
          <span className="font-['Inter'] text-[10px] uppercase font-bold mt-1">장비</span>
        </button>
        <button onClick={() => setActiveTab('outsourcing')} className={`flex flex-col items-center justify-center py-2 transition-transform active:scale-90 ${activeTab === 'outsourcing' ? 'text-[#556b2f]' : 'text-[#737373] hover:text-[#1a1c1c]'}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'outsourcing' ? "'FILL' 1" : "'FILL' 0" }}>handshake</span>
          <span className="font-['Inter'] text-[10px] uppercase font-bold mt-1">외주</span>
        </button>
        <button onClick={() => setActiveTab('expense')} className={`flex flex-col items-center justify-center py-2 transition-transform active:scale-90 ${activeTab === 'expense' ? 'text-[#556b2f]' : 'text-[#737373] hover:text-[#1a1c1c]'}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'expense' ? "'FILL' 1" : "'FILL' 0" }}>receipt_long</span>
          <span className="font-['Inter'] text-[10px] uppercase font-bold mt-1">경비</span>
        </button>
        <button onClick={() => setActiveTab('material')} className={`flex flex-col items-center justify-center py-2 transition-transform active:scale-90 ${activeTab === 'material' ? 'text-[#556b2f]' : 'text-[#737373] hover:text-[#1a1c1c]'}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'material' ? "'FILL' 1" : "'FILL' 0" }}>inventory_2</span>
          <span className="font-['Inter'] text-[10px] uppercase font-bold mt-1">자재</span>
        </button>
      </nav>

      {/* Floating Action Button */}
      {selectedSiteId && ['labor', 'equipment', 'material', 'outsourcing', 'expense'].includes(activeTab) && !showAddForm && !showNewSiteForm && (
        <button 
          onClick={() => setShowAddForm(true)}
          className="fixed right-6 bottom-20 w-14 h-14 bg-[#556b2f] text-[#ffffff] rounded-full shadow-lg shadow-[#556b2f]/20 flex items-center justify-center active:scale-90 transition-transform z-50 hover:opacity-90"
        >
          <span className="material-symbols-outlined font-bold">add</span>
        </button>
      )}
    </>
  )
}
