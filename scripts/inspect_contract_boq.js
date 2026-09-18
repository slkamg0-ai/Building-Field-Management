const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
  console.log('=== 1. DB ContractItem Check ===');
  const items = await prisma.contractItem.findMany({
    where: { site: { name: { contains: '송산그리시티1-2' } } },
    take: 20
  });
  console.log(`ContractItems count in DB: ${items.length}`);
  if (items.length > 0) {
    console.log('Sample ContractItems:');
    items.slice(0, 5).forEach(it => console.log(`  - [${it.code || ''}] ${it.name} (${it.spec || ''}): 수량 ${it.contractQuantity} ${it.unit || ''}, 금액 ${it.contractAmount}`));
  }

  console.log('\n=== 2. 도급내역서 Excel Files Check ===');
  const files = [
    'G:\\내 드라이브\\Work\\P송산그린시티1-2공구_우오수공사\\06_내역_수량\\관로공내역서(도급,실행, 견적) 비교표-극동수정.xlsx',
    'G:\\내 드라이브\\Work\\P송산그린시티1-2공구_우오수공사\\06_내역_수량\\관로공estimate_kd_nego.xlsx'
  ];

  for (const fp of files) {
    if (!fs.existsSync(fp)) {
      console.log(`File not found: ${fp}`);
      continue;
    }
    console.log(`\n--- Inspecting: ${fp.split('\\\\').pop()} ---`);
    const wb = XLSX.readFile(fp);
    console.log('Sheet Names:', wb.SheetNames);
    
    // Check first few sheets
    for (const sname of wb.SheetNames.slice(0, 4)) {
      const ws = wb.Sheets[sname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      console.log(`\n  Sheet [${sname}] Rows: ${data.length}`);
      const nonEmpties = data.filter(r => r && r.length > 0).slice(0, 10);
      nonEmpties.forEach((r, idx) => {
        console.log(`    Row ${idx+1}:`, JSON.stringify(r.slice(0, 10)));
      });
    }
  }
}

main().finally(() => prisma.$disconnect());
