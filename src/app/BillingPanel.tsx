'use client'

import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { Trash2, Upload, FileSpreadsheet, ChevronRight, Download } from 'lucide-react'
import {
  getContractItems,
  getContractItemProgress,
  importContractItems,
  createContractItem,
  updateContractItem,
  deleteContractItem,
  getWorkQuantities,
  addWorkQuantity,
  deleteWorkQuantity,
  getMonthlyProgressClaim,
  getProgressClaimHistory,
  generateMonthlyProgressClaim,
  updateProgressClaimStatus,
  getProgressClaimItemDetail,
  getMonthlyCostDetail,
} from '@/lib/actions'

function won(n: number | null | undefined) {
  return `${Math.round(n || 0).toLocaleString()}원`
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '작성중', SUBMITTED: '원청 제출', CONFIRMED: '지급 확정',
}
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'text-[rgba(29,31,32,0.55)] bg-[#ededed]', SUBMITTED: 'text-[#0284c7] bg-[#0284c7]/10', CONFIRMED: 'text-[#16a34a] bg-[#16a34a]/10',
}

export default function BillingPanel({ siteId, logId, currentUser }: { siteId: string; logId?: string | null; currentUser: any }) {
  const isAdmin = currentUser?.role === 'ADMIN'
  const [subTab, setSubTab] = useState<'entry' | 'items' | 'cost' | 'claim'>('entry')

  const [items, setItems] = useState<any[]>([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')

  const [todayQuantities, setTodayQuantities] = useState<any[]>([])
  const [entryForm, setEntryForm] = useState({ contractItemId: '', quantity: '', note: '' })
  const [entrySearch, setEntrySearch] = useState('')

  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [claim, setClaim] = useState<any>(null)
  const [claimHistory, setClaimHistory] = useState<any[]>([])
  const [claimLoading, setClaimLoading] = useState(false)

  const [costDetail, setCostDetail] = useState<any>(null)
  const [costLoading, setCostLoading] = useState(false)

  async function loadItems() {
    if (!siteId) return
    setItemsLoading(true)
    try {
      // getContractItems: 그룹 헤더 포함 전체 목록(화면 표시용) / getContractItemProgress: 시공품목(leaf)의 누적수량
      const [all, progress] = await Promise.all([getContractItems(siteId), getContractItemProgress(siteId)])
      const progressMap = new Map(progress.map((p: any) => [p.id, p]))
      const merged = all.map((item: any) => {
        const p = progressMap.get(item.id)
        return p ? { ...item, doneQuantity: p.doneQuantity, doneAmount: p.doneAmount, remainQuantity: p.remainQuantity, progressPercent: p.progressPercent } : item
      })
      setItems(merged)
    } finally {
      setItemsLoading(false)
    }
  }

  async function loadTodayQuantities() {
    if (!logId) { setTodayQuantities([]); return }
    const data = await getWorkQuantities(logId)
    setTodayQuantities(data)
  }

  async function loadClaim() {
    if (!siteId) return
    setClaimLoading(true)
    try {
      const [c, history] = await Promise.all([
        getMonthlyProgressClaim(siteId, year, month),
        getProgressClaimHistory(siteId),
      ])
      setClaim(c)
      setClaimHistory(history)
    } finally {
      setClaimLoading(false)
    }
  }

  async function loadCostDetail() {
    if (!siteId) return
    setCostLoading(true)
    try {
      const data = await getMonthlyCostDetail(siteId, year, month)
      setCostDetail(data)
    } finally {
      setCostLoading(false)
    }
  }

  useEffect(() => { loadItems() }, [siteId])
  useEffect(() => { loadTodayQuantities() }, [logId])
  useEffect(() => { loadClaim() }, [siteId, year, month])
  useEffect(() => { loadCostDetail() }, [siteId, year, month])

  const leafItems = useMemo(() => items.filter(i => i.isLeaf), [items])
  const filteredLeafItems = useMemo(() => {
    if (!entrySearch.trim()) return leafItems.slice(0, 30)
    const q = entrySearch.trim()
    return leafItems.filter(i => i.name.includes(q) || (i.spec || '').includes(q) || (i.code || '').includes(q)).slice(0, 30)
  }, [leafItems, entrySearch])

  const totalContractAmount = useMemo(() => items.filter(i => i.isLeaf).reduce((s, i) => s + (i.contractAmount || 0), 0), [items])
  const totalDoneAmount = useMemo(() => items.filter(i => i.isLeaf).reduce((s, i) => s + (i.doneAmount || 0), 0), [items])

  async function handleExcelFile(file: File) {
    setImportError('')
    setImporting(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })

      // 헤더 행(구분/항목/규격/수량/단위/단가/금액 이 보이는 행)을 찾는다.
      // 시트가 여러 개일 수 있어(표지+상세 등) 행 수 추정 대신, 각 시트를 순서대로
      // 실제 스캔해서 헤더를 가장 먼저 찾아내는 시트를 사용한다.
      const headerAliases: Record<string, string[]> = {
        code: ['구분', '코드', 'no', '번호'],
        name: ['항목', '품명', '품목', '공종'],
        spec: ['규격', '규격/사양'],
        unit: ['단위'],
        quantity: ['수량'],
        unitPrice: ['단가'],
        amount: ['금액', '합계'],
        note: ['비고'],
      }

      let raw: any[][] = []
      let headerRowIdx = -1
      let colMap: Record<string, number> = {}
      let matchedSheet = ''

      const numifyProbe = (v: any) => {
        if (v === '' || v === undefined || v === null) return null
        const n = Number(String(v).replace(/,/g, ''))
        return Number.isFinite(n) ? n : null
      }

      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name]
        const sheetRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        for (let r = 0; r < Math.min(sheetRows.length, 40); r++) {
          // "견적금액"처럼 상위 헤더(예: 4행)와 그 하위 단가/금액 컬럼명(예: 5행)이
          // 두 줄에 나뉘어 있는 내역서가 많다. 현재 행과 바로 다음 행을 함께 검사해서
          // 컬럼을 찾되, 다음 행에서 찾은 항목이 있으면 실제 헤더는 그 다음 행으로 본다.
          const row0 = sheetRows[r].map(c => String(c || '').trim())
          const row1 = (sheetRows[r + 1] || []).map(c => String(c || '').trim())
          const map: Record<string, number> = {}
          let usedNextRow = false
          // "견적금액"(상위 병합헤더) 안에 "금액"이라는 글자가 그대로 포함돼 있어서,
          // 느슨한 부분일치만 쓰면 진짜 "금액" 컬럼(하위행)보다 먼저 잘못 잡힌다.
          // 그래서 정확히 일치하는 셀을 최우선으로 찾고(하위행 우선), 그다음에만 부분일치로 넘어간다.
          for (const [key, aliases] of Object.entries(headerAliases)) {
            let idx = row1.findIndex(cell => aliases.includes(cell))
            if (idx >= 0) { map[key] = idx; usedNextRow = true; continue }
            idx = row0.findIndex(cell => aliases.includes(cell))
            if (idx >= 0) { map[key] = idx; continue }
            idx = row1.findIndex(cell => aliases.some(a => cell.includes(a)))
            if (idx >= 0) { map[key] = idx; usedNextRow = true; continue }
            idx = row0.findIndex(cell => aliases.some(a => cell.includes(a)))
            if (idx >= 0) { map[key] = idx }
          }
          // 항목명 + 단위 + 수량 + 단가 컬럼을 모두 찾아야 후보로 인정
          if (map.name === undefined || map.unit === undefined || map.quantity === undefined || map.unitPrice === undefined || map.name === map.unit) {
            continue
          }
          // 표지/요약 페이지의 우연한 오탐을 막기 위해, 후보 헤더 다음 50행 중
          // 수량+단가가 실제 숫자로 채워진 행이 최소 5개 이상 있어야 진짜 내역서로 인정한다.
          const candidateHeaderRow = usedNextRow ? r + 1 : r
          const sample = sheetRows.slice(candidateHeaderRow + 1, candidateHeaderRow + 51)
          const validRows = sample.filter(row =>
            numifyProbe(row[map.quantity]) !== null && numifyProbe(row[map.unitPrice]) !== null
          ).length
          if (validRows < 5) continue

          headerRowIdx = candidateHeaderRow
          colMap = map
          raw = sheetRows
          matchedSheet = name
          break
        }
        if (headerRowIdx >= 0) break
      }
      if (headerRowIdx === -1) throw new Error(`엑셀에서 항목/단위/단가 등 헤더 행을 찾지 못했습니다. (검사한 시트: ${wb.SheetNames.join(', ')}) 견적내역서 형식을 확인해주세요.`)

      const numify = (v: any) => {
        if (v === '' || v === undefined || v === null) return null
        const n = Number(String(v).replace(/,/g, ''))
        return Number.isFinite(n) ? n : null
      }

      const rows = raw.slice(headerRowIdx + 1)
        .map(row => ({
          code: colMap.code !== undefined ? String(row[colMap.code] ?? '').trim() : '',
          name: colMap.name !== undefined ? String(row[colMap.name] ?? '').trim() : '',
          spec: colMap.spec !== undefined ? String(row[colMap.spec] ?? '').trim() : '',
          unit: colMap.unit !== undefined ? String(row[colMap.unit] ?? '').trim() : '',
          quantity: colMap.quantity !== undefined ? numify(row[colMap.quantity]) : null,
          unitPrice: colMap.unitPrice !== undefined ? numify(row[colMap.unitPrice]) : null,
          amount: colMap.amount !== undefined ? numify(row[colMap.amount]) : null,
          note: colMap.note !== undefined ? String(row[colMap.note] ?? '').trim() : '',
        }))
        .filter(r => r.name)

      if (rows.length === 0) throw new Error('가져올 항목이 없습니다.')
      const result = await importContractItems(siteId, rows)
      alert(`'${matchedSheet}' 시트에서 ${result.imported}개 행을 확인했고, 유효한 품목을 계약내역으로 저장했습니다.`)
      await loadItems()
    } catch (e) {
      setImportError(e instanceof Error ? e.message : '엑셀 처리 중 오류가 발생했습니다.')
    } finally {
      setImporting(false)
    }
  }

  async function handleAddQuantity(e: React.FormEvent) {
    e.preventDefault()
    if (!logId) { alert('오늘 날짜의 작업일보가 아직 준비되지 않았습니다.'); return }
    if (!entryForm.contractItemId || !entryForm.quantity) return
    try {
      await addWorkQuantity(logId, entryForm.contractItemId, parseFloat(entryForm.quantity), entryForm.note)
      setEntryForm({ contractItemId: '', quantity: '', note: '' })
      setEntrySearch('')
      await Promise.all([loadTodayQuantities(), loadItems()])
    } catch (err) {
      alert(err instanceof Error ? err.message : '시공수량 입력 중 오류가 발생했습니다.')
    }
  }

  async function handleDeleteQuantity(id: string) {
    if (!confirm('이 시공수량 입력을 삭제할까요?')) return
    await deleteWorkQuantity(id)
    await Promise.all([loadTodayQuantities(), loadItems()])
  }

  async function handleGenerateClaim() {
    if (!confirm(`${year}년 ${month}월 기성청구액을 지금까지의 시공수량 기준으로 산출할까요?`)) return
    try {
      await generateMonthlyProgressClaim(siteId, year, month)
      await loadClaim()
    } catch (err) {
      alert(err instanceof Error ? err.message : '기성청구서 산출 중 오류가 발생했습니다.')
    }
  }

  async function handleUpdateClaimStatus(status: string) {
    if (!claim) return
    await updateProgressClaimStatus(claim.id, status)
    await loadClaim()
  }

  async function handleExportClaim() {
    try {
      const { site, rows } = await getProgressClaimItemDetail(siteId, year, month)
      if (rows.length === 0) { alert('이번달 시공 실적이 있는 품목이 없습니다.'); return }

      const header = ['구분', '항목', '규격', '단위', '계약수량', '계약단가', '계약금액', '이번달 시공수량', '이번달 기성금액', '누적 시공수량', '누적 기성금액', '잔량']
      const body = rows.map(r => [
        r.code, r.name, r.spec, r.unit,
        r.contractQuantity ?? '', r.contractUnitPrice, r.contractAmount,
        r.monthQuantity, r.monthAmount, r.cumulativeQuantity, r.cumulativeAmount, r.remainQuantity ?? '',
      ])
      const monthTotal = rows.reduce((s, r) => s + r.monthAmount, 0)
      const cumulativeTotal = rows.reduce((s, r) => s + r.cumulativeAmount, 0)

      const sheetData = [
        [`${site.name} 기성청구서 (${year}년 ${month}월)`],
        [`작성일: ${new Date().toISOString().slice(0, 10)}`],
        [],
        header,
        ...body,
        [],
        ['', '', '', '', '', '', '', '합계', monthTotal, '', cumulativeTotal, ''],
      ]
      const ws = XLSX.utils.aoa_to_sheet(sheetData)
      ws['!cols'] = header.map(() => ({ wch: 14 }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '기성청구서')
      XLSX.writeFile(wb, `${site.name}_기성청구서_${year}-${String(month).padStart(2, '0')}.xlsx`)
    } catch (err) {
      alert(err instanceof Error ? err.message : '기성청구서 내보내기 중 오류가 발생했습니다.')
    }
  }

  async function handleExportCostDetail() {
    if (!costDetail) return
    const { site, daysInMonth, labors, equipments, materials, expenses, outsourcings, totals, grandTotal } = costDetail
    const dayHeaders = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}일`)
    const calendarRows = (rows: any[], labelKey: string, subLabel: string) => [
      [labelKey, subLabel, ...dayHeaders, '합계공수', '단가', '금액'],
      ...rows.map((r: any) => [
        r.name, r.sub,
        ...Array.from({ length: daysInMonth }, (_, i) => r.days[i + 1] ?? ''),
        r.totalAmount, r.unitPrice, r.totalPrice,
      ]),
    ]

    const sheetData: any[][] = [
      [`${site.name} 투입명세서 (${year}년 ${month}월)`],
      [`작성일: ${new Date().toISOString().slice(0, 10)}`],
      [],
      ['[노무] — 일자별 출력일수'],
      ...calendarRows(labors, '이름', '공종'),
      ['', '', ...dayHeaders.map(() => ''), '', '소계', totals.labor],
      [],
      ['[장비] — 일자별 투입량'],
      ...calendarRows(equipments, '장비명', '구분'),
      ['', '', ...dayHeaders.map(() => ''), '', '소계', totals.equipment],
      [],
      ['[자재]'],
      ['날짜', '자재명', '규격', '단위', '수량', '금액'],
      ...materials.map((m: any) => [new Date(m.date).toISOString().slice(0, 10), m.name, m.spec, m.unit, m.quantity, m.totalPrice]),
      ['', '', '', '', '소계', totals.material],
      [],
      ['[경비]'],
      ['항목', '금액'],
      ...expenses.map((e: any) => [e.category, e.amount]),
      ['소계', totals.expense],
      [],
      ['[외주]'],
      ['업체명', '작업내용', '금액'],
      ...outsourcings.map((o: any) => [o.companyName, o.task, o.amount]),
      ['', '소계', totals.outsourcing],
      [],
      ['총 투입원가 합계', grandTotal],
    ]
    const ws = XLSX.utils.aoa_to_sheet(sheetData)
    ws['!cols'] = [{ wch: 14 }, { wch: 14 }, ...dayHeaders.map(() => ({ wch: 5 })), { wch: 10 }, { wch: 10 }, { wch: 14 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '투입명세서')
    XLSX.writeFile(wb, `${site.name}_투입명세서_${year}-${String(month).padStart(2, '0')}.xlsx`)
  }

  const selectedItem = leafItems.find(i => i.id === entryForm.contractItemId)

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-[#ededed] p-1 rounded-lg w-fit">
        <button onClick={() => setSubTab('entry')} className={`px-3 py-1.5 rounded text-xs md:text-sm font-bold transition-colors ${subTab === 'entry' ? 'bg-[#f2f2f3] text-[#5980a6] shadow' : 'text-[rgba(29,31,32,0.55)]'}`}>오늘 시공수량</button>
        <button onClick={() => setSubTab('items')} className={`px-3 py-1.5 rounded text-xs md:text-sm font-bold transition-colors ${subTab === 'items' ? 'bg-[#f2f2f3] text-[#5980a6] shadow' : 'text-[rgba(29,31,32,0.55)]'}`}>계약품목{isAdmin ? ' 관리' : ''}</button>
        <button onClick={() => setSubTab('cost')} className={`px-3 py-1.5 rounded text-xs md:text-sm font-bold transition-colors ${subTab === 'cost' ? 'bg-[#f2f2f3] text-[#5980a6] shadow' : 'text-[rgba(29,31,32,0.55)]'}`}>월별 투입명세서</button>
        <button onClick={() => setSubTab('claim')} className={`px-3 py-1.5 rounded text-xs md:text-sm font-bold transition-colors ${subTab === 'claim' ? 'bg-[#f2f2f3] text-[#5980a6] shadow' : 'text-[rgba(29,31,32,0.55)]'}`}>월별 기성청구서</button>
      </div>

      {/* ===================== 오늘 시공수량 입력 ===================== */}
      {subTab === 'entry' && (
        <div className="space-y-4">
          {leafItems.length === 0 ? (
            <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-8 text-center text-[rgba(29,31,32,0.55)]">
              등록된 계약품목이 없습니다. {isAdmin ? "'계약품목 관리' 탭에서 견적내역서를 업로드해주세요." : '관리자에게 계약품목 등록을 요청해주세요.'}
            </div>
          ) : (
            <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-4">
              <h4 className="font-bold text-[#5980a6] mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-sm">construction</span> 오늘 시공수량 입력</h4>
              <form onSubmit={handleAddQuantity} className="space-y-3">
                <div className="relative">
                  <label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">계약품목 검색</label>
                  <input
                    type="text"
                    placeholder="품목명, 규격, 구분코드로 검색"
                    className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]"
                    value={selectedItem ? `${selectedItem.name} ${selectedItem.spec ? `(${selectedItem.spec})` : ''}` : entrySearch}
                    onChange={e => { setEntrySearch(e.target.value); setEntryForm(f => ({ ...f, contractItemId: '' })) }}
                  />
                  {!entryForm.contractItemId && entrySearch && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#f2f2f3] z-50 border border-[rgba(29,31,32,0.16)] rounded max-h-56 overflow-y-auto shadow-xl">
                      {filteredLeafItems.length === 0 ? (
                        <div className="p-3 text-sm text-[rgba(29,31,32,0.55)]">일치하는 품목이 없습니다.</div>
                      ) : filteredLeafItems.map(item => (
                        <div key={item.id} onClick={() => { setEntryForm(f => ({ ...f, contractItemId: item.id })); setEntrySearch('') }}
                          className="p-3 border-b border-[rgba(29,31,32,0.16)] hover:bg-[#f2f2f3] cursor-pointer">
                          <div className="font-medium text-[#1d1f20] text-sm">{item.name} {item.spec && <span className="text-xs text-[#5980a6] ml-1">{item.spec}</span>}</div>
                          <div className="text-[10px] text-[rgba(29,31,32,0.6)] mt-0.5">단위 {item.unit} · 계약 {item.contractQuantity ?? '-'} · 잔량 {item.remainQuantity ?? '-'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">시공수량 {selectedItem ? `(${selectedItem.unit})` : ''}</label>
                    <input type="number" step="0.01" required className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]"
                      value={entryForm.quantity} onChange={e => setEntryForm(f => ({ ...f, quantity: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-[rgba(29,31,32,0.6)] mb-1 block">비고</label>
                    <input type="text" className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]"
                      value={entryForm.note} onChange={e => setEntryForm(f => ({ ...f, note: e.target.value }))} />
                  </div>
                </div>
                <button type="submit" disabled={!entryForm.contractItemId} className="w-full bg-[#5980a6] text-[#f2f2f3] font-bold py-2 rounded hover:opacity-90 disabled:opacity-40">추가하기</button>
              </form>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="font-bold text-[#1d1f20] px-1">오늘 입력한 시공수량</h4>
            {todayQuantities.length === 0 ? (
              <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-6 text-center text-[rgba(29,31,32,0.55)] text-sm">아직 입력된 시공수량이 없습니다.</div>
            ) : todayQuantities.map((wq: any) => (
              <div key={wq.id} className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-3 flex justify-between items-center group">
                <div>
                  <div className="font-bold text-sm text-[#1d1f20]">{wq.contractItem?.name} {wq.contractItem?.spec && <span className="text-xs text-[#5980a6] font-normal">{wq.contractItem.spec}</span>}</div>
                  <div className="text-xs text-[rgba(29,31,32,0.6)]">{wq.quantity}{wq.contractItem?.unit} · {wq.createdBy}{wq.note ? ` · ${wq.note}` : ''}</div>
                </div>
                <button onClick={() => handleDeleteQuantity(wq.id)} className="p-2 rounded-lg text-[rgba(29,31,32,0.5)] opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-600 transition-all">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================== 계약품목 관리 ===================== */}
      {subTab === 'items' && (
        <div className="space-y-4">
          {isAdmin && (
            <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-4">
              <h4 className="font-bold text-[#5980a6] mb-2 flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> 견적내역서(BOQ) 엑셀 업로드</h4>
              <p className="text-xs text-[rgba(29,31,32,0.6)] mb-3">구분/항목/규격/수량/단위/단가/금액 컬럼이 있는 시트를 업로드하면 전체 계약품목을 새로 대체합니다. (기존 시공수량 입력 기록은 유지됩니다)</p>
              <label className={`flex items-center justify-center gap-2 cursor-pointer text-sm font-bold px-4 py-3 rounded border-2 border-dashed transition-colors ${importing ? 'text-[rgba(29,31,32,0.5)] border-[rgba(29,31,32,0.16)] pointer-events-none' : 'text-[#5980a6] border-[#5980a6]/40 hover:border-[#5980a6]'}`}>
                <Upload className="w-4 h-4" />
                {importing ? '업로드 중...' : '엑셀 파일 선택'}
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelFile(f); e.target.value = '' }} />
              </label>
              {importError && <p className="text-xs text-red-600 mt-2">{importError}</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-3 text-center">
              <div className="text-xs text-[rgba(29,31,32,0.6)]">계약(견적) 총액</div>
              <div className="text-lg font-bold text-[#1d1f20]">{won(totalContractAmount)}</div>
            </div>
            <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-3 text-center">
              <div className="text-xs text-[rgba(29,31,32,0.6)]">누적 시공 기성액</div>
              <div className="text-lg font-bold text-[#5980a6]">{won(totalDoneAmount)}</div>
            </div>
          </div>

          <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs md:text-sm">
                <thead>
                  <tr className="bg-[#ededed] text-[rgba(29,31,32,0.6)]">
                    <th className="p-2 text-left">품목</th>
                    <th className="p-2 text-right">계약수량</th>
                    <th className="p-2 text-right">단가</th>
                    <th className="p-2 text-right">계약금액</th>
                    <th className="p-2 text-right">누적시공</th>
                    <th className="p-2 text-right">잔량</th>
                    {isAdmin && <th className="p-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {itemsLoading ? (
                    <tr><td colSpan={7} className="p-6 text-center text-[rgba(29,31,32,0.55)]">불러오는 중...</td></tr>
                  ) : items.length === 0 ? (
                    <tr><td colSpan={7} className="p-6 text-center text-[rgba(29,31,32,0.55)]">등록된 계약품목이 없습니다.</td></tr>
                  ) : items.map((item: any) => (
                    <tr key={item.id} className={`border-t border-[rgba(29,31,32,0.16)] ${!item.isLeaf ? 'bg-[#ededed] font-bold' : ''}`}>
                      <td className="p-2">
                        <div className="text-[#1d1f20]">{item.name}</div>
                        {item.spec && <div className="text-[10px] text-[rgba(29,31,32,0.6)]">{item.spec}</div>}
                      </td>
                      <td className="p-2 text-right text-[#1d1f20]">{item.isLeaf ? `${item.contractQuantity ?? '-'} ${item.unit || ''}` : ''}</td>
                      <td className="p-2 text-right text-[#1d1f20]">{item.isLeaf && item.contractUnitPrice != null ? item.contractUnitPrice.toLocaleString() : ''}</td>
                      <td className="p-2 text-right text-[#1d1f20]">{won(item.contractAmount)}</td>
                      <td className="p-2 text-right text-[#5980a6]">{item.isLeaf ? (item.doneQuantity || 0) : ''}</td>
                      <td className="p-2 text-right text-[#1d1f20]">{item.isLeaf ? (item.remainQuantity ?? '-') : ''}</td>
                      {isAdmin && (
                        <td className="p-2 text-right">
                          <button onClick={async () => { if (confirm(`'${item.name}' 품목을 삭제할까요?`)) { await deleteContractItem(item.id); await loadItems() } }} className="p-1.5 rounded text-[rgba(29,31,32,0.5)] hover:bg-red-500/10 hover:text-red-600">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================== 월별 투입명세서(원가) ===================== */}
      {subTab === 'cost' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]">
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
            </select>
            <button onClick={handleExportCostDetail} disabled={!costDetail} className="ml-auto flex items-center gap-1.5 bg-[#f2f2f3] border border-[#5980a6]/40 text-[#5980a6] font-bold px-3 py-2 rounded text-sm hover:bg-[#5980a6]/10 disabled:opacity-40">
              <Download className="w-4 h-4" /> 엑셀로 내보내기
            </button>
          </div>

          {costLoading ? (
            <div className="text-center py-8 text-[rgba(29,31,32,0.55)]">불러오는 중...</div>
          ) : !costDetail ? null : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {[
                  ['노무', costDetail.totals.labor], ['장비', costDetail.totals.equipment], ['자재', costDetail.totals.material],
                  ['경비', costDetail.totals.expense], ['외주', costDetail.totals.outsourcing],
                ].map(([label, value]: any) => (
                  <div key={label} className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-3 text-center">
                    <div className="text-xs text-[rgba(29,31,32,0.6)]">{label}</div>
                    <div className="text-sm font-bold text-[#1d1f20]">{won(value)}</div>
                  </div>
                ))}
              </div>
              <div className="bg-[#5980a6]/10 border border-[#5980a6]/30 rounded-xl p-3 text-center">
                <div className="text-xs text-[#5980a6]">이번달 총 투입원가</div>
                <div className="text-xl font-bold text-[#5980a6]">{won(costDetail.grandTotal)}</div>
              </div>

              {[
                { title: '노무 — 일자별 출력일수', rows: costDetail.labors },
                { title: '장비 — 일자별 투입량', rows: costDetail.equipments },
              ].filter(sec => sec.rows.length > 0).map(sec => (
                <div key={sec.title} className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-[#ededed] font-bold text-sm text-[#1d1f20]">{sec.title} ({sec.rows.length}건)</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs whitespace-nowrap">
                      <thead>
                        <tr className="text-[rgba(29,31,32,0.6)] border-t border-[rgba(29,31,32,0.16)]">
                          <th className="p-2 text-left sticky left-0 bg-[#f2f2f3]">이름/구분</th>
                          {Array.from({ length: costDetail.daysInMonth }, (_, i) => (
                            <th key={i} className="p-1 text-center w-7">{i + 1}</th>
                          ))}
                          <th className="p-2 text-right">합계</th>
                          <th className="p-2 text-right">단가</th>
                          <th className="p-2 text-right">금액</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sec.rows.map((r: any) => (
                          <tr key={r.key} className="border-t border-[rgba(29,31,32,0.16)]">
                            <td className="p-2 sticky left-0 bg-[#f2f2f3]">
                              <div className="font-bold text-[#1d1f20]">{r.name}</div>
                              <div className="text-[10px] text-[rgba(29,31,32,0.6)]">{r.sub}</div>
                            </td>
                            {Array.from({ length: costDetail.daysInMonth }, (_, i) => (
                              <td key={i} className="p-1 text-center text-[#5980a6]">{r.days[i + 1] ?? ''}</td>
                            ))}
                            <td className="p-2 text-right font-bold text-[#1d1f20]">{r.totalAmount}</td>
                            <td className="p-2 text-right text-[#1d1f20]">{r.unitPrice.toLocaleString()}</td>
                            <td className="p-2 text-right font-bold text-[#1d1f20]">{won(r.totalPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {[
                { title: '자재', rows: costDetail.materials, get: (r: any) => [r.name, `${r.spec || ''}${r.spec ? ' · ' : ''}${r.unit || ''}`, r.quantity, won(r.totalPrice)] },
                { title: '경비', rows: costDetail.expenses, get: (r: any) => [r.category, '', '', won(r.amount)] },
                { title: '외주', rows: costDetail.outsourcings, get: (r: any) => [r.companyName, r.task, '', won(r.amount)] },
              ].filter(sec => sec.rows.length > 0).map(sec => (
                <div key={sec.title} className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-[#ededed] font-bold text-sm text-[#1d1f20]">{sec.title} ({sec.rows.length}건)</div>
                  <table className="w-full text-xs md:text-sm">
                    <tbody>
                      {sec.rows.map((r: any, i: number) => (
                        <tr key={i} className="border-t border-[rgba(29,31,32,0.16)]">
                          {sec.get(r).map((v: any, j: number) => (
                            <td key={j} className={`p-2 ${j === sec.get(r).length - 1 ? 'text-right font-bold text-[#1d1f20]' : 'text-[#1d1f20]'}`}>{v}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================== 월별 기성청구서 ===================== */}
      {subTab === 'claim' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]">
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
            </select>
            <button onClick={handleExportClaim} className="ml-auto flex items-center gap-1.5 bg-[#f2f2f3] border border-[#5980a6]/40 text-[#5980a6] font-bold px-3 py-2 rounded text-sm hover:bg-[#5980a6]/10">
              <Download className="w-4 h-4" /> 엑셀로 내보내기
            </button>
            {isAdmin && (
              <button onClick={handleGenerateClaim} className="bg-[#5980a6] text-[#f2f2f3] font-bold px-4 py-2 rounded text-sm hover:opacity-90">
                {claim ? '다시 산출' : '기성청구액 산출'}
              </button>
            )}
          </div>

          {claimLoading ? (
            <div className="text-center py-8 text-[rgba(29,31,32,0.55)]">불러오는 중...</div>
          ) : !claim ? (
            <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-8 text-center text-[rgba(29,31,32,0.55)]">
              {year}년 {month}월 기성청구서가 아직 산출되지 않았습니다. {isAdmin && "'기성청구액 산출' 버튼을 눌러주세요."}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-3">
                  <div className="text-xs text-[rgba(29,31,32,0.6)]">이번달 기성청구액</div>
                  <div className="text-base md:text-lg font-bold text-[#5980a6]">{won(claim.totalClaimAmount)}</div>
                </div>
                <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-3">
                  <div className="text-xs text-[rgba(29,31,32,0.6)]">누적 기성고</div>
                  <div className="text-base md:text-lg font-bold text-[#1d1f20]">{won(claim.cumulativeClaimAmount)}</div>
                </div>
                <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-3">
                  <div className="text-xs text-[rgba(29,31,32,0.6)]">이번달 실투입원가</div>
                  <div className="text-base md:text-lg font-bold text-[#1d1f20]">{won(claim.totalCostAmount)}</div>
                </div>
                <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-3">
                  <div className="text-xs text-[rgba(29,31,32,0.6)]">이번달 손익</div>
                  <div className={`text-base md:text-lg font-bold ${claim.profitAmount >= 0 ? 'text-[#16a34a]' : 'text-red-600'}`}>{won(claim.profitAmount)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#ededed] border border-[rgba(29,31,32,0.16)] rounded-xl p-3">
                  <div className="text-xs text-[rgba(29,31,32,0.6)]">누계 실투입원가 (착공~{month}월)</div>
                  <div className="text-base md:text-lg font-bold text-[#1d1f20]">{won(claim.cumulativeCostAmount)}</div>
                </div>
                <div className="bg-[#ededed] border border-[rgba(29,31,32,0.16)] rounded-xl p-3">
                  <div className="text-xs text-[rgba(29,31,32,0.6)]">누계 손익</div>
                  <div className={`text-base md:text-lg font-bold ${claim.cumulativeProfitAmount >= 0 ? 'text-[#16a34a]' : 'text-red-600'}`}>{won(claim.cumulativeProfitAmount)}</div>
                </div>
              </div>

              <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-4 flex items-center justify-between">
                <span className={`text-xs font-bold px-2 py-1 rounded ${STATUS_COLOR[claim.status]}`}>{STATUS_LABEL[claim.status]}</span>
                {isAdmin && (
                  <div className="flex gap-2">
                    {claim.status === 'DRAFT' && <button onClick={() => handleUpdateClaimStatus('SUBMITTED')} className="text-xs font-bold px-3 py-1.5 rounded bg-[#0284c7] text-white hover:opacity-90">원청 제출 처리</button>}
                    {claim.status === 'SUBMITTED' && <button onClick={() => handleUpdateClaimStatus('CONFIRMED')} className="text-xs font-bold px-3 py-1.5 rounded bg-[#16a34a] text-white hover:opacity-90">지급 확정 처리</button>}
                  </div>
                )}
              </div>
            </div>
          )}

          {claimHistory.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-bold text-[#1d1f20] px-1 flex items-center gap-1"><ChevronRight className="w-4 h-4" /> 기성청구 이력</h4>
              {claimHistory.map((c: any) => (
                <div key={c.id} onClick={() => { setYear(c.year); setMonth(c.month) }} className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-3 flex justify-between items-center cursor-pointer hover:border-[#5980a6]/50">
                  <span className="text-sm font-bold text-[#1d1f20]">{c.year}년 {c.month}월</span>
                  <span className="text-sm text-[#5980a6]">{won(c.totalClaimAmount)}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUS_COLOR[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
