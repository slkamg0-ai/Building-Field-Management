'use client'

import { useState } from 'react'
import { addExpense, deleteExpense } from '@/lib/actions'
import { Trash2 } from 'lucide-react'

type Props = {
  showAddForm: boolean
  setShowAddForm: (v: boolean) => void
  isAnalyzing: boolean
  analyzeDocument: (file: File, formType: string) => Promise<Record<string, string> | null>
  logData: any
  loading: boolean
  currentUser: any
  allUsers: any[]
  handleDeleteItem: (deleteFn: (id: string) => Promise<any>, id: string, label: string) => void
  onChanged: () => void
}

export default function ExpenseTab({
  showAddForm, setShowAddForm, isAnalyzing, analyzeDocument,
  logData, loading, currentUser, allUsers, handleDeleteItem, onChanged,
}: Props) {
  const [expenseForm, setExpenseForm] = useState({ category: '', amount: '', note: '', assignedTo: '' })

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!logData || !currentUser) return
    await addExpense(logData.id, expenseForm, currentUser.name)
    setExpenseForm({ category: '', amount: '', note: '', assignedTo: '' })
    setShowAddForm(false)
    onChanged()
  }

  return (
    <>
      {showAddForm && (
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
    </>
  )
}
