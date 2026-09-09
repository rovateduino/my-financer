import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, 'dados-referencia', 'Link para  Jan_2026.xlsx');
const buffer = fs.readFileSync(filePath);
const workbook = xlsx.read(buffer, { type: 'buffer' });
console.log('Sheet names:', workbook.SheetNames);

workbook.SheetNames.forEach((sheetName) => {
  console.log(`\n=== Sheet: ${sheetName} ===`);
  const worksheet = workbook.Sheets[sheetName];
  const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
  rawData.forEach((row, idx) => {
    console.log(`Row ${idx}:`, row);
  });
});
