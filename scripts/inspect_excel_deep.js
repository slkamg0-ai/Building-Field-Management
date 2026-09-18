const XLSX = require('xlsx');

function excelDateToJS(serial) {
  if (typeof serial !== 'number') return serial;
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return date_info.toISOString().slice(0, 10);
}

const files = [
  { month: 7, path: 'G:\\내 드라이브\\Work\\P송산그린시티1-2공구_우오수공사\\08_투입관리\\7월 투입.xlsx' },
  { month: 8, path: 'G:\\내 드라이브\\Work\\P송산그린시티1-2공구_우오수공사\\08_투입관리\\8월 투입.xlsx' },
  { month: 9, path: 'G:\\내 드라이브\\Work\\P송산그린시티1-2공구_우오수공사\\08_투입관리\\9월 투입.xlsx' }
];

for (const f of files) {
  console.log(`\n================== ${f.month}월 투입 분석 ==================`);
  const wb = XLSX.readFile(f.path);

  // 1. 노무비
  const laborSheetName = wb.SheetNames.find(s => s.includes('노무비'));
  if (laborSheetName) {
    const ws = wb.Sheets[laborSheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    console.log(`\n[${laborSheetName}] Rows: ${data.length}`);
    // Print row 3 & 4 (headers)
    console.log('  Header Row 3:', data[2]?.slice(0, 15).map(v => typeof v === 'number' && v > 40000 ? excelDateToJS(v) : v));
    console.log('  Header Row 4:', data[3]?.slice(0, 15).map(v => typeof v === 'number' && v > 40000 ? excelDateToJS(v) : v));
    
    // Find worker rows
    const workerRows = [];
    for (let r = 4; r < data.length; r++) {
      const row = data[r];
      if (!row || !row[2]) continue; // Name in col index 2
      const num = row[0];
      const job = row[1];
      const name = String(row[2]).trim();
      if (!name || name === '성명' || name === '소계' || name === '합계') continue;
      
      // Let's count non-empty attendance values in date columns
      let workCount = 0;
      let totalManDays = 0;
      for (let c = 5; c < row.length; c++) {
        const val = row[c];
        if (typeof val === 'number') {
          totalManDays += val;
          workCount++;
        }
      }
      workerRows.push({ num, job, name, workCount, totalManDays, rowIdx: r });
    }
    console.log(`  Identified Workers (${workerRows.length}):`);
    workerRows.forEach(w => console.log(`    - [Row ${w.rowIdx+1}] ${w.name} (${w.job}): ${w.workCount}일 출역, 총 ${w.totalManDays}공수`));
  }

  // 2. 장비
  const eqSheetName = wb.SheetNames.find(s => s.includes('장비') && !s.includes('목록'));
  if (eqSheetName) {
    const ws = wb.Sheets[eqSheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    console.log(`\n[${eqSheetName}] Rows: ${data.length}`);
    console.log('  Header Row 3:', data[2]?.slice(0, 15).map(v => typeof v === 'number' && v > 40000 ? excelDateToJS(v) : v));
    console.log('  Header Row 4:', data[3]?.slice(0, 15).map(v => typeof v === 'number' && v > 40000 ? excelDateToJS(v) : v));

    const eqRows = [];
    for (let r = 4; r < data.length; r++) {
      const row = data[r];
      if (!row || (!row[1] && !row[2] && !row[3])) continue;
      const num = row[0];
      const eqName = row[1];
      const regNo = row[2];
      const company = row[3];
      if (!eqName && !company) continue;

      let workCount = 0;
      let totalAmount = 0;
      for (let c = 5; c < row.length; c++) {
        const val = row[c];
        if (typeof val === 'number') {
          totalAmount += val;
          workCount++;
        }
      }
      eqRows.push({ num, eqName, regNo, company, workCount, totalAmount, rowIdx: r });
    }
    console.log(`  Identified Equipment (${eqRows.length}):`);
    eqRows.forEach(e => console.log(`    - [Row ${e.rowIdx+1}] ${e.eqName} (${e.regNo || e.company}): ${e.workCount}일 투입, 총 ${e.totalAmount}`));
  }

  // 3. 관리비
  const expSheetName = wb.SheetNames.find(s => s.includes('관리비'));
  if (expSheetName) {
    const ws = wb.Sheets[expSheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    console.log(`\n[${expSheetName}] Rows: ${data.length}`);
    const expenses = [];
    for (let r = 4; r < data.length; r++) {
      const row = data[r];
      if (!row || !row[1] || row[1] === '합     계' || row[1] === '합계') continue;
      const dateSerial = row[0];
      const dateStr = typeof dateSerial === 'number' ? excelDateToJS(dateSerial) : dateSerial;
      const vendor = row[1];
      const desc = row[3];
      const amount = row[4] || row[6]; // supply or total
      if (amount) {
        expenses.push({ dateStr, vendor, desc, amount, rowIdx: r });
      }
    }
    console.log(`  Identified Expenses (${expenses.length}):`);
    expenses.slice(0, 10).forEach(ex => console.log(`    - ${ex.dateStr} | ${ex.vendor} | ${ex.desc} | ${ex.amount}원`));
    if (expenses.length > 10) console.log(`    ... and ${expenses.length - 10} more`);
  }
}
