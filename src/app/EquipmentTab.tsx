'use client'

import { useState, useRef } from 'react'
import { addEquipment, deleteEquipment, searchEquipments } from '@/lib/actions'
import { Trash2, ScanLine, Plus, AlertTriangle } from 'lucide-react'
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
  currentUser: any
  totalEquipments: number
  handleDeleteItem: (deleteFn: (id: string) => Promise<any>, id: string, label: string) => void
  onChanged: () => void
  onOpenSmartScan?: () => void
}

export default function EquipmentTab({
  showAddForm, setShowAddForm, isAnalyzing, analyzeDocument, suggestions, setSuggestions,
  logData, loading, currentUser, totalEquipments, handleDeleteItem, onChanged,
  onOpenSmartScan,
}: Props) {
  const [equipmentForm, setEquipmentForm] = useState({
    name: '', spec: '', unitPrice: '', amount: '1', note: '', ownerType: 'SUBCONTRACT', taskDescription: '',
  })
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  const handleEquipmentNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setEquipmentForm(prev => ({ ...prev, name: val }))

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)

    if (val.trim().length >= 1) {
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const res = await searchEquipments(val)
          setSuggestions(res)
        } catch {
          setSuggestions([])
        }
      }, 250)
    } else {
      setSuggestions([])
    }
  }

  const selectEquipmentSuggestion = (s: any) => {
    setEquipmentForm(prev => ({
      ...prev,
      name: s.name,
      spec: s.spec || '',
      unitPrice: s.unitPrice ? s.unitPrice.toString() : prev.unitPrice,
    }))
    setSuggestions([])
  }

  const handleEquipmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!logData || !currentUser) return
    try {
      await addEquipment(logData.id, equipmentForm, currentUser.name)
      toast.success(`장비 [${equipmentForm.name}] 투입이 추가되었습니다.`)
      setEquipmentForm({ name: '', spec: '', unitPrice: '', amount: '1', note: '', ownerType: 'SUBCONTRACT', taskDescription: '' })
      setShowAddForm(false)
      onChanged()
    } catch (err: any) {
      toast.error(err.message || '장비 추가 중 오류가 발생했습니다.')
    }
  }

  return (
    <>
      {/* ===================== 상단 QUICK ACTION BAR ===================== */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#ededed] border border-[rgba(29,31,32,0.16)] p-2.5 rounded-xl mb-4">
        <div className="flex items-center gap-2">
          {onOpenSmartScan && (
            <button
              type="button"
              onClick={onOpenSmartScan}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#5980a6] hover:bg-[#416180] text-white font-bold rounded-lg text-xs shadow-sm transition-all active:scale-95"
            >
              <ScanLine className="w-3.5 h-3.5" />
              <span>장비 서류 스캔 (등록증/보험)</span>
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
          <Plus className="w-3.5 h-3.5 text-[#5980a6]" />
          <span>{showAddForm ? '입력폼 닫기' : '+ 직접 입력'}</span>
        </button>
      </div>

      {showAddForm && (
        <div className="bg-[#ededed] border-2 border-[#5980a6] p-4 rounded-xl mb-4 relative animate-fade-in shadow-xl">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-bold text-[#5980a6] flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">precision_manufacturing</span> 새 장비 추가
            </h4>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowAddForm(false)} className="text-[rgba(29,31,32,0.6)] hover:text-[#1d1f20]">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          </div>
          <form onSubmit={handleEquipmentSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3 relative">
            <div className="relative">
              <label className="text-xs font-bold text-[rgba(29,31,32,0.7)] mb-1 block">장비명 / 차종</label>
              <input
                type="text"
                required
                placeholder="굴착기, 덤프트럭 등"
                className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.25)] rounded-lg px-3 py-2 text-[#1d1f20] font-semibold outline-none focus:border-[#5980a6]"
                value={equipmentForm.name}
                onChange={handleEquipmentNameChange}
                autoComplete="off"
              />
              {suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white z-50 border border-[rgba(29,31,32,0.2)] rounded-lg max-h-48 overflow-y-auto shadow-2xl">
                  {suggestions.map((s, i) => (
                    <div
                      key={i}
                      onClick={() => selectEquipmentSuggestion(s)}
                      className="p-3 border-b border-[rgba(29,31,32,0.1)] hover:bg-[#f2f2f3] cursor-pointer"
                    >
                      <div className="font-bold text-[#1d1f20] text-sm">
                        {s.name} <span className="text-xs text-[#5980a6] ml-2 font-normal">{s.spec}</span>
                      </div>
                      <div className="text-xs text-[rgba(29,31,32,0.6)] mt-1 font-medium">단가: ₩{s.unitPrice?.toLocaleString()}원</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-bold text-[rgba(29,31,32,0.7)] mb-1 block">규격 / 장비번호</label>
              <input
                type="text"
                placeholder="예: 06가1234 또는 0.6w"
                className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.25)] rounded-lg px-3 py-2 text-[#1d1f20] font-semibold outline-none focus:border-[#5980a6]"
                value={equipmentForm.spec}
                onChange={e => setEquipmentForm({ ...equipmentForm, spec: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[rgba(29,31,32,0.7)] mb-1 block">단가 (원)</label>
              <input
                type="number"
                required
                className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.25)] rounded-lg px-3 py-2 text-[#1d1f20] font-semibold outline-none focus:border-[#5980a6]"
                value={equipmentForm.unitPrice}
                onChange={e => setEquipmentForm({ ...equipmentForm, unitPrice: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[rgba(29,31,32,0.7)] mb-1 block">투입 일/시간</label>
              <input
                type="number"
                step="0.1"
                required
                className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.25)] rounded-lg px-3 py-2 text-[#1d1f20] font-semibold outline-none focus:border-[#5980a6]"
                value={equipmentForm.amount}
                onChange={e => setEquipmentForm({ ...equipmentForm, amount: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[rgba(29,31,32,0.7)] mb-1 block">투입 구분</label>
              <div className="flex border border-[rgba(29,31,32,0.25)] rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setEquipmentForm({ ...equipmentForm, ownerType: 'DIRECT' })}
                  className={`flex-1 py-2 text-xs font-bold transition-colors ${
                    equipmentForm.ownerType === 'DIRECT' ? 'bg-[#5980a6] text-white' : 'bg-[#f2f2f3] text-[#1d1f20]'
                  }`}
                >
                  원청 직영
                </button>
                <button
                  type="button"
                  onClick={() => setEquipmentForm({ ...equipmentForm, ownerType: 'SUBCONTRACT' })}
                  className={`flex-1 py-2 text-xs font-bold transition-colors border-l border-[rgba(29,31,32,0.2)] ${
                    equipmentForm.ownerType === 'SUBCONTRACT' ? 'bg-[#5980a6] text-white' : 'bg-[#f2f2f3] text-[#1d1f20]'
                  }`}
                >
                  당사 투입
                </button>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-[rgba(29,31,32,0.7)] mb-1 block">
                작업 내용 (예: 터파기, 되메우기, 자재 운반 등)
              </label>
              <input
                type="text"
                className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.25)] rounded-lg px-3 py-2 text-[#1d1f20] font-semibold outline-none focus:border-[#5980a6]"
                value={equipmentForm.taskDescription}
                onChange={e => setEquipmentForm({ ...equipmentForm, taskDescription: e.target.value })}
              />
            </div>
            <div className="md:col-span-2 mt-2">
              <button
                type="submit"
                className="w-full bg-[#5980a6] hover:bg-[#416180] text-white font-bold py-2.5 rounded-lg shadow-sm transition-all active:scale-95 text-sm"
              >
                일보에 장비 등록하기
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex justify-between items-center px-2">
          <h3 className="font-bold text-lg text-[#1d1f20]">투입 장비</h3>
          <span className="text-xs font-bold text-[#5980a6] bg-[#5980a6]/15 px-2.5 py-1 rounded-full border border-[#5980a6]/30">
            총 {totalEquipments} 대 투입
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {loading ? (
            <div className="text-center py-10 text-[rgba(29,31,32,0.55)]">데이터를 불러오는 중...</div>
          ) : logData?.equipments.length === 0 ? (
            <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-8 text-center text-[rgba(29,31,32,0.55)]">
              입력된 투입 장비가 없습니다.
            </div>
          ) : (
            logData?.equipments.map((eq: any) => (
              <div
                key={eq.id}
                className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.2)] rounded-xl p-4 flex justify-between items-center hover:border-[#5980a6] transition-colors group"
              >
                <div className="flex items-center gap-3 w-2/3">
                  <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shrink-0 border border-[rgba(29,31,32,0.1)] shadow-sm">
                    <span className="material-symbols-outlined text-[#0369a1]">precision_manufacturing</span>
                  </div>
                  <div className="overflow-hidden">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-[#1d1f20] truncate text-sm md:text-base">{eq.name}</h4>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                          eq.ownerType === 'DIRECT' ? 'bg-[#5980a6]/20 text-[#2b4c6f]' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {eq.ownerType === 'DIRECT' ? '원청 직영' : '당사 투입'}
                      </span>
                      {eq.createdBy && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#e2e8f0] text-[rgba(29,31,32,0.65)] font-bold">
                          BY {eq.createdBy}
                        </span>
                      )}
                      {eq.documentStatus !== 'COMPLETE' && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-800 font-bold flex items-center gap-0.5"
                          title="장비 안전서류(등록증/보험/면허 등) 확인 필요"
                        >
                          <AlertTriangle className="w-3 h-3 text-amber-600" /> 서류 확인필요
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] md:text-xs text-[rgba(29,31,32,0.7)] font-medium truncate mt-0.5">
                      {eq.spec} • {eq.amount} 시간/일 • ₩{eq.unitPrice?.toLocaleString()}원
                    </p>
                    {eq.taskDescription && (
                      <p className="text-[10px] md:text-xs text-[rgba(29,31,32,0.65)] truncate mt-0.5 normal-case">
                        작업: {eq.taskDescription}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 flex items-center gap-3">
                  <p className="text-base md:text-lg font-bold text-[#1d1f20]">₩{eq.totalPrice.toLocaleString()}</p>
                  <button
                    onClick={() => handleDeleteItem(deleteEquipment, eq.id, `장비 (${eq.name})`)}
                    className="p-2 rounded-lg text-[rgba(29,31,32,0.5)] opacity-80 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-600 transition-all"
                    title="삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
