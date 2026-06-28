'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  getWorkers, createWorker, updateWorker, deleteWorker,
  getAttendanceByDate, setAttendanceVerify,
  uploadImage,
} from '@/lib/actions'
import { preloadFaceModels, getDescriptor } from '@/lib/face'
import {
  ChevronLeft, UserPlus, Camera, Trash2, Pencil, Check, X, ShieldCheck,
  Clock, MapPin, AlertTriangle, Loader2, CheckCircle2, Users, CalendarDays,
} from 'lucide-react'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function optimizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const max = 720
        let { width, height } = img
        if (width > height && width > max) { height = (height * max) / width; width = max }
        else if (height > max) { width = (width * max) / height; height = max }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.onerror = reject
      img.src = e.target?.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(','); const mime = arr[0].match(/:(.*?);/)![1]
  const bstr = atob(arr[1]); let n = bstr.length; const u8 = new Uint8Array(n)
  while (n--) u8[n] = bstr.charCodeAt(n)
  return new Blob([u8], { type: mime })
}

const EMPTY = { name: '', phone: '', company: '', jobType: '', birthDate: '', gender: '', safetyEduDate: '', basicSafetyEdu: false }

function VerifyBadge({ status }: { status: string }) {
  const map: any = {
    AUTO: ['자동확인', 'bg-[#556b2f]/10 text-[#556b2f]'],
    CONFIRMED: ['관리자확인', 'bg-[#556b2f]/10 text-[#556b2f]'],
    REVIEW: ['확인필요', 'bg-[#d97706]/10 text-[#d97706]'],
    REJECTED: ['반려', 'bg-red-500/10 text-red-600'],
  }
  const [label, cls] = map[status] || map.REVIEW
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
}

export default function WorkersPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'workers' | 'attendance'>('workers')
  const [workers, setWorkers] = useState<any[]>([])
  const [modelReady, setModelReady] = useState(false)

  // 등록 폼
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<any>({ ...EMPTY })
  const [facePhoto, setFacePhoto] = useState<string | null>(null)
  const [faceDesc, setFaceDesc] = useState<number[] | null>(null)
  const [faceState, setFaceState] = useState<'none' | 'detecting' | 'ok' | 'fail'>('none')
  const [saving, setSaving] = useState(false)
  const faceRef = useRef<HTMLInputElement>(null)

  // 출퇴근
  const [attDate, setAttDate] = useState(todayStr())
  const [records, setRecords] = useState<any[]>([])
  const [loadingAtt, setLoadingAtt] = useState(false)

  useEffect(() => { loadWorkers(); preloadFaceModels().then(setModelReady) }, [])
  useEffect(() => { if (tab === 'attendance') loadAttendance() }, [tab, attDate])

  async function loadWorkers() {
    try { setWorkers(await getWorkers(true)) } catch (e) { console.error(e) }
  }
  async function loadAttendance() {
    setLoadingAtt(true)
    try { setRecords(await getAttendanceByDate(attDate)) } catch (e) { console.error(e) } finally { setLoadingAtt(false) }
  }

  function openCreate() { setEditId(null); setForm({ ...EMPTY }); setFacePhoto(null); setFaceDesc(null); setFaceState('none'); setShowForm(true) }
  function openEdit(w: any) {
    setEditId(w.id)
    setForm({
      name: w.name || '', phone: w.phone || '', company: w.company || '', jobType: w.jobType || '',
      birthDate: w.birthDate ? w.birthDate.slice(0, 10) : '', gender: w.gender || '',
      safetyEduDate: w.safetyEduDate ? w.safetyEduDate.slice(0, 10) : '', basicSafetyEdu: !!w.basicSafetyEdu,
    })
    setFacePhoto(w.photoUrl || null)
    setFaceDesc(Array.isArray(w.faceDescriptor) ? w.faceDescriptor : null)
    setFaceState(Array.isArray(w.faceDescriptor) ? 'ok' : 'none')
    setShowForm(true)
  }

  async function onFace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    const dataUrl = await optimizeImage(file)
    setFacePhoto(dataUrl); setFaceState('detecting'); setFaceDesc(null)
    const desc = await getDescriptor(dataUrl)
    if (desc) { setFaceDesc(desc); setFaceState('ok') }
    else { setFaceState('fail') }
  }

  async function save() {
    if (!form.name.trim()) { alert('이름을 입력하세요.'); return }
    setSaving(true)
    try {
      let photoUrl: string | null = facePhoto
      // 새로 찍은 사진(dataURL)이면 업로드
      if (facePhoto && facePhoto.startsWith('data:')) {
        photoUrl = await uploadImage(facePhoto, 'worker')
      }
      const payload: any = {
        name: form.name.trim(), phone: form.phone, company: form.company, jobType: form.jobType,
        birthDate: form.birthDate || null, gender: form.gender,
        safetyEduDate: form.safetyEduDate || null, basicSafetyEdu: form.basicSafetyEdu,
        photoUrl, faceDescriptor: faceDesc,
      }
      if (editId) await updateWorker(editId, payload)
      else await createWorker(payload)
      setShowForm(false)
      loadWorkers()
    } catch (err: any) {
      alert(err?.message || '저장 실패')
    } finally { setSaving(false) }
  }

  async function remove(id: string) {
    if (!confirm('이 근로자를 삭제할까요? 출퇴근 기록도 함께 삭제됩니다.')) return
    try { await deleteWorker(id); loadWorkers() } catch (e: any) { alert(e?.message) }
  }

  async function verify(id: string, status: string) {
    try { await setAttendanceVerify(id, status); loadAttendance() } catch (e: any) { alert(e?.message) }
  }

  const fmtTime = (t: string | null) => t ? new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div className="min-h-screen bg-[#f9f9f9] text-[#1a1c1c]">
      <input ref={faceRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onFace} />

      <header className="sticky top-0 z-10 bg-[#f9f9f9] border-b border-[#e5e5e5] px-4 h-14 flex items-center gap-2">
        <button onClick={() => router.push('/')} className="p-2 -ml-2 text-[#737373]"><ChevronLeft className="w-5 h-5" /></button>
        <h1 className="font-bold text-[#556b2f]">근로자 · 출퇴근 관리</h1>
        <span className="ml-auto text-[11px] text-[#737373] flex items-center gap-1">
          {modelReady ? <><ShieldCheck className="w-3.5 h-3.5 text-[#556b2f]" /> 얼굴인식 준비</> : <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 로딩</>}
        </span>
      </header>

      {/* 탭 */}
      <div className="max-w-3xl mx-auto px-4 pt-3 flex gap-4 border-b border-[#e5e5e5]">
        <button onClick={() => setTab('workers')} className={`pb-2 text-sm font-semibold flex items-center gap-1.5 ${tab === 'workers' ? 'text-[#556b2f] border-b-2 border-[#556b2f]' : 'text-[#737373]'}`}><Users className="w-4 h-4" /> 근로자</button>
        <button onClick={() => setTab('attendance')} className={`pb-2 text-sm font-semibold flex items-center gap-1.5 ${tab === 'attendance' ? 'text-[#556b2f] border-b-2 border-[#556b2f]' : 'text-[#737373]'}`}><CalendarDays className="w-4 h-4" /> 출퇴근 현황</button>
      </div>

      <main className="max-w-3xl mx-auto p-4 space-y-3 pb-24">
        {tab === 'workers' && (
          <>
            {!showForm && (
              <button onClick={openCreate} className="w-full bg-[#556b2f] text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2">
                <UserPlus className="w-5 h-5" /> 근로자 등록
              </button>
            )}

            {showForm && (
              <div className="bg-white border border-[#e5e5e5] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold">{editId ? '근로자 수정' : '근로자 등록'}</h2>
                  <button onClick={() => setShowForm(false)} className="text-[#737373]"><X className="w-5 h-5" /></button>
                </div>

                {/* 얼굴 등록 */}
                <div className="flex items-center gap-3">
                  <div className="w-20 h-20 rounded-xl bg-[#f3f3f3] border border-[#e5e5e5] overflow-hidden flex items-center justify-center shrink-0">
                    {facePhoto ? <img src={facePhoto} alt="얼굴" className="w-full h-full object-cover" /> : <Camera className="w-6 h-6 text-[#737373]" />}
                  </div>
                  <div className="flex-1">
                    <button onClick={() => faceRef.current?.click()} className="border border-[#556b2f] text-[#556b2f] px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1">
                      <Camera className="w-4 h-4" /> 얼굴 촬영
                    </button>
                    <div className="text-[11px] mt-1.5">
                      {faceState === 'detecting' && <span className="text-[#737373] flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> 얼굴 인식 중…</span>}
                      {faceState === 'ok' && <span className="text-[#556b2f] flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> 얼굴 등록됨 (자동매칭 가능)</span>}
                      {faceState === 'fail' && <span className="text-[#d97706] flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> 얼굴 미인식 — 사진은 저장되나 자동매칭 불가. 다시 촬영 권장</span>}
                      {faceState === 'none' && <span className="text-[#737373]">정면·밝은 곳에서 촬영하세요</span>}
                    </div>
                  </div>
                </div>

                {/* 인적사항 */}
                <div className="grid grid-cols-2 gap-2">
                  <Field label="이름*"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} /></Field>
                  <Field label="연락처"><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} inputMode="tel" className={inputCls} /></Field>
                  <Field label="소속 업체"><input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className={inputCls} /></Field>
                  <Field label="직종/공종"><input value={form.jobType} onChange={e => setForm({ ...form, jobType: e.target.value })} className={inputCls} /></Field>
                  <Field label="성별">
                    <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })} className={inputCls}>
                      <option value="">선택</option><option value="남">남</option><option value="여">여</option>
                    </select>
                  </Field>
                  <div className="col-span-2">
                    <Field label="생년월일">
                      <BirthdayPicker value={form.birthDate} onChange={(v: string) => setForm({ ...form, birthDate: v })} />
                    </Field>
                  </div>
                  <Field label="안전교육 이수일"><input type="date" value={form.safetyEduDate} onChange={e => setForm({ ...form, safetyEduDate: e.target.value })} className={inputCls} /></Field>
                  <Field label="기초안전보건교육">
                    <label className="flex items-center gap-2 h-[42px] px-1">
                      <input type="checkbox" checked={form.basicSafetyEdu} onChange={e => setForm({ ...form, basicSafetyEdu: e.target.checked })} className="w-5 h-5 accent-[#556b2f]" />
                      <span className="text-sm text-[#737373]">이수함</span>
                    </label>
                  </Field>
                </div>

                <button onClick={save} disabled={saving} className="w-full bg-[#556b2f] text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-1 disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} 저장
                </button>
              </div>
            )}

            {/* 목록 */}
            <div className="space-y-2">
              {workers.map(w => (
                <div key={w.id} className={`bg-white border border-[#e5e5e5] rounded-xl p-3 flex items-center gap-3 ${!w.isActive ? 'opacity-50' : ''}`}>
                  <div className="w-12 h-12 rounded-full bg-[#f3f3f3] overflow-hidden shrink-0 flex items-center justify-center">
                    {w.photoUrl ? <img src={w.photoUrl} alt={w.name} className="w-full h-full object-cover" /> : <Users className="w-5 h-5 text-[#737373]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold truncate">{w.name}</span>
                      {Array.isArray(w.faceDescriptor) && <ShieldCheck className="w-3.5 h-3.5 text-[#556b2f]" />}
                      {w.basicSafetyEdu && <span className="text-[9px] bg-[#556b2f]/10 text-[#556b2f] px-1.5 py-0.5 rounded">안전교육</span>}
                    </div>
                    <div className="text-xs text-[#737373] truncate">
                      {[w.company, w.jobType, w.phone].filter(Boolean).join(' · ') || '정보 없음'}
                    </div>
                  </div>
                  <button onClick={() => openEdit(w)} className="p-2 text-[#737373] hover:text-[#556b2f]"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(w.id)} className="p-2 text-[#737373] hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              {workers.length === 0 && <div className="text-center text-sm text-[#737373] py-8">등록된 근로자가 없습니다.</div>}
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

            {loadingAtt ? (
              <div className="text-center py-8 text-[#737373]"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
            ) : records.length === 0 ? (
              <div className="text-center text-sm text-[#737373] py-8">해당 날짜 출퇴근 기록이 없습니다.</div>
            ) : (
              <div className="space-y-2">
                {records.map(r => {
                  const w = r.Worker || {}
                  return (
                    <div key={r.id} className="bg-white border border-[#e5e5e5] rounded-xl p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{w.name || '(삭제됨)'}</span>
                        <VerifyBadge status={r.verifyStatus} />
                        {r.checkInScore != null && (
                          <span className="text-[10px] text-[#737373]">유사도 {Math.round(r.checkInScore * 100)}%</span>
                        )}
                        <span className="ml-auto text-[11px] text-[#737373]">{r.siteName || ''}</span>
                      </div>

                      <div className="mt-2 flex gap-3">
                        {/* 출근 */}
                        <div className="flex-1">
                          <div className="text-[10px] text-[#737373] mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> 출근 {fmtTime(r.checkInAt)}</div>
                          {r.checkInPhotoUrl
                            ? <img src={r.checkInPhotoUrl} alt="출근" className="w-full h-24 object-cover rounded-lg border border-[#e5e5e5]" />
                            : <div className="w-full h-24 bg-[#f3f3f3] rounded-lg flex items-center justify-center text-[10px] text-[#737373]">사진 없음</div>}
                          {(r.checkInLat != null) && <div className="text-[9px] text-[#737373] mt-1 flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{r.checkInLat.toFixed(4)},{r.checkInLng?.toFixed(4)}</div>}
                        </div>
                        {/* 퇴근 */}
                        <div className="flex-1">
                          <div className="text-[10px] text-[#737373] mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> 퇴근 {fmtTime(r.checkOutAt)}</div>
                          {r.checkOutPhotoUrl
                            ? <img src={r.checkOutPhotoUrl} alt="퇴근" className="w-full h-24 object-cover rounded-lg border border-[#e5e5e5]" />
                            : <div className="w-full h-24 bg-[#f3f3f3] rounded-lg flex items-center justify-center text-[10px] text-[#737373]">미퇴근</div>}
                          {r.workMinutes != null && <div className="text-[9px] text-[#556b2f] mt-1 font-semibold">근무 {Math.floor(r.workMinutes / 60)}시간 {r.workMinutes % 60}분</div>}
                        </div>
                      </div>

                      <div className="mt-2 flex gap-2">
                        <button onClick={() => verify(r.id, 'CONFIRMED')} className="flex-1 text-xs border border-[#556b2f] text-[#556b2f] py-1.5 rounded-lg font-medium flex items-center justify-center gap-1"><Check className="w-3.5 h-3.5" /> 확인</button>
                        <button onClick={() => verify(r.id, 'REJECTED')} className="flex-1 text-xs border border-[#e5e5e5] text-red-600 py-1.5 rounded-lg font-medium flex items-center justify-center gap-1"><X className="w-3.5 h-3.5" /> 반려</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

const inputCls = 'w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded-lg px-3 py-2.5 outline-none focus:border-[#556b2f] text-sm'

// 고령 작업자도 쉽게 — 연/월/일 드롭다운(연도는 최근→과거)
function BirthdayPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [y, setY] = useState('')
  const [m, setM] = useState('')
  const [d, setD] = useState('')
  useEffect(() => {
    if (value) {
      const [a, b, c] = value.split('-')
      setY(a || ''); setM(b ? String(parseInt(b)) : ''); setD(c ? String(parseInt(c)) : '')
    } else { setY(''); setM(''); setD('') }
  }, [value])

  const nowY = new Date().getFullYear()
  const years: number[] = []
  for (let yr = nowY; yr >= 1940; yr--) years.push(yr)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const maxDay = (y && m) ? new Date(parseInt(y), parseInt(m), 0).getDate() : 31
  const days = Array.from({ length: maxDay }, (_, i) => i + 1)

  const emit = (ny: string, nm: string, nd: string) => {
    if (ny && nm && nd) onChange(`${ny}-${nm.padStart(2, '0')}-${nd.padStart(2, '0')}`)
    else onChange('')
  }
  const sel = inputCls + ' appearance-none text-center'
  return (
    <div className="flex gap-2">
      <select value={y} onChange={e => { setY(e.target.value); emit(e.target.value, m, d) }} className={sel + ' flex-[1.3]'}>
        <option value="">년</option>
        {years.map(yr => <option key={yr} value={yr}>{yr}년</option>)}
      </select>
      <select value={m} onChange={e => { setM(e.target.value); emit(y, e.target.value, d) }} className={sel}>
        <option value="">월</option>
        {months.map(mm => <option key={mm} value={mm}>{mm}월</option>)}
      </select>
      <select value={d} onChange={e => { setD(e.target.value); emit(y, m, e.target.value) }} className={sel}>
        <option value="">일</option>
        {days.map(dd => <option key={dd} value={dd}>{dd}일</option>)}
      </select>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-[#737373]">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  )
}
