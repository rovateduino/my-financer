import fs from 'fs';
import path from 'path';
import { PDFParse } from 'pdf-parse';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function categorizeEntry(lowerDesc: string, isRevenue: boolean) {
  if (isRevenue) {
    if (
      lowerDesc.includes('salario') ||
      lowerDesc.includes('vencimento') ||
      lowerDesc.includes('recebido') ||
      lowerDesc.includes('remuneracao') ||
      lowerDesc.includes('remuneração')
    ) {
      return 'Salário';
    }
    if (lowerDesc.includes('investimento') || lowerDesc.includes('rendimento')) {
      return 'Investimentos';
    }
    return 'Outras Receitas';
  } else {
    if (lowerDesc.includes('supermercado') || lowerDesc.includes('mercado')) {
      return 'Supermercado';
    }
    if (lowerDesc.includes('restaurante') || lowerDesc.includes('ifood') || lowerDesc.includes('food')) {
      return 'Alimentação';
    }
    if (lowerDesc.includes('transporte') || lowerDesc.includes('uber') || lowerDesc.includes('99pop')) {
      return 'Transporte';
    }
    if (lowerDesc.includes('aluguel')) {
      return 'Aluguel';
    }
    if (lowerDesc.includes('energia') || lowerDesc.includes('enel')) {
      return 'Energia';
    }
    if (lowerDesc.includes('internet') || lowerDesc.includes('vivo') || lowerDesc.includes('tim')) {
      return 'Internet';
    }
    if (lowerDesc.includes('saude') || lowerDesc.includes('saúde') || lowerDesc.includes('farmacia')) {
      return 'Saúde';
    }
    if (lowerDesc.includes('lazer') || lowerDesc.includes('cinema') || lowerDesc.includes('netflix')) {
      return 'Lazer';
    }
    return 'Outros';
  }
}

function parseBradescoStatement(text: string, origin: string = 'extrato_bradesco') {
  const lines = text.split('\n');
  const transactions: any[] = [];
  const currentYear = new Date().getFullYear();

  // Merge split lines: if a line doesn't start with a date, merge it with previous line
  const mergedLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const startsWithDate = /^\d{2}\/\d{2}\/\d{2}/.test(line);
    if (startsWithDate || mergedLines.length === 0) {
      mergedLines.push(line);
    } else {
      // Merge with previous line
      mergedLines[mergedLines.length - 1] += ' ' + line;
    }
  }
  
  // Now split merged lines into individual transactions by date
  const transactionLines: string[] = [];
  for (const line of mergedLines) {
    // Split on date patterns (DD/MM/YY)
    const parts = line.split(/(?=\d{2}\/\d{2}\/\d{2})/);
    transactionLines.push(...parts.filter(p => p.trim()));
  }
  
  for (const line of transactionLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip header lines with "Data Histórico", "SALDO ANTERIOR", "Total", etc.
    const lowerTrimmed = trimmed.toLowerCase();
    if (
      lowerTrimmed.includes('data histórico') ||
      lowerTrimmed.includes('saldo anterior') ||
      lowerTrimmed.startsWith('total') ||
      lowerTrimmed.includes('saldos invest') ||
      lowerTrimmed.includes('fone fácil') ||
      lowerTrimmed.includes('atendimento') ||
      lowerTrimmed.includes('ouvidoria') ||
      lowerTrimmed.includes('sac') ||
      lowerTrimmed.includes('capitais e regiões') ||
      lowerTrimmed.includes('os dados acima')
    ) {
      continue;
    }

    // Bradesco format from the sample: Data (DD/MM/YY) Histórico [Docto.] [Crédito] [Débito] [Saldo]
    const bradescoDateMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{2,4})\s+(.*)$/);
    if (bradescoDateMatch) {
      const day = bradescoDateMatch[1];
      const month = bradescoDateMatch[2];
      let year = bradescoDateMatch[3];
      if (year.length === 2) {
        year = '20' + year; // Assume 2000s
      }
      const rest = bradescoDateMatch[4].trim();

      // Skip lines that are just saldo
      const lowerRest = rest.toLowerCase();
      if (lowerRest.includes('saldo anterior')) {
        continue;
      }

      // Now, split this rest into multiple transactions if there are multiple debits/credits
      // First, find all debit patterns (- X,XX)
      const debitMatches = [...rest.matchAll(/- ([\d.,]+)/g)];
      if (debitMatches.length > 0) {
        // For each debit, try to find the description before it
        let lastIndex = 0;
        for (const match of debitMatches) {
          const valueStr = match[1];
          const index = match.index as number;
          // Get description from lastIndex to this index
          const desc = rest.slice(lastIndex, index).trim();
          lastIndex = index + match[0].length;

          // Clean description (remove any trailing "Rem:", "Contr:", etc.)
          let cleanDesc = desc.replace(/^(Rem:|Contr:|Docto:|Poup Facil-depos a Partir)\s*/i, '').trim();
          if (!cleanDesc) {
            cleanDesc = 'Despesa Bradesco';
          }
          
          // Skip if description contains "Total"
          if (cleanDesc.toLowerCase().includes('total')) continue;

          // Skip if the value doesn't have exactly two decimal places (check original string)
          if (!valueStr.includes(',') || valueStr.split(',')[1].length !== 2) continue;

          // Clean value
          const cleanValStr = valueStr.replace(/\./g, '').replace(',', '.');
          const value = parseFloat(cleanValStr);
          // Only accept values between 0.01 and 1,000,000
          if (isNaN(value) || value <= 0.01 || value > 1000000) continue;

          const lowerDesc = cleanDesc.toLowerCase();
          const category = categorizeEntry(lowerDesc, false);

          console.log('Adding debit transaction:', { cleanDesc, value, category });
          transactions.push({
            type: 'despesa_variavel',
            category,
            description: cleanDesc,
            beneficiary: cleanDesc.slice(0, 30),
            value: Math.abs(value),
            due_date: `${year}-${month}-${day}`,
            status: 'pago',
            payment_method: 'pix',
            origin
          });
        }
      }

      // Now check for credits (positive values that are not saldo)
      // Find all values with comma decimal (exactly two decimal places), and no "-" before them
      const creditMatches = [...rest.matchAll(/(?<!- )(\d+(?:\.\d{3})*,\d{2})/g)];
      if (creditMatches.length > 0 && debitMatches.length === 0) {
        for (const match of creditMatches) {
          const valueStr = match[1];
          const index = match.index as number;
          // Get description from start to this index
          const desc = rest.slice(0, index).trim();
          
          // Clean description
          let cleanDesc = desc.replace(/^(Rem:|Contr:|Docto:|Poup Facil-depos a Partir)\s*/i, '').trim();
          if (!cleanDesc || cleanDesc.length < 2) {
            cleanDesc = 'Receita Bradesco';
          }

          // Skip if description contains "Total"
          if (cleanDesc.toLowerCase().includes('total')) continue;

          // Skip if the value doesn't have exactly two decimal places (check original string)
          if (!valueStr.includes(',') || valueStr.split(',')[1].length !== 2) continue;

          // Clean value
          const cleanValStr = valueStr.replace(/\./g, '').replace(',', '.');
          const value = parseFloat(cleanValStr);
          // Only accept values between 0.01 and 1,000,000
          if (isNaN(value) || value <= 0.01 || value > 1000000) continue;

          const lowerDesc = cleanDesc.toLowerCase();
          const category = categorizeEntry(lowerDesc, true);

          console.log('Adding credit transaction:', { cleanDesc, value, category });
          transactions.push({
            type: 'receita',
            category,
            description: cleanDesc,
            beneficiary: cleanDesc.slice(0, 30),
            value: Math.abs(value),
            due_date: `${year}-${month}-${day}`,
            status: 'pago',
            payment_method: 'pix',
            origin
          });
          // Only take the first credit
          break;
        }
      }

      continue;
    }
  }

  return transactions;
}

// Test script
const pdfPath = path.join(__dirname, 'dados-referencia', 'Extratos Bancos Mensais', 'BRADESCO', 'Bradesco_Fevereiro.pdf');
console.log('Testing Bradesco PDF:', pdfPath);

async function test() {
  try {
    const fileBuffer = fs.readFileSync(pdfPath);
    const parser = new PDFParse({ data: fileBuffer });
    const data = await parser.getText();
    console.log('Text extracted, length:', data.text.length);
    const transactions = parseBradescoStatement(data.text);
    console.log('Found transactions:', transactions.length);
    console.log('Sample transactions:', JSON.stringify(transactions.slice(0, 10), null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

test();