import fs from 'fs'
import * as XLSX from 'xlsx'
const p = 'e:/Paid Project/Muhammad Amr Sudia Arabic/ERPNext/Culinova-Custom-ERPNext/ITEM MASTER CUILINVA 2.xlsb'
const wb = XLSX.read(fs.readFileSync(p), { cellComments: true })
console.log('SHEETS:', wb.SheetNames.join(', '))
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  console.log(`\n================= SHEET: ${name}  (rows=${rows.length}) =================`)
  // print up to first 4 rows fully (header + brief rows), each cell on its own line
  for (let r = 0; r < Math.min(rows.length, 4); r++) {
    console.log(`\n--- ROW ${r + 1} ---`)
    rows[r].forEach((cell, i) => { if (cell !== '' && cell != null) console.log(`  [${i}] ${String(cell).slice(0, 300)}`) })
  }
}
process.exit(0)
