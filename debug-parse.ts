import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type LaunchType = 'receita' | 'despesa_fixa' | 'despesa_variavel' | 'divida_parcelamento';

interface ParsedLaunchFromExcel {
  description: string;
  value: number;
  type: LaunchType;
  category: string;
  warning?: string;
}

function parseExcelPersonalBudget(rawData: any[][], filename: string): { launches: ParsedLaunchFromExcel[]; warnings: string[] } {
  const launches: ParsedLaunchFromExcel[] = [];
  const warnings: string[] = [];

  // Helper to check if ANY cell in a row has aggregate keywords, EXCEPT when they are part of data
  const hasAggregateKeyword = (row: any[]): boolean => {
    const keywords = ['sub-total', 'sub total', 'subtotal', 'total geral', 'total', 'despesas total mês'];
    for (const cell of row) {
      const cellStr = (cell || '').toString().toLowerCase().trim();
      if (keywords.some(kw => cellStr.includes(kw))) {
        console.log('hasAggregateKeyword found in row:', row, 'keyword cell:', cell);
        return true;
      }
    }
    return false;
  };

  // Aggregate keywords to skip - only skip if description is EXACTLY a number or has only aggregate terms
  const isAggregateRow = (text: string): boolean => {
    if (!text) return false;
    const lower = text.toLowerCase().trim();
    
    // Check keywords - only skip if description is only the aggregate term
    const keywords = ['sub-total', 'sub total', 'subtotal', 'total geral', 'total', 'receita', 'renda mensal total', 'receita mensal', 'despesas total mês', 'categoria', 'valor real', 'renda mensal', 'saldo', 'gastos fixos', 'gastos variados', 'fatura b diário', 'dia', 'valor', 'litros / diesel', 'total r$/mês', 'total litros mês'];
    if (keywords.some(kw => lower === kw)) { // Only skip EXACT matches!
      return true;
    }
    
    // Skip only if description is 100% a number (no other characters)
    const onlyDigitsAndSeparators = /^[\d.,\s]+$/.test(text.trim());
    const hasValidNumber = !isNaN(parseFloat(text.replace(/,/g, '.').trim()));
    if (onlyDigitsAndSeparators && hasValidNumber) {
      return true;
    }
    
    return false;
  };

  const parseValue = (valStr: string): number => {
    if (!valStr) return 0;
    const numStr = valStr.toString().replace(/[^\d.,]/g, '').replace(/,/g, '.');
    return parseFloat(numStr) || 0;
  };

  // Helper: Parse a section with description in one column and value in another
  const parseSection = (type: LaunchType, category: string, startRow: number, endRow: number, descCol: number, valCol: number) => {
    console.log(`parseSection: type=${type}, category=${category}, startRow=${startRow}, endRow=${endRow}, descCol=${descCol}, valCol=${valCol}`);
    for (let row = startRow; row <= endRow && row < rawData.length; row++) {
      const rowData = rawData[row] || [];
      console.log(`Parsing row ${row}:`, rowData);
      if (rowData.length <= Math.max(descCol, valCol)) continue;

      const desc = (rowData[descCol] || '').toString().trim();
      const valStr = (rowData[valCol] || '').toString().trim();
      const val = parseValue(valStr);

      // Skip empty rows
      if (!desc) continue;

      // Skip if no value
      if (!valStr || val <= 0) {
        if (desc) {
          warnings.push(`Linha ${row + 1}: "${desc}" tem descrição mas valor vazio - pulando`);
        }
        continue;
      }

      // Skip if it's an aggregate/header row OR if any cell in the row has an aggregate keyword
      if (isAggregateRow(desc) || hasAggregateKeyword(rowData)) {
        console.log(`Skipping row ${row} (aggregate): desc=${desc}, rowData=${JSON.stringify(rowData)}`);
        continue;
      }

      console.log(`Adding launch from row ${row}:`, { description: desc, value: val, type, category });
      launches.push({
        description: desc,
        value: val,
        type,
        category
      });
    }
  };

  // Find and parse sections
  for (let r = 0; r < rawData.length; r++) {
    const row = rawData[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cell = (row[c] || '').toString().toLowerCase().trim();

      // Check for "Gastos Fixos" header - data should be in col c+1 (description) and c+2 (value)
      if (cell === 'gastos fixos') {
        console.log('Found Gastos Fixos at row', r, 'column', c);
        // Find extent: scan down until any cell has subtotal/total
        let endRow = r;
        // First, check the same row (header row) for data (row 2 in our case)
        const headerRowData = rawData[r] || [];
        const headerDescCell = (headerRowData[c+1] || '').toString().toLowerCase().trim();
        if (headerDescCell && !isAggregateRow(headerDescCell)) {
          endRow = r;
        }
        for (let checkRow = r + 1; checkRow < Math.min(r + 20, rawData.length); checkRow++) {
          const checkRowData = rawData[checkRow] || [];
          if (hasAggregateKeyword(checkRowData)) {
            console.log('Breaking Gastos Fixos endRow at checkRow', checkRow, 'due to aggregate');
            break;
          }
          // Check if there's a non-empty cell in description column (c+1)
          const descCell = (checkRowData[c+1] || '').toString().toLowerCase().trim();
          if (descCell) {
            console.log('Updating Gastos Fixos endRow to', checkRow, 'because descCell is', descCell);
            endRow = checkRow;
          }
        }
        // Parse Gastos Fixos: description in col c+1, value in col c+2
        if (endRow >= r) {
          parseSection('despesa_fixa', 'Contas de Consumo', r, endRow, c + 1, c + 2);
        }
      }

      // Check for "Gastos Variados" header
      if (cell === 'gastos variados') {
        console.log('Found Gastos Variados at row', r, 'column', c);
        let endRow = r;
        // First, check the same row (header row) for data (row 2 in our case)
        const headerRowData = rawData[r] || [];
        const headerDescCell = (headerRowData[c+1] || '').toString().toLowerCase().trim();
        if (headerDescCell && !isAggregateRow(headerDescCell)) {
          endRow = r;
        }
        for (let checkRow = r + 1; checkRow < Math.min(r + 20, rawData.length); checkRow++) {
          const checkRowData = rawData[checkRow] || [];
          if (hasAggregateKeyword(checkRowData)) {
            console.log('Breaking Gastos Variados endRow at checkRow', checkRow, 'due to aggregate');
            break;
          }
          // Check if there's a non-empty cell in description column (c+1)
          const descCell = (checkRowData[c+1] || '').toString().toLowerCase().trim();
          if (descCell) {
            console.log('Updating Gastos Variados endRow to', checkRow, 'because descCell is', descCell);
            endRow = checkRow;
          }
        }
        // Parse Gastos Variados: description in col c+1, value in col c+2
        if (endRow >= r) {
          parseSection('despesa_variavel', 'Outros', r, endRow, c + 1, c + 2);
        }
      }

      // Check for "RECEITA" header (only once at top)
      if (cell === 'receita' && r < 25) {
        console.log('Found RECEITA at row', r, 'column', c);
        // Look for the actual income data starting after headers
        let startRow = r;
        let endRow = r;
        
        // Find all data rows for income - keep going until we hit Gastos Fixos/Gastos Variados!
        for (let checkRow = r; checkRow < Math.min(r + 20, rawData.length); checkRow++) {
          const checkRowData = rawData[checkRow] || [];
          
          // Check if we've hit Gastos Fixos/Gastos Variados header - stop here!
          const hitGastosHeader = checkRowData.some((cellVal: any) => {
            const cellStr = (cellVal || '').toString().toLowerCase().trim();
            return cellStr === 'gastos fixos' || cellStr === 'gastos variados';
          });
          if (hitGastosHeader) break;
          
          // Check both possible column configurations for RECEITA
          // First, check description in c+1, value in c+2
          const checkCell1 = (checkRowData[c+1] || '').toString().toLowerCase().trim();
          const valCell1 = checkRowData[c+2];
          // Then check description in c, value in c+1 (original configuration)
          const checkCell2 = (checkRowData[c] || '').toString().toLowerCase().trim();
          const valCell2 = checkRowData[c+1];
          
          const hasDataInFirstConfig = checkCell1 && valCell1 && !isAggregateRow(checkCell1);
          const hasDataInSecondConfig = checkCell2 && valCell2 && !isAggregateRow(checkCell2);
          
          // Skip header-like rows (only exact matches!)
          const isHeaderRow = ['categoria', 'valor real', 'renda mensal', 'renda mensal total', 'receita'].some(kw => 
            checkCell1 === kw || checkCell2 === kw
          );
          if (isHeaderRow) {
            startRow = checkRow + 1;
            continue;
          }
          
          // This looks like a data row
          if (hasDataInFirstConfig || hasDataInSecondConfig) {
            if (startRow === r) startRow = checkRow; // Set start row if not already set
            endRow = checkRow;
          }
        }

        // Determine which column configuration to use for parsing
        let descCol = c;
        let valCol = c + 1;
        // Check if the first few data rows have data in c+1 and c+2
        for (let checkRow = startRow; checkRow <= endRow; checkRow++) {
          const checkRowData = rawData[checkRow] || [];
          const checkCell1 = (checkRowData[c+1] || '').toString().trim();
          const valCell1 = checkRowData[c+2];
          if (checkCell1 && valCell1) {
            descCol = c + 1;
            valCol = c + 2;
            break;
          }
        }

        // Parse income
        if (endRow >= startRow && startRow < rawData.length) {
          parseSection('receita', 'Salário', startRow, endRow, descCol, valCol);
        }
      }
    }
  }

  return { launches, warnings };
}

// Test with "Despesas mensais" sheet
const filePath = path.join(__dirname, 'dados-referencia', 'Link para  Jan_2026.xlsx');
const buffer = fs.readFileSync(filePath);
const workbook = xlsx.read(buffer, { type: 'buffer' });

let allLaunches: ParsedLaunchFromExcel[] = [];
for (const sheetName of workbook.SheetNames) {
  console.log(`\n=== Processing sheet "${sheetName}" ===`);
  const worksheet = workbook.Sheets[sheetName];
  const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
  console.log('Raw data for sheet:', rawData); // Added!
  const { launches } = parseExcelPersonalBudget(rawData, sheetName);
  allLaunches = [...allLaunches, ...launches];
}

console.log('\n=== Final allLaunches ===');
console.log(JSON.stringify(allLaunches, null, 2));
console.log('\n=== Total launches:', allLaunches.length);
