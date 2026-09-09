/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';
import { DbSchema, Launch, Category, Member, BeneficiaryRule, AICacheEntry, Goal, GoalScenario, AdminUser, AuthToken, AppUser } from './types.js';

const getModulePath = () => {
  try {
    if (typeof module !== 'undefined' && module && typeof module.filename === 'string' && module.filename) {
      return module.filename as string;
    }
  } catch {}

  try {
    if (typeof import.meta !== 'undefined' && (import.meta as ImportMeta).url) {
      return fileURLToPath((import.meta as ImportMeta).url);
    }
  } catch {}

  if (typeof globalThis.__filename === 'string' && globalThis.__filename) {
    return globalThis.__filename;
  }

  return path.resolve(process.cwd(), 'src/db.ts');
};

const __filename = getModulePath();
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.FINANCER_DATA_DIR || process.cwd();
const DB_FILE = path.resolve(DATA_DIR, 'financer_db.sqlite');
const JSON_DB_FILE = path.resolve(DATA_DIR, 'financer_db.json');
const BACKUP_DIR = path.resolve(DATA_DIR, 'backups');

function ensureAuthTables() {
  if (!db) return;
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_single ON admin_users ((1));`);
    db.run(`
      CREATE TABLE IF NOT EXISTS auth_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL UNIQUE,
        label TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_used_at TEXT,
        used_at TEXT,
        device_id TEXT
      );
    `);
    try { db.run(`ALTER TABLE auth_tokens ADD COLUMN used_at TEXT;`); } catch {}
    try { db.run(`ALTER TABLE auth_tokens ADD COLUMN device_id TEXT;`); } catch {}
    db.run(`CREATE INDEX IF NOT EXISTS idx_auth_tokens_token ON auth_tokens(token);`);
    db.run(`
      CREATE TABLE IF NOT EXISTS app_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        device_id TEXT NOT NULL UNIQUE,
        session_token TEXT UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    try { db.run(`ALTER TABLE app_users ADD COLUMN session_token TEXT;`); } catch {}
  } catch (err) {
    console.error('[DB] Falha ao garantir tabelas de autenticação:', err);
  }
}
const BACKUP_EVERY_N_WRITES = 10;
let writeCount = 0;

// Default data
const DEFAULT_CATEGORIES: Category[] = [
  { id: 1, name: 'Salário', type: 'receita', budget_target: 0 },
  { id: 2, name: 'Freelance', type: 'receita', budget_target: 0 },
  { id: 3, name: 'Investimentos', type: 'receita', budget_target: 0 },
  { id: 4, name: 'Outras Receitas', type: 'receita', budget_target: 0 },
  { id: 5, name: 'Aluguel', type: 'despesa', budget_target: 0 },
  { id: 6, name: 'Energia', type: 'despesa', budget_target: 0 },
  { id: 7, name: 'Internet', type: 'despesa', budget_target: 0 },
  { id: 8, name: 'Supermercado', type: 'despesa', budget_target: 0 },
  { id: 9, name: 'Transporte', type: 'despesa', budget_target: 0 },
  { id: 10, name: 'Saúde', type: 'despesa', budget_target: 0 },
  { id: 11, name: 'Lazer', type: 'despesa', budget_target: 0 },
  { id: 12, name: 'Outros', type: 'despesa', budget_target: 0 }
];
const DEFAULT_MEMBERS: Member[] = [
  { id: 1, name: 'Titular' }
];
const DEFAULT_RULES: BeneficiaryRule[] = [
  { id: 1, beneficiary: 'ENEL', suggested_category_id: 6, suggested_category: 'Energia' },
  { id: 2, beneficiary: 'VIVO', suggested_category_id: 7, suggested_category: 'Internet' }
];

let db: any; // sql.js Database instance
let SQL: any;

// Initialize sql.js and the database
export async function initDb() {
  SQL = await initSqlJs({ locateFile: (filename: string) => path.resolve(__dirname, '..', 'node_modules', 'sql.js', 'dist', filename) });
  
  if (fs.existsSync(DB_FILE)) {
    // Load existing database
    const fileBuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(fileBuffer);
    // Ensure all tables exist (idempotent migration for older databases)
    createTables();
    ensureAuthTables();
    saveDb();
  } else {
    // Create new database
    db = new SQL.Database();
    createTables();
    ensureAuthTables();
    
    // Check if JSON db exists for migration
    if (fs.existsSync(JSON_DB_FILE)) {
      console.log('Migrating data from JSON to SQLite...');
      try {
        migrateFromJson();
        console.log('Migration complete!');
        // Backup JSON file
        fs.renameSync(JSON_DB_FILE, `${JSON_DB_FILE}.backup`);
        console.log('JSON file backed up to financer_db.json.backup');
      } catch (err) {
        console.error('Migration failed:', err);
        // If migration fails, keep using default data
      }
    } else {
      // Insert default data
      insertDefaultData();
    }
    
    saveDb();
  }
  
  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON;');

  // Register shutdown handlers as safety net
  registerShutdownHandlers();

  // Time-based backup: create one if none exists or latest is > 24h old
  scheduleTimeBasedBackup();
}

function registerShutdownHandlers() {
  process.on('exit', () => saveDb());

  const handleSignal = () => {
    saveDb();
    process.exit(0);
  };
  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);
}

function scheduleTimeBasedBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      createBackup();
      return;
    }
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => BACKUP_FILE_RE.test(f))
      .map(f => fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs);
    if (files.length === 0) {
      createBackup();
      return;
    }
    const latest = Math.max(...files);
    const hoursSinceLastBackup = (Date.now() - latest) / (1000 * 60 * 60);
    if (hoursSinceLastBackup >= 24) {
      createBackup();
    }
  } catch (err) {
    console.error('Error checking scheduled backup:', err);
  }
}

function createTables() {
  // Categories
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (type IN ('receita', 'despesa')),
      budget_target REAL DEFAULT 0
    );
  `);
  
  // Home members
  db.run(`
    CREATE TABLE IF NOT EXISTS home_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
  `);
  
  // Beneficiary rules
  db.run(`
    CREATE TABLE IF NOT EXISTS beneficiary_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      beneficiary TEXT NOT NULL UNIQUE,
      suggested_category_id INTEGER NOT NULL REFERENCES categories(id)
    );
  `);
  
  // Launches
  db.run(`
    CREATE TABLE IF NOT EXISTS launches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('receita', 'despesa_fixa', 'despesa_variavel', 'divida_parcelamento')),
      category_id INTEGER NOT NULL REFERENCES categories(id),
      subcategory TEXT,
      description TEXT NOT NULL,
      beneficiary TEXT,
      value REAL NOT NULL CHECK (value > 0),
      due_date TEXT,
      competence_month INTEGER NOT NULL CHECK (competence_month BETWEEN 1 AND 12),
      competence_year INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pendente', 'pago', 'atrasado')) DEFAULT 'pendente',
      payment_method TEXT CHECK (payment_method IN ('pix', 'boleto', 'cartao', 'debito_automatico', 'dinheiro')),
      installment_current INTEGER,
      installment_total INTEGER,
      origin TEXT NOT NULL CHECK (origin IN ('planilha', 'pdf', 'manual', 'itau_statement', 'extrato', 'extrato_bradesco', 'extrato_nubank', 'extrato_itau')),
      pdf_path TEXT,
      doc_number TEXT,
      barcode TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  
  // AI cache
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_cache (
      cache_key TEXT PRIMARY KEY,
      response TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  
  // Goals
  db.run(`
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      target_value REAL NOT NULL CHECK (target_value > 0),
      current_saved REAL NOT NULL DEFAULT 0 CHECK (current_saved >= 0),
      monthly_contribution REAL NOT NULL CHECK (monthly_contribution >= 0),
      start_date TEXT NOT NULL,
      target_date TEXT,
      priority INTEGER NOT NULL CHECK (priority IN (1, 2, 3)),
      status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')) DEFAULT 'active',
      category_id INTEGER REFERENCES categories(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  
  // Goal scenarios
  db.run(`
    CREATE TABLE IF NOT EXISTS goal_scenarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      scenario_type TEXT NOT NULL CHECK (scenario_type IN ('financing', 'savings', 'hybrid')),
      total_value REAL,
      down_payment REAL,
      installments INTEGER,
      installment_value REAL,
      interest_rate REAL,
      total_cost REAL
    );
  `);
  
  // Admin accounts (local) - at most ONE admin row allowed
  db.run(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // Enforce the "single admin" rule at the database level.
  // In SQLite a unique index on a constant expression allows at most one row.
  try {
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_single ON admin_users ((1));`);
  } catch (err) {
    console.error('[DB] Falha ao criar índice de admin único:', err);
  }
  
  // Access tokens generated by the admin
  db.run(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      label TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      used_at TEXT,
      device_id TEXT
    );
  `);
  for (const column of ['used_at TEXT', 'device_id TEXT']) {
    try { db.run(`ALTER TABLE auth_tokens ADD COLUMN ${column};`); } catch {}
  }
  
  // Create indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_launches_competence ON launches(competence_year, competence_month);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_launches_category ON launches(category_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_auth_tokens_token ON auth_tokens(token);`);
  db.run(`
    CREATE TABLE IF NOT EXISTS app_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      device_id TEXT NOT NULL UNIQUE,
      session_token TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  try { db.run(`ALTER TABLE app_users ADD COLUMN session_token TEXT;`); } catch {}
}

function insertDefaultData() {
  // Insert default categories
  const insertCategory = db.prepare('INSERT INTO categories (name, type, budget_target) VALUES (?, ?, ?);');
  for (const cat of DEFAULT_CATEGORIES) {
    insertCategory.run([cat.name, cat.type, cat.budget_target]);
  }
  
  // Insert default members
  const insertMember = db.prepare('INSERT INTO home_members (name) VALUES (?);');
  for (const member of DEFAULT_MEMBERS) {
    insertMember.run([member.name]);
  }
  
  // Insert default rules
  const insertRule = db.prepare('INSERT INTO beneficiary_rules (beneficiary, suggested_category_id) VALUES (?, ?);');
  for (const rule of DEFAULT_RULES) {
    insertRule.run([rule.beneficiary, rule.suggested_category_id]);
  }
}

export function importDbFromJsonData(jsonData: DbSchema): void {
  if (!SQL) {
    throw new Error('Database not initialized');
  }

  const previousDb = db;
  const authSnapshot = previousDb.exec(`
    SELECT username, password_hash, device_id, session_token, created_at FROM app_users;
  `)[0]?.values || [];
  const tokenSnapshot = previousDb.exec(`
    SELECT token, label, created_at, last_used_at, used_at, device_id FROM auth_tokens;
  `)[0]?.values || [];
  try {
    db = new SQL.Database();
    createTables();
    db.run('PRAGMA foreign_keys = ON;');
    db.run('BEGIN TRANSACTION;');

    try {
      const insertUser = db.prepare(`
        INSERT OR IGNORE INTO app_users (username, password_hash, device_id, session_token, created_at)
        VALUES (?, ?, ?, ?, ?);
      `);
      for (const user of authSnapshot) insertUser.run(user);

      const insertToken = db.prepare(`
        INSERT OR IGNORE INTO auth_tokens (token, label, created_at, last_used_at, used_at, device_id)
        VALUES (?, ?, ?, ?, ?, ?);
      `);
      for (const token of tokenSnapshot) insertToken.run(token);

      if (jsonData.categories && jsonData.categories.length > 0) {
        const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (name, type, budget_target) VALUES (?, ?, ?);');
        for (const cat of jsonData.categories) {
          insertCategory.run([cat.name, cat.type, cat.budget_target ?? null]);
        }
      } else {
        insertDefaultData();
      }

      function getCategoryIdByName(name: string | undefined | null) {
        const safeName = typeof name === 'string' && name.trim() ? name : '';
        const stmt = db.prepare('SELECT id FROM categories WHERE name = ?;');
        const result = stmt.getAsObject([safeName]);
        return result && result.id !== undefined ? result.id : null;
      }

      if (jsonData.home_members) {
        const insertMember = db.prepare('INSERT OR IGNORE INTO home_members (name) VALUES (?);');
        for (const member of jsonData.home_members) {
          insertMember.run([member.name]);
        }
      }

      if (jsonData.beneficiary_rules) {
        const insertRule = db.prepare('INSERT OR IGNORE INTO beneficiary_rules (beneficiary, suggested_category_id) VALUES (?, ?);');
        for (const rule of jsonData.beneficiary_rules) {
          const catId = getCategoryIdByName(rule.suggested_category);
          if (catId) {
            insertRule.run([rule.beneficiary, catId]);
          }
        }
      }

      if (jsonData.launches) {
        const insertLaunch = db.prepare(`
          INSERT INTO launches (
            type, category_id, subcategory, description, beneficiary, value, due_date,
            competence_month, competence_year, status, payment_method,
            installment_current, installment_total, origin, pdf_path, doc_number, barcode, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `);
        let totalLaunches = jsonData.launches.length;
        let insertedCount = 0;
        let skippedCount = 0;
        const skippedCategories = new Set<string>();

        for (const launch of jsonData.launches) {
          const catId = getCategoryIdByName(launch.category);
          if (catId) {
            const rawOrigin = String(launch.origin || 'manual');
            let mappedOrigin = rawOrigin;
            if (rawOrigin === 'itau') mappedOrigin = 'itau_statement';
            const allowed = new Set(['planilha', 'pdf', 'manual', 'itau_statement', 'extrato', 'extrato_bradesco', 'extrato_nubank', 'extrato_itau']);
            if (!allowed.has(mappedOrigin)) mappedOrigin = 'manual';

            const safeCompetenceMonth = Number.isInteger(launch.competence_month) ? launch.competence_month : 1;
            const safeCompetenceYear = Number.isInteger(launch.competence_year) ? launch.competence_year : new Date().getFullYear();

            insertLaunch.run([
              normalizeDbValue(launch.type || 'despesa_variavel'),
              normalizeDbValue(catId),
              normalizeDbValue(launch.subcategory || null),
              normalizeDbValue(launch.description || 'Lançamento importado'),
              normalizeDbValue(launch.beneficiary || null),
              normalizeDbValue(launch.value ?? 0.01),
              normalizeDbValue(launch.due_date || null),
              normalizeDbValue(safeCompetenceMonth),
              normalizeDbValue(safeCompetenceYear),
              normalizeDbValue(launch.status || 'pago'),
              normalizeDbValue(launch.payment_method || null),
              normalizeDbValue(launch.installment_current ?? null),
              normalizeDbValue(launch.installment_total ?? null),
              normalizeDbValue(mappedOrigin),
              normalizeDbValue(launch.pdf_path || null),
              normalizeDbValue(launch.doc_number || null),
              normalizeDbValue(launch.barcode || null),
              normalizeDbValue(launch.created_at || new Date().toISOString())
            ]);
            insertedCount++;
          } else {
            skippedCount++;
            skippedCategories.add(launch.category || '<missing>');
          }
        }

        console.log(`[DB MIGRATE] launches: total=${totalLaunches} inserted=${insertedCount} skipped=${skippedCount}`);
        if (skippedCategories.size > 0) {
          console.log('[DB MIGRATE] skipped categories sample:', Array.from(skippedCategories).slice(0,10));
        }
      }

      if (jsonData.ai_cache) {
        const insertCache = db.prepare('INSERT OR IGNORE INTO ai_cache (cache_key, response, created_at) VALUES (?, ?, ?);');
        for (const cache of jsonData.ai_cache) {
          insertCache.run([cache.cache_key, cache.response, cache.created_at]);
        }
      }

      if (jsonData.goals) {
        const insertGoal = db.prepare(`
          INSERT INTO goals (
            name, description, target_value, current_saved, monthly_contribution,
            start_date, target_date, priority, status, category_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `);

        for (const goal of jsonData.goals) {
          const catId = goal.category ? getCategoryIdByName(goal.category) : null;
          insertGoal.run([
            goal.name, goal.description || null, goal.target_value, goal.current_saved,
            goal.monthly_contribution, goal.start_date, goal.target_date || null,
            goal.priority, goal.status, catId, goal.created_at, goal.updated_at
          ]);
        }
      }

      if (jsonData.goal_scenarios) {
        const insertScenario = db.prepare(`
          INSERT INTO goal_scenarios (
            goal_id, scenario_type, total_value, down_payment, installments,
            installment_value, interest_rate, total_cost
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        `);

        for (const scenario of jsonData.goal_scenarios) {
          insertScenario.run([
            scenario.goal_id, scenario.scenario_type, scenario.total_value || null,
            scenario.down_payment || null, scenario.installments || null,
            scenario.installment_value || null, scenario.interest_rate || null,
            scenario.total_cost || null
          ]);
        }
      }

      db.run('COMMIT;');
      saveDb();
    } catch (err) {
      db.run('ROLLBACK;');
      throw err;
    }
  } catch (err) {
    db = previousDb;
    throw err;
  }
}

function migrateFromJson() {
  const importPath = process.env.FINANCER_IMPORT_JSON || JSON_DB_FILE;
  const jsonData = JSON.parse(fs.readFileSync(importPath, 'utf-8')) as DbSchema;
  importDbFromJsonData(jsonData);
}

function fetchAll(stmt: any, params: any[] = []) {
  if (params.length > 0) {
    stmt.bind(params);
  }
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function normalizeDbValue(value: any) {
  return value === undefined ? null : value;
}

// Save database to file with crash-safe guarantees:
// 1. fsync before rename to ensure data is on disk
// 2. Retry rename on EPERM/EBUSY (Windows lock contention)
function saveDb() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, buffer);

    // Force data to physical disk before rename (crash safety)
    const fd = fs.openSync(tmpFile, 'r+');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    // Retry rename with backoff for Windows lock contention (EPERM/EBUSY)
    const delays = [50, 100, 200, 400, 800];
    for (let attempt = 0; attempt < delays.length; attempt++) {
      try {
        fs.renameSync(tmpFile, DB_FILE);
        writeCount++;
        if (writeCount >= BACKUP_EVERY_N_WRITES) {
          createBackup();
          writeCount = 0;
        }
        return;
      } catch (renameErr: any) {
        if ((renameErr.code === 'EPERM' || renameErr.code === 'EBUSY') && attempt < delays.length - 1) {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delays[attempt]);
        } else {
          throw renameErr;
        }
      }
    }
  } catch (err) {
    console.error('Error saving DB:', err);
    throw err;
  }
}

// ------------------- BACKUP -------------------

const BACKUP_FILE_RE = /^financer_db(?:_pre-restore)?_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.sqlite$/;

function createBackup(label?: string) {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const prefix = label ? `financer_db_${label}_` : 'financer_db_';
    const backupFile = path.join(BACKUP_DIR, `${prefix}${ts}.sqlite`);
    fs.copyFileSync(DB_FILE, backupFile);
    cleanupOldBackups();
  } catch (err) {
    console.error('Error creating backup:', err);
  }
}

function cleanupOldBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return;
    const allFiles = fs.readdirSync(BACKUP_DIR)
      .filter(f => BACKUP_FILE_RE.test(f))
      .map(f => ({
        name: f,
        path: path.join(BACKUP_DIR, f),
        mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs
      }));

    // Rotate normal and pre-restore backups independently
    const normal = allFiles.filter(f => f.name.startsWith('financer_db_') && !f.name.includes('_pre-restore_'))
      .sort((a, b) => a.mtime - b.mtime);
    const preRestore = allFiles.filter(f => f.name.includes('_pre-restore_'))
      .sort((a, b) => a.mtime - b.mtime);

    while (normal.length > 10) {
      const oldest = normal.shift()!;
      fs.unlinkSync(oldest.path);
    }
    while (preRestore.length > 3) {
      const oldest = preRestore.shift()!;
      fs.unlinkSync(oldest.path);
    }
  } catch (err) {
    console.error('Error cleaning up backups:', err);
  }
}

export function listBackups(): { filename: string; size: number; date: string }[] {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR)
      .filter(f => BACKUP_FILE_RE.test(f))
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return {
          filename: f,
          size: stat.size,
          date: stat.mtime.toISOString()
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch (err) {
    console.error('Error listing backups:', err);
    return [];
  }
}

export function restoreFromBackup(filename: string): boolean {
  const safeName = path.basename(filename);
  if (!BACKUP_FILE_RE.test(safeName)) {
    throw new Error('Invalid backup filename');
  }
  const backupPath = path.join(BACKUP_DIR, safeName);
  if (!fs.existsSync(backupPath)) {
    throw new Error('Backup file not found');
  }
  createBackup('pre-restore');
  const fileBuffer = fs.readFileSync(backupPath);
  db = new SQL.Database(fileBuffer);
  db.run('PRAGMA foreign_keys = ON;');
  createTables();
  saveDb();
  return true;
}

export function resetDatabaseToDefaults(): void {
  if (!SQL) {
    throw new Error('Database not initialized');
  }

  try {
    if (fs.existsSync(DB_FILE)) {
      fs.unlinkSync(DB_FILE);
    }
    if (fs.existsSync(`${DB_FILE}.tmp`)) {
      fs.unlinkSync(`${DB_FILE}.tmp`);
    }

    db = new SQL.Database();
    createTables();
    insertDefaultData();
    db.run('PRAGMA foreign_keys = ON;');
    saveDb();
  } catch (err) {
    console.error('Error resetting database:', err);
    throw err;
  }
}

// ------------------- GETTERS -------------------

export function getCategories(): Category[] {
  const stmt = db.prepare('SELECT * FROM categories ORDER BY name ASC;');
  const result = fetchAll(stmt);
  return result.map((row: any) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    budget_target: row.budget_target
  }));
}

function getCategoryIdByName(name: string): number | null {
  const stmt = db.prepare('SELECT id FROM categories WHERE name = ?;');
  const row = stmt.getAsObject([name]);
  return row && row.id !== undefined ? row.id : null;
}

function getLastInsertRowId(): number {
  const stmt = db.prepare('SELECT last_insert_rowid() AS id;');
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return row && row.id !== undefined ? row.id : 0;
}

export function getMembers(): Member[] {
  const stmt = db.prepare('SELECT * FROM home_members ORDER BY name ASC;');
  const result = fetchAll(stmt);
  return result.map((row: any) => ({
    id: row.id,
    name: row.name
  }));
}

export function getRules(): BeneficiaryRule[] {
  const stmt = db.prepare(`
    SELECT br.*, c.name as suggested_category 
    FROM beneficiary_rules br 
    JOIN categories c ON br.suggested_category_id = c.id 
    ORDER BY br.beneficiary ASC;
  `);
  const result = fetchAll(stmt);
  return result.map((row: any) => ({
    id: row.id,
    beneficiary: row.beneficiary,
    suggested_category_id: row.suggested_category_id,
    suggested_category: row.suggested_category
  }));
}

export function getAICache(cacheKey?: string): AICacheEntry[] | AICacheEntry | undefined {
  if (cacheKey) {
    const stmt = db.prepare('SELECT * FROM ai_cache WHERE cache_key = ?;');
    const row = stmt.getAsObject([cacheKey]);
    if (!row || row.cache_key === undefined) return undefined;
    return {
      cache_key: row.cache_key,
      response: row.response,
      created_at: row.created_at
    };
  }
  const stmt = db.prepare('SELECT * FROM ai_cache ORDER BY created_at DESC;');
  const result = fetchAll(stmt);
  return result.map((row: any) => ({
    cache_key: row.cache_key,
    response: row.response,
    created_at: row.created_at
  }));
}

// Backward compatibility aliases
export const getAiCache = getAICache;
export const clearAiCache = clearAICache;
export const getHomeMembers = getMembers;
export const getBeneficiaryRules = getRules;

export function getLaunches(): Launch[] {
  const stmt = db.prepare(`
    SELECT l.*, c.name as category 
    FROM launches l 
    JOIN categories c ON l.category_id = c.id 
    ORDER BY l.due_date ASC, l.id ASC;
  `);
  const result = fetchAll(stmt);
  return result.map((row: any) => ({
    id: row.id,
    type: row.type,
    category: row.category,
    category_id: row.category_id,
    subcategory: row.subcategory,
    description: row.description,
    beneficiary: row.beneficiary,
    value: row.value,
    due_date: row.due_date,
    competence_month: row.competence_month,
    competence_year: row.competence_year,
    status: row.status,
    payment_method: row.payment_method,
    installment_current: row.installment_current,
    installment_total: row.installment_total,
    origin: row.origin,
    pdf_path: row.pdf_path,
    doc_number: row.doc_number,
    barcode: row.barcode,
    created_at: row.created_at
  }));
}

export function getGoals(): Goal[] {
  const stmt = db.prepare(`
    SELECT g.*, c.name as category 
    FROM goals g 
    LEFT JOIN categories c ON g.category_id = c.id 
    ORDER BY g.priority ASC, g.id ASC;
  `);
  const result = fetchAll(stmt);
  return result.map((row: any) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    target_value: row.target_value,
    current_saved: row.current_saved,
    monthly_contribution: row.monthly_contribution,
    start_date: row.start_date,
    target_date: row.target_date,
    priority: row.priority,
    status: row.status,
    category: row.category,
    category_id: row.category_id,
    created_at: row.created_at,
    updated_at: row.updated_at
  }));
}

export function getGoalScenarios(goalId?: number): GoalScenario[] {
  let stmt;
  if (goalId) {
    stmt = db.prepare('SELECT * FROM goal_scenarios WHERE goal_id = ? ORDER BY id ASC;');
    const result = fetchAll(stmt, [goalId]);
    return result.map((row: any) => ({
      id: row.id,
      goal_id: row.goal_id,
      scenario_type: row.scenario_type,
      total_value: row.total_value,
      down_payment: row.down_payment,
      installments: row.installments,
      installment_value: row.installment_value,
      interest_rate: row.interest_rate,
      total_cost: row.total_cost
    }));
  }
  stmt = db.prepare('SELECT * FROM goal_scenarios ORDER BY id ASC;');
  const result = fetchAll(stmt);
  return result.map((row: any) => ({
    id: row.id,
    goal_id: row.goal_id,
    scenario_type: row.scenario_type,
    total_value: row.total_value,
    down_payment: row.down_payment,
    installments: row.installments,
    installment_value: row.installment_value,
    interest_rate: row.interest_rate,
    total_cost: row.total_cost
  }));
}

// Backward compatibility
export function readDb(): DbSchema {
  // Return a mock db schema with current data
  return {
    launches: getLaunches(),
    categories: getCategories(),
    home_members: getHomeMembers(),
    beneficiary_rules: getBeneficiaryRules(),
    ai_cache: getAICache() as AICacheEntry[],
    goals: getGoals(),
    goal_scenarios: getGoalScenarios()
  };
}

export function exportDbToJsonData(filePath: string = JSON_DB_FILE): DbSchema {
  const payload = readDb();
  const resolvedPath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

// ------------------- MUTATIONS -------------------

export function addCategory(nameOrObj: string | { name: string; type: 'receita' | 'despesa'; budget_target?: number }, type?: 'receita' | 'despesa', budgetTarget: number = 0): Category {
  let name: string;
  let categoryType: 'receita' | 'despesa';
  let budget: number;

  if (typeof nameOrObj === 'string') {
    name = nameOrObj;
    categoryType = type!;
    budget = budgetTarget;
  } else {
    name = nameOrObj.name;
    categoryType = nameOrObj.type;
    budget = nameOrObj.budget_target ?? 0;
  }

  const stmt = db.prepare('INSERT INTO categories (name, type, budget_target) VALUES (?, ?, ?);');
  stmt.run([name, categoryType, budget]);
  const insertedId = getLastInsertRowId();
  saveDb();
  return { id: insertedId, name, type: categoryType, budget_target: budget };
}

export function updateCategoryBudget(name: string, budgetTarget: number): boolean {
  const stmt = db.prepare('UPDATE categories SET budget_target = ? WHERE name = ?;');
  stmt.run([budgetTarget, name]);
  const modified = db.getRowsModified() > 0;
  saveDb();
  return modified;
}

export function deleteCategory(name: string): boolean {
  const stmt = db.prepare('DELETE FROM categories WHERE name = ?;');
  stmt.run([name]);
  const modified = db.getRowsModified() > 0;
  saveDb();
  return modified;
}

export function addMember(name: string): Member {
  const stmt = db.prepare('INSERT INTO home_members (name) VALUES (?);');
  stmt.run([name]);
  const insertedId = getLastInsertRowId();
  saveDb();
  return { id: insertedId, name };
}

export function deleteMember(id: number): boolean {
  const stmt = db.prepare('DELETE FROM home_members WHERE id = ?;');
  stmt.run([id]);
  const modified = db.getRowsModified() > 0;
  saveDb();
  return modified;
}

export function addBeneficiaryRule(
  beneficiaryOrObj: string | { beneficiary: string; suggested_category: string },
  suggestedCategoryName?: string
): BeneficiaryRule {
  let beneficiary: string;
  let suggestedCategory: string;

  if (typeof beneficiaryOrObj === 'string') {
    beneficiary = beneficiaryOrObj;
    suggestedCategory = suggestedCategoryName!;
  } else {
    beneficiary = beneficiaryOrObj.beneficiary;
    suggestedCategory = beneficiaryOrObj.suggested_category;
  }

  const categoryId = getCategoryIdByName(suggestedCategory);
  if (categoryId === null) {
    throw new Error('Category not found');
  }

  const stmt = db.prepare('INSERT INTO beneficiary_rules (beneficiary, suggested_category_id) VALUES (?, ?);');
  stmt.run([beneficiary, categoryId]);
  const insertedId = getLastInsertRowId();
  saveDb();

  return {
    id: insertedId,
    beneficiary,
    suggested_category_id: categoryId,
    suggested_category: suggestedCategory
  };
}

export function deleteBeneficiaryRule(id: number): boolean {
  const stmt = db.prepare('DELETE FROM beneficiary_rules WHERE id = ?;');
  stmt.run([id]);
  const modified = db.getRowsModified() > 0;
  saveDb();
  return modified;
}

// ------------------- AUTH -------------------

export function getAdminUsers(): AdminUser[] {
  const stmt = db.prepare('SELECT * FROM admin_users ORDER BY id ASC;');
  const result = fetchAll(stmt);
  return result.map((row: any) => ({
    id: row.id,
    username: row.username,
    password_hash: row.password_hash,
    created_at: row.created_at
  }));
}

export function getAdminUserByUsername(username: string): AdminUser | undefined {
  const stmt = db.prepare('SELECT * FROM admin_users WHERE username = ?;');
  const row = stmt.getAsObject([username]);
  stmt.free();
  if (!row || row.id === undefined) return undefined;
  return {
    id: row.id,
    username: row.username,
    password_hash: row.password_hash,
    created_at: row.created_at
  };
}

export function addAdminUser(username: string, passwordHash: string): AdminUser {
  if (getAdminUsers().length > 0) {
    throw new Error('Já existe uma conta de administrador. Apenas um admin é permitido.');
  }
  const stmt = db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?);');
  stmt.run([username, passwordHash]);
  const insertedId = getLastInsertRowId();
  saveDb();
  return { id: insertedId, username, password_hash: passwordHash, created_at: new Date().toISOString() };
}

export function updateAdminPassword(username: string, passwordHash: string): boolean {
  const stmt = db.prepare('UPDATE admin_users SET password_hash = ? WHERE username = ?;');
  stmt.run([passwordHash, username]);
  const modified = db.getRowsModified() > 0;
  saveDb();
  return modified;
}

export function getAuthTokens(): AuthToken[] {
  const stmt = db.prepare('SELECT * FROM auth_tokens ORDER BY created_at DESC;');
  const result = fetchAll(stmt);
  return result.map((row: any) => ({
    id: row.id,
    token: row.token,
    label: row.label || undefined,
    created_at: row.created_at,
    last_used_at: row.last_used_at || undefined,
    used_at: row.used_at || undefined,
    device_id: row.device_id || undefined
  }));
}

export function getAuthTokenByValue(token: string): AuthToken | undefined {
  const stmt = db.prepare('SELECT * FROM auth_tokens WHERE token = ?;');
  const row = stmt.getAsObject([token]);
  stmt.free();
  if (!row || row.id === undefined) return undefined;
  return {
    id: row.id,
    token: row.token,
    label: row.label || undefined,
    created_at: row.created_at,
    last_used_at: row.last_used_at || undefined,
    used_at: row.used_at || undefined,
    device_id: row.device_id || undefined
  };
}

export function addAuthToken(token: string, label?: string): AuthToken {
  const stmt = db.prepare('INSERT INTO auth_tokens (token, label) VALUES (?, ?);');
  stmt.run([token, label || null]);
  const insertedId = getLastInsertRowId();
  saveDb();
  return { id: insertedId, token, label: label || undefined, created_at: new Date().toISOString() };
}

export function getAppUserByUsername(username: string): AppUser | undefined {
  const stmt = db.prepare('SELECT * FROM app_users WHERE username = ?;');
  const row = stmt.getAsObject([username]);
  stmt.free();
  if (!row || row.id === undefined) return undefined;
  return row as AppUser;
}

export function getAppUserBySessionToken(sessionToken: string): AppUser | undefined {
  const stmt = db.prepare('SELECT * FROM app_users WHERE session_token = ?;');
  const row = stmt.getAsObject([sessionToken]);
  stmt.free();
  if (!row || row.id === undefined) return undefined;
  return row as AppUser;
}

export function getAppUserByDeviceId(deviceId: string): AppUser | undefined {
  const stmt = db.prepare('SELECT * FROM app_users WHERE device_id = ?;');
  const row = stmt.getAsObject([deviceId]);
  stmt.free();
  if (!row || row.id === undefined) return undefined;
  return row as AppUser;
}

export function addAppUser(username: string, passwordHash: string, deviceId: string, sessionToken?: string): AppUser {
  const stmt = db.prepare(`
    INSERT INTO app_users (username, password_hash, device_id, session_token) VALUES (?, ?, ?, ?);
  `);
  stmt.run([username, passwordHash, deviceId, sessionToken || null]);
  const insertedId = getLastInsertRowId();
  saveDb();
  return { id: insertedId, username, password_hash: passwordHash, device_id: deviceId, session_token: sessionToken, created_at: new Date().toISOString() };
}

export function setAppUserSession(username: string, sessionToken: string): boolean {
  const stmt = db.prepare('UPDATE app_users SET session_token = ? WHERE username = ?;');
  stmt.run([sessionToken, username]);
  const modified = db.getRowsModified() > 0;
  if (modified) saveDb();
  return modified;
}

export function updateAppUserPassword(username: string, passwordHash: string): boolean {
  const stmt = db.prepare('UPDATE app_users SET password_hash = ? WHERE username = ?;');
  stmt.run([passwordHash, username]);
  const modified = db.getRowsModified() > 0;
  if (modified) saveDb();
  return modified;
}

export function resetAppAuthentication(): void {
  db.run('DELETE FROM app_users;');
  db.run('DELETE FROM auth_tokens;');
  saveDb();
}

export function consumeAuthToken(id: number, deviceId: string): boolean {
  const stmt = db.prepare(`
    UPDATE auth_tokens SET used_at = ?, device_id = ?, last_used_at = ?
    WHERE id = ? AND used_at IS NULL;
  `);
  const now = new Date().toISOString();
  stmt.run([now, deviceId, now, id]);
  const modified = db.getRowsModified() > 0;
  if (modified) saveDb();
  return modified;
}

export function deleteAuthToken(id: number): boolean {
  const stmt = db.prepare('DELETE FROM auth_tokens WHERE id = ?;');
  stmt.run([id]);
  const modified = db.getRowsModified() > 0;
  saveDb();
  return modified;
}

export function touchAuthToken(id: number): void {
  const stmt = db.prepare('UPDATE auth_tokens SET last_used_at = ? WHERE id = ?;');
  stmt.run([new Date().toISOString(), id]);
  saveDb();
}

export function getGoalById(id: number): Goal | undefined {
  const stmt = db.prepare(`
    SELECT g.*, c.name as category 
    FROM goals g 
    LEFT JOIN categories c ON g.category_id = c.id 
    WHERE g.id = ?;
  `);
  const row = stmt.getAsObject([id]);
  if (!row || row.id === undefined) return undefined;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    target_value: row.target_value,
    current_saved: row.current_saved,
    monthly_contribution: row.monthly_contribution,
    start_date: row.start_date,
    target_date: row.target_date,
    priority: row.priority,
    status: row.status,
    category: row.category,
    category_id: row.category_id,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

const VALID_PAYMENT_METHODS = ['pix', 'boleto', 'cartao', 'debito_automatico', 'dinheiro'];
function normalizePaymentMethod(pm?: string): string {
  if (!pm || !VALID_PAYMENT_METHODS.includes(pm)) {
    const lower = (pm || '').toLowerCase().trim();
    if (lower === 'credito' || lower === 'crédito' || lower === 'cartão' || lower === 'debito') return 'cartao';
    if (lower === 'transferencia' || lower === 'transferência' || lower === 'ted' || lower === 'doc') return 'pix';
    return 'pix';
  }
  return pm;
}

export function addLaunch(launchData: Omit<Launch, 'id' | 'created_at'>): Launch {
  const categoryId = getCategoryIdByName(launchData.category);
  if (categoryId === null) {
    throw new Error('Category not found');
  }
  
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO launches (
      type, category_id, subcategory, description, beneficiary, value, due_date,
      competence_month, competence_year, status, payment_method,
      installment_current, installment_total, origin, pdf_path, doc_number, barcode, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  
  stmt.run([
    normalizeDbValue(launchData.type),
    normalizeDbValue(categoryId),
    normalizeDbValue(launchData.subcategory),
    normalizeDbValue(launchData.description),
    normalizeDbValue(launchData.beneficiary),
    normalizeDbValue(launchData.value),
    normalizeDbValue(launchData.due_date),
    normalizeDbValue(launchData.competence_month),
    normalizeDbValue(launchData.competence_year),
    normalizeDbValue(launchData.status),
    normalizeDbValue(normalizePaymentMethod(launchData.payment_method)),
    normalizeDbValue(launchData.installment_current),
    normalizeDbValue(launchData.installment_total),
    normalizeDbValue(launchData.origin),
    normalizeDbValue(launchData.pdf_path),
    normalizeDbValue(launchData.doc_number),
    normalizeDbValue(launchData.barcode),
    normalizeDbValue(now)
  ]);
  const insertedId = getLastInsertRowId();
  
  saveDb();
  
  return {
    ...launchData,
    id: insertedId,
    category_id: categoryId,
    created_at: now
  };
}

export function updateLaunch(id: number, updates: Partial<Omit<Launch, 'id' | 'created_at'>>): Launch | null {
  // If category is being updated, get category id
  let categoryId = null;
  if (updates.category) {
    const getCatId = db.prepare('SELECT id FROM categories WHERE name = ?;');
    const catResult = getCatId.getAsObject([updates.category]);
    if (catResult && catResult.id !== undefined) categoryId = catResult.id;
    getCatId.free();
  }
  
  // Build update query
  const setClauses: string[] = [];
  const params: any[] = [];
  
  if (updates.type) { setClauses.push('type = ?'); params.push(normalizeDbValue(updates.type)); }
  if (categoryId) { setClauses.push('category_id = ?'); params.push(normalizeDbValue(categoryId)); }
  if (updates.subcategory !== undefined) { setClauses.push('subcategory = ?'); params.push(normalizeDbValue(updates.subcategory)); }
  if (updates.description) { setClauses.push('description = ?'); params.push(normalizeDbValue(updates.description)); }
  if (updates.beneficiary !== undefined) { setClauses.push('beneficiary = ?'); params.push(normalizeDbValue(updates.beneficiary)); }
  if (updates.value) { setClauses.push('value = ?'); params.push(normalizeDbValue(updates.value)); }
  if (updates.due_date !== undefined) { setClauses.push('due_date = ?'); params.push(normalizeDbValue(updates.due_date)); }
  if (updates.competence_month) { setClauses.push('competence_month = ?'); params.push(normalizeDbValue(updates.competence_month)); }
  if (updates.competence_year) { setClauses.push('competence_year = ?'); params.push(normalizeDbValue(updates.competence_year)); }
  if (updates.status) { setClauses.push('status = ?'); params.push(normalizeDbValue(updates.status)); }
  if (updates.payment_method !== undefined) { setClauses.push('payment_method = ?'); params.push(normalizeDbValue(updates.payment_method)); }
  if (updates.installment_current !== undefined) { setClauses.push('installment_current = ?'); params.push(normalizeDbValue(updates.installment_current)); }
  if (updates.installment_total !== undefined) { setClauses.push('installment_total = ?'); params.push(normalizeDbValue(updates.installment_total)); }
  if (updates.origin) { setClauses.push('origin = ?'); params.push(normalizeDbValue(updates.origin)); }
  if (updates.pdf_path !== undefined) { setClauses.push('pdf_path = ?'); params.push(normalizeDbValue(updates.pdf_path)); }
  if (updates.doc_number !== undefined) { setClauses.push('doc_number = ?'); params.push(normalizeDbValue(updates.doc_number)); }
  if (updates.barcode !== undefined) { setClauses.push('barcode = ?'); params.push(normalizeDbValue(updates.barcode)); }
  
  // Verify the launch exists before attempting update
  const existingStmt = db.prepare('SELECT id FROM launches WHERE id = ?;');
  const existing = existingStmt.getAsObject([id]);
  existingStmt.free();
  if (!existing || existing.id === undefined) return null;

  if (setClauses.length === 0) return getLaunches().find(l => l.id === id) || null;
  
  setClauses.push('id = ?');
  params.push(id);
  
  const stmt = db.prepare(`UPDATE launches SET ${setClauses.slice(0, -1).join(', ')} WHERE id = ?;`);
  stmt.run(params);
  saveDb();
  
  return getLaunches().find(l => l.id === id) || null;
}

export function deleteLaunch(id: number): boolean {
  const existingStmt = db.prepare('SELECT id FROM launches WHERE id = ?;');
  const existing = existingStmt.getAsObject([id]);
  existingStmt.free();

  if (!existing || existing.id === undefined) return false;

  const stmt = db.prepare('DELETE FROM launches WHERE id = ?;');
  stmt.run([id]);
  saveDb();
  return true;
}

export function deleteMultipleLaunches(ids: number[]): number {
  if (ids.length === 0) return 0;

  let deletedCount = 0;
  for (const id of ids) {
    if (deleteLaunch(id)) deletedCount++;
  }

  return deletedCount;
}

export function toggleLaunchPaid(id: number): Launch | null {
  const launch = getLaunches().find(l => l.id === id);
  if (!launch) return null;
  
  const newStatus = launch.status === 'pago' ? 'pendente' : 'pago';
  return updateLaunch(id, { status: newStatus });
}

export function clearAICache(): void {
  const stmt = db.prepare('DELETE FROM ai_cache;');
  stmt.run();
  saveDb();
}

export function addAICache(key: string, response: string): void {
  const stmt = db.prepare('INSERT OR REPLACE INTO ai_cache (cache_key, response) VALUES (?, ?);');
  stmt.run([key, response]);
  saveDb();
}

export function getAICacheByKey(key: string): AICacheEntry | undefined {
  const stmt = db.prepare('SELECT * FROM ai_cache WHERE cache_key = ?;');
  const result = stmt.getAsObject([key]);
  if (!result || result.cache_key === undefined) return undefined;
  return { cache_key: result.cache_key, response: result.response, created_at: result.created_at };
}

export function addGoal(goalData: Omit<Goal, 'id' | 'created_at' | 'updated_at'>): Goal {
  const now = new Date().toISOString();
  const catId = goalData.category ? getCategoryIdByName(goalData.category) : null;
  
  const stmt = db.prepare(`
    INSERT INTO goals (
      name, description, target_value, current_saved, monthly_contribution,
      start_date, target_date, priority, status, category_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  
  stmt.run([
    goalData.name, goalData.description || null, goalData.target_value,
    goalData.current_saved, goalData.monthly_contribution, goalData.start_date,
    goalData.target_date || null, goalData.priority, goalData.status, catId,
    now, now
  ]);
  const insertedId = getLastInsertRowId();
  
  saveDb();
  
  return {
    ...goalData,
    id: insertedId,
    category_id: catId,
    created_at: now,
    updated_at: now
  };
}

export function updateGoal(id: number, updates: Partial<Omit<Goal, 'id' | 'created_at'>>): Goal | null {
  const now = new Date().toISOString();
  let categoryId = null;
  if (updates.category) {
    categoryId = getCategoryIdByName(updates.category);
  }
  
  const setClauses: string[] = [];
  const params: any[] = [];
  
  if (updates.name) { setClauses.push('name = ?'); params.push(updates.name); }
  if (updates.description !== undefined) { setClauses.push('description = ?'); params.push(updates.description); }
  if (updates.target_value) { setClauses.push('target_value = ?'); params.push(updates.target_value); }
  if (updates.current_saved !== undefined) { setClauses.push('current_saved = ?'); params.push(updates.current_saved); }
  if (updates.monthly_contribution !== undefined) { setClauses.push('monthly_contribution = ?'); params.push(updates.monthly_contribution); }
  if (updates.start_date) { setClauses.push('start_date = ?'); params.push(updates.start_date); }
  if (updates.target_date !== undefined) { setClauses.push('target_date = ?'); params.push(updates.target_date); }
  if (updates.priority) { setClauses.push('priority = ?'); params.push(updates.priority); }
  if (updates.status) { setClauses.push('status = ?'); params.push(updates.status); }
  if (categoryId !== undefined) { setClauses.push('category_id = ?'); params.push(categoryId); }
  setClauses.push('updated_at = ?');
  params.push(now);
  setClauses.push('id = ?');
  params.push(id);
  
  const stmt = db.prepare(`UPDATE goals SET ${setClauses.slice(0, -1).join(', ')} WHERE id = ?;`);
  stmt.run(params);
  const modified = db.getRowsModified() > 0;
  saveDb();
  
  return modified ? (getGoals().find(g => g.id === id) || null) : null;
}

export function deleteGoal(id: number): boolean {
  const stmt = db.prepare('DELETE FROM goals WHERE id = ?;');
  stmt.run([id]);
  const modified = db.getRowsModified() > 0;
  saveDb();
  return modified;
}

export function addGoalScenario(scenarioData: Omit<GoalScenario, 'id'>): GoalScenario {
  const stmt = db.prepare(`
    INSERT INTO goal_scenarios (
      goal_id, scenario_type, total_value, down_payment, installments,
      installment_value, interest_rate, total_cost
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
  `);
  
  stmt.run([
    scenarioData.goal_id, scenarioData.scenario_type, scenarioData.total_value || null,
    scenarioData.down_payment || null, scenarioData.installments || null,
    scenarioData.installment_value || null, scenarioData.interest_rate || null,
    scenarioData.total_cost || null
  ]);
  const insertedId = getLastInsertRowId();
  
  saveDb();
  
  return { ...scenarioData, id: insertedId };
}

export function deleteGoalScenario(id: number): boolean {
  const stmt = db.prepare('DELETE FROM goal_scenarios WHERE id = ?;');
  stmt.run([id]);
  const modified = db.getRowsModified() > 0;
  saveDb();
  return modified;
}

// Deprecated - keep for compatibility
export function writeDb(data: Partial<DbSchema>): void {
  // This function is deprecated, but we'll keep it for compatibility
  saveDb();
}

// Export default db for backward compatibility
export default {
  getCategories,
  getMembers,
  getHomeMembers,
  getRules,
  getBeneficiaryRules,
  getAICache,
  getAiCache,
  getLaunches,
  getGoals,
  getGoalById,
  getGoalScenarios,
  addCategory,
  updateCategoryBudget,
  deleteCategory,
  addMember,
  addHomeMember: addMember,
  deleteMember,
  deleteHomeMember: deleteMember,
  addBeneficiaryRule,
  deleteBeneficiaryRule,
  addLaunch,
  updateLaunch,
  deleteLaunch,
  deleteMultipleLaunches,
  toggleLaunchPaid,
  togglePaid: toggleLaunchPaid,
  clearAICache,
  clearAiCache,
  addAICache,
  setAiCache: addAICache,
  getAICacheByKey,
  addGoal,
  updateGoal,
  deleteGoal,
  addGoalScenario,
  deleteGoalScenario,
  getAdminUsers,
  getAdminUserByUsername,
  addAdminUser,
  updateAdminPassword,
  getAuthTokens,
  getAuthTokenByValue,
  addAuthToken,
  deleteAuthToken,
  touchAuthToken,
  readDb,
  writeDb,
  initDb
};
