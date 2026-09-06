import { GoogleGenAI, Type, type Schema } from '@google/genai'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { uploadDataUrlToR2 } from '@/lib/r2'
import { normalizeEquipmentName, normalizeJobType, normalizeNumber, validatePlate } from '@/lib/ocrPostProcess'

export const maxDuration = 60

const COMMON_RULES = `
규칙:
- 글자가 흐리거나 가려져 판독이 불확실한 값은 추측하지 말고 빈 문자열("")로 두세요.
- 주민등록번호 뒷자리는 수집하지 않으므로 생년월일 앞 6자리(YYMMDD)만 추출하세요.
- 계좌번호, 교육번호 등 숫자에서 O(영문)와 0, l/I와 1을 혼동하지 마세요.
- 도장/스탬프·손글씨 메모는 인쇄된 본문과 구분하세요.`

const str = (description: string): Schema => ({ type: Type.STRING, description })

const WORKER_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    workerName: str('근로자 성명'),
    birthYYMMDD: str('생년월일 6자리 (YYMMDD 형식)'),
    bankName: str('은행명 (국민, 신한, 농협 등)'),
    accountNumber: str('계좌번호 (하이픈 없이 숫자만)'),
    safetyEduNumber: str('기초안전보건교육 이수증 번호'),
    safetyEduComplete: { type: Type.BOOLEAN, description: '기초안전보건교육 이수 여부' },
    documentTypes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '포함된 서류 종류 (ID_CARD, BANKBOOK, SAFETY_EDU, OTHER)',
    },
    jobType: str('추정 공종/직종 (보통인부, 철근공, 목수 등, 불확실하면 보통인부)'),
    notes: str('특이사항 또는 판독 주의점'),
  },
  required: ['workerName', 'birthYYMMDD', 'bankName', 'accountNumber', 'safetyEduNumber', 'safetyEduComplete', 'documentTypes'],
}

const EQUIPMENT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    name: str('장비 종류 한국어 표준 명칭 (굴착기, 덤프트럭, 지게차, 크레인 등)'),
    spec: str('차량번호 또는 등록번호 (예: 06가1234, 인천98바5432)'),
    ownerType: str('소유구분 (DIRECT: 원청 직영, SUBCONTRACT: 당사 투입)'),
    driverName: str('조종원/기사 성명 (문서에 기재되어 있을 경우)'),
    driverPhone: str('조종원 연락처'),
    documentType: str('서류 종류 (REGISTRATION: 건설기계등록증/차량등록증, INSURANCE: 배상책임보험증권, LICENSE: 조종사면허증, OTHER)'),
    unitPrice: str('단가 또는 일대 (문서에 금액이 있을 경우, 숫자만)'),
    notes: str('규격, 톤수, 유효기간 등 특이사항'),
  },
  required: ['name', 'spec', 'ownerType', 'driverName', 'driverPhone', 'documentType'],
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  try {
    const { fileDataUrl, docCategory = 'worker', fileName = 'doc' } = await req.json()

    if (!fileDataUrl) {
      return NextResponse.json({ error: '파일 데이터가 누락되었습니다.' }, { status: 400 })
    }

    const matches = fileDataUrl.match(/^data:(.+?);base64,(.*)$/)
    if (!matches) {
      return NextResponse.json({ error: '잘못된 데이터 형식입니다.' }, { status: 400 })
    }

    const mimeType = matches[1]
    const base64Data = matches[2]

    const isEquipment = docCategory === 'equipment'
    const promptText = isEquipment
      ? `이 파일은 건설현장 장비 관련 서류(건설기계등록증, 차량등록증, 영업배상책임보험증권, 조종사 면허증 등)입니다. 정보를 정확히 추출하세요.${COMMON_RULES}`
      : `이 파일은 건설현장 근로자 관련 서류(주민등록증, 운전면허증, 통장 사본, 기초안전보건교육 이수증 등)입니다. 1장의 이미지 안에 여러 서류가 함께 촬영되어 있을 수도 있습니다. 근로자 정보를 종합적으로 추출하세요.${COMMON_RULES}`

    const schema = isEquipment ? EQUIPMENT_SCHEMA : WORKER_SCHEMA

    // 1. Gemini Vision 호출
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API 키가 설정되지 않았습니다.' }, { status: 500 })
    }
    const ai = new GoogleGenAI({ apiKey })

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { data: base64Data, mimeType } },
            { text: promptText },
          ],
        },
      ],
      config: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    })

    const rawJson = JSON.parse(response.text ?? '{}')
    const warnings: string[] = []

    // 2. 후처리 정규화
    let cleanedData: Record<string, any> = {}
    if (isEquipment) {
      const eqName = normalizeEquipmentName(rawJson.name)
      if (eqName.corrected) warnings.push(`장비명 "${rawJson.name}" → "${eqName.value}" 표준화`)
      
      const plate = validatePlate(rawJson.spec)
      if (!plate.valid && rawJson.spec) warnings.push(`등록번호 "${rawJson.spec}" 형식 확인 필요`)

      const price = normalizeNumber(rawJson.unitPrice)

      cleanedData = {
        name: eqName.value || rawJson.name || '',
        spec: plate.value || rawJson.spec || '',
        ownerType: ['DIRECT', 'SUBCONTRACT'].includes(rawJson.ownerType) ? rawJson.ownerType : 'SUBCONTRACT',
        driverName: rawJson.driverName?.trim() || '',
        driverPhone: rawJson.driverPhone?.replace(/[^\d-]/g, '') || '',
        documentType: rawJson.documentType || 'REGISTRATION',
        unitPrice: price.value || '',
        notes: rawJson.notes || '',
      }
    } else {
      const job = normalizeJobType(rawJson.jobType)
      const accNum = rawJson.accountNumber ? String(rawJson.accountNumber).replace(/[^\d]/g, '') : ''
      const birth = rawJson.birthYYMMDD ? String(rawJson.birthYYMMDD).replace(/[^\d]/g, '').slice(0, 6) : ''

      cleanedData = {
        workerName: rawJson.workerName?.trim() || '',
        birthYYMMDD: birth,
        bankName: rawJson.bankName?.trim() || '',
        accountNumber: accNum,
        safetyEduNumber: rawJson.safetyEduNumber?.trim() || '',
        safetyEduComplete: !!rawJson.safetyEduComplete || !!rawJson.safetyEduNumber,
        documentTypes: Array.isArray(rawJson.documentTypes) ? rawJson.documentTypes : [],
        jobType: job.value || '보통인부',
        notes: rawJson.notes || '',
      }

      if (!cleanedData.workerName) warnings.push('근로자 성명을 감지하지 못했습니다. 직접 입력해 주세요.')
      if (!cleanedData.birthYYMMDD) warnings.push('생년월일(6자리)을 감지하지 못했습니다.')
    }

    // 3. Cloudflare R2 영구 저장 시도
    let r2Url = ''
    try {
      const prefix = isEquipment ? 'equipment_doc' : 'worker_doc'
      r2Url = await uploadDataUrlToR2(fileDataUrl, prefix)
    } catch (r2Err) {
      console.warn('[R2 Upload Warning]:', r2Err instanceof Error ? r2Err.message : r2Err)
      r2Url = ''
    }

    return NextResponse.json({
      success: true,
      docCategory,
      fileUrl: r2Url || fileDataUrl,
      extractedData: cleanedData,
      warnings,
    })
  } catch (err: any) {
    console.error('[analyze-worker-document error]:', err)
    return NextResponse.json({ error: err.message || '서류 분석 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
