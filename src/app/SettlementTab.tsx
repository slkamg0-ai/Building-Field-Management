'use client'

import { useEffect, useState } from 'react'
import { getMonthlyExpensesByPerson, settleExpenses } from '@/lib/actions'

type Props = {
  selectedSiteId: string
  selectedYear: number
  selectedMonth: number
}

export default function SettlementTab({ selectedSiteId, selectedYear, selectedMonth }: Props) {
  const [settlementData, setSettlementData] = useState<any[]>([])
  const [settlementLoading, setSettlementLoading] = useState(false)
  const [settlementError, setSettlementError] = useState<string | null>(null)

  async function loadSettlementData() {
    if (!selectedSiteId) return
    setSettlementLoading(true)
    setSettlementError(null)
    try {
      const data = await getMonthlyExpensesByPerson(selectedSiteId, selectedYear, selectedMonth)
      setSettlementData(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setSettlementError(msg)
    } finally { setSettlementLoading(false) }
  }

  useEffect(() => {
    loadSettlementData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSiteId, selectedYear, selectedMonth])

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center px-2">
        <h3 className="font-bold text-lg text-[#1d1f20] flex items-center gap-2">
          <span className="material-symbols-outlined text-[#16a34a]">account_balance_wallet</span>
          {selectedMonth}월 경비 정산
        </h3>
        <button onClick={loadSettlementData} className="text-xs text-[rgba(29,31,32,0.6)] hover:text-[#1d1f20] flex items-center gap-1">
          <span className="material-symbols-outlined text-sm">refresh</span> 새로고침
        </button>
      </div>

      {settlementLoading ? (
        <div className="text-center py-12 text-[rgba(29,31,32,0.55)]">데이터를 불러오는 중...</div>
      ) : settlementError ? (
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 text-center">
          <p className="text-red-600 text-sm font-bold mb-1">오류가 발생했습니다</p>
          <p className="text-red-500 text-xs">{settlementError}</p>
        </div>
      ) : settlementData.length === 0 ? (
        <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-8 text-center text-[rgba(29,31,32,0.55)]">이달 경비 내역이 없습니다.</div>
      ) : (
        <div className="space-y-4">
          {settlementData.map((person) => (
            <div key={person.person} className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl overflow-hidden">
              {/* 담당자 헤더 */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(29,31,32,0.16)]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[rgba(29,31,32,0.16)] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[rgba(29,31,32,0.6)] text-sm">person</span>
                  </div>
                  <div>
                    <p className="font-bold text-[#1d1f20]">{person.person}</p>
                    <p className="text-[10px] text-[rgba(29,31,32,0.55)] mt-0.5">총 {person.items.length}건 · ₩{person.total.toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    {person.unsettledTotal > 0 && (
                      <p className="text-sm font-bold text-red-600">미정산 ₩{person.unsettledTotal.toLocaleString()}</p>
                    )}
                    {person.settledTotal > 0 && (
                      <p className="text-xs text-[#16a34a]">정산완료 ₩{person.settledTotal.toLocaleString()}</p>
                    )}
                  </div>
                  {person.unsettledTotal > 0 && (
                    <button
                      onClick={async () => {
                        if (!confirm(`${person.person}의 미정산 경비 ₩${person.unsettledTotal.toLocaleString()}을 정산 처리하시겠습니까?`)) return
                        const ids = person.items.filter((i: any) => !i.isSettled).map((i: any) => i.id)
                        try {
                          await settleExpenses(ids)
                          loadSettlementData()
                        } catch (e) {
                          alert('정산 처리 실패: ' + (e instanceof Error ? e.message : String(e)))
                        }
                      }}
                      className="px-3 py-1.5 rounded bg-[#16a34a]/10 text-[#16a34a] border border-[#16a34a]/30 text-xs font-bold hover:bg-[#16a34a]/20 transition-colors whitespace-nowrap"
                    >
                      정산 처리
                    </button>
                  )}
                </div>
              </div>
              {/* 경비 상세 목록 */}
              <div className="divide-y divide-[rgba(29,31,32,0.16)]">
                {person.items.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${item.isSettled ? 'bg-[#16a34a]' : 'bg-red-400'}`}></span>
                      <div>
                        <p className="text-sm text-[#1d1f20]">{item.category}</p>
                        <p className="text-[10px] text-[rgba(29,31,32,0.55)]">{item.note || ''}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-[#1d1f20]">₩{item.amount.toLocaleString()}</p>
                      <p className={`text-[10px] font-bold ${item.isSettled ? 'text-[#16a34a]' : 'text-red-600'}`}>
                        {item.isSettled ? '정산완료' : '미정산'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
