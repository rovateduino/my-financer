import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'my-financer-db-'));
process.env.FINANCER_DATA_DIR = tempDir;

const dbModule = await import('../db.ts');

test('export/import de backup preserva categorias e lançamentos', async () => {
  const { initDb, addCategory, addLaunch, readDb, exportDbToJsonData, importDbFromJsonData, resetDatabaseToDefaults } = dbModule;

  await initDb();

  addCategory('Categoria Teste', 'despesa', 150);
  addLaunch({
    type: 'despesa_variavel',
    category: 'Categoria Teste',
    description: 'Lanĉamento de teste',
    value: 42.5,
    due_date: '2026-07-15',
    competence_month: 7,
    competence_year: 2026,
    status: 'pago',
    payment_method: 'pix',
    origin: 'manual'
  } as any);

  const exported = exportDbToJsonData();
  const exportFile = path.join(tempDir, 'financer_db.json');

  assert.ok(fs.existsSync(exportFile), 'o arquivo JSON de exportação deve ser criado');
  const serialized = JSON.parse(fs.readFileSync(exportFile, 'utf8'));
  assert.ok(serialized.categories.some((c: any) => c.name === 'Categoria Teste'));
  assert.ok(serialized.launches.some((l: any) => l.description === 'Lanĉamento de teste'));

  resetDatabaseToDefaults();
  importDbFromJsonData(exported);

  const restored = readDb();
  assert.ok(restored.categories.some((c: any) => c.name === 'Categoria Teste'));
  assert.ok(restored.launches.some((l: any) => l.description === 'Lanĉamento de teste'));
});
