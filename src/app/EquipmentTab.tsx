'use client'

import { useState } from 'react'
import { addEquipment, deleteEquipment, searchEquipments } from '@/lib/actions'
import { Trash2 } from 'lucide-react'

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
}

export default function EquipmentTab({
  showAddForm, setShowAddForm, isAnalyzing, analyzeDocument, suggestions, setSuggestions,
  logData, loading, currentUser, totalEquipments, handleDeleteItem, onChanged,
}: Props) {
  const [equipmentForm, setEquipmentForm] = useState({ name: '', spec: '', unitPrice: '', amount: '1', note: '', ownerType: 'DIRECT', taskDescription: '' })

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
    onChanged()
  }

  return (
    <>
      {showAddForm && (
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
    </>
  )
}
