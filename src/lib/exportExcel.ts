import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'

function downloadWorkbook(wb: XLSX.WorkBook, fileName: string) {
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  saveAs(blob, fileName)
}

export function exportMonthlyReport(
  siteName: string,
  monthLabel: string, // e.g. "2026년 4월"
  logData: any,       // 오늘 하루 데이터 (선택)
  monthlyStats: any,  // 월별 집계 데이터
  siteTotalStats: any // 전체 누적 데이터
) {
  const wb = XLSX.utils.book_new()

  // ===== 시트 1: 월간 일별 집계 =====
  const summaryRows: any[][] = [
    [`${siteName} - ${monthLabel} 월간 비용 집계`],
    [],
    ['일자', '노무비', '장비대', '외주비', '경비', '일별 합계'],
  ]

  let grandLabor = 0, grandEquip = 0, grandOuts = 0, grandExp = 0
  if (monthlyStats?.dailyData) {
    monthlyStats.dailyData.forEach((row: any) => {
      const l = row['노무비'] || 0
      const e = row['장비대'] || 0
      const o = row['외주비'] || 0
      const x = row['경비'] || 0
      grandLabor += l; grandEquip += e; grandOuts += o; grandExp += x
      summaryRows.push([row.name, l, e, o, x, l + e + o + x])
    })
  }
  summaryRows.push(['합계', grandLabor, grandEquip, grandOuts, grandExp, grandLabor + grandEquip + grandOuts + grandExp])

  if (siteTotalStats?.site) {
    summaryRows.push([])
    summaryRows.push(['도급액', siteTotalStats.site.contractAmount])
    summaryRows.push(['누적 투입비', siteTotalStats.totalSpent])
    summaryRows.push(['잔여 예산', siteTotalStats.site.contractAmount - siteTotalStats.totalSpent])
    summaryRows.push(['전체 공기', `${siteTotalStats.totalDays}일`])
    summaryRows.push(['경과 일수', `${siteTotalStats.passedDays}일`])
  }

  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows)
  // 열 너비 설정
  ws1['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws1, '월간집계')

  // ===== 시트 2: 노무 명세 =====
  if (logData?.labors?.length > 0) {
    const laborRows: any[][] = [
      ['작업자', '공종', '단가', '투입공수', '금액', '비고'],
      ...logData.labors.map((l: any) => [l.name, l.jobType, l.unitPrice, l.amount, l.totalPrice, l.note || ''])
    ]
    const ws2 = XLSX.utils.aoa_to_sheet(laborRows)
    ws2['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, ws2, '노무명세')
  }

  // ===== 시트 3: 장비 명세 =====
  if (logData?.equipments?.length > 0) {
    const eqRows: any[][] = [
      ['장비명', '규격', '단가', '투입량', '금액', '비고'],
      ...logData.equipments.map((e: any) => [e.name, e.spec || '', e.unitPrice, e.amount, e.totalPrice, e.note || ''])
    ]
    const ws3 = XLSX.utils.aoa_to_sheet(eqRows)
    ws3['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, ws3, '장비명세')
  }

  // ===== 시트 4: 외주 명세 =====
  if (logData?.outsourcings?.length > 0) {
    const outRows: any[][] = [
      ['업체명', '작업내용', '금액', '비고'],
      ...logData.outsourcings.map((o: any) => [o.companyName, o.task, o.amount, o.note || ''])
    ]
    const ws4 = XLSX.utils.aoa_to_sheet(outRows)
    ws4['!cols'] = [{ wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, ws4, '외주명세')
  }

  // ===== 시트 5: 경비 명세 =====
  if (logData?.expenses?.length > 0) {
    const expRows: any[][] = [
      ['항목', '금액', '비고'],
      ...logData.expenses.map((e: any) => [e.category, e.amount, e.note || ''])
    ]
    const ws5 = XLSX.utils.aoa_to_sheet(expRows)
    ws5['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 24 }]
    XLSX.utils.book_append_sheet(wb, ws5, '경비명세')
  }

  // 파일 다운로드
  const fileName = `${siteName}_${monthLabel}_작업일보.xlsx`
  downloadWorkbook(wb, fileName)
}
