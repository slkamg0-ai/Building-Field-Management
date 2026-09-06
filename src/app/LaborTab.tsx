'use client'

import { useState, useMemo, useRef } from 'react'
import { addLabor, deleteLabor, searchLabors, copyPreviousDayLabor } from '@/lib/actions'
import { Trash2, Copy, ScanLine, UserPlus, Sparkles, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from '@/components/Toast'

type Props = {
  showAddForm: boolean
  setShowAddForm: (v: boolean) => void
  isAnalyzing: boolean
  analyzeDocument: (file: File, formType: string) => Promise<Record<string, string> | null>
  suggestions: any[]
  setSuggestions: (v: any[]) => void
  logData: any
  loading: boolean
  workerDocMap: Record<string, string>
  currentUser: any
  totalLabors: number
  handleDeleteItem: (deleteFn: (id: string) => Promise<any>, id: string, label: string) => void
  onChanged: () => void
  onOpenSmartScan?: () => void
  selectedSiteId?: string
  currentDate?: string
}

export default function LaborTab({
  showAddForm, setShowAddForm, isAnalyzing, analyzeDocument, suggestions, setSuggestions,
  logData, loading, workerDocMap, currentUser, totalLabors, handleDeleteItem, onChanged,
  onOpenSmartScan, selectedSiteId, currentDate,
}: Props) {
  const [laborForm, setLaborForm] = useState({ workerId: '', name: '', jobType: '', unitPrice: '', amount: '1', note: '' })
  const [isCopying, setIsCopying] = useState(false)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // 디바운스 검색 (250ms)
  const handleLaborNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setLaborForm(prev => ({ ...prev, name: val, workerId: '' }))

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)

    if (val.trim().length >= 1) {
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const res = await searchLabors(val)
          setSuggestions(res)
        } catch {
          setSuggestions([])
        }
      }, 250)
    } else {
      setSuggestions([])
    }
  }

  const selectLaborSuggestion = (s: any) => {
    setLaborForm(prev => ({
      ...prev,
      workerId: s.workerId || '',
      name: s.name,
      jobType: s.jobType,
      unitPrice: s.unitPrice.toString(),
    }))
    setSuggestions([])
  }

  const handleLaborSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!logData || !currentUser) return
    try {
      await addLabor(logData.id, laborForm, currentUser.name)
      toast.success(`노무자 [${laborForm.name}] 투입이 추가되었습니다.`)
      setLaborForm({ workerId: '', name: '', jobType: '', unitPrice: '', amount: '1', note: '' })
      setShowAddForm(false)
      onChanged()
    } catch (err: any) {
      toast.error(err.message || '추가 중 오류가 발생했습니다.')
    }
  }

  // 어제 인원 1-클릭 복제 핸들러
  const handleCopyYesterday = async () => {
    if (!logData?.id || !selectedSiteId || !currentDate) {
      toast.warning('현장 및 날짜 정보를 확인할 수 없습니다.')
      return
    }
    setIsCopying(true)
    try {
      const res = await copyPreviousDayLabor(logData.id, selectedSiteId, currentDate)
      toast.success(`어제 투입 인력 ${res.copiedCount}명을 그대로 복제했습니다.`)
      onChanged()
    } catch (err: any) {
      toast.warning(err.message || '복제할 인력이 없습니다.')
    } finally {
      setIsCopying(false)
    }
  }

  return (
    <>
      {/* ===================== 상단 QUICK ACTION BAR (v2.0) ===================== */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#ededed] border border-[rgba(29,31,32,0.16)] p-2.5 rounded-xl mb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isCopying}
            onClick={handleCopyYesterday}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-[rgba(29,31,32,0.2)] text-[#1d1f20] font-bold rounded-lg text-xs shadow-sm transition-all active:scale-95 disabled:opacity-50"
            title="직전 작업일의 인력 명단을 1공수로 그대로 복사합니다"
          >
            {isCopying ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#5980a6]" /> : <Copy className="w-3.5 h-3.5 text-[#5980a6]" />}
            <span>어제 인원 복사</span>
          </button>

          {onOpenSmartScan && (
            <button
              type="button"
              onClick={onOpenSmartScan}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#5980a6] hover:bg-[#416180] text-white font-bold rounded-lg text-xs shadow-sm transition-all active:scale-95"
            >
              <ScanLine className="w-3.5 h-3.5" />
              <span>원스톱 서류 스캔</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className={`flex items-center gap-1.5 px-3 py-2 font-bold rounded-lg text-xs transition-all ${
            showAddForm
              ? 'bg-[#181a1d] text-white'
              : 'bg-white hover:bg-slate-50 border border-[rgba(29,31,32,0.2)] text-[#1d1f20]'
          }`}
        >
          <UserPlus className="w-3.5 h-3.5 text-[#5980a6]" />
          <span>{showAddForm ? '입력폼 닫기' : '+ 직접 입력'}</span>
        </button>
      </div>

      {/* ===================== 새 노무 인력 수동 추가 폼 ===================== */}
      {showAddForm && (
        <div className="bg-[#ededed] border-2 border-[#5980a6] p-4 rounded-xl mb-4 relative animate-fade-in shadow-xl">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-bold text-[#5980a6] flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">person_add</span> 새 노무 인력 추가
            </h4>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowAddForm(false)} className="text-[rgba(29,31,32,0.6)] hover:text-[#1d1f20]">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleLaborSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3 relative">
            <div className="relative">
              <label className="text-xs font-bold text-[rgba(29,31,32,0.7)] mb-1 block">작업자 이름</label>
              <input
                type="text"
                required
                placeholder="이름 입력 (마스터 자동 검색)"
                className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.25)] rounded-lg px-3 py-2 text-[#1d1f20] font-semibold outline-none focus:border-[#5980a6]"
                value={laborForm.name}
                onChange={handleLaborNameChange}
                autoComplete="off"
              />
              {suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white z-50 border border-[rgba(29,31,32,0.2)] rounded-lg max-h-56 overflow-y-auto shadow-2xl">
                  {suggestions.map((s, i) => (
                    <div
                      key={i}
                      onClick={() => selectLaborSuggestion(s)}
                      className="p-3 border-b border-[rgba(29,31,32,0.1)] hover:bg-[#f2f2f3] cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#1d1f20] text-sm">
                          {s.name}
                          {s.birthYYMMDD && (
                            <span className="text-[11px] text-slate-500 font-normal ml-1.5">
                              ({s.birthYYMMDD.slice(0, 2)}년생)
                            </span>
                          )}
                        </span>
                        <span className="text-xs bg-[#5980a6]/15 text-[#416180] font-bold px-2 py-0.5 rounded">
                          {s.jobType}
                        </span>
                      </div>
                      <div className="text-xs text-[rgba(29,31,32,0.6)] mt-1 font-medium">
                        기준 단가: ₩{s.unitPrice?.toLocaleString()}원
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-[rgba(29,31,32,0.7)] mb-1 block">공종 / 직종</label>
              <input
                type="text"
                required
                className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.25)] rounded-lg px-3 py-2 text-[#1d1f20] font-semibold outline-none focus:border-[#5980a6]"
                value={laborForm.jobType}
                onChange={e => setLaborForm({ ...laborForm, jobType: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[rgba(29,31,32,0.7)] mb-1 block">단가 (원)</label>
              <input
                type="number"
                required
                className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.25)] rounded-lg px-3 py-2 text-[#1d1f20] font-semibold outline-none focus:border-[#5980a6]"
                value={laborForm.unitPrice}
                onChange={e => setLaborForm({ ...laborForm, unitPrice: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[rgba(29,31,32,0.7)] mb-1 block">투입 공수</label>
              <input
                type="number"
                step="0.1"
                required
                className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.25)] rounded-lg px-3 py-2 text-[#1d1f20] font-semibold outline-none focus:border-[#5980a6]"
                value={laborForm.amount}
                onChange={e => setLaborForm({ ...laborForm, amount: e.target.value })}
              />
            </div>

            <div className="md:col-span-2 mt-2">
              <button
                type="submit"
                className="w-full bg-[#5980a6] hover:bg-[#416180] text-white font-bold py-2.5 rounded-lg shadow-sm transition-all active:scale-95 text-sm"
              >
                일보에 노무자 등록하기
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================== 일일 투입 인력 목록 ===================== */}
      <div className="space-y-4">
        <div className="flex justify-between items-center px-2">
          <h3 className="font-bold text-lg text-[#1d1f20]">일일 투입 인력</h3>
          <span className="text-xs font-bold text-[#5980a6] bg-[#5980a6]/15 px-2.5 py-1 rounded-full border border-[#5980a6]/30">
            총 {totalLabors} 활성 공수
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {loading ? (
            <div className="text-center py-10 text-[rgba(29,31,32,0.55)]">데이터를 불러오는 중...</div>
          ) : !logData?.labors || logData.labors.length === 0 ? (
            <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-8 text-center text-[rgba(29,31,32,0.55)]">
              입력된 노무 인력이 없습니다.
              <div className="mt-2 text-xs text-[#5980a6] font-semibold">
                상단의 [어제 인원 복사] 또는 [원스톱 서류 스캔]을 눌러 빠르게 추가하세요.
              </div>
            </div>
          ) : (
            (logData.labors || []).map((labor: any) => {
              const docStatus = workerDocMap[labor.name.trim().toLowerCase()]
              const docWarning = docStatus === undefined ? '근로자 미등록' : docStatus !== 'COMPLETE' ? '서류 미비' : null
              return (
                <div
                  key={labor.id}
                  className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.2)] rounded-xl p-4 flex justify-between items-center hover:border-[#5980a6] transition-colors group"
                >
                  <div className="flex items-center gap-3 w-2/3">
                    <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shrink-0 border border-[rgba(29,31,32,0.1)] shadow-sm">
                      <span className="material-symbols-outlined text-[#0369a1]">engineering</span>
                    </div>
                    <div className="overflow-hidden">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-[#1d1f20] truncate text-sm md:text-base">{labor.name}</h4>
                        {labor.createdBy && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#e2e8f0] text-[rgba(29,31,32,0.65)] font-bold">
                            BY {labor.createdBy}
                          </span>
                        )}
                        {docWarning && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-800 font-bold flex items-center gap-0.5"
                            title="근로자 관리에서 서류를 등록해주세요"
                          >
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            {docWarning}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] md:text-xs text-[rgba(29,31,32,0.7)] font-medium truncate mt-0.5">
                        {labor.jobType} • {labor.amount}공수 • 단가 ₩{labor.unitPrice.toLocaleString()}원
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0 flex items-center gap-3">
                    <div>
                      <p className="text-base md:text-lg font-bold text-[#1d1f20]">
                        ₩{labor.totalPrice.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-emerald-700 font-bold tracking-wider mt-0.5">확인됨</p>
                    </div>
                    <button
                      onClick={() => handleDeleteItem(deleteLabor, labor.id, `노무 (${labor.name})`)}
                      className="p-2 rounded-lg text-[rgba(29,31,32,0.5)] opacity-80 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-600 transition-all"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
