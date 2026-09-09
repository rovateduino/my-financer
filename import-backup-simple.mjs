import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backupPath = path.resolve(__dirname, 'backups', 'financer_db_ATÉ MES 7.json');
const dbPath = path.resolve(__dirname, 'data', 'financer_db.sqlite');

if (!fs.existsSync(backupPath)) {
  console.error('Backup not found:', backupPath);
  process.exit(1);
}

const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
const SQL = await initSqlJs({ locateFile: (filename) => path.resolve(__dirname, 'node_modules', 'sql.js', 'dist', filename) });
const db = new SQL.Database();

const run = (sql, params = []) => {
  const stmt = db.prepare(sql);
  stmt.run(params);
  stmt.free();
};

const schema = [
  `CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, type TEXT NOT NULL CHECK (type IN ('receita', 'despesa')), budget_target REAL DEFAULT 0);`,
  `CREATE TABLE IF NOT EXISTS home_members (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);`,
  `CREATE TABLE IF NOT EXISTS beneficiary_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, beneficiary TEXT NOT NULL UNIQUE, suggested_category_id INTEGER NOT NULL REFERENCES categories(id));`,
  `CREATE TABLE IF NOT EXISTS launches (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL CHECK (type IN ('receita', 'despesa_fixa', 'despesa_variavel', 'divida_parcelamento')), category_id INTEGER NOT NULL REFERENCES categories(id), subcategory TEXT, description TEXT NOT NULL, beneficiary TEXT, value REAL NOT NULL CHECK (value > 0), due_date TEXT, competence_month INTEGER NOT NULL CHECK (competence_month BETWEEN 1 AND 12), competence_year INTEGER NOT NULL, status TEXT NOT NULL CHECK (status IN ('pendente', 'pago', 'atrasado')) DEFAULT 'pendente', payment_method TEXT CHECK (payment_method IN ('pix', 'boleto', 'cartao', 'debito_automatico', 'dinheiro')), installment_current INTEGER, installment_total INTEGER, origin TEXT NOT NULL CHECK (origin IN ('planilha', 'pdf', 'manual', 'itau_statement', 'extrato', 'extrato_bradesco', 'extrato_nubank', 'extrato_itau')), pdf_path TEXT, doc_number TEXT, barcode TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));`,
  `CREATE TABLE IF NOT EXISTS ai_cache (cache_key TEXT PRIMARY KEY, response TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));`,
  `CREATE TABLE IF NOT EXISTS goals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, target_value REAL NOT NULL CHECK (target_value > 0), current_saved REAL NOT NULL DEFAULT 0 CHECK (current_saved >= 0), monthly_contribution REAL NOT NULL CHECK (monthly_contribution >= 0), start_date TEXT NOT NULL, target_date TEXT, priority INTEGER NOT NULL CHECK (priority IN (1, 2, 3)), status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')) DEFAULT 'active', category_id INTEGER REFERENCES categories(id), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));`,
  `CREATE TABLE IF NOT EXISTS goal_scenarios (id INTEGER PRIMARY KEY AUTOINCREMENT, goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE, scenario_type TEXT NOT NULL CHECK (scenario_type IN ('financing', 'savings', 'hybrid')), total_value REAL, down_payment REAL, installments INTEGER, installment_value REAL, interest_rate REAL, total_cost REAL);`,
  `CREATE TABLE IF NOT EXISTS admin_users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_single ON admin_users ((1));`,
  `CREATE TABLE IF NOT EXISTS auth_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL UNIQUE, label TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), last_used_at TEXT);`,
  `CREATE INDEX IF NOT EXISTS idx_auth_tokens_token ON auth_tokens(token);`
];

for (const sql of schema) {
  run(sql);
}

for (const category of backup.categories || []) {
  run(`INSERT OR IGNORE INTO categories (id, name, type, budget_target) VALUES (?, ?, ?, ?);`, [category.id, category.name, category.type, category.budget_target ?? 0]);
}
for (const member of backup.home_members || []) {
  run(`INSERT OR IGNORE INTO home_members (id, name) VALUES (?, ?);`, [member.id, member.name]);
}
for (const rule of backup.beneficiary_rules || []) {
  run(`INSERT OR IGNORE INTO beneficiary_rules (id, beneficiary, suggested_category_id) VALUES (?, ?, ?);`, [rule.id, rule.beneficiary, rule.suggested_category_id]);
}
for (const launch of backup.launches || []) {
  run(`INSERT OR IGNORE INTO launches (id, type, category_id, subcategory, description, beneficiary, value, due_date, competence_month, competence_year, status, payment_method, installment_current, installment_total, origin, pdf_path, doc_number, barcode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, [
    launch.id,
    launch.type,
    launch.category_id,
    launch.subcategory ?? null,
    launch.description,
    launch.beneficiary ?? null,
    launch.value,
    launch.due_date ?? null,
    launch.competence_month,
    launch.competence_year,
    launch.status,
    launch.payment_method ?? null,
    launch.installment_current ?? null,
    launch.installment_total ?? null,
    launch.origin,
    launch.pdf_path ?? null,
    launch.doc_number ?? null,
    launch.barcode ?? null,
    launch.created_at ?? new Date().toISOString()
  ]);
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
fs.writeFileSync(dbPath, Buffer.from(db.export()));
console.log('Imported backup into', dbPath);
