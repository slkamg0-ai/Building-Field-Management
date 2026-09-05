'use client'

import { useState } from 'react'
import { addLabor, deleteLabor, searchLabors } from '@/lib/actions'
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
  workerDocMap: Record<string, string>
  currentUser: any
  totalLabors: number
  handleDeleteItem: (deleteFn: (id: string) => Promise<any>, id: string, label: string) => void
  onChanged: () => void
}

export default function LaborTab({
  showAddForm, setShowAddForm, isAnalyzing, analyzeDocument, suggestions, setSuggestions,
  logData, loading, workerDocMap, currentUser, totalLabors, handleDeleteItem, onChanged,
}: Props) {
  const [laborForm, setLaborForm] = useState({ name: '', jobType: '', unitPrice: '', amount: '1', note: '' })

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
    onChanged()
  }

  return (
    <>
      {/* ===================== LABOR TAB ===================== */}
      {showAddForm && (
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
    </>
  )
}
