'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createWorker,
  deleteWorker,
  getAttendanceByDate,
  getCurrentUser,
  getWorkers,
  mergeWorkers,
  setAttendanceVerify,
  updateWorker,
} from '@/lib/actions'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  Loader2,
  Pencil,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'

const inputCls = 'w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded-lg px-3 py-2.5 outline-none focus:border-[#556b2f] text-sm'

const EMPTY = {
  name: '',
  phone: '',
  company: '',
  jobType: '',
  birthDate: '',
  birthYYMMDD: '',
  gender: '',
  safetyEduDate: '',
  safetyEduNumber: '',
  bankName: '',
  accountNumber: '',
  basicSafetyEdu: false,
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-[#737373]">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  )
}

function statusLabel(status?: string) {
  switch (status) {
    case 'COMPLETE':
      return '서류완비'
    case 'REVIEW':
      return '검토필요'
    case 'INCOMPLETE':
      return '미비'
    case 'MERGED':
      return '병합됨'
    default:
      return '확인필요'
  }
}

export default function WorkersPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [tab, setTab] = useState<'workers' | 'attendance'>('workers')
  const [workers, setWorkers] = useState<any[]>([])
  const [records, setRecords] = useState<any[]>([])
  const [attDate, setAttDate] = useState(todayStr())
  const [loading, setLoading] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<any>({ ...EMPTY })
  const [saving, setSaving] = useState(false)

  const [mergeMode, setMergeMode] = useState(false)
  const [mergeTargetId, setMergeTargetId] = useState('')
  const [mergeSourceIds, setMergeSourceIds] = useState<string[]>([])
  const [merging, setMerging] = useState(false)

  useEffect(() => {
    ;(async () => {
      const user = await getCurrentUser()
      if (!user || user.role !== 'ADMIN') {
        router.push('/login')
        return
      }
      setCurrentUser(user)
      await loadWorkers()
    })()
  }, [])

  useEffect(() => {
    if (tab === 'attendance') loadAttendance()
  }, [tab, attDate])

  async function loadWorkers() {
    setLoading(true)
    try {
      setWorkers(await getWorkers(true))
    } finally {
      setLoading(false)
    }
  }

  async function loadAttendance() {
    setLoading(true)
    try {
      setRecords(await getAttendanceByDate(attDate))
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setEditId(null)
    setForm({ ...EMPTY })
    setShowForm(true)
  }

  function openEdit(worker: any) {
    setEditId(worker.id)
    setForm({
      name: worker.name || '',
      phone: worker.phone || '',
      company: worker.company || '',
      jobType: worker.jobType || '',
      birthDate: worker.birthDate ? new Date(worker.birthDate).toISOString().slice(0, 10) : '',
      birthYYMMDD: worker.birthYYMMDD || '',
      gender: worker.gender || '',
      safetyEduDate: worker.safetyEduDate ? new Date(worker.safetyEduDate).toISOString().slice(0, 10) : '',
      safetyEduNumber: worker.safetyEduNumber || '',
      bankName: worker.bankName || '',
      accountNumber: worker.accountNumber || '',
      basicSafetyEdu: !!worker.basicSafetyEdu,
    })
    setShowForm(true)
  }

  async function saveWorker() {
    if (!form.name.trim()) {
      alert('이름을 입력하세요.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        birthDate: form.birthDate || null,
        safetyEduDate: form.safetyEduDate || null,
      }
      if (editId) await updateWorker(editId, payload)
      else await createWorker(payload)
      setShowForm(false)
      await loadWorkers()
    } catch (error: any) {
      alert(error?.message || '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function removeWorker(id: string) {
    if (!confirm('이 근로자를 삭제할까요? 연결된 출근 기록도 삭제될 수 있습니다.')) return
    try {
      await deleteWorker(id)
      await loadWorkers()
    } catch (error: any) {
      alert(error?.message || '삭제에 실패했습니다.')
    }
  }

  function closeMergeMode() {
    setMergeMode(false)
    setMergeTargetId('')
    setMergeSourceIds([])
  }

  function toggleMergeSource(id: string) {
    setMergeSourceIds(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id])
  }

  async function runMerge() {
    if (!mergeTargetId || mergeSourceIds.length === 0) {
      alert('기준 근로자와 병합할 근로자를 선택하세요.')
      return
    }
    const target = workers.find(w => w.id === mergeTargetId)
    const sources = workers.filter(w => mergeSourceIds.includes(w.id))
    if (!confirm(`${sources.map(w => w.name).join(', ')} 기록을 ${target?.name || '기준 근로자'}에게 병합할까요? 병합된 근로자는 비활성화됩니다.`)) return

    setMerging(true)
    try {
      const result = await mergeWorkers(mergeTargetId, mergeSourceIds)
      closeMergeMode()
      await loadWorkers()
      const driveNote = result.driveMoveErrors?.length
        ? `Drive 이동 오류: ${result.driveMoveErrors.join(', ')}`
        : `Drive 파일 이동: ${result.driveMovedCount || 0}개 / 중복 폴더 정리: ${result.driveTrashedFolderCount || 0}개`
      alert(`근로자 병합이 완료되었습니다.\n${driveNote}`)
    } catch (error: any) {
      alert(error?.message || '근로자 병합에 실패했습니다.')
    } finally {
      setMerging(false)
    }
  }

  async function verifyAttendance(id: string, status: string) {
    try {
      await setAttendanceVerify(id, status)
      await loadAttendance()
    } catch (error: any) {
      alert(error?.message || '상태 변경에 실패했습니다.')
    }
  }

  return (
    <div className="min-h-screen bg-[#f9f9f9] text-[#1a1c1c]">
      <header className="sticky top-0 z-10 bg-[#f9f9f9] border-b border-[#e5e5e5] px-4 h-14 flex items-center gap-2">
        <button onClick={() => router.push('/')} className="p-2 -ml-2 text-[#737373]" title="뒤로">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-[#556b2f]">근로자 관리</h1>
        <span className="ml-auto text-xs text-[#737373]">{currentUser?.name}</span>
      </header>

      <div className="max-w-4xl mx-auto px-4 pt-3 flex gap-4 border-b border-[#e5e5e5]">
        <button onClick={() => setTab('workers')} className={`pb-2 text-sm font-semibold flex items-center gap-1.5 ${tab === 'workers' ? 'text-[#556b2f] border-b-2 border-[#556b2f]' : 'text-[#737373]'}`}>
          <Users className="w-4 h-4" /> 근로자
        </button>
        <button onClick={() => setTab('attendance')} className={`pb-2 text-sm font-semibold flex items-center gap-1.5 ${tab === 'attendance' ? 'text-[#556b2f] border-b-2 border-[#556b2f]' : 'text-[#737373]'}`}>
          <CalendarDays className="w-4 h-4" /> 출퇴근 현황
        </button>
      </div>

      <main className="max-w-4xl mx-auto p-4 space-y-3 pb-24">
        {tab === 'workers' && (
          <>
            {!showForm && (
              <button onClick={openCreate} className="w-full bg-[#556b2f] text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2">
                <UserPlus className="w-5 h-5" /> 근로자 등록
              </button>
            )}

            {!showForm && (
              <div className="bg-white border border-[#e5e5e5] rounded-xl p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="font-bold text-sm">중복 근로자 병합</div>
                    <div className="text-xs text-[#737373]">AI가 같은 사람을 여러 명으로 분류했을 때 기록과 Drive 파일을 기준 근로자에게 합칩니다.</div>
                  </div>
                  {mergeMode ? (
                    <button onClick={closeMergeMode} className="px-3 py-2 rounded-lg border border-[#e5e5e5] text-sm font-semibold text-[#737373]">취소</button>
                  ) : (
                    <button onClick={() => setMergeMode(true)} className="px-3 py-2 rounded-lg border border-[#556b2f] text-sm font-semibold text-[#556b2f]">병합</button>
                  )}
                </div>
                {mergeMode && (
                  <div className="space-y-2">
                    <select value={mergeTargetId} onChange={e => { setMergeTargetId(e.target.value); setMergeSourceIds(prev => prev.filter(id => id !== e.target.value)) }} className={inputCls}>
                      <option value="">기준 근로자 선택</option>
                      {workers.filter(w => w.isActive).map(w => (
                        <option key={w.id} value={w.id}>{w.name}{w.birthYYMMDD ? `_${w.birthYYMMDD}` : ''}</option>
                      ))}
                    </select>
                    <div className="text-xs text-[#737373]">아래 목록에서 기준 근로자에게 합칠 중복 항목을 체크하세요.</div>
                    <button onClick={runMerge} disabled={merging || !mergeTargetId || mergeSourceIds.length === 0} className="w-full bg-[#1a1c1c] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40">
                      {merging ? '병합 중...' : `${mergeSourceIds.length}명 병합 실행`}
                    </button>
                  </div>
                )}
              </div>
            )}

            {showForm && (
              <div className="bg-white border border-[#e5e5e5] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold">{editId ? '근로자 수정' : '근로자 등록'}</h2>
                  <button onClick={() => setShowForm(false)} className="text-[#737373]" title="닫기"><X className="w-5 h-5" /></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Field label="이름*"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} /></Field>
                  <Field label="연락처"><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputCls} /></Field>
                  <Field label="소속 업체"><input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className={inputCls} /></Field>
                  <Field label="직종/공종"><input value={form.jobType} onChange={e => setForm({ ...form, jobType: e.target.value })} className={inputCls} /></Field>
                  <Field label="생년월일"><input type="date" value={form.birthDate} onChange={e => setForm({ ...form, birthDate: e.target.value })} className={inputCls} /></Field>
                  <Field label="생년월일 6자리"><input value={form.birthYYMMDD} onChange={e => setForm({ ...form, birthYYMMDD: e.target.value.replace(/[^\d]/g, '').slice(0, 6) })} className={inputCls} placeholder="예: 650324" /></Field>
                  <Field label="은행"><input value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value })} className={inputCls} /></Field>
                  <Field label="계좌번호"><input value={form.accountNumber} onChange={e => setForm({ ...form, accountNumber: e.target.value })} className={inputCls} /></Field>
                  <Field label="안전교육일"><input type="date" value={form.safetyEduDate} onChange={e => setForm({ ...form, safetyEduDate: e.target.value })} className={inputCls} /></Field>
                  <Field label="안전교육번호"><input value={form.safetyEduNumber} onChange={e => setForm({ ...form, safetyEduNumber: e.target.value })} className={inputCls} /></Field>
                  <label className="flex items-center gap-2 h-[42px] mt-5">
                    <input type="checkbox" checked={form.basicSafetyEdu} onChange={e => setForm({ ...form, basicSafetyEdu: e.target.checked })} className="w-5 h-5 accent-[#556b2f]" />
                    <span className="text-sm text-[#737373]">기초안전보건교육 이수</span>
                  </label>
                </div>
                <button onClick={saveWorker} disabled={saving} className="w-full bg-[#556b2f] text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-1 disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} 저장
                </button>
              </div>
            )}

            <div className="space-y-2">
              {loading && <div className="text-center py-6 text-[#737373]"><Loader2 className="w-5 h-5 animate-spin inline" /></div>}
              {workers.map(worker => (
                <div key={worker.id} className={`bg-white border border-[#e5e5e5] rounded-xl p-3 flex items-center gap-3 ${!worker.isActive ? 'opacity-50' : ''}`}>
                  {mergeMode && (
                    <input
                      type="checkbox"
                      checked={mergeSourceIds.includes(worker.id)}
                      disabled={!worker.isActive || worker.id === mergeTargetId}
                      onChange={() => toggleMergeSource(worker.id)}
                      className="w-5 h-5 accent-[#556b2f] disabled:opacity-30"
                    />
                  )}
                  <div className="w-12 h-12 rounded-full bg-[#f3f3f3] overflow-hidden shrink-0 flex items-center justify-center">
                    {worker.photoUrl ? <img src={worker.photoUrl} alt={worker.name} className="w-full h-full object-cover" /> : <Users className="w-5 h-5 text-[#737373]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold truncate">{worker.name}</span>
                      <span className="text-[10px] bg-[#556b2f]/10 text-[#556b2f] px-1.5 py-0.5 rounded">{statusLabel(worker.documentStatus)}</span>
                    </div>
                    <div className="text-xs text-[#737373] truncate">
                      {[worker.birthYYMMDD, worker.company, worker.jobType, worker.phone].filter(Boolean).join(' · ') || '정보 없음'}
                    </div>
                  </div>
                  <button onClick={() => openEdit(worker)} className="p-2 text-[#737373] hover:text-[#556b2f]" title="수정"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => removeWorker(worker.id)} className="p-2 text-[#737373] hover:text-red-600" title="삭제"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              {!loading && workers.length === 0 && <div className="text-center text-sm text-[#737373] py-8">등록된 근로자가 없습니다.</div>}
            </div>
          </>
        )}

        {tab === 'attendance' && (
          <>
            <div className="flex items-center gap-2">
              <input type="date" value={attDate} onChange={e => setAttDate(e.target.value)} className={inputCls + ' max-w-[180px]'} />
              <span className="text-sm text-[#737373]">{records.length}명 기록</span>
              <button onClick={loadAttendance} className="ml-auto text-xs text-[#556b2f] font-semibold">새로고침</button>
            </div>
            <div className="space-y-2">
              {loading && <div className="text-center py-6 text-[#737373]"><Loader2 className="w-5 h-5 animate-spin inline" /></div>}
              {records.map(record => {
                const worker = record.Worker || {}
                return (
                  <div key={record.id} className="bg-white border border-[#e5e5e5] rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{worker.name || '(삭제됨)'}</span>
                      <span className="text-[10px] bg-[#f3f3f3] text-[#737373] px-1.5 py-0.5 rounded">{record.verifyStatus}</span>
                      <span className="ml-auto text-[11px] text-[#737373]">{record.siteName || ''}</span>
                    </div>
                    <div className="mt-2 text-xs text-[#737373]">
                      출근: {record.checkInAt ? new Date(record.checkInAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      {' / '}
                      퇴근: {record.checkOutAt ? new Date(record.checkOutAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => verifyAttendance(record.id, 'CONFIRMED')} className="flex-1 text-xs border border-[#556b2f] text-[#556b2f] py-1.5 rounded-lg font-medium">확인</button>
                      <button onClick={() => verifyAttendance(record.id, 'REJECTED')} className="flex-1 text-xs border border-[#e5e5e5] text-red-600 py-1.5 rounded-lg font-medium">반려</button>
                    </div>
                  </div>
                )
              })}
              {!loading && records.length === 0 && <div className="text-center text-sm text-[#737373] py-8">해당 날짜 출퇴근 기록이 없습니다.</div>}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
