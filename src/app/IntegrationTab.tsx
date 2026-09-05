'use client'

import { useEffect, useState } from 'react'
import {
  syncWorkersFromConfiguredDriveMaster,
  processPendingWorkerDocuments,
  getWorkerDocumentReviews,
  getWorkers,
  saveWorkerDocumentReview,
  generateMonthlyLaborBilling,
  exportMonthlyLaborBillingToDrive,
} from '@/lib/actions'

type Props = {
  selectedSiteId: string
  selectedYear: number
  selectedMonth: number
  currentDate: string
  onDataChanged: () => void
}

export default function IntegrationTab({ selectedSiteId, selectedYear, selectedMonth, currentDate, onDataChanged }: Props) {
  const [integrationLoading, setIntegrationLoading] = useState<string | null>(null)
  const [integrationError, setIntegrationError] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<any>(null)
  const [documentScanResult, setDocumentScanResult] = useState<any>(null)
  const [billingResult, setBillingResult] = useState<any>(null)
  const [documentReviews, setDocumentReviews] = useState<any[]>([])
  const [documentReviewEdits, setDocumentReviewEdits] = useState<Record<string, any>>({})
  const [documentReviewLoading, setDocumentReviewLoading] = useState(false)
  const [workerOptions, setWorkerOptions] = useState<any[]>([])

  async function loadDocumentReviews() {
    setDocumentReviewLoading(true)
    try {
      const [docs, workers] = await Promise.all([
        getWorkerDocumentReviews(30),
        getWorkers(true),
      ])
      setDocumentReviews(docs)
      setWorkerOptions(workers)
      setDocumentReviewEdits(Object.fromEntries(docs.map((doc: any) => {
        const extracted = doc.extractedData || {}
        return [doc.id, {
          workerId: doc.workerId || '',
          workerName: doc.workerName || extracted.workerName || '',
          birthYYMMDD: doc.birthYYMMDD || extracted.birthYYMMDD || '',
          documentType: doc.documentType || 'OTHER',
          bankName: extracted.bankName || doc.worker?.bankName || '',
          accountNumber: extracted.accountNumber || doc.worker?.accountNumber || '',
          safetyEduNumber: extracted.safetyEduNumber || doc.worker?.safetyEduNumber || '',
          safetyEduComplete: !!extracted.safetyEduComplete,
          status: doc.status || 'REVIEW',
          note: doc.note || '',
        }]
      })))
    } catch (e) {
      setIntegrationError(e instanceof Error ? e.message : String(e))
    } finally {
      setDocumentReviewLoading(false)
    }
  }

  useEffect(() => {
    loadDocumentReviews()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSiteId, selectedYear, selectedMonth, currentDate])

  function patchDocumentReview(id: string, patch: any) {
    setDocumentReviewEdits(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch },
    }))
  }

  async function handleDriveWorkerSync() {
    setIntegrationLoading('sync')
    setIntegrationError(null)
    try {
      const result = await syncWorkersFromConfiguredDriveMaster()
      setSyncResult(result)
      await onDataChanged()
    } catch (e) {
      setIntegrationError(e instanceof Error ? e.message : String(e))
    } finally {
      setIntegrationLoading(null)
    }
  }

  async function handleProcessWorkerDocuments() {
    setIntegrationLoading('documents')
    setIntegrationError(null)
    try {
      const result = await processPendingWorkerDocuments(10)
      setDocumentScanResult(result)
      await loadDocumentReviews()
      await onDataChanged()
    } catch (e) {
      setIntegrationError(e instanceof Error ? e.message : String(e))
    } finally {
      setIntegrationLoading(null)
    }
  }

  async function handleSaveDocumentReview(id: string, approve: boolean) {
    setIntegrationLoading(`review-${id}`)
    setIntegrationError(null)
    try {
      await saveWorkerDocumentReview(id, documentReviewEdits[id] || {}, approve)
      await loadDocumentReviews()
    } catch (e) {
      setIntegrationError(e instanceof Error ? e.message : String(e))
    } finally {
      setIntegrationLoading(null)
    }
  }

  async function handleGenerateMonthlyBilling() {
    if (!selectedSiteId) return
    setIntegrationLoading('billing')
    setIntegrationError(null)
    try {
      const result = await generateMonthlyLaborBilling(selectedSiteId, selectedYear, selectedMonth)
      setBillingResult(result)
    } catch (e) {
      setIntegrationError(e instanceof Error ? e.message : String(e))
    } finally {
      setIntegrationLoading(null)
    }
  }

  async function handleExportMonthlyBilling() {
    if (!selectedSiteId) return
    setIntegrationLoading('export')
    setIntegrationError(null)
    try {
      const result = await exportMonthlyLaborBillingToDrive(selectedSiteId, selectedYear, selectedMonth)
      setBillingResult(result)
    } catch (e) {
      setIntegrationError(e instanceof Error ? e.message : String(e))
    } finally {
      setIntegrationLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center px-2">
        <h3 className="font-bold text-lg text-[#1d1f20] flex items-center gap-2">
          <span className="material-symbols-outlined text-[#0284c7]">hub</span>
          Drive 노무관리 연계
        </h3>
        <span className="text-xs text-[rgba(29,31,32,0.55)]">{selectedYear}년 {selectedMonth}월</span>
      </div>

      {integrationError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-600">
          {integrationError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-5 space-y-4">
          <div>
            <p className="text-xs font-bold tracking-widest text-[#0284c7] uppercase">Worker Master</p>
            <h4 className="font-bold text-[#1d1f20] mt-1">근로자마스터 동기화</h4>
            <p className="text-sm text-[rgba(29,31,32,0.6)] mt-2">Google Drive의 노무관리 마스터 시트에서 근로자 서류 상태, 계좌, 안전교육 정보를 앱 DB로 반영합니다.</p>
          </div>
          <button
            onClick={handleDriveWorkerSync}
            disabled={integrationLoading !== null}
            className="w-full bg-[#0284c7] text-white font-bold py-3 rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">{integrationLoading === 'sync' ? 'sync' : 'cloud_sync'}</span>
            {integrationLoading === 'sync' ? '동기화 중...' : 'Drive 근로자 동기화'}
          </button>
          <button
            onClick={handleProcessWorkerDocuments}
            disabled={integrationLoading !== null}
            className="w-full border border-[#0284c7] text-[#0284c7] font-bold py-3 rounded-lg hover:bg-[#0284c7]/10 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">{integrationLoading === 'documents' ? 'sync' : 'document_scanner'}</span>
            {integrationLoading === 'documents' ? '서류 분석 중...' : '대기 서류 분석'}
          </button>
          {syncResult && (
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">신규</p><p className="font-bold">{syncResult.created}</p></div>
              <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">갱신</p><p className="font-bold">{syncResult.updated}</p></div>
              <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">건너뜀</p><p className="font-bold">{syncResult.skipped}</p></div>
              <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">전체</p><p className="font-bold">{syncResult.total}</p></div>
            </div>
          )}
          {documentScanResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">처리</p><p className="font-bold">{documentScanResult.processed}</p></div>
                <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">완료</p><p className="font-bold text-[#16a34a]">{documentScanResult.completed}</p></div>
                <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">검토</p><p className="font-bold text-amber-600">{documentScanResult.review}</p></div>
                <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">실패</p><p className="font-bold text-red-600">{documentScanResult.failed}</p></div>
              </div>
              <div className="border border-[rgba(29,31,32,0.16)] rounded-lg overflow-hidden">
                <div className="max-h-40 overflow-auto divide-y divide-[rgba(29,31,32,0.16)]">
                  {documentScanResult.details?.slice(0, 10).map((item: any, idx: number) => (
                    <div key={`${item.fileName}-${idx}`} className="px-3 py-2 text-xs">
                      <p className="font-bold text-[#1d1f20]">{item.workerName || item.fileName}</p>
                      <p className="text-[rgba(29,31,32,0.55)]">{item.status}{item.reason ? ` · ${item.reason}` : ''}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-5 space-y-4">
          <div>
            <p className="text-xs font-bold tracking-widest text-[#16a34a] uppercase">Monthly Billing</p>
            <h4 className="font-bold text-[#1d1f20] mt-1">월별 노무 기성 초안</h4>
            <p className="text-sm text-[rgba(29,31,32,0.6)] mt-2">앱에 입력된 일일 노무 투입 내역과 근로자 서류 상태를 합쳐 월별투입명세 초안을 생성합니다.</p>
          </div>
          <button
            onClick={handleGenerateMonthlyBilling}
            disabled={integrationLoading !== null || !selectedSiteId}
            className="w-full bg-[#16a34a] text-white font-bold py-3 rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">{integrationLoading === 'billing' ? 'sync' : 'request_quote'}</span>
            {integrationLoading === 'billing' ? '생성 중...' : '월별투입명세 생성'}
          </button>
          <button
            onClick={handleExportMonthlyBilling}
            disabled={integrationLoading !== null || !selectedSiteId}
            className="w-full border border-[#16a34a] text-[#16a34a] font-bold py-3 rounded-lg hover:bg-[#16a34a]/10 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">{integrationLoading === 'export' ? 'sync' : 'drive_file_move'}</span>
            {integrationLoading === 'export' ? '출력 중...' : 'Google Sheets/PDF 출력'}
          </button>
          {billingResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">인원</p><p className="font-bold">{billingResult.billing.workerCount}</p></div>
                <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">지급가능</p><p className="font-bold text-[#16a34a]">{billingResult.billing.readyWorkerCount}</p></div>
                <div className="bg-[#f2f2f3] rounded-lg p-3"><p className="text-[10px] text-[rgba(29,31,32,0.55)]">보류</p><p className="font-bold text-red-600">{billingResult.billing.holdWorkerCount}</p></div>
              </div>
              <div className="border border-[rgba(29,31,32,0.16)] rounded-lg overflow-hidden">
                <div className="max-h-64 overflow-auto divide-y divide-[rgba(29,31,32,0.16)]">
                  {billingResult.items.slice(0, 20).map((item: any, idx: number) => (
                    <div key={`${item.name}-${idx}`} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div>
                        <p className="font-bold text-[#1d1f20]">{item.name}</p>
                        <p className="text-[10px] text-[rgba(29,31,32,0.55)]">{item.jobType} · {item.amount}공수 · {item.documentStatus}</p>
                      </div>
                      <p className="font-bold">₩{item.totalPrice.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
              {(billingResult.spreadsheetUrl || billingResult.pdfUrl) && (
                <div className="flex flex-wrap gap-2">
                  {billingResult.spreadsheetUrl && (
                    <a href={billingResult.spreadsheetUrl} target="_blank" className="text-xs font-bold text-[#0284c7] border border-[#0284c7]/30 rounded px-3 py-2 hover:bg-[#0284c7]/10">
                      Google Sheets 열기
                    </a>
                  )}
                  {billingResult.pdfUrl && (
                    <a href={billingResult.pdfUrl} target="_blank" className="text-xs font-bold text-[#16a34a] border border-[#16a34a]/30 rounded px-3 py-2 hover:bg-[#16a34a]/10">
                      PDF 열기
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs font-bold tracking-widest text-[#7c3aed] uppercase">Document Review</p>
            <h4 className="font-bold text-[#1d1f20] mt-1">AI 서류 인식 검수</h4>
            <p className="text-sm text-[rgba(29,31,32,0.6)] mt-2">인식된 이름, 생년월일, 계좌, 안전교육 정보를 관리자가 수정하고 승인합니다.</p>
          </div>
          <button
            onClick={loadDocumentReviews}
            disabled={documentReviewLoading || integrationLoading !== null}
            className="px-3 py-2 rounded-lg border border-[#7c3aed]/40 text-[#7c3aed] text-sm font-bold disabled:opacity-50"
          >
            {documentReviewLoading ? '불러오는 중...' : '새로고침'}
          </button>
        </div>

        <div className="space-y-3 max-h-[520px] overflow-auto pr-1">
          {documentReviews.length === 0 && (
            <div className="text-center text-sm text-[rgba(29,31,32,0.55)] py-8 bg-[#f2f2f3] rounded-lg">
              검수할 서류가 없습니다.
            </div>
          )}
          {documentReviews.map((doc: any) => {
            const edit = documentReviewEdits[doc.id] || {}
            const busy = integrationLoading === `review-${doc.id}`
            return (
              <div key={doc.id} className="border border-[rgba(29,31,32,0.16)] rounded-xl p-3 space-y-3">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="flex-1 min-w-[220px]">
                    <p className="font-bold text-sm text-[#1d1f20]">{doc.sourceFileName || doc.workerName || '서류'}</p>
                    <p className="text-[11px] text-[rgba(29,31,32,0.55)]">
                      {doc.status} · {doc.documentType} · 신뢰도 {doc.confidence == null ? '-' : `${Math.round(doc.confidence * 100)}%`}
                    </p>
                  </div>
                  {doc.driveFileUrl && (
                    <a href={doc.driveFileUrl} target="_blank" className="text-xs font-bold text-[#0284c7] border border-[#0284c7]/30 rounded px-2 py-1">
                      원본 열기
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <select
                    value={edit.workerId || ''}
                    onChange={e => {
                      const worker = workerOptions.find(w => w.id === e.target.value)
                      patchDocumentReview(doc.id, {
                        workerId: e.target.value,
                        ...(worker ? {
                          workerName: worker.name || edit.workerName,
                          birthYYMMDD: worker.birthYYMMDD || edit.birthYYMMDD,
                          bankName: worker.bankName || edit.bankName,
                          accountNumber: worker.accountNumber || edit.accountNumber,
                          safetyEduNumber: worker.safetyEduNumber || edit.safetyEduNumber,
                        } : {}),
                      })
                    }}
                    className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-sm"
                  >
                    <option value="">근로자 선택/신규</option>
                    {workerOptions.filter(w => w.isActive).map(w => (
                      <option key={w.id} value={w.id}>{w.name}{w.birthYYMMDD ? `_${w.birthYYMMDD}` : ''}</option>
                    ))}
                  </select>
                  <input value={edit.workerName || ''} onChange={e => patchDocumentReview(doc.id, { workerName: e.target.value })} placeholder="이름" className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-sm" />
                  <input value={edit.birthYYMMDD || ''} onChange={e => patchDocumentReview(doc.id, { birthYYMMDD: e.target.value.replace(/[^\d]/g, '').slice(0, 6) })} placeholder="생년월일 6자리" className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-sm" />
                  <select value={edit.documentType || 'OTHER'} onChange={e => patchDocumentReview(doc.id, { documentType: e.target.value })} className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-sm">
                    <option value="ID_CARD">신분증</option>
                    <option value="DRIVER_LICENSE">운전면허증</option>
                    <option value="BANKBOOK">통장사본</option>
                    <option value="SAFETY_EDU">안전교육증</option>
                    <option value="OTHER">기타</option>
                  </select>
                  <input value={edit.bankName || ''} onChange={e => patchDocumentReview(doc.id, { bankName: e.target.value })} placeholder="은행" className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-sm" />
                  <input value={edit.accountNumber || ''} onChange={e => patchDocumentReview(doc.id, { accountNumber: e.target.value })} placeholder="계좌번호" className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-sm md:col-span-2" />
                  <input value={edit.safetyEduNumber || ''} onChange={e => patchDocumentReview(doc.id, { safetyEduNumber: e.target.value })} placeholder="안전교육번호" className="bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-sm" />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-[rgba(29,31,32,0.55)]">
                    <input type="checkbox" checked={!!edit.safetyEduComplete} onChange={e => patchDocumentReview(doc.id, { safetyEduComplete: e.target.checked })} className="accent-[#5980a6]" />
                    안전교육 이수
                  </label>
                  <input value={edit.note || ''} onChange={e => patchDocumentReview(doc.id, { note: e.target.value })} placeholder="검수 메모" className="flex-1 min-w-[180px] bg-[#f2f2f3] border border-[rgba(29,31,32,0.16)] rounded px-3 py-2 text-sm" />
                  <button onClick={() => handleSaveDocumentReview(doc.id, false)} disabled={busy} className="px-3 py-2 rounded-lg border border-[rgba(29,31,32,0.55)]/30 text-[rgba(29,31,32,0.55)] text-sm font-bold disabled:opacity-50">
                    저장
                  </button>
                  <button onClick={() => handleSaveDocumentReview(doc.id, true)} disabled={busy} className="px-3 py-2 rounded-lg bg-[#5980a6] text-white text-sm font-bold disabled:opacity-50">
                    승인
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
