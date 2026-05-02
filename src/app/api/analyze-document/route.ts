import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest, NextResponse } from 'next/server'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!)

const PROMPTS: Record<string, string> = {
  labor: `이 이미지는 건설현장 노무 관련 문서입니다(신분증, 영수증 등).
다음 필드를 추출해 JSON으로만 응답하세요. 값이 없으면 빈 문자열로:
{
  "name": "작업자 이름",
  "jobType": "공종/직종",
  "unitPrice": "일당 금액(숫자만, 원단위)",
  "amount": "공수(숫자만, 기본 1)",
  "note": "특이사항"
}`,

  equipment: `이 이미지는 건설현장 장비 관련 문서입니다(차량등록증, 영수증 등).
다음 필드를 추출해 JSON으로만 응답하세요. 값이 없으면 빈 문자열로:
{
  "name": "장비명/차종",
  "spec": "규격 또는 차량번호",
  "unitPrice": "단가(숫자만, 원단위)",
  "amount": "투입 시간 또는 일수(숫자만, 기본 1)",
  "note": "특이사항"
}`,

  material: `이 이미지는 건설현장 자재 관련 문서입니다(거래명세서, 영수증 등).
다음 필드를 추출해 JSON으로만 응답하세요. 값이 없으면 빈 문자열로:
{
  "name": "자재명",
  "spec": "규격",
  "unit": "단위(EA/kg/m/개/포 등)",
  "quantity": "수량(숫자만)",
  "note": "특이사항"
}`,

  expense: `이 이미지는 경비 관련 영수증 또는 문서입니다.
다음 필드를 추출해 JSON으로만 응답하세요. 값이 없으면 빈 문자열로:
{
  "category": "항목명(식대/주유비/소모품 등)",
  "amount": "금액(숫자만, 원단위)",
  "note": "비고"
}`,

  outsourcing: `이 이미지는 외주 관련 문서입니다(거래명세서, 계약서, 영수증 등).
다음 필드를 추출해 JSON으로만 응답하세요. 값이 없으면 빈 문자열로:
{
  "company": "업체명",
  "task": "작업 내용",
  "amount": "금액(숫자만, 원단위)",
  "note": "비고"
}`,
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

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const result = await model.generateContent([
      { inlineData: { data: base64Data, mimeType } },
      prompt,
    ])

    const text = result.response.text()
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
