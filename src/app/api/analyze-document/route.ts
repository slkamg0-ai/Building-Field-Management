import { GoogleGenAI } from '@google/genai'
import { NextRequest, NextResponse } from 'next/server'

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '' })

const PROMPTS: Record<string, string> = {
  labor: `이 이미지는 건설현장 노무 관련 문서입니다(신분증, 영수증 등).
다음 필드를 추출해 JSON으로만 응답하세요. 값이 없으면 빈 문자열로:
{"name":"작업자 이름","jobType":"공종/직종","unitPrice":"일당 금액(숫자만)","amount":"공수(숫자만, 기본 1)","note":"특이사항"}`,

  equipment: `이 이미지는 건설현장 장비 관련 문서입니다(차량등록증, 영수증 등).
다음 필드를 추출해 JSON으로만 응답하세요. 값이 없으면 빈 문자열로:
{"name":"장비명/차종","spec":"규격 또는 차량번호","unitPrice":"단가(숫자만)","amount":"투입 시간/일수(숫자만, 기본 1)","note":"특이사항"}`,

  equipment_photo: `이 이미지는 건설현장에서 직접 촬영한 실제 장비(중장비/건설기계/차량) 사진입니다.
사진 속 장비를 시각적으로 판단해 다음을 JSON으로만 응답하세요. 값이 없으면 빈 문자열로:
{"name":"장비 종류(한국어 명칭, 예: 굴착기(굴삭기), 덤프트럭, 지게차, 크레인, 휠로더, 불도저, 롤러, 펌프카, 고소작업차, 스카이, 콘크리트믹서트럭 등)","spec":"번호판 또는 장비번호를 보이는 그대로(예: 06가1234, 인천98바5432, 장비 측면 번호)","note":"제조사·색상·톤수/규격 등 식별 특이사항"}
번호판/식별번호의 한글·숫자는 최대한 정확히 읽어 적으세요. 장비 종류가 불확실하면 가장 가까운 명칭으로 추정하고, 번호가 안 보이면 빈 문자열로 두세요.`,

  material: `이 이미지는 건설현장 자재 관련 문서입니다(거래명세서, 영수증 등).
다음 필드를 추출해 JSON으로만 응답하세요. 값이 없으면 빈 문자열로:
{"name":"자재명","spec":"규격","unit":"단위(EA/kg/m/개/포 등)","quantity":"수량(숫자만)","note":"특이사항"}`,

  expense: `이 이미지는 경비 관련 영수증 또는 문서입니다.
다음 필드를 추출해 JSON으로만 응답하세요. 값이 없으면 빈 문자열로:
{"category":"항목명(식대/주유비/소모품 등)","amount":"금액(숫자만)","note":"비고"}`,

  outsourcing: `이 이미지는 외주 관련 문서입니다(거래명세서, 계약서, 영수증 등).
다음 필드를 추출해 JSON으로만 응답하세요. 값이 없으면 빈 문자열로:
{"company":"업체명","task":"작업 내용","amount":"금액(숫자만)","note":"비고"}`,
}

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, formType } = await req.json()

    if (!imageBase64 || !formType) {
      return NextResponse.json({ error: '이미지 또는 폼 타입 누락' }, { status: 400 })
    }

    const prompt = PROMPTS[formType]
    if (!prompt) {
      return NextResponse.json({ error: '지원하지 않는 폼 타입' }, { status: 400 })
    }

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
    const mimeType = imageBase64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { data: base64Data, mimeType } },
            { text: prompt },
          ],
        },
      ],
    })

    const text = response.text ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: '문서에서 정보를 추출할 수 없습니다' }, { status: 422 })
    }

    const extracted = JSON.parse(jsonMatch[0])
    return NextResponse.json({ data: extracted })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
