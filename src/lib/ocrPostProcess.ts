// OCR 추출값 후처리: 정규화 · 오류 예비수정 · 검증
// analyze-document API의 Gemini 추출 결과를 폼에 넣기 전에 보정한다.

export interface PostProcessResult {
  data: Record<string, string>
  warnings: string[] // 사용자가 확인해야 할 항목 안내
}

// ---------- 숫자 정규화 ----------
// "1,500,000원", "₩1.500.000", "１５０００", "5O만" 등 → 숫자 문자열
const FULLWIDTH_DIGITS: Record<string, string> = {
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
  '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
}
// 숫자 문맥에서 흔한 OCR 혼동 문자
const DIGIT_CONFUSIONS: Record<string, string> = {
  O: '0', o: '0', D: '0', Q: '0',
  l: '1', I: '1', '|': '1',
  Z: '2', z: '2',
  S: '5', s: '5',
  B: '8',
  g: '9',
}

export function normalizeNumber(raw: string | undefined | null): { value: string; corrected: boolean } {
  if (!raw) return { value: '', corrected: false }
  let s = String(raw).trim()
  const original = s

  // 전각 → 반각
  s = s.replace(/[０-９]/g, (c) => FULLWIDTH_DIGITS[c] ?? c)
  // 통화기호·단위·공백 제거
  s = s.replace(/[₩\\$¥]|원정?|KRW|won/gi, '').trim()
  // 한국식 단위 표기: "150만", "1.5만", "3천"
  const manMatch = s.match(/^([\d.,]+)\s*만$/)
  const cheonMatch = s.match(/^([\d.,]+)\s*천$/)
  if (manMatch) s = String(Math.round(parseFloat(manMatch[1].replace(/,/g, '')) * 10000))
  else if (cheonMatch) s = String(Math.round(parseFloat(cheonMatch[1].replace(/,/g, '')) * 1000))
  // 숫자 문맥 혼동 문자 보정 (숫자가 하나라도 섞여 있을 때만)
  if (/\d/.test(s)) s = s.replace(/[OoDQlI|ZzSsBg]/g, (c) => DIGIT_CONFUSIONS[c] ?? c)
  // 천단위 구분자 제거 (콤마, 점이 3자리 그룹일 때)
  s = s.replace(/,/g, '')
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  // 남은 비숫자 제거 (소수점 하나는 허용)
  s = s.replace(/[^\d.]/g, '')
  const parts = s.split('.')
  if (parts.length > 2) s = parts[0] + '.' + parts.slice(1).join('')

  return { value: s, corrected: s !== original.trim() && original.trim() !== '' }
}

// ---------- 차량/장비 번호판 검증 ----------
// 한국 번호판: (지역명)? 2~3자리 숫자 + 한글 1자 + 4자리 숫자  예) 06가1234, 인천98바5432
const PLATE_RE = /^(?:[가-힣]{2})?\d{2,3}[가-힣]\d{4}$/
// 번호판 한글 위치에서 흔한 숫자→한글 오인식은 드물어 검증만 수행
export function validatePlate(raw: string | undefined | null): { value: string; valid: boolean } {
  if (!raw) return { value: '', valid: false }
  let s = String(raw).replace(/[\s-]/g, '')
  // 한글 사이 숫자 혼동 보정: 번호판 형식 근사 매칭 시 O→0, I→1
  s = s.replace(/[OoDQ]/g, '0').replace(/[Il|]/g, '1')
  return { value: s, valid: PLATE_RE.test(s) }
}

// ---------- 장비명 표준화 ----------
const EQUIPMENT_ALIASES: Record<string, string> = {
  '굴삭기': '굴착기', '포크레인': '굴착기', '포크래인': '굴착기', '백호': '굴착기', '백호우': '굴착기',
  '덤프': '덤프트럭', '덤프차': '덤프트럭',
  '스카이': '고소작업차', '스카이차': '고소작업차',
  '레미콘': '콘크리트믹서트럭', '레미콘차': '콘크리트믹서트럭', '믹서트럭': '콘크리트믹서트럭',
  '펌프카': '콘크리트펌프카', '펌프차': '콘크리트펌프카',
  '로더': '휠로더', '휠로더': '휠로더', '페이로더': '휠로더',
  '지게차': '지게차', '포크리프트': '지게차',
  '롤라': '롤러', '진동롤러': '롤러',
  '크레인': '크레인', '카고크레인': '카고크레인', '기중기': '크레인',
  '불도저': '불도저', '도자': '불도저',
}
export function normalizeEquipmentName(raw: string | undefined | null): { value: string; corrected: boolean } {
  if (!raw) return { value: '', corrected: false }
  const s = String(raw).trim()
  // 정확 일치 우선, 다음 부분 일치
  if (EQUIPMENT_ALIASES[s]) return { value: EQUIPMENT_ALIASES[s], corrected: EQUIPMENT_ALIASES[s] !== s }
  const canonicals = new Set(Object.values(EQUIPMENT_ALIASES))
  for (const [alias, canonical] of Object.entries(EQUIPMENT_ALIASES)) {
    // 이미 표준 명칭을 포함하면 치환하지 않음 (예: "덤프트럭"에 "덤프" 치환 방지)
    if (s.includes(alias) && alias.length >= 2 && !s.includes(canonical) && !canonicals.has(s)) {
      const replaced = s.replace(alias, canonical)
      return { value: replaced, corrected: replaced !== s }
    }
  }
  return { value: s, corrected: false }
}

// ---------- 공종/직종 표준화 ----------
const JOB_ALIASES: Record<string, string> = {
  '보통인부': '보통인부', '일반인부': '보통인부', '잡부': '보통인부', '조공': '조공',
  '철근공': '철근공', '철근': '철근공',
  '형틀목공': '형틀목공', '형틀': '형틀목공', '목수': '형틀목공',
  '콘크리트공': '콘크리트공', '콘크리트': '콘크리트공', '타설공': '콘크리트공',
  '미장공': '미장공', '미장': '미장공',
  '방수공': '방수공', '방수': '방수공',
  '용접공': '용접공', '용접': '용접공',
  '전기공': '전기공', '전기': '전기공',
  '배관공': '배관공', '배관': '배관공', '설비': '배관공',
  '석공': '석공', '조적공': '조적공', '조적': '조적공',
  '도장공': '도장공', '도장': '도장공', '페인트': '도장공',
  '비계공': '비계공', '비계': '비계공', '아시바': '비계공',
  '측량사': '측량사', '측량': '측량사',
}
export function normalizeJobType(raw: string | undefined | null): { value: string; corrected: boolean } {
  if (!raw) return { value: '', corrected: false }
  const s = String(raw).trim()
  if (JOB_ALIASES[s]) return { value: JOB_ALIASES[s], corrected: JOB_ALIASES[s] !== s }
  return { value: s, corrected: false }
}

// ---------- 금액 타당성 범위 (원) ----------
const AMOUNT_RANGES: Record<string, [number, number]> = {
  laborUnitPrice: [50_000, 1_000_000],     // 일당
  equipmentUnitPrice: [50_000, 5_000_000], // 장비 단가
  expenseAmount: [100, 10_000_000],        // 경비
  outsourcingAmount: [10_000, 500_000_000],
}
function checkRange(key: keyof typeof AMOUNT_RANGES, value: string, label: string, warnings: string[]) {
  if (!value) return
  const n = parseFloat(value)
  if (isNaN(n)) return
  const [min, max] = AMOUNT_RANGES[key]
  if (n < min || n > max) warnings.push(`${label} ${n.toLocaleString()}원이 일반 범위(${min.toLocaleString()}~${max.toLocaleString()})를 벗어남 — 확인 필요`)
}

// ---------- 폼 타입별 후처리 ----------
export function postProcess(formType: string, extracted: Record<string, unknown>): PostProcessResult {
  const d: Record<string, string> = {}
  for (const [k, v] of Object.entries(extracted)) d[k] = v == null ? '' : String(v)
  const warnings: string[] = []

  const num = (field: string, label: string) => {
    const { value, corrected } = normalizeNumber(d[field])
    if (corrected) warnings.push(`${label} 값을 "${d[field]}" → "${value}"로 보정함`)
    d[field] = value
  }

  switch (formType) {
    case 'labor': {
      const job = normalizeJobType(d.jobType)
      if (job.corrected) warnings.push(`공종 "${d.jobType}" → "${job.value}" 표준화`)
      d.jobType = job.value
      num('unitPrice', '일당')
      num('amount', '공수')
      if (!d.amount) d.amount = '1'
      checkRange('laborUnitPrice', d.unitPrice, '일당', warnings)
      if (!d.name) warnings.push('작업자 이름을 인식하지 못함 — 직접 입력 필요')
      break
    }
    case 'equipment':
    case 'equipment_photo': {
      const eq = normalizeEquipmentName(d.name)
      if (eq.corrected) warnings.push(`장비명 "${d.name}" → "${eq.value}" 표준화`)
      d.name = eq.value
      if (formType === 'equipment_photo' && d.spec) {
        const plate = validatePlate(d.spec)
        d.spec = plate.value
        if (!plate.valid) warnings.push(`번호판 "${d.spec}" 형식이 일반 번호판과 다름 — 확인 필요`)
      }
      if (formType === 'equipment') {
        num('unitPrice', '단가')
        num('amount', '투입 시간/일수')
        if (!d.amount) d.amount = '1'
        checkRange('equipmentUnitPrice', d.unitPrice, '단가', warnings)
      }
      if (!d.name) warnings.push('장비명을 인식하지 못함 — 직접 입력 필요')
      break
    }
    case 'material': {
      num('quantity', '수량')
      if (!d.name) warnings.push('자재명을 인식하지 못함 — 직접 입력 필요')
      break
    }
    case 'expense': {
      num('amount', '금액')
      checkRange('expenseAmount', d.amount, '금액', warnings)
      if (!d.amount) warnings.push('금액을 인식하지 못함 — 직접 입력 필요')
      break
    }
    case 'outsourcing': {
      num('amount', '금액')
      checkRange('outsourcingAmount', d.amount, '금액', warnings)
      if (!d.company) warnings.push('업체명을 인식하지 못함 — 직접 입력 필요')
      break
    }
  }
  return { data: d, warnings }
}
