'use client'

import { useState } from 'react'
import { addMaterial, deleteMaterial, searchMaterials } from '@/lib/actions'
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
  totalMaterials: number
  handleDeleteItem: (deleteFn: (id: string) => Promise<any>, id: string, label: string) => void
  onChanged: () => void
}

export default function MaterialTab({
  showAddForm, setShowAddForm, isAnalyzing, analyzeDocument, suggestions, setSuggestions,
  logData, loading, currentUser, totalMaterials, handleDeleteItem, onChanged,
}: Props) {
  const [materialForm, setMaterialForm] = useState({ name: '', spec: '', unit: '', quantity: '1', note: '' })

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
    onChanged()
  }

  return (
    <>
      {showAddForm && (
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
    </>
  )
}
