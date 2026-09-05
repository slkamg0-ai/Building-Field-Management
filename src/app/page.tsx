'use client'

import { useState, useEffect } from 'react'
import { getDailyLog, addLabor, addEquipment, addMaterial, addOutsourcing, addExpense, deleteLabor, deleteEquipment, deleteMaterial, deleteOutsourcing, deleteExpense, searchLabors, searchEquipments, searchMaterials, searchOutsourcings, getSites, createSite, updateSite, resetSiteData, getMonthlyStats, getSiteTotalStats, getUsers, createUser, deleteUser, toggleUserActive, updateUserPin, updateUserRole, updateDailyLogDescription, addPhotoRecord, deletePhoto, getMonthlyExpensesByPerson, settleExpenses, uploadPhoto, getCurrentUser, logout, syncWorkersFromConfiguredDriveMaster, processPendingWorkerDocuments, generateMonthlyLaborBilling, exportMonthlyLaborBillingToDrive, getWorkerDocumentReviews, saveWorkerDocumentReview, getWorkers } from '@/lib/actions'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, PieChart, Pie, Cell } from 'recharts'
import { exportMonthlyReport } from '@/lib/exportExcel'
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
  const router = useRouter()

  // 폼 표시 상태
  const [showAddForm, setShowAddForm] = useState(false)
  
  // 항목별 폼 상태
  const [laborForm, setLaborForm] = useState({ name: '', jobType: '', unitPrice: '', amount: '1', note: '' })
  const [equipmentForm, setEquipmentForm] = useState({ name: '', spec: '', unitPrice: '', amount: '1', note: '', ownerType: 'DIRECT', taskDescription: '' })
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
  const [documentReviews, setDocumentReviews] = useState<any[]>([])
  const [documentReviewEdits, setDocumentReviewEdits] = useState<Record<string, any>>({})
  const [documentReviewLoading, setDocumentReviewLoading] = useState(false)
  const [workerOptions, setWorkerOptions] = useState<any[]>([])
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
      if (activeTab === 'settlement') loadSettlementData()
    }
    if (activeTab === 'integration' && currentUser?.role === 'ADMIN') {
      loadDocumentReviews()
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
      await loadDocumentReviews()
      await loadData()
    } catch (e) {
      setIntegrationError(e instanceof Error ? e.message : String(e))
    } finally {
      setIntegrationLoading(null)
    }
  }

  async function loadDocumentReviews() {
    setDocumentReviewLoading(true)
    try {
      const [docs, workers] = await Promise.all([
        getWorkerDocumentReviews(30),
        getWorkers(true),
      ])
      setDocumentReviews(docs)
      setWorkerOptions(workers)
      setDocumentReviewEdits(Object.fromEntries(docs.map((doc: any) => {
        const extracted = doc.extractedData || {}
        return [doc.id, {
          workerId: doc.workerId || '',
          workerName: doc.workerName || extracted.workerName || '',
          birthYYMMDD: doc.birthYYMMDD || extracted.birthYYMMDD || '',
          documentType: doc.documentType || 'OTHER',
          bankName: extracted.bankName || doc.worker?.bankName || '',
          accountNumber: extracted.accountNumber || doc.worker?.accountNumber || '',
          safetyEduNumber: extracted.safetyEduNumber || doc.worker?.safetyEduNumber || '',
          safetyEduComplete: !!extracted.safetyEduComplete,
          status: doc.status || 'REVIEW',
          note: doc.note || '',
        }]
      })))
    } catch (e) {
      setIntegrationError(e instanceof Error ? e.message : String(e))
    } finally {
      setDocumentReviewLoading(false)
    }
  }

  function patchDocumentReview(id: string, patch: any) {
    setDocumentReviewEdits(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch },
    }))
  }

  async function handleSaveDocumentReview(id: string, approve: boolean) {
    setIntegrationLoading(`review-${id}`)
    setIntegrationError(null)
    try {
      await saveWorkerDocumentReview(id, documentReviewEdits[id] || {}, approve)
      await loadDocumentReviews()
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
    setEquipmentForm({ name: '', spec: '', unitPrice: '', amount: '1', note: '', ownerType: 'DIRECT', taskDescription: '' })
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
                <div className="space-y-3 animate-fade-in">

                  {/* 오늘의 요약 및 한계금액 분석 */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="dash-card bg-[#fffdf7] border border-[#2e3192]/60 p-4">
                      <h4 className="font-cond font-bold text-[#23255c] text-sm mb-2 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#2e3192] text-[18px]">calendar_today</span> 오늘의 지출 요약 ({currentDate})
                      </h4>
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center py-1.5 border-b border-[#2e3192]/20">
                          <span className="text-[#6266a8] text-sm">일일 총 지출</span>
                          <span className={`font-bold ${isOverBudgetToday ? 'text-red-600' : 'text-[#23255c]'}`}>₩{grandTotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-1.5 border-b border-[#2e3192]/20">
                          <span className="text-[#6266a8] text-sm">일일 권장 투입 한계</span>
                          <span className="font-bold text-[#5b6fd6]">₩{siteTotalStats ? Math.round(siteTotalStats.dailyLimit).toLocaleString() : 0}</span>
                        </div>
                        <div className="flex justify-between items-center pt-1.5">
                          <span className="text-[#6266a8] text-sm">상태 분석</span>
                          {isOverBudgetToday ? (
                            <span className="dash-pill text-red-600 font-bold text-xs bg-red-400/10 px-2 py-1">한계선 초과 (주의)</span>
                          ) : (
                            <span className="dash-pill text-[#2e3192] font-bold text-xs bg-[#eef1ff] px-2 py-1">안정적 (예산 내)</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="dash-card bg-[#fffdf7] border border-[#2e3192]/60 p-4 flex items-center gap-4">
                      <span className="material-symbols-outlined text-3xl text-[#8489c4] shrink-0">download</span>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-cond font-bold text-[#23255c] text-sm mb-0.5">데이터 내보내기</h4>
                        <p className="text-xs text-[#6266a8] mb-2 truncate">월간 작업일보 및 투입 비용 명세서 (.xlsx)</p>
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
                          className="dash-sm py-1.5 px-4 bg-[#2e3192] text-[#fffdf7] text-sm font-bold transition-colors flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-95"
                        >
                          <span className="material-symbols-outlined text-sm">file_download</span>
                          엑셀 다운로드
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 차트 + 월간 상세 분석: 넓은 화면에서는 좌우로 배치해 스크롤을 줄임 */}
                  <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
                    {/* 일자별 지출 추이 바 차트 */}
                    <div className="xl:col-span-3 dash-card bg-[#fffdf7] border border-[#2e3192]/60 p-4">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="font-cond font-bold text-[#23255c] text-sm flex items-center gap-2">
                          <span className="material-symbols-outlined text-[#2e3192] text-[18px]">bar_chart</span>
                          {monthName} 일자별 지출 추이
                        </h3>
                        <span className="text-[10px] text-[#6266a8]">단위: 원</span>
                      </div>

                      {monthlyLoading ? (
                        <div className="h-56 flex items-center justify-center text-[#6266a8] text-sm">데이터를 불러오는 중...</div>
                      ) : monthlyStats?.dailyData?.length === 0 ? (
                        <div className="h-56 flex items-center justify-center text-[#6266a8] text-sm">입력된 데이터가 없습니다.</div>
                      ) : (
                        <div className="h-56 w-full xl:h-[26rem]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={monthlyStats.dailyData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#2e3192" strokeOpacity={0.15} vertical={false} />
                              <XAxis dataKey="name" stroke="#6266a8" fontSize={11} tickLine={false} axisLine={false} />
                              <YAxis stroke="#6266a8" fontSize={11} tickFormatter={(val) => `₩${(val/10000).toFixed(0)}만`} tickLine={false} axisLine={false} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#fffdf7', borderColor: '#2e3192', borderRadius: '10px' }}
                                itemStyle={{ fontSize: '13px' }}
                                formatter={(value: unknown) => [`₩${Number(value).toLocaleString()}`, undefined]}
                              />
                              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                              <Bar dataKey="노무비" stackId="a" fill="#2e3192" radius={[0, 0, 4, 4]} />
                              <Bar dataKey="장비대" stackId="a" fill="#5b6fd6" />
                              <Bar dataKey="외주비" stackId="a" fill="#93a5f0" />
                              <Bar dataKey="경비" stackId="a" fill="#c9d3fa" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>

                    <div className="xl:col-span-2 flex flex-col gap-3">
                      {/* 지출 비중 원형 차트 */}
                      <div className="dash-card bg-[#fffdf7] border border-[#2e3192]/60 p-4">
                        <h4 className="font-cond font-bold text-[#23255c] text-sm mb-2 flex items-center gap-2">
                          <span className="material-symbols-outlined text-[#2e3192] text-[18px]">pie_chart</span> 카테고리별 지출 비중
                        </h4>
                        <div className="flex items-center gap-3">
                          <div className="w-28 h-28 shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={[
                                    { name: '노무', value: monthlyStats?.summary?.totalLabor || 0, color: '#2e3192' },
                                    { name: '장비', value: monthlyStats?.summary?.totalEquipment || 0, color: '#5b6fd6' },
                                    { name: '외주', value: monthlyStats?.summary?.totalOutsourcing || 0, color: '#93a5f0' },
                                    { name: '경비', value: monthlyStats?.summary?.totalExpense || 0, color: '#c9d3fa' },
                                  ].filter(d => d.value > 0)}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={32}
                                  outerRadius={48}
                                  paddingAngle={5}
                                  dataKey="value"
                                >
                                  {[
                                    { color: '#2e3192' },
                                    { color: '#5b6fd6' },
                                    { color: '#93a5f0' },
                                    { color: '#c9d3fa' },
                                  ].map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip
                                  contentStyle={{ backgroundColor: '#fffdf7', border: '1px solid #2e3192', borderRadius: '10px' }}
                                  itemStyle={{ color: '#23255c' }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 dash-pill bg-[#2e3192] shrink-0"></div>
                              <span className="text-[10px] text-[#6266a8] font-bold uppercase truncate">노무 {((monthlyStats?.summary?.totalLabor / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 dash-pill bg-[#5b6fd6] shrink-0"></div>
                              <span className="text-[10px] text-[#6266a8] font-bold uppercase truncate">장비 {((monthlyStats?.summary?.totalEquipment / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 dash-pill bg-[#93a5f0] shrink-0"></div>
                              <span className="text-[10px] text-[#6266a8] font-bold uppercase truncate">외주 {((monthlyStats?.summary?.totalOutsourcing / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 dash-pill bg-[#c9d3fa] shrink-0"></div>
                              <span className="text-[10px] text-[#6266a8] font-bold uppercase truncate">경비 {((monthlyStats?.summary?.totalExpense / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 월간 상세 집계표 */}
                      <div className="flex-1 dash-card bg-[#fffdf7] border border-[#2e3192]/60 p-4">
                        <h4 className="font-cond font-bold text-[#23255c] text-sm mb-2 flex items-center gap-2">
                          <span className="material-symbols-outlined text-[#2e3192] text-[18px]">analytics</span> 월간 상세 집계표 ({monthName})
                        </h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="border-b border-[#2e3192]/40 text-[9px] text-[#6266a8] font-bold uppercase tracking-widest">
                                <th className="pb-1.5 px-1">카테고리</th>
                                <th className="pb-1.5 px-1 text-right">금액</th>
                                <th className="pb-1.5 px-1 text-right">비중</th>
                              </tr>
                            </thead>
                            <tbody className="text-xs">
                              <tr className="border-b border-[#2e3192]/20">
                                <td className="py-1.5 px-1 text-[#23255c] font-medium flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 dash-pill bg-[#2e3192] shrink-0"></span> 노무비
                                </td>
                                <td className="py-1.5 px-1 text-right text-[#23255c] font-bold">₩{monthlyStats?.summary?.totalLabor?.toLocaleString()}</td>
                                <td className="py-1.5 px-1 text-right text-[#6266a8]">{((monthlyStats?.summary?.totalLabor / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</td>
                              </tr>
                              <tr className="border-b border-[#2e3192]/20">
                                <td className="py-1.5 px-1 text-[#23255c] font-medium flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 dash-pill bg-[#5b6fd6] shrink-0"></span> 장비대
                                </td>
                                <td className="py-1.5 px-1 text-right text-[#23255c] font-bold">₩{monthlyStats?.summary?.totalEquipment?.toLocaleString()}</td>
                                <td className="py-1.5 px-1 text-right text-[#6266a8]">{((monthlyStats?.summary?.totalEquipment / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</td>
                              </tr>
                              <tr className="border-b border-[#2e3192]/20">
                                <td className="py-1.5 px-1 text-[#23255c] font-medium flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 dash-pill bg-[#93a5f0] shrink-0"></span> 외주비
                                </td>
                                <td className="py-1.5 px-1 text-right text-[#23255c] font-bold">₩{monthlyStats?.summary?.totalOutsourcing?.toLocaleString()}</td>
                                <td className="py-1.5 px-1 text-right text-[#6266a8]">{((monthlyStats?.summary?.totalOutsourcing / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</td>
                              </tr>
                              <tr className="border-b border-[#2e3192]/20">
                                <td className="py-1.5 px-1 text-[#23255c] font-medium flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 dash-pill bg-[#c9d3fa] shrink-0"></span> 경비
                                </td>
                                <td className="py-1.5 px-1 text-right text-[#23255c] font-bold">₩{monthlyStats?.summary?.totalExpense?.toLocaleString()}</td>
                                <td className="py-1.5 px-1 text-right text-[#6266a8]">{((monthlyStats?.summary?.totalExpense / monthlyStats?.summary?.grandTotal) * 100 || 0).toFixed(1)}%</td>
                              </tr>
                              <tr className="bg-[#2e3192]/5">
                                <td className="py-2 px-1 text-[#2e3192] font-bold">합계</td>
                                <td className="py-2 px-1 text-right text-[#2e3192] font-bold">₩{monthlyStats?.summary?.grandTotal?.toLocaleString()}</td>
                                <td className="py-2 px-1 text-right text-[#2e3192] font-bold">100%</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
              </div>
            )}

              {/* ===================== LABOR TAB ===================== */}
              {showAddForm && activeTab === 'labor' && (
                <div className="bg-[#ededed] border border-[#5980a6] p-4 rounded-xl mb-4 relative animate-fade-in shadow-xl shadow-black/50">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-[#5980a6] flex items-center gap-2"><span className="material-symbols-outlined text-sm">person_add</span> 새 노무 인력 추가</h4>
                    <div className="flex items-center gap-2">
                      <label className={`flex items-center gap-1 cursor-pointer text-xs font-bold px-2 py-1 rounded border transition-colors ${isAnalyzing ? 'text-[rgba(29,31,32,0.5)] border-[rgba(29,31,32,0.16)] pointer-events-none' : 'text-[rgba(29,31,32,0.6)] border-[rgba(29,31,32,0.16)] hover:text-[#5980a6] hover:border-[#5980a6]'}`}>
                        <span className="material-symbols-outlined text-sm">document_scanner</span>
                        {isAnalyzing ? '분석 중...' : '문서 스캔'}
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0]; if (!file) return
                          const data = await analyzeDocument(file, 'labor')
                          if (data) setLaborForm(prev => ({ ...prev, name: data.name || prev.name, jobType: data.jobType || prev.jobType, unitPrice: data.unitPrice || prev.unitPrice, amount: data.amount || prev.amount, note: data.note || prev.note }))
                          e.target.value = ''
                        }} />
                      </label>
                      <button onClick={() => setShowAddForm(false)} className="text-[rgba(29,31,32,0.6)] hover:text-[#1d1f20]"><span className="material-symbols-outlined">close</span></button>
                    </div>
                  </div>
                  <form onSubmit={handleLaborSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3 relative">
                    <div className="relative">
                      <label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">작업자 이름</label>
                      <input type="text" required className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={laborForm.name} onChange={handleLaborNameChange} autoComplete="off"/>
                      {suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#e8e8e8] z-50 border border-[rgba(29,31,32,0.16)] rounded max-h-48 overflow-y-auto shadow-xl">
                          {suggestions.map((s, i) => (
                            <div key={i} onClick={() => selectLaborSuggestion(s)} className="p-3 border-b border-[rgba(29,31,32,0.16)] hover:bg-[#f2f2f3] cursor-pointer">
                              <div className="font-medium text-[#1d1f20]">{s.name} <span className="text-xs text-[#5980a6] ml-2">{s.jobType}</span></div>
                              <div className="text-xs text-[rgba(29,31,32,0.6)] mt-1">단가: ₩{s.unitPrice.toLocaleString()}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div><label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">공종</label><input type="text" required className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={laborForm.jobType} onChange={e => setLaborForm({...laborForm, jobType: e.target.value})} /></div>
                    <div><label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">단가 (원)</label><input type="number" required className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={laborForm.unitPrice} onChange={e => setLaborForm({...laborForm, unitPrice: e.target.value})} /></div>
                    <div><label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">투입 공수</label><input type="number" step="0.1" required className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={laborForm.amount} onChange={e => setLaborForm({...laborForm, amount: e.target.value})} /></div>
                    <div className="md:col-span-2 mt-2"><button type="submit" className="w-full bg-[#5980a6] text-[#f2f2f3] font-bold py-2 rounded hover:opacity-90">추가하기</button></div>
                  </form>
                </div>
              )}

              {activeTab === 'labor' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="font-bold text-lg text-[#1d1f20]">일일 투입 인력</h3>
                    <span className="text-xs font-bold text-[#5980a6] bg-[#5980a6]/10 px-2 py-1 rounded border border-[#5980a6]/20">{totalLabors} 활성 공수</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {loading ? <div className="text-center py-8 text-[rgba(29,31,32,0.55)]">데이터를 불러오는 중...</div> : logData?.labors.length === 0 ? <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-8 text-center text-[rgba(29,31,32,0.55)]">입력된 노무 인력이 없습니다.</div> : logData?.labors.map((labor: any) => {
                      const docStatus = workerDocMap[labor.name.trim().toLowerCase()]
                      const docWarning = docStatus === undefined ? '근로자 미등록' : docStatus !== 'COMPLETE' ? '서류 미비' : null
                      return (
                        <div key={labor.id} className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-4 flex justify-between items-center hover:border-[#5980a6]/50 transition-colors group">
                          <div className="flex items-center gap-3 w-2/3">
                            <div className="w-12 h-12 bg-[rgba(29,31,32,0.16)] rounded-lg flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-[#0369a1]">engineering</span></div>
                            <div className="overflow-hidden">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-[#1d1f20] truncate text-sm md:text-base">{labor.name}</h4>
                                {labor.createdBy && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#ededed] text-[rgba(29,31,32,0.55)] font-bold">BY {labor.createdBy}</span>
                                )}
                                {docWarning && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 font-bold flex items-center gap-0.5" title="근로자 관리에서 서류를 등록해주세요">
                                    <span className="material-symbols-outlined text-[11px]">warning</span>{docWarning}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] md:text-xs text-[rgba(29,31,32,0.6)] uppercase truncate mt-0.5">{labor.jobType} • {labor.amount}공수 • 단가₩{labor.unitPrice.toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0 flex items-center gap-2">
                            <div>
                              <p className="text-base md:text-lg font-bold text-[#1d1f20]">₩{labor.totalPrice.toLocaleString()}</p>
                              <p className="text-[10px] text-[#16a34a] font-bold tracking-widest mt-0.5">확인됨</p>
                            </div>
                            <button
                              onClick={() => handleDeleteItem(deleteLabor, labor.id, `노무 (${labor.name})`)}
                              className="p-2 rounded-lg text-[rgba(29,31,32,0.5)] opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-600 transition-all"
                              title="삭제"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ===================== EQUIPMENT TAB ===================== */}
              {showAddForm && activeTab === 'equipment' && (
                <div className="bg-[#ededed] border border-[#5980a6] p-4 rounded-xl mb-4 relative animate-fade-in shadow-xl shadow-black/50">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-[#5980a6] flex items-center gap-2"><span className="material-symbols-outlined text-sm">precision_manufacturing</span> 새 장비 추가</h4>
                    <div className="flex items-center gap-2">
                      <label className={`flex items-center gap-1 cursor-pointer text-xs font-bold px-2 py-1 rounded border transition-colors ${isAnalyzing ? 'text-[rgba(29,31,32,0.5)] border-[rgba(29,31,32,0.16)] pointer-events-none' : 'text-[#f2f2f3] bg-[#5980a6] border-[#5980a6] hover:opacity-90'}`}>
                        <span className="material-symbols-outlined text-sm">photo_camera</span>
                        {isAnalyzing ? '인식 중...' : '장비 촬영'}
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0]; if (!file) return
                          const data = await analyzeDocument(file, 'equipment_photo')
                          if (data) setEquipmentForm(prev => ({ ...prev, name: data.name || prev.name, spec: data.spec || prev.spec, note: data.note || prev.note }))
                          e.target.value = ''
                        }} />
                      </label>
                      <label className={`flex items-center gap-1 cursor-pointer text-xs font-bold px-2 py-1 rounded border transition-colors ${isAnalyzing ? 'text-[rgba(29,31,32,0.5)] border-[rgba(29,31,32,0.16)] pointer-events-none' : 'text-[rgba(29,31,32,0.6)] border-[rgba(29,31,32,0.16)] hover:text-[#5980a6] hover:border-[#5980a6]'}`}>
                        <span className="material-symbols-outlined text-sm">document_scanner</span>
                        {isAnalyzing ? '분석 중...' : '문서 스캔'}
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0]; if (!file) return
                          const data = await analyzeDocument(file, 'equipment')
                          if (data) setEquipmentForm(prev => ({ ...prev, name: data.name || prev.name, spec: data.spec || prev.spec, unitPrice: data.unitPrice || prev.unitPrice, amount: data.amount || prev.amount, note: data.note || prev.note }))
                          e.target.value = ''
                        }} />
                      </label>
                      <button onClick={() => setShowAddForm(false)} className="text-[rgba(29,31,32,0.6)] hover:text-[#1d1f20]"><span className="material-symbols-outlined">close</span></button>
                    </div>
                  </div>
                  <form onSubmit={handleEquipmentSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3 relative">
                    <div className="relative">
                      <label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">장비명</label>
                      <input type="text" required className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={equipmentForm.name} onChange={handleEquipmentNameChange} autoComplete="off"/>
                      {suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#e8e8e8] z-50 border border-[rgba(29,31,32,0.16)] rounded max-h-48 overflow-y-auto shadow-xl">
                          {suggestions.map((s, i) => (
                            <div key={i} onClick={() => selectEquipmentSuggestion(s)} className="p-3 border-b border-[rgba(29,31,32,0.16)] hover:bg-[#f2f2f3] cursor-pointer">
                              <div className="font-medium text-[#1d1f20]">{s.name} <span className="text-xs text-[#5980a6] ml-2">{s.spec}</span></div>
                              <div className="text-xs text-[rgba(29,31,32,0.6)] mt-1">단가: ₩{s.unitPrice.toLocaleString()}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div><label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">규격 / 장비번호</label><input type="text" className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={equipmentForm.spec} onChange={e => setEquipmentForm({...equipmentForm, spec: e.target.value})} /></div>
                    <div><label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">단가 (원)</label><input type="number" required className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={equipmentForm.unitPrice} onChange={e => setEquipmentForm({...equipmentForm, unitPrice: e.target.value})} /></div>
                    <div><label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">투입 일/시간</label><input type="number" step="0.1" required className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={equipmentForm.amount} onChange={e => setEquipmentForm({...equipmentForm, amount: e.target.value})} /></div>
                    <div>
                      <label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">투입 구분</label>
                      <div className="flex border border-[rgba(29,31,32,0.16)] rounded overflow-hidden">
                        <button type="button" onClick={() => setEquipmentForm({...equipmentForm, ownerType: 'DIRECT'})} className={`flex-1 py-2 text-xs font-bold transition-colors ${equipmentForm.ownerType === 'DIRECT' ? 'bg-[#5980a6] text-[#f2f2f3]' : 'bg-[#f2f2f3] text-[#1d1f20]'}`}>원청 직영</button>
                        <button type="button" onClick={() => setEquipmentForm({...equipmentForm, ownerType: 'SUBCONTRACT'})} className={`flex-1 py-2 text-xs font-bold transition-colors border-l border-[rgba(29,31,32,0.16)] ${equipmentForm.ownerType === 'SUBCONTRACT' ? 'bg-[#5980a6] text-[#f2f2f3]' : 'bg-[#f2f2f3] text-[#1d1f20]'}`}>당사 투입</button>
                      </div>
                    </div>
                    <div className="md:col-span-2"><label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">작업 내용 (예: 터파기, 되메우기, 자재 운반 등)</label><input type="text" className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={equipmentForm.taskDescription} onChange={e => setEquipmentForm({...equipmentForm, taskDescription: e.target.value})} /></div>
                    <div className="md:col-span-2 mt-2"><button type="submit" className="w-full bg-[#5980a6] text-[#f2f2f3] font-bold py-2 rounded hover:opacity-90">추가하기</button></div>
                  </form>
                </div>
              )}

              {activeTab === 'equipment' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="font-bold text-lg text-[#1d1f20]">투입 장비</h3>
                    <span className="text-xs font-bold text-[#5980a6] bg-[#5980a6]/10 px-2 py-1 rounded border border-[#5980a6]/20">{totalEquipments} 대 투입</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {loading ? <div className="text-center py-8 text-[rgba(29,31,32,0.55)]">데이터를 불러오는 중...</div> : logData?.equipments.length === 0 ? <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-8 text-center text-[rgba(29,31,32,0.55)]">입력된 투입 장비가 없습니다.</div> : logData?.equipments.map((eq: any) => (
                        <div key={eq.id} className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-4 flex justify-between items-center hover:border-[#5980a6]/50 transition-colors group">
                          <div className="flex items-center gap-3 w-2/3">
                            <div className="w-12 h-12 bg-[rgba(29,31,32,0.16)] rounded-lg flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-[#0369a1]">precision_manufacturing</span></div>
                            <div className="overflow-hidden">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-[#1d1f20] truncate text-sm md:text-base">{eq.name}</h4>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${eq.ownerType === 'DIRECT' ? 'bg-[#5980a6]/15 text-[#416180]' : 'bg-[rgba(29,31,32,0.08)] text-[rgba(29,31,32,0.6)]'}`}>
                                  {eq.ownerType === 'DIRECT' ? '원청 직영' : '당사 투입'}
                                </span>
                                {eq.createdBy && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#ededed] text-[rgba(29,31,32,0.55)] font-bold">BY {eq.createdBy}</span>
                                )}
                                {eq.documentStatus !== 'COMPLETE' && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 font-bold flex items-center gap-0.5" title="장비 안전서류(등록증/보험/면허 등) 확인 필요">
                                    <span className="material-symbols-outlined text-[11px]">warning</span>서류 확인필요
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] md:text-xs text-[rgba(29,31,32,0.6)] uppercase truncate mt-0.5">{eq.spec} • {eq.amount} 시간/일</p>
                              {eq.taskDescription && (
                                <p className="text-[10px] md:text-xs text-[rgba(29,31,32,0.55)] truncate mt-0.5 normal-case">작업: {eq.taskDescription}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0 flex items-center gap-2">
                            <p className="text-base md:text-lg font-bold text-[#1d1f20]">₩{eq.totalPrice.toLocaleString()}</p>
                            <button
                              onClick={() => handleDeleteItem(deleteEquipment, eq.id, `장비 (${eq.name})`)}
                              className="p-2 rounded-lg text-[rgba(29,31,32,0.5)] opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-600 transition-all"
                              title="삭제"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ===================== OUTSOURCING TAB ===================== */}
              {showAddForm && activeTab === 'outsourcing' && (
                <div className="bg-[#ededed] border border-[#5980a6] p-4 rounded-xl mb-4 relative animate-fade-in shadow-xl shadow-black/50">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-[#5980a6] flex items-center gap-2"><span className="material-symbols-outlined text-sm">handshake</span> 새 외주 항목 추가</h4>
                    <div className="flex items-center gap-2">
                      <label className={`flex items-center gap-1 cursor-pointer text-xs font-bold px-2 py-1 rounded border transition-colors ${isAnalyzing ? 'text-[rgba(29,31,32,0.5)] border-[rgba(29,31,32,0.16)] pointer-events-none' : 'text-[rgba(29,31,32,0.6)] border-[rgba(29,31,32,0.16)] hover:text-[#5980a6] hover:border-[#5980a6]'}`}>
                        <span className="material-symbols-outlined text-sm">document_scanner</span>
                        {isAnalyzing ? '분석 중...' : '문서 스캔'}
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0]; if (!file) return
                          const data = await analyzeDocument(file, 'outsourcing')
                          if (data) setOutsourcingForm(prev => ({ ...prev, company: data.company || prev.company, task: data.task || prev.task, amount: data.amount || prev.amount, note: data.note || prev.note }))
                          e.target.value = ''
                        }} />
                      </label>
                      <button onClick={() => setShowAddForm(false)} className="text-[rgba(29,31,32,0.6)] hover:text-[#1d1f20]"><span className="material-symbols-outlined">close</span></button>
                    </div>
                  </div>
                  <form onSubmit={handleOutsourcingSubmit} className="grid grid-cols-1 gap-3 relative">
                    <div className="relative">
                      <label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">외주 업체명</label>
                      <input type="text" required className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={outsourcingForm.company} onChange={handleOutsourcingCompanyChange} autoComplete="off"/>
                      {suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#e8e8e8] z-50 border border-[rgba(29,31,32,0.16)] rounded max-h-48 overflow-y-auto shadow-xl">
                          {suggestions.map((s, i) => (
                            <div key={i} onClick={() => selectOutsourcingSuggestion(s)} className="p-3 border-b border-[rgba(29,31,32,0.16)] hover:bg-[#f2f2f3] cursor-pointer">
                              <div className="font-medium text-[#1d1f20]">{s.companyName} <span className="text-xs text-[#5980a6] ml-2">{s.task}</span></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div><label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">작업 내용</label><input type="text" required className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={outsourcingForm.task} onChange={e => setOutsourcingForm({...outsourcingForm, task: e.target.value})} /></div>
                    <div><label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">청구 비용 (원)</label><input type="number" required className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={outsourcingForm.amount} onChange={e => setOutsourcingForm({...outsourcingForm, amount: e.target.value})} /></div>
                    <div className="mt-2"><button type="submit" className="w-full bg-[#5980a6] text-[#f2f2f3] font-bold py-2 rounded hover:opacity-90">추가하기</button></div>
                  </form>
                </div>
              )}

              {activeTab === 'outsourcing' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="font-bold text-lg text-[#1d1f20]">외주 작업</h3>
                    <span className="text-xs font-bold text-[#5980a6] bg-[#5980a6]/10 px-2 py-1 rounded border border-[#5980a6]/20">{totalOutsourcings} 건</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {loading ? <div className="text-center py-8 text-[rgba(29,31,32,0.55)]">데이터를 불러오는 중...</div> : logData?.outsourcings.length === 0 ? <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-8 text-center text-[rgba(29,31,32,0.55)]">입력된 외주 항목이 없습니다.</div> : logData?.outsourcings.map((out: any) => (
                        <div key={out.id} className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-4 flex justify-between items-center hover:border-[#5980a6]/50 transition-colors group">
                          <div className="flex items-center gap-3 w-2/3">
                            <div className="w-12 h-12 bg-[rgba(29,31,32,0.16)] rounded-lg flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-[#7c3aed]">handshake</span></div>
                            <div className="overflow-hidden">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-[#1d1f20] truncate text-sm md:text-base">{out.companyName}</h4>
                                {out.createdBy && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#ededed] text-[rgba(29,31,32,0.55)] font-bold">BY {out.createdBy}</span>
                                )}
                              </div>
                              <p className="text-[10px] md:text-xs text-[rgba(29,31,32,0.6)] uppercase truncate mt-0.5">{out.task}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0 flex items-center gap-2">
                            <p className="text-base md:text-lg font-bold text-[#1d1f20]">₩{out.amount.toLocaleString()}</p>
                            <button
                              onClick={() => handleDeleteItem(deleteOutsourcing, out.id, `외주 (${out.companyName})`)}
                              className="p-2 rounded-lg text-[rgba(29,31,32,0.5)] opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-600 transition-all"
                              title="삭제"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ===================== MATERIAL TAB ===================== */}
              {showAddForm && activeTab === 'material' && (
                <div className="bg-[#ededed] border border-[#5980a6] p-4 rounded-xl mb-4 relative animate-fade-in shadow-xl shadow-black/50">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-[#5980a6] flex items-center gap-2"><span className="material-symbols-outlined text-sm">inventory_2</span> 새 자재 추가</h4>
                    <div className="flex items-center gap-2">
                      <label className={`flex items-center gap-1 cursor-pointer text-xs font-bold px-2 py-1 rounded border transition-colors ${isAnalyzing ? 'text-[rgba(29,31,32,0.5)] border-[rgba(29,31,32,0.16)] pointer-events-none' : 'text-[rgba(29,31,32,0.6)] border-[rgba(29,31,32,0.16)] hover:text-[#5980a6] hover:border-[#5980a6]'}`}>
                        <span className="material-symbols-outlined text-sm">document_scanner</span>
                        {isAnalyzing ? '분석 중...' : '문서 스캔'}
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0]; if (!file) return
                          const data = await analyzeDocument(file, 'material')
                          if (data) setMaterialForm(prev => ({ ...prev, name: data.name || prev.name, spec: data.spec || prev.spec, unit: data.unit || prev.unit, quantity: data.quantity || prev.quantity, note: data.note || prev.note }))
                          e.target.value = ''
                        }} />
                      </label>
                      <button onClick={() => setShowAddForm(false)} className="text-[rgba(29,31,32,0.6)] hover:text-[#1d1f20]"><span className="material-symbols-outlined">close</span></button>
                    </div>
                  </div>
                  <form onSubmit={handleMaterialSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3 relative">
                    <div className="relative">
                      <label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">자재명</label>
                      <input type="text" required className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={materialForm.name} onChange={handleMaterialNameChange} autoComplete="off"/>
                      {suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#e8e8e8] z-50 border border-[rgba(29,31,32,0.16)] rounded max-h-48 overflow-y-auto shadow-xl">
                          {suggestions.map((s, i) => (
                            <div key={i} onClick={() => selectMaterialSuggestion(s)} className="p-3 border-b border-[rgba(29,31,32,0.16)] hover:bg-[#f2f2f3] cursor-pointer">
                              <div className="font-medium text-[#1d1f20]">{s.name} <span className="text-xs text-[#5980a6] ml-2">{s.spec}</span></div>
                              <div className="text-xs text-[rgba(29,31,32,0.6)] mt-1">단위: {s.unit}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div><label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">규격</label><input type="text" className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={materialForm.spec} onChange={e => setMaterialForm({...materialForm, spec: e.target.value})} /></div>
                    <div><label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">단위 (EA, kg, m)</label><input type="text" required className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={materialForm.unit} onChange={e => setMaterialForm({...materialForm, unit: e.target.value})} /></div>
                    <div><label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">수량</label><input type="number" step="0.1" required className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={materialForm.quantity} onChange={e => setMaterialForm({...materialForm, quantity: e.target.value})} /></div>
                    <div className="md:col-span-2 mt-2"><button type="submit" className="w-full bg-[#5980a6] text-[#f2f2f3] font-bold py-2 rounded hover:opacity-90">추가하기</button></div>
                  </form>
                </div>
              )}

              {activeTab === 'material' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="font-bold text-lg text-[#1d1f20]">투입 자재</h3>
                    <span className="text-xs font-bold text-[#5980a6] bg-[#5980a6]/10 px-2 py-1 rounded border border-[#5980a6]/20">{totalMaterials} 건 투입</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {loading ? <div className="text-center py-8 text-[rgba(29,31,32,0.55)]">데이터를 불러오는 중...</div> : logData?.materials.length === 0 ? <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-8 text-center text-[rgba(29,31,32,0.55)]">입력된 자재가 없습니다.</div> : logData?.materials.map((mat: any) => (
                        <div key={mat.id} className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-4 flex justify-between items-center hover:border-[#5980a6]/50 transition-colors group">
                          <div className="flex items-center gap-3 w-2/3">
                            <div className="w-12 h-12 bg-[rgba(29,31,32,0.16)] rounded-lg flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-[#d97706]">inventory_2</span></div>
                            <div className="overflow-hidden">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-[#1d1f20] truncate text-sm md:text-base">{mat.name}</h4>
                                {mat.createdBy && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#ededed] text-[rgba(29,31,32,0.55)] font-bold">BY {mat.createdBy}</span>
                                )}
                              </div>
                              <p className="text-[10px] md:text-xs text-[rgba(29,31,32,0.6)] uppercase truncate mt-0.5">{mat.spec} • {mat.quantity}{mat.unit}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0 flex items-center gap-2">
                            <p className="text-xs text-[rgba(29,31,32,0.6)]">{mat.note || '메모 없음'}</p>
                            <button
                              onClick={() => handleDeleteItem(deleteMaterial, mat.id, `자재 (${mat.name})`)}
                              className="p-2 rounded-lg text-[rgba(29,31,32,0.5)] opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-600 transition-all"
                              title="삭제"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ===================== EXPENSE TAB ===================== */}
              {showAddForm && activeTab === 'expense' && (
                <div className="bg-[#ededed] border border-[#5980a6] p-4 rounded-xl mb-4 relative animate-fade-in shadow-xl shadow-black/50">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-[#5980a6] flex items-center gap-2"><span className="material-symbols-outlined text-sm">receipt_long</span> 새 경비 추가</h4>
                    <div className="flex items-center gap-2">
                      <label className={`flex items-center gap-1 cursor-pointer text-xs font-bold px-2 py-1 rounded border transition-colors ${isAnalyzing ? 'text-[rgba(29,31,32,0.5)] border-[rgba(29,31,32,0.16)] pointer-events-none' : 'text-[rgba(29,31,32,0.6)] border-[rgba(29,31,32,0.16)] hover:text-[#5980a6] hover:border-[#5980a6]'}`}>
                        <span className="material-symbols-outlined text-sm">document_scanner</span>
                        {isAnalyzing ? '분석 중...' : '문서 스캔'}
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0]; if (!file) return
                          const data = await analyzeDocument(file, 'expense')
                          if (data) setExpenseForm(prev => ({ ...prev, category: data.category || prev.category, amount: data.amount || prev.amount, note: data.note || prev.note }))
                          e.target.value = ''
                        }} />
                      </label>
                      <button onClick={() => setShowAddForm(false)} className="text-[rgba(29,31,32,0.6)] hover:text-[#1d1f20]"><span className="material-symbols-outlined">close</span></button>
                    </div>
                  </div>
                  <form onSubmit={handleExpenseSubmit} className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">담당자</label>
                      <select required className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={expenseForm.assignedTo || currentUser?.name || ''} onChange={e => setExpenseForm({...expenseForm, assignedTo: e.target.value})}>
                        {allUsers.filter(u => u.isActive !== false).map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                      </select>
                    </div>
                    <div><label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">항목 (식대, 주유비, 소모품 등)</label><input type="text" required className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={expenseForm.category} onChange={e => setExpenseForm({...expenseForm, category: e.target.value})} /></div>
                    <div><label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">금액 (원)</label><input type="number" required className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} /></div>
                    <div><label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">비고</label><input type="text" className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]" value={expenseForm.note} onChange={e => setExpenseForm({...expenseForm, note: e.target.value})} /></div>
                    <div className="mt-2"><button type="submit" className="w-full bg-[#5980a6] text-[#f2f2f3] font-bold py-2 rounded hover:opacity-90">추가하기</button></div>
                  </form>
                </div>
              )}

              {activeTab === 'expense' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="font-bold text-lg text-[#1d1f20]">경비 내역</h3>
                    <span className="text-xs font-bold text-[#5980a6] bg-[#5980a6]/10 px-2 py-1 rounded border border-[#5980a6]/20">{logData?.expenses?.length || 0} 건</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {loading ? <div className="text-center py-8 text-[rgba(29,31,32,0.55)]">데이터를 불러오는 중...</div> : logData?.expenses?.length === 0 ? <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-8 text-center text-[rgba(29,31,32,0.55)]">입력된 경비가 없습니다.</div> : logData?.expenses?.map((exp: any) => (
                        <div key={exp.id} className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-4 flex justify-between items-center hover:border-[#5980a6]/50 transition-colors group">
                          <div className="flex items-center gap-3 w-2/3">
                            <div className="w-12 h-12 bg-[rgba(29,31,32,0.16)] rounded-lg flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-[#16a34a]">payments</span></div>
                            <div className="overflow-hidden">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-[#1d1f20] truncate text-sm md:text-base">{exp.category}</h4>
                                {exp.createdBy && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#ededed] text-[rgba(29,31,32,0.55)] font-bold">BY {exp.createdBy}</span>
                                )}
                              </div>
                              <p className="text-[10px] md:text-xs text-[rgba(29,31,32,0.6)] truncate mt-0.5">{exp.note || '메모 없음'}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0 flex items-center gap-2">
                            <p className="text-base md:text-lg font-bold text-[#1d1f20]">₩{exp.amount.toLocaleString()}</p>
                            {exp.isSettled ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#16a34a]/10 text-[#16a34a] font-bold" title="정산 완료된 경비는 삭제할 수 없습니다">정산됨</span>
                            ) : (
                              <button
                                onClick={() => handleDeleteItem(deleteExpense, exp.id, `경비 (${exp.category})`)}
                                className="p-2 rounded-lg text-[rgba(29,31,32,0.5)] opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-600 transition-all"
                                title="삭제"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                    ))}
                  </div>
                </div>
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
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="font-bold text-lg text-[#1d1f20] flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#16a34a]">account_balance_wallet</span>
                      {selectedMonth}월 경비 정산
                    </h3>
                    <button onClick={loadSettlementData} className="text-xs text-[rgba(29,31,32,0.6)] hover:text-[#1d1f20] flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">refresh</span> 새로고침
                    </button>
                  </div>

                  {settlementLoading ? (
                    <div className="text-center py-12 text-[rgba(29,31,32,0.55)]">데이터를 불러오는 중...</div>
                  ) : settlementError ? (
                    <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 text-center">
                      <p className="text-red-600 text-sm font-bold mb-1">오류가 발생했습니다</p>
                      <p className="text-red-500 text-xs">{settlementError}</p>
                    </div>
                  ) : settlementData.length === 0 ? (
                    <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-8 text-center text-[rgba(29,31,32,0.55)]">이달 경비 내역이 없습니다.</div>
                  ) : (
                    <div className="space-y-4">
                      {settlementData.map((person) => (
                        <div key={person.person} className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl overflow-hidden">
                          {/* 담당자 헤더 */}
                          <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(29,31,32,0.16)]">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-[rgba(29,31,32,0.16)] flex items-center justify-center">
                                <span className="material-symbols-outlined text-[rgba(29,31,32,0.6)] text-sm">person</span>
                              </div>
                              <div>
                                <p className="font-bold text-[#1d1f20]">{person.person}</p>
                                <p className="text-[10px] text-[rgba(29,31,32,0.55)] mt-0.5">총 {person.items.length}건 · ₩{person.total.toLocaleString()}</p>
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
                          <div className="divide-y divide-[rgba(29,31,32,0.16)]">
                            {person.items.map((item: any) => (
                              <div key={item.id} className="flex items-center justify-between px-5 py-3">
                                <div className="flex items-center gap-3">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${item.isSettled ? 'bg-[#16a34a]' : 'bg-red-400'}`}></span>
                                  <div>
                                    <p className="text-sm text-[#1d1f20]">{item.category}</p>
                                    <p className="text-[10px] text-[rgba(29,31,32,0.55)]">{item.note || ''}</p>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-bold text-[#1d1f20]">₩{item.amount.toLocaleString()}</p>
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
                    <h3 className="font-bold text-lg text-[#1d1f20] flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#0284c7]">hub</span>
                      Drive 노무관리 연계
                    </h3>
                    <span className="text-xs text-[rgba(29,31,32,0.55)]">{selectedYear}년 {selectedMonth}월</span>
                  </div>

                  {integrationError && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-600">
                      {integrationError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-5 space-y-4">
                      <div>
                        <p className="text-xs font-bold tracking-widest text-[#0284c7] uppercase">Worker Master</p>
                        <h4 className="font-bold text-[#1d1f20] mt-1">근로자마스터 동기화</h4>
                        <p className="text-sm text-[rgba(29,31,32,0.6)] mt-2">Google Drive의 노무관리 마스터 시트에서 근로자 서류 상태, 계좌, 안전교육 정보를 앱 DB로 반영합니다.</p>
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
                          <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">신규</p><p className="font-bold">{syncResult.created}</p></div>
                          <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">갱신</p><p className="font-bold">{syncResult.updated}</p></div>
                          <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">건너뜀</p><p className="font-bold">{syncResult.skipped}</p></div>
                          <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">전체</p><p className="font-bold">{syncResult.total}</p></div>
                        </div>
                      )}
                      {documentScanResult && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-4 gap-2 text-center">
                            <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">처리</p><p className="font-bold">{documentScanResult.processed}</p></div>
                            <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">완료</p><p className="font-bold text-[#16a34a]">{documentScanResult.completed}</p></div>
                            <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">검토</p><p className="font-bold text-amber-600">{documentScanResult.review}</p></div>
                            <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">실패</p><p className="font-bold text-red-600">{documentScanResult.failed}</p></div>
                          </div>
                          <div className="border border-[rgba(29,31,32,0.16)] rounded-lg overflow-hidden">
                            <div className="max-h-40 overflow-auto divide-y divide-[rgba(29,31,32,0.16)]">
                              {documentScanResult.details?.slice(0, 10).map((item: any, idx: number) => (
                                <div key={`${item.fileName}-${idx}`} className="px-3 py-2 text-xs">
                                  <p className="font-bold text-[#1d1f20]">{item.workerName || item.fileName}</p>
                                  <p className="text-[rgba(29,31,32,0.55)]">{item.status}{item.reason ? ` · ${item.reason}` : ''}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-5 space-y-4">
                      <div>
                        <p className="text-xs font-bold tracking-widest text-[#16a34a] uppercase">Monthly Billing</p>
                        <h4 className="font-bold text-[#1d1f20] mt-1">월별 노무 기성 초안</h4>
                        <p className="text-sm text-[rgba(29,31,32,0.6)] mt-2">앱에 입력된 일일 노무 투입 내역과 근로자 서류 상태를 합쳐 월별투입명세 초안을 생성합니다.</p>
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
                            <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">인원</p><p className="font-bold">{billingResult.billing.workerCount}</p></div>
                            <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">지급가능</p><p className="font-bold text-[#16a34a]">{billingResult.billing.readyWorkerCount}</p></div>
                            <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">보류</p><p className="font-bold text-red-600">{billingResult.billing.holdWorkerCount}</p></div>
                          </div>
                          <div className="border border-[rgba(29,31,32,0.16)] rounded-lg overflow-hidden">
                            <div className="max-h-64 overflow-auto divide-y divide-[rgba(29,31,32,0.16)]">
                              {billingResult.items.slice(0, 20).map((item: any, idx: number) => (
                                <div key={`${item.name}-${idx}`} className="flex items-center justify-between px-3 py-2 text-sm">
                                  <div>
                                    <p className="font-bold text-[#1d1f20]">{item.name}</p>
                                    <p className="text-[10px] text-[rgba(29,31,32,0.55)]">{item.jobType} · {item.amount}공수 · {item.documentStatus}</p>
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

                  <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <p className="text-xs font-bold tracking-widest text-[#7c3aed] uppercase">Document Review</p>
                        <h4 className="font-bold text-[#1d1f20] mt-1">AI 서류 인식 검수</h4>
                        <p className="text-sm text-[rgba(29,31,32,0.6)] mt-2">인식된 이름, 생년월일, 계좌, 안전교육 정보를 관리자가 수정하고 승인합니다.</p>
                      </div>
                      <button
                        onClick={loadDocumentReviews}
                        disabled={documentReviewLoading || integrationLoading !== null}
                        className="px-3 py-2 rounded-lg border border-[#7c3aed]/40 text-[#7c3aed] text-sm font-bold disabled:opacity-50"
                      >
                        {documentReviewLoading ? '불러오는 중...' : '새로고침'}
                      </button>
                    </div>

                    <div className="space-y-3 max-h-[520px] overflow-auto pr-1">
                      {documentReviews.length === 0 && (
                        <div className="text-center text-sm text-[rgba(29,31,32,0.55)] py-8 bg-[#f2f2f3] rounded-lg">
                          검수할 서류가 없습니다.
                        </div>
                      )}
                      {documentReviews.map((doc: any) => {
                        const edit = documentReviewEdits[doc.id] || {}
                        const busy = integrationLoading === `review-${doc.id}`
                        return (
                          <div key={doc.id} className="border border-[rgba(29,31,32,0.16)] rounded-xl p-3 space-y-3">
                            <div className="flex flex-wrap items-start gap-2">
                              <div className="flex-1 min-w-[220px]">
                                <p className="font-bold text-sm text-[#1d1f20]">{doc.sourceFileName || doc.workerName || '서류'}</p>
                                <p className="text-[11px] text-[rgba(29,31,32,0.55)]">
                                  {doc.status} · {doc.documentType} · 신뢰도 {doc.confidence == null ? '-' : `${Math.round(doc.confidence * 100)}%`}
                                </p>
                              </div>
                              {doc.driveFileUrl && (
                                <a href={doc.driveFileUrl} target="_blank" className="text-xs font-bold text-[#0284c7] border border-[#0284c7]/30 rounded px-2 py-1">
                                  원본 열기
                                </a>
                              )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                              <select
                                value={edit.workerId || ''}
                                onChange={e => {
                                  const worker = workerOptions.find(w => w.id === e.target.value)
                                  patchDocumentReview(doc.id, {
                                    workerId: e.target.value,
                                    ...(worker ? {
                                      workerName: worker.name || edit.workerName,
                                      birthYYMMDD: worker.birthYYMMDD || edit.birthYYMMDD,
                                      bankName: worker.bankName || edit.bankName,
                                      accountNumber: worker.accountNumber || edit.accountNumber,
                                      safetyEduNumber: worker.safetyEduNumber || edit.safetyEduNumber,
                                    } : {}),
                                  })
                                }}
                                className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-sm"
                              >
                                <option value="">근로자 선택/신규</option>
                                {workerOptions.filter(w => w.isActive).map(w => (
                                  <option key={w.id} value={w.id}>{w.name}{w.birthYYMMDD ? `_${w.birthYYMMDD}` : ''}</option>
                                ))}
                              </select>
                              <input value={edit.workerName || ''} onChange={e => patchDocumentReview(doc.id, { workerName: e.target.value })} placeholder="이름" className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-sm" />
                              <input value={edit.birthYYMMDD || ''} onChange={e => patchDocumentReview(doc.id, { birthYYMMDD: e.target.value.replace(/[^\d]/g, '').slice(0, 6) })} placeholder="생년월일 6자리" className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-sm" />
                              <select value={edit.documentType || 'OTHER'} onChange={e => patchDocumentReview(doc.id, { documentType: e.target.value })} className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-sm">
                                <option value="ID_CARD">신분증</option>
                                <option value="DRIVER_LICENSE">운전면허증</option>
                                <option value="BANKBOOK">통장사본</option>
                                <option value="SAFETY_EDU">안전교육증</option>
                                <option value="OTHER">기타</option>
                              </select>
                              <input value={edit.bankName || ''} onChange={e => patchDocumentReview(doc.id, { bankName: e.target.value })} placeholder="은행" className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-sm" />
                              <input value={edit.accountNumber || ''} onChange={e => patchDocumentReview(doc.id, { accountNumber: e.target.value })} placeholder="계좌번호" className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-sm md:col-span-2" />
                              <input value={edit.safetyEduNumber || ''} onChange={e => patchDocumentReview(doc.id, { safetyEduNumber: e.target.value })} placeholder="안전교육번호" className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-sm" />
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <label className="flex items-center gap-2 text-xs text-[rgba(29,31,32,0.55)]">
                                <input type="checkbox" checked={!!edit.safetyEduComplete} onChange={e => patchDocumentReview(doc.id, { safetyEduComplete: e.target.checked })} className="accent-[#5980a6]" />
                                안전교육 이수
                              </label>
                              <input value={edit.note || ''} onChange={e => patchDocumentReview(doc.id, { note: e.target.value })} placeholder="검수 메모" className="flex-1 min-w-[180px] bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-sm" />
                              <button onClick={() => handleSaveDocumentReview(doc.id, false)} disabled={busy} className="px-3 py-2 rounded-lg border border-[rgba(29,31,32,0.55)]/30 text-[rgba(29,31,32,0.55)] text-sm font-bold disabled:opacity-50">
                                저장
                              </button>
                              <button onClick={() => handleSaveDocumentReview(doc.id, true)} disabled={busy} className="px-3 py-2 rounded-lg bg-[#5980a6] text-white text-sm font-bold disabled:opacity-50">
                                승인
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
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
