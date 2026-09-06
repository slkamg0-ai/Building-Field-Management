'use client'

import { useState, useRef } from 'react'
import {
  Camera,
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  X,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Loader2,
  ShieldCheck,
  Truck,
  UserCheck,
} from 'lucide-react'
import { toast } from './Toast'
import { saveSmartScannedWorkerDoc, saveSmartScannedEquipmentDoc } from '@/lib/actions'

interface Props {
  isOpen: boolean
  onClose: () => void
  initialCategory?: 'worker' | 'equipment'
  onSuccess?: () => void
}

export default function SmartScanModal({ isOpen, onClose, initialCategory = 'worker', onSuccess }: Props) {
  const [category, setCategory] = useState<'worker' | 'equipment'>(initialCategory)
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'review'>('idle')
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const [isPdf, setIsPdf] = useState(false)
  const [extractedData, setExtractedData] = useState<Record<string, any>>({})
  const [warnings, setWarnings] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  // 클라이언트 이미지 최적화 (해상도 1792px 유지, 약 300KB로 압축해 전송)
  const optimizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (file.type === 'application/pdf') {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
        return
      }

      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = event => {
        const img = new Image()
        img.src = event.target?.result as string
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let width = img.width
          let height = img.height
          const max_size = 1792

          if (width > height) {
            if (width > max_size) {
              height *= max_size / width
              width = max_size
            }
          } else {
            if (height > max_size) {
              width *= max_size / height
              height = max_size
            }
          }
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx?.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', 0.85))
        }
      }
      reader.onerror = reject
    })
  }

  const handleFileSelect = async (file?: File) => {
    if (!file) return
    setIsPdf(file.type === 'application/pdf')
    setStatus('analyzing')
    setZoomLevel(1)

    try {
      const dataUrl = await optimizeImage(file)
      setPreviewUrl(dataUrl)

      const res = await fetch('/api/analyze-worker-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileDataUrl: dataUrl,
          docCategory: category,
          fileName: file.name,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '문서 분석에 실패했습니다.')

      setExtractedData(json.extractedData || {})
      setWarnings(json.warnings || [])
      if (json.fileUrl) {
        setPreviewUrl(json.fileUrl)
      }
      setStatus('review')
    } catch (e: any) {
      toast.error(e.message || '서류 분석 중 오류가 발생했습니다.')
      setStatus('idle')
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      if (category === 'worker') {
        if (!extractedData.workerName?.trim()) {
          toast.warning('근로자 성명을 입력해 주세요.')
          setIsSaving(false)
          return
        }

        await saveSmartScannedWorkerDoc({
          workerName: extractedData.workerName,
          birthYYMMDD: extractedData.birthYYMMDD,
          bankName: extractedData.bankName,
          accountNumber: extractedData.accountNumber,
          safetyEduNumber: extractedData.safetyEduNumber,
          basicSafetyEdu: extractedData.safetyEduComplete,
          jobType: extractedData.jobType,
          fileUrl: previewUrl,
          documentType: extractedData.documentTypes?.[0] || 'ID_CARD',
          status: 'SUCCESS',
          note: extractedData.notes,
        })
        toast.success(`근로자 [${extractedData.workerName}] 서류가 등록되었습니다.`)
      } else {
        if (!extractedData.name?.trim()) {
          toast.warning('장비명을 입력해 주세요.')
          setIsSaving(false)
          return
        }

        await saveSmartScannedEquipmentDoc({
          name: extractedData.name,
          spec: extractedData.spec,
          ownerType: extractedData.ownerType,
          driverName: extractedData.driverName,
          driverPhone: extractedData.driverPhone,
          unitPrice: extractedData.unitPrice,
          fileUrl: previewUrl,
          documentType: extractedData.documentType || 'REGISTRATION',
          status: 'SUCCESS',
          note: extractedData.notes,
        })
        toast.success(`장비 [${extractedData.name}] 서류가 등록되었습니다.`)
      }

      onSuccess?.()
      handleClose()
    } catch (e: any) {
      toast.error(e.message || '저장 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = () => {
    setStatus('idle')
    setPreviewUrl('')
    setExtractedData({})
    setWarnings([])
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#f8f9fa] border border-[#3f434a] rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-[#1d1f20]">
        {/* 헤더 */}
        <div className="flex justify-between items-center px-4 py-3 bg-[#181a1d] text-white border-b border-[#2d343d]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#5980a6] flex items-center justify-center text-white">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base">원스톱 스마트 서류 스캔</h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#5980a6]/30 text-[#94bce3] font-bold">
                  v2.0 Flash
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                촬영 2초 만에 AI가 판독하여 마스터 및 안전서류에 즉시 등록합니다
              </p>
            </div>
          </div>

          <button onClick={handleClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#282a2d]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 카테고리 탭 (분석 전만 변경 가능) */}
        {status === 'idle' && (
          <div className="flex border-b border-[rgba(29,31,32,0.12)] bg-[#ededed] p-1.5 gap-1.5">
            <button
              onClick={() => setCategory('worker')}
              className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${
                category === 'worker'
                  ? 'bg-white text-[#181a1d] shadow-sm border border-[rgba(29,31,32,0.1)]'
                  : 'text-[rgba(29,31,32,0.6)] hover:text-[#1d1f20]'
              }`}
            >
              <UserCheck className="w-4 h-4 text-[#5980a6]" />
              근로자 서류 (신분증 / 통장 / 안전교육증)
            </button>
            <button
              onClick={() => setCategory('equipment')}
              className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${
                category === 'equipment'
                  ? 'bg-white text-[#181a1d] shadow-sm border border-[rgba(29,31,32,0.1)]'
                  : 'text-[rgba(29,31,32,0.6)] hover:text-[#1d1f20]'
              }`}
            >
              <Truck className="w-4 h-4 text-[#5980a6]" />
              장비 서류 (건설기계등록증 / 보험증권)
            </button>
          </div>
        )}

        {/* 본문 영역 */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* 상태 1: 파일 업로드 대기 */}
          {status === 'idle' && (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center border-2 border-dashed border-[rgba(29,31,32,0.2)] rounded-xl bg-white">
              <div className="w-16 h-16 rounded-full bg-[#5980a6]/10 text-[#5980a6] flex items-center justify-center mb-4">
                <Camera className="w-8 h-8" />
              </div>
              <h4 className="font-bold text-base text-[#1d1f20] mb-1">
                {category === 'worker' ? '근로자 서류 촬영 또는 선택' : '장비 등록증/보험증권 촬영 또는 선택'}
              </h4>
              <p className="text-xs text-[rgba(29,31,32,0.6)] max-w-sm mb-6 leading-relaxed">
                스마트폰 카메라로 직접 찍거나 갤러리/카카오톡 저장 사진을 선택하세요.
                <br />
                <span className="text-[#5980a6] font-semibold">스캔 앱으로 찍은 PDF 파일도 바로 지원합니다.</span>
              </p>

              <div className="flex flex-wrap gap-3 justify-center w-full max-w-md">
                {/* 모바일 카메라 직접 실행 */}
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex-1 min-w-[140px] flex items-center justify-center gap-2 bg-[#5980a6] hover:bg-[#416180] text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all active:scale-95 text-sm"
                >
                  <Camera className="w-4 h-4" />
                  카메라로 즉시 촬영
                </button>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => handleFileSelect(e.target.files?.[0])}
                />

                {/* 갤러리 / PDF 파일 선택 */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 min-w-[140px] flex items-center justify-center gap-2 bg-white hover:bg-slate-50 border border-[rgba(29,31,32,0.2)] text-[#1d1f20] font-bold py-3 px-4 rounded-xl shadow-sm transition-all active:scale-95 text-sm"
                >
                  <Upload className="w-4 h-4 text-[#5980a6]" />
                  갤러리 / PDF 파일
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={e => handleFileSelect(e.target.files?.[0])}
                />
              </div>
            </div>
          )}

          {/* 상태 2: AI 분석 중 */}
          {status === 'analyzing' && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 className="w-12 h-12 text-[#5980a6] animate-spin mb-4" />
              <h4 className="font-bold text-base text-[#1d1f20] mb-1">Gemini 2.5 AI 실시간 분석 중...</h4>
              <p className="text-xs text-[rgba(29,31,32,0.6)]">
                신분증 성명, 계좌번호, 이수번호 및 장비 등록 정보를 추출하고 있습니다.
              </p>
            </div>
          )}

          {/* 상태 3: Split-Screen 검수 화면 */}
          {status === 'review' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
              {/* 좌측(또는 상단): 원본 서류 뷰어 */}
              <div className="lg:col-span-6 flex flex-col bg-[#181a1d] rounded-xl overflow-hidden border border-[#2d343d] relative min-h-[260px] lg:min-h-[420px]">
                <div className="flex justify-between items-center px-3 py-1.5 bg-[#282a2d] text-white text-xs">
                  <span className="font-bold flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#5980a6]" /> 원본 서류 프리뷰
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setZoomLevel(prev => Math.max(0.7, prev - 0.2))}
                      className="p-1 hover:bg-[#333538] rounded text-slate-300"
                      title="축소"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] text-slate-400 min-w-[32px] text-center">
                      {Math.round(zoomLevel * 100)}%
                    </span>
                    <button
                      onClick={() => setZoomLevel(prev => Math.min(2.5, prev + 0.2))}
                      className="p-1 hover:bg-[#333538] rounded text-slate-300"
                      title="확대"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setZoomLevel(1)}
                      className="p-1 hover:bg-[#333538] rounded text-slate-300 ml-1"
                      title="초기화"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto flex items-center justify-center p-2 bg-[#121416]">
                  {isPdf ? (
                    <iframe src={previewUrl} className="w-full h-full min-h-[300px] border-0" title="PDF Preview" />
                  ) : (
                    <img
                      src={previewUrl}
                      alt="Scanned Document"
                      style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
                      className="max-h-full max-w-full object-contain transition-transform duration-150 rounded"
                    />
                  )}
                </div>
              </div>

              {/* 우측(또는 하단): 추출된 폼 검수 & 수정 */}
              <div className="lg:col-span-6 flex flex-col bg-white border border-[rgba(29,31,32,0.12)] rounded-xl p-4 overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-sm text-[#1d1f20] flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    AI 판독 결과 확인 및 보정
                  </h4>
                  <span className="text-[11px] font-semibold text-[#5980a6] bg-[#5980a6]/10 px-2 py-0.5 rounded">
                    {category === 'worker' ? '노무자 마스터' : '장비 마스터'}
                  </span>
                </div>

                {warnings.length > 0 && (
                  <div className="p-2.5 mb-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-900 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-0.5">
                      {warnings.map((w, i) => (
                        <div key={i}>{w}</div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 폼 필드: 근로자 */}
                {category === 'worker' ? (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-[rgba(29,31,32,0.6)] mb-1">
                          근로자 성명 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={extractedData.workerName || ''}
                          onChange={e => setExtractedData({ ...extractedData, workerName: e.target.value })}
                          className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.2)] rounded-lg px-2.5 py-2 font-bold text-sm text-[#1d1f20] outline-none focus:border-[#5980a6]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[rgba(29,31,32,0.6)] mb-1">
                          생년월일 6자리 (YYMMDD)
                        </label>
                        <input
                          type="text"
                          maxLength={6}
                          placeholder="800101"
                          value={extractedData.birthYYMMDD || ''}
                          onChange={e => setExtractedData({ ...extractedData, birthYYMMDD: e.target.value })}
                          className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.2)] rounded-lg px-2.5 py-2 font-bold text-sm text-[#1d1f20] outline-none focus:border-[#5980a6]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-[rgba(29,31,32,0.6)] mb-1">은행명</label>
                        <input
                          type="text"
                          placeholder="국민, 농협 등"
                          value={extractedData.bankName || ''}
                          onChange={e => setExtractedData({ ...extractedData, bankName: e.target.value })}
                          className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.2)] rounded-lg px-2.5 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[11px] font-bold text-[rgba(29,31,32,0.6)] mb-1">
                          계좌번호 (숫자만)
                        </label>
                        <input
                          type="text"
                          value={extractedData.accountNumber || ''}
                          onChange={e => setExtractedData({ ...extractedData, accountNumber: e.target.value })}
                          className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.2)] rounded-lg px-2.5 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-[rgba(29,31,32,0.6)] mb-1">
                          기초안전보건교육번호
                        </label>
                        <input
                          type="text"
                          value={extractedData.safetyEduNumber || ''}
                          onChange={e => setExtractedData({ ...extractedData, safetyEduNumber: e.target.value })}
                          className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.2)] rounded-lg px-2.5 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[rgba(29,31,32,0.6)] mb-1">추정 공종</label>
                        <input
                          type="text"
                          value={extractedData.jobType || ''}
                          onChange={e => setExtractedData({ ...extractedData, jobType: e.target.value })}
                          className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.2)] rounded-lg px-2.5 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="safetyComplete"
                        checked={!!extractedData.safetyEduComplete}
                        onChange={e => setExtractedData({ ...extractedData, safetyEduComplete: e.target.checked })}
                        className="w-4 h-4 rounded text-[#5980a6] focus:ring-0 cursor-pointer"
                      />
                      <label htmlFor="safetyComplete" className="text-xs font-semibold text-[#1d1f20] cursor-pointer">
                        기초안전보건교육 이수 확인됨
                      </label>
                    </div>
                  </div>
                ) : (
                  /* 폼 필드: 장비 */
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-[rgba(29,31,32,0.6)] mb-1">
                          장비명/차종 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="굴착기, 덤프트럭 등"
                          value={extractedData.name || ''}
                          onChange={e => setExtractedData({ ...extractedData, name: e.target.value })}
                          className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.2)] rounded-lg px-2.5 py-2 font-bold text-sm text-[#1d1f20] outline-none focus:border-[#5980a6]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[rgba(29,31,32,0.6)] mb-1">
                          차량/등록번호
                        </label>
                        <input
                          type="text"
                          placeholder="06가1234"
                          value={extractedData.spec || ''}
                          onChange={e => setExtractedData({ ...extractedData, spec: e.target.value })}
                          className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.2)] rounded-lg px-2.5 py-2 font-bold text-sm text-[#1d1f20] outline-none focus:border-[#5980a6]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-[rgba(29,31,32,0.6)] mb-1">
                          조종원/기사 성명
                        </label>
                        <input
                          type="text"
                          value={extractedData.driverName || ''}
                          onChange={e => setExtractedData({ ...extractedData, driverName: e.target.value })}
                          className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.2)] rounded-lg px-2.5 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[rgba(29,31,32,0.6)] mb-1">
                          조종원 연락처
                        </label>
                        <input
                          type="text"
                          placeholder="010-0000-0000"
                          value={extractedData.driverPhone || ''}
                          onChange={e => setExtractedData({ ...extractedData, driverPhone: e.target.value })}
                          className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.2)] rounded-lg px-2.5 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-[rgba(29,31,32,0.6)] mb-1">소유 구분</label>
                        <select
                          value={extractedData.ownerType || 'SUBCONTRACT'}
                          onChange={e => setExtractedData({ ...extractedData, ownerType: e.target.value })}
                          className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.2)] rounded-lg px-2.5 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]"
                        >
                          <option value="DIRECT">원청 직영</option>
                          <option value="SUBCONTRACT">당사 투입</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[rgba(29,31,32,0.6)] mb-1">
                          기본 단가 (원)
                        </label>
                        <input
                          type="text"
                          value={extractedData.unitPrice || ''}
                          onChange={e => setExtractedData({ ...extractedData, unitPrice: e.target.value })}
                          className="w-full bg-[#f2f2f3] border border-[rgba(29,31,32,0.2)] rounded-lg px-2.5 py-2 text-[#1d1f20] outline-none focus:border-[#5980a6]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 하단 버튼 바 */}
                <div className="mt-auto pt-5 flex items-center justify-between gap-2 border-t border-[rgba(29,31,32,0.12)]">
                  <button
                    type="button"
                    onClick={() => {
                      setStatus('idle')
                      setPreviewUrl('')
                    }}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-[rgba(29,31,32,0.6)] hover:bg-[#ededed]"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> 다시 촬영
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="px-3 py-2 rounded-lg text-xs font-bold text-[rgba(29,31,32,0.6)] hover:bg-[#ededed]"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleSave}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#5980a6] hover:bg-[#416180] text-white shadow-sm transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      승인 및 마스터 저장
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
