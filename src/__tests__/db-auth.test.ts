import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import initSqlJs from 'sql.js';

const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'my-financer-auth-'));

test('initDb recria as tabelas de autenticação em bancos antigos', async () => {
  const tempDir = makeTempDir();
  process.env.FINANCER_DATA_DIR = tempDir;

  const dbPath = path.join(tempDir, 'financer_db.sqlite');
  const SQL = await initSqlJs({
    locateFile: (filename: string) => path.resolve(process.cwd(), 'node_modules', 'sql.js', 'dist', filename)
  });

  const db = new SQL.Database();
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (type IN ('receita', 'despesa')),
      budget_target REAL DEFAULT 0
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS launches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('receita', 'despesa_fixa', 'despesa_variavel', 'divida_parcelamento')),
      category_id INTEGER NOT NULL REFERENCES categories(id),
      description TEXT NOT NULL,
      value REAL NOT NULL CHECK (value > 0),
      competence_month INTEGER NOT NULL CHECK (competence_month BETWEEN 1 AND 12),
      competence_year INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pendente', 'pago', 'atrasado')) DEFAULT 'pendente',
      origin TEXT NOT NULL CHECK (origin IN ('planilha', 'pdf', 'manual', 'itau_statement', 'extrato', 'extrato_bradesco', 'extrato_nubank', 'extrato_itau')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  fs.writeFileSync(dbPath, Buffer.from(db.export()));

  const dbModule = await import('../db.ts?' + Date.now());
  await dbModule.initDb();

  const reopened = new SQL.Database(fs.readFileSync(dbPath));
  const tables = reopened.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const tableNames = tables[0]?.values.map((row: any[]) => row[0]) ?? [];

  assert.ok(tableNames.includes('admin_users'), 'a tabela admin_users deve existir');
  assert.ok(tableNames.includes('auth_tokens'), 'a tabela auth_tokens deve existir');
});
