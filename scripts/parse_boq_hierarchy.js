const XLSX = require('xlsx');

const fp = 'G:\\내 드라이브\\Work\\P송산그린시티1-2공구_우오수공사\\06_내역_수량\\관로공내역서(도급,실행, 견적) 비교표-극동수정.xlsx';
const wb = XLSX.readFile(fp);
const ws = wb.Sheets['우오수공'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

console.log('=== Major Section Hierarchy from 도급내역서 (우오수공) ===');

for (let r = 5; r < data.length; r++) {
  const row = data[r];
  if (!row) continue;
  const col1 = row[1]; // 구분코드 (Ⅱ.5, A, A.1, 1, 1.1 등)
  const col2 = row[2]; // 공종/항목명
  const col3 = row[3]; // 규격
  const col4 = row[4]; // 수량
  const col5 = row[5]; // 단위
  const col7 = row[7]; // 도급금액
  const col9 = row[9]; // 실행금액

  // If code is major like 'A', 'B', 'C', '1', '2' or col7 > 100,000,000
  if (col1 && typeof col1 === 'string' && (col1.length <= 4 || !col1.includes('.'))) {
    console.log(`[Code: ${col1}] ${col2} (${col3 || ''}) | 수량: ${col4 || ''} ${col5 || ''} | 도급액: ${col7 ? col7.toLocaleString() : ''}원 | 실행: ${col9 ? col9.toLocaleString() : ''}원`);
  }
}
