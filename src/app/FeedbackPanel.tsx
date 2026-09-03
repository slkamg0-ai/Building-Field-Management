'use client'

import { useState, useEffect } from 'react'
import { Trash2, MessageSquarePlus } from 'lucide-react'
import { getFeedbacks, createFeedback, updateFeedbackStatus, deleteFeedback } from '@/lib/actions'

const CATEGORY_LABEL: Record<string, string> = { REQUEST: '요구사항', BUG: '버그', ETC: '기타' }
const CATEGORY_COLOR: Record<string, string> = {
  REQUEST: 'text-[#0284c7] bg-[#0284c7]/10', BUG: 'text-red-600 bg-red-500/10', ETC: 'text-[rgba(29,31,32,0.55)] bg-[#ededed]',
}
const STATUS_LABEL: Record<string, string> = { OPEN: '대기', IN_PROGRESS: '진행중', DONE: '완료' }
const STATUS_COLOR: Record<string, string> = {
  OPEN: 'text-[rgba(29,31,32,0.55)] bg-[#ededed]', IN_PROGRESS: 'text-[#d97706] bg-[#d97706]/10', DONE: 'text-[#16a34a] bg-[#16a34a]/10',
}

export default function FeedbackPanel({ currentUser }: { currentUser: any }) {
  const isAdmin = currentUser?.role === 'ADMIN'
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('REQUEST')
  const [submitting, setSubmitting] = useState(false)
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'DONE'>('ALL')

  async function load() {
    setLoading(true)
    try {
      const data = await getFeedbacks()
      setItems(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setSubmitting(true)
    try {
      await createFeedback(content, category)
      setContent('')
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : '등록 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제할까요?')) return
    try {
      await deleteFeedback(id)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.')
    }
  }

  const filtered = filter === 'ALL' ? items : items.filter(i => i.status === filter)

  return (
    <div className="space-y-4">
      <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-4">
        <h4 className="font-bold text-[#5980a6] mb-3 flex items-center gap-2">
          <MessageSquarePlus className="w-4 h-4" /> 요구사항 / 버그 남기기
        </h4>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            {(['REQUEST', 'BUG', 'ETC'] as const).map(c => (
              <button key={c} type="button" onClick={() => setCategory(c)}
                className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors ${category === c ? 'bg-[#5980a6] text-white border-[#5980a6]' : 'bg-[#f2f2f3] text-[rgba(29,31,32,0.6)] border-[rgba(29,31,32,0.16)]'}`}>
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="불편한 점, 추가되었으면 하는 기능, 오류 등을 자유롭게 적어주세요."
            className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6] h-24 resize-none"
          />
          <button type="submit" disabled={submitting || !content.trim()} className="w-full bg-[#5980a6] text-white font-bold py-2 rounded hover:opacity-90 disabled:opacity-40">
            등록하기
          </button>
        </form>
      </div>

      <div className="flex gap-1 bg-[#ededed] p-1 rounded-lg w-fit">
        {(['ALL', 'OPEN', 'IN_PROGRESS', 'DONE'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${filter === f ? 'bg-white text-[#5980a6] shadow' : 'text-[rgba(29,31,32,0.55)]'}`}>
            {f === 'ALL' ? '전체' : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-8 text-[rgba(29,31,32,0.55)]">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-8 text-center text-[rgba(29,31,32,0.55)]">등록된 항목이 없습니다.</div>
        ) : filtered.map(item => (
          <div key={item.id} className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-4 group">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${CATEGORY_COLOR[item.category]}`}>{CATEGORY_LABEL[item.category]}</span>
                <span className="text-xs text-[rgba(29,31,32,0.6)]">{item.createdBy} · {new Date(item.createdAt).toLocaleDateString('ko-KR')}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isAdmin ? (
                  <select value={item.status} onChange={e => updateFeedbackStatus(item.id, e.target.value).then(load)}
                    className={`text-[10px] font-bold px-2 py-1 rounded border-0 outline-none ${STATUS_COLOR[item.status]}`}>
                    {(['OPEN', 'IN_PROGRESS', 'DONE'] as const).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                ) : (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUS_COLOR[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                )}
                {(isAdmin || item.createdBy === currentUser?.name) && (
                  <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded text-[rgba(29,31,32,0.5)] opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-600 transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-sm text-[#1d1f20] mt-2 whitespace-pre-wrap">{item.content}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
