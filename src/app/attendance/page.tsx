'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getSites, getWorkers, checkIn, checkOut } from '@/lib/actions'
import { supabase } from '@/lib/supabase'
import { preloadFaceModels, getDescriptor, bestMatch, MATCH_DISTANCE_THRESHOLD } from '@/lib/face'
import { Camera, MapPin, CheckCircle2, LogIn, LogOut, ChevronLeft, UserCheck, AlertTriangle, Loader2 } from 'lucide-react'

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
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)
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
  const arr = dataurl.split(',')
  const mime = arr[0].match(/:(.*?);/)![1]
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8 = new Uint8Array(n)
  while (n--) u8[n] = bstr.charCodeAt(n)
  return new Blob([u8], { type: mime })
}

export default function AttendancePage() {
  const router = useRouter()
  const [sites, setSites] = useState<any[]>([])
  const [workers, setWorkers] = useState<any[]>([])
  const [siteId, setSiteId] = useState('')
  const [mode, setMode] = useState<'in' | 'out'>('in')
  const [photo, setPhoto] = useState<string | null>(null)
  const [matching, setMatching] = useState(false)
  const [matchedId, setMatchedId] = useState('')
  const [score, setScore] = useState<number | null>(null)
  const [autoVerified, setAutoVerified] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<any>(null)
  const [modelReady, setModelReady] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [s, w] = await Promise.all([getSites(), getWorkers()])
        setSites(s)
        setWorkers(w)
        const saved = localStorage.getItem('att_site')
        if (saved && s.find((x: any) => x.id === saved)) setSiteId(saved)
        else if (s.length) setSiteId(s[0].id)
      } catch (e) { console.error(e) }
    })()
    preloadFaceModels().then(setModelReady)
  }, [])

  function startCapture(m: 'in' | 'out') {
    setMode(m)
    setPhoto(null); setMatchedId(''); setScore(null); setAutoVerified(false); setDone(null)
    fileRef.current?.click()
    // GPS는 가능하면 백그라운드로 수집 (HTTP에서는 차단될 수 있음)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => setCoords(null),
        { enableHighAccuracy: true, timeout: 8000 },
      )
    }
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const dataUrl = await optimizeImage(file)
      setPhoto(dataUrl)
      setMatching(true)
      const desc = await getDescriptor(dataUrl)
      const res = bestMatch(desc, workers)
      setMatching(false)
      if (res.worker) {
        setMatchedId(res.worker.id)
        setScore(res.score)
        setAutoVerified(res.distance <= MATCH_DISTANCE_THRESHOLD)
      } else {
        setMatchedId('')
        setScore(null)
        setAutoVerified(false)
      }
    } catch (err) {
      console.error(err)
      setMatching(false)
    }
  }

  async function submit() {
    if (!matchedId) { alert('근로자를 선택해 주세요.'); return }
    if (!photo) { alert('사진을 먼저 촬영해 주세요.'); return }
    setSubmitting(true)
    try {
      const worker = workers.find(w => w.id === matchedId)
      const site = sites.find(s => s.id === siteId)
      // 사진 업로드
      const fileName = `attendance/${matchedId}_${mode}_${Date.now()}.jpg`
      const blob = dataURLtoBlob(photo)
      const { error: upErr } = await supabase.storage.from('site-photos').upload(fileName, blob, { contentType: 'image/jpeg' })
      if (upErr) throw new Error(`사진 업로드 실패: ${upErr.message}`)
      const { data: { publicUrl } } = supabase.storage.from('site-photos').getPublicUrl(fileName)

      const date = todayStr()
      if (mode === 'in') {
        const r = await checkIn({
          workerId: matchedId, date, siteId, siteName: site?.name ?? null,
          photoUrl: publicUrl, lat: coords?.lat ?? null, lng: coords?.lng ?? null,
          score, verifyStatus: autoVerified ? 'AUTO' : 'REVIEW',
        })
        if (r.already) { setDone({ type: 'in', already: true, worker, record: r.record }) }
        else { setDone({ type: 'in', worker, record: r.record }) }
      } else {
        const r = await checkOut({
          workerId: matchedId, date,
          photoUrl: publicUrl, lat: coords?.lat ?? null, lng: coords?.lng ?? null, score,
        })
        setDone({ type: 'out', already: r.already, worker, record: r.record })
      }
    } catch (err: any) {
      alert(err?.message || '처리 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const matchedWorker = workers.find(w => w.id === matchedId)

  return (
    <div className="min-h-screen bg-[#f9f9f9] text-[#1a1c1c]">
      <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onPhoto} />

      <header className="sticky top-0 z-10 bg-[#f9f9f9] border-b border-[#e5e5e5] px-4 h-14 flex items-center gap-2">
        <button onClick={() => router.push('/')} className="p-2 -ml-2 text-[#737373]"><ChevronLeft className="w-5 h-5" /></button>
        <h1 className="font-bold text-[#556b2f]">출퇴근 체크</h1>
        <span className="ml-auto text-xs text-[#737373]">{todayStr()}</span>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4 pb-24">
        {/* 현장 선택 */}
        <div className="bg-white border border-[#e5e5e5] rounded-xl p-4">
          <label className="text-xs font-semibold text-[#737373] tracking-wide">현장 선택</label>
          <select
            value={siteId}
            onChange={e => { setSiteId(e.target.value); localStorage.setItem('att_site', e.target.value) }}
            className="mt-2 w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded-lg px-3 py-3 outline-none focus:border-[#556b2f]"
          >
            {sites.length === 0 && <option value="">현장 없음</option>}
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-[#737373]">
            {modelReady
              ? <><UserCheck className="w-3.5 h-3.5 text-[#556b2f]" /> 얼굴 자동인식 준비됨</>
              : <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 얼굴 인식 모델 로딩 중…</>}
          </div>
        </div>

        {/* 완료 화면 */}
        {done ? (
          <div className="bg-white border border-[#e5e5e5] rounded-xl p-6 text-center space-y-3">
            <CheckCircle2 className="w-14 h-14 text-[#556b2f] mx-auto" />
            <div className="text-lg font-bold">
              {done.worker?.name} 님 {done.type === 'in' ? '출근' : '퇴근'} 완료
            </div>
            {done.already && <div className="text-sm text-[#d97706]">이미 {done.type === 'in' ? '출근' : '퇴근'} 기록이 있어요.</div>}
            <div className="text-sm text-[#737373]">
              {done.type === 'in'
                ? `출근 ${done.record?.checkInAt ? new Date(done.record.checkInAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : ''}`
                : `퇴근 ${done.record?.checkOutAt ? new Date(done.record.checkOutAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : ''}` +
                  (done.record?.workMinutes != null ? ` · 근무 ${Math.floor(done.record.workMinutes / 60)}시간 ${done.record.workMinutes % 60}분` : '')}
            </div>
            <button onClick={() => { setDone(null); setPhoto(null); setMatchedId('') }} className="mt-2 w-full bg-[#556b2f] text-white font-semibold py-3 rounded-lg">확인</button>
          </div>
        ) : photo ? (
          /* 촬영 후 매칭/확인 */
          <div className="bg-white border border-[#e5e5e5] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <img src={photo} alt="촬영" className="w-24 h-24 rounded-lg object-cover border border-[#e5e5e5]" />
              <div className="flex-1 text-sm">
                {matching ? (
                  <div className="flex items-center gap-2 text-[#737373]"><Loader2 className="w-4 h-4 animate-spin" /> 얼굴 인식 중…</div>
                ) : matchedWorker ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      {autoVerified
                        ? <UserCheck className="w-4 h-4 text-[#556b2f]" />
                        : <AlertTriangle className="w-4 h-4 text-[#d97706]" />}
                      <span className="font-bold">{matchedWorker.name}</span>
                    </div>
                    <div className="text-xs text-[#737373] mt-0.5">
                      유사도 {score != null ? Math.round(score * 100) : 0}% · {autoVerified ? '자동 신원확인' : '수동 확인 필요'}
                    </div>
                  </>
                ) : (
                  <div className="text-[#d97706] text-xs flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> 자동 인식 실패 — 아래에서 본인을 선택하세요</div>
                )}
              </div>
            </div>

            {/* 근로자 선택(매칭 보정/수동) */}
            <div>
              <label className="text-xs font-semibold text-[#737373]">본인 확인</label>
              <select value={matchedId} onChange={e => { setMatchedId(e.target.value); setAutoVerified(false) }}
                className="mt-1 w-full bg-[#f3f3f3] border border-[#e5e5e5] rounded-lg px-3 py-3 outline-none focus:border-[#556b2f]">
                <option value="">— 근로자 선택 —</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name}{w.company ? ` (${w.company})` : ''}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-1 text-[11px] text-[#737373]">
              <MapPin className="w-3.5 h-3.5" />
              {coords ? `위치 ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : '위치 정보 없음(HTTP 환경)'}
            </div>

            <div className="flex gap-2">
              <button onClick={() => startCapture(mode)} className="flex-1 border border-[#e5e5e5] text-[#737373] py-3 rounded-lg font-medium flex items-center justify-center gap-1">
                <Camera className="w-4 h-4" /> 다시 촬영
              </button>
              <button onClick={submit} disabled={submitting || !matchedId}
                className="flex-1 bg-[#556b2f] text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-1 disabled:opacity-40">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (mode === 'in' ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />)}
                {mode === 'in' ? '출근 확정' : '퇴근 확정'}
              </button>
            </div>
          </div>
        ) : (
          /* 초기: 출근/퇴근 버튼 */
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => startCapture('in')} disabled={!siteId}
              className="bg-white border-2 border-[#556b2f] rounded-2xl p-6 flex flex-col items-center gap-2 active:scale-95 transition disabled:opacity-40">
              <div className="w-14 h-14 rounded-full bg-[#556b2f]/10 flex items-center justify-center"><LogIn className="w-7 h-7 text-[#556b2f]" /></div>
              <span className="font-bold text-[#556b2f]">출근</span>
              <span className="text-[11px] text-[#737373]">셀카 촬영</span>
            </button>
            <button onClick={() => startCapture('out')} disabled={!siteId}
              className="bg-white border border-[#e5e5e5] rounded-2xl p-6 flex flex-col items-center gap-2 active:scale-95 transition disabled:opacity-40">
              <div className="w-14 h-14 rounded-full bg-[#f3f3f3] flex items-center justify-center"><LogOut className="w-7 h-7 text-[#737373]" /></div>
              <span className="font-bold text-[#1a1c1c]">퇴근</span>
              <span className="text-[11px] text-[#737373]">셀카 촬영</span>
            </button>
          </div>
        )}

        {workers.length === 0 && (
          <div className="text-center text-xs text-[#737373] bg-[#f3f3f3] border border-[#e5e5e5] rounded-lg p-3">
            등록된 근로자가 없습니다. 관리자 화면에서 먼저 근로자를 등록하세요.
          </div>
        )}
      </main>
    </div>
  )
}
