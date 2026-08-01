import { GoogleGenAI, Type, type Schema } from '@google/genai'
import { NextRequest, NextResponse } from 'next/server'
import { postProcess } from '@/lib/ocrPostProcess'

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '' })

// 공통 지시: 한국어 문서 OCR에서 흔한 오류를 모델 단계에서 줄인다
const COMMON_RULES = `
규칙:
- 글자가 흐리거나 가려져 판독이 불확실한 값은 추측하지 말고 빈 문자열("")로 두세요.
- 금액·수량은 콤마/통화기호/단위 없이 숫자만 적으세요 (예: "1,500,000원" → "1500000").
- 숫자에서 O(영문)와 0, l/I와 1을 혼동하지 마세요. 금액 자리수를 다시 한 번 확인하세요.
- 도장/스탬프·손글씨 메모는 인쇄된 본문과 구분하세요.
- 여러 후보가 보이면 문서의 합계·총액 등 최종 확정 값을 우선하세요.`

const str = (description: string): Schema => ({ type: Type.STRING, description })

const FORM_DEFS: Record<string, { prompt: string; schema: Schema }> = {
  labor: {
    prompt: `이 이미지는 건설현장 노무 관련 문서입니다(신분증, 영수증, 출력일보 등).
작업자 정보를 추출하세요.${COMMON_RULES}`,
    schema: {
      type: Type.OBJECT,
      properties: {
        name: str('작업자 이름'),
        jobType: str('공종/직종 (예: 보통인부, 철근공, 형틀목공)'),
        unitPrice: str('일당 금액, 숫자만'),
        amount: str('공수, 숫자만, 기본 1'),
        note: str('특이사항'),
      },
      required: ['name', 'jobType', 'unitPrice', 'amount', 'note'],
    },
  },
  equipment: {
    prompt: `이 이미지는 건설현장 장비 관련 문서입니다(차량등록증, 영수증, 세금계산서 등).
장비 투입 정보를 추출하세요.${COMMON_RULES}`,
    schema: {
      type: Type.OBJECT,
      properties: {
        name: str('장비명/차종'),
        spec: str('규격 또는 차량번호'),
        unitPrice: str('단가, 숫자만'),
        amount: str('투입 시간 또는 일수, 숫자만, 기본 1'),
        note: str('특이사항'),
      },
      required: ['name', 'spec', 'unitPrice', 'amount', 'note'],
    },
  },
  equipment_photo: {
    prompt: `이 이미지는 건설현장에서 직접 촬영한 실제 장비(중장비/건설기계/차량) 사진입니다.
사진 속 장비를 시각적으로 판단하세요.
- 장비 종류는 한국어 표준 명칭으로: 굴착기(굴삭기), 덤프트럭, 지게차, 크레인, 휠로더, 불도저, 롤러, 콘크리트펌프카, 고소작업차, 콘크리트믹서트럭 등. 불확실하면 가장 가까운 명칭으로 추정하세요.
- 번호판/장비번호는 보이는 그대로 정확히 (예: 06가1234, 인천98바5432). 한국 번호판은 [지역명 선택]+숫자2~3자리+한글1자+숫자4자리 형식입니다. 형식에 맞춰 한글·숫자를 다시 확인하고, 안 보이면 빈 문자열로 두세요.${COMMON_RULES}`,
    schema: {
      type: Type.OBJECT,
      properties: {
        name: str('장비 종류 한국어 명칭'),
        spec: str('번호판 또는 장비번호, 보이는 그대로'),
        note: str('제조사·색상·톤수/규격 등 식별 특이사항'),
      },
      required: ['name', 'spec', 'note'],
    },
  },
  material: {
    prompt: `이 이미지는 건설현장 자재 관련 문서입니다(거래명세서, 영수증 등).
자재 정보를 추출하세요. 품목이 여러 개면 가장 주된(금액이 큰) 품목 기준으로 적으세요.${COMMON_RULES}`,
    schema: {
      type: Type.OBJECT,
      properties: {
        name: str('자재명'),
        spec: str('규격'),
        unit: str('단위 (EA/kg/m/개/포 등)'),
        quantity: str('수량, 숫자만'),
        note: str('특이사항'),
      },
      required: ['name', 'spec', 'unit', 'quantity', 'note'],
    },
  },
  expense: {
    prompt: `이 이미지는 경비 관련 영수증 또는 문서입니다.
경비 정보를 추출하세요. 금액은 부가세 포함 최종 결제 금액(합계) 기준입니다.${COMMON_RULES}`,
    schema: {
      type: Type.OBJECT,
      properties: {
        category: str('항목명 (식대/주유비/소모품 등)'),
        amount: str('금액, 숫자만'),
        note: str('비고'),
      },
      required: ['category', 'amount', 'note'],
    },
  },
  outsourcing: {
    prompt: `이 이미지는 외주 관련 문서입니다(거래명세서, 계약서, 영수증 등).
외주 정보를 추출하세요.${COMMON_RULES}`,
    schema: {
      type: Type.OBJECT,
      properties: {
        company: str('업체명'),
        task: str('작업 내용'),
        amount: str('금액, 숫자만'),
        note: str('비고'),
      },
      required: ['company', 'task', 'amount', 'note'],
    },
  },
}

async function callGemini(base64Data: string, mimeType: string, def: { prompt: string; schema: Schema }, modelName = 'gemini-2.5-flash') {
  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { data: base64Data, mimeType } },
          { text: def.prompt },
        ],
      },
    ],
    config: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: def.schema,
    },
  })
  return response.text ?? ''
}

function tryParse(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text)
  } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      return JSON.parse(m[0])
    } catch {
      return null
    }
  }
}

// 추출 결과가 유효한지 검증하는 함수 (주요 필수 항목 검사)
function isValidExtraction(formType: string, data: Record<string, unknown> | null): boolean {
  if (!data) return false
  const strVal = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')

  switch (formType) {
    case 'labor':
      return strVal(data.name).length > 0
    case 'equipment':
    case 'equipment_photo':
      return strVal(data.name).length > 0
    case 'material':
      return strVal(data.name).length > 0
    case 'expense':
      return strVal(data.category).length > 0 || strVal(data.amount).length > 0
    case 'outsourcing':
      return strVal(data.company).length > 0 || strVal(data.amount).length > 0
    default:
      return Object.values(data).some(v => strVal(v).length > 0)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, formType } = await req.json()

    if (!imageBase64 || !formType) {
      return NextResponse.json({ error: '이미지 또는 폼 타입 누락' }, { status: 400 })
    }

    const def = FORM_DEFS[formType]
    if (!def) {
      return NextResponse.json({ error: '지원하지 않는 폼 타입' }, { status: 400 })
    }

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
    const mimeType = imageBase64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'

    // 1차 시도: Gemini 2.5 Flash (초고속, 저비용)
    let extracted: Record<string, unknown> | null = null
    let usedModel = 'gemini-2.5-flash'

    try {
      const text = await callGemini(base64Data, mimeType, def, 'gemini-2.5-flash')
      extracted = tryParse(text)
    } catch (err) {
      console.warn('Gemini 2.5 Flash OCR failed, trying Pro:', err)
    }

    // 2차 시도: Flash 추출 실패 또는 주요 항목 누락 시 Gemini 2.5 Pro 폴백 (고성능)
    if (!isValidExtraction(formType, extracted)) {
      console.log(`[OCR] ${formType}: Flash 인식 결과 불충분 → Gemini 2.5 Pro로 정밀 재분석 실행`)
      try {
        const textPro = await callGemini(base64Data, mimeType, def, 'gemini-2.5-pro')
        const extractedPro = tryParse(textPro)
        if (isValidExtraction(formType, extractedPro)) {
          extracted = extractedPro
          usedModel = 'gemini-2.5-pro'
        } else if (extractedPro) {
          // Pro 결과도 완벽하진 않으나 일부 추출된 경우 사용
          extracted = extractedPro
          usedModel = 'gemini-2.5-pro'
        }
      } catch (proErr) {
        console.error('Gemini 2.5 Pro OCR failed:', proErr)
      }
    }

    if (!extracted) {
      return NextResponse.json({ error: '문서에서 정보를 추출할 수 없습니다' }, { status: 422 })
    }

    // 오류 예비수정: 숫자 정규화, 번호판 검증, 명칭 표준화, 범위 점검
    const { data, warnings } = postProcess(formType, extracted)
    return NextResponse.json({ data, warnings, model: usedModel })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
