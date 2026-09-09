import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { execFile } from 'child_process';
import { PDFParse } from 'pdf-parse';
import * as xlsx from 'xlsx';
import crypto from 'crypto';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { isDuplicate as detectDuplicate, stringsAreSimilar } from './src/duplicateDetection.js';
import {
  buildGoalAnalysisOfflineAdvice,
  buildRecommendationFallbackAdvice,
  buildReserveAnalysisOfflineAdvice
} from './src/aiFallbacks.js';

// Load environment variables from .env file
dotenv.config();

import { 
  initDb,
  getLaunches, 
  addLaunch, 
  updateLaunch, 
  deleteLaunch, 
  toggleLaunchPaid as togglePaid, 
  getCategories, 
  addCategory, 
  updateCategoryBudget,
  deleteCategory, 
  getMembers as getHomeMembers, 
  addMember as addHomeMember, 
  deleteMember as deleteHomeMember, 
  getRules as getBeneficiaryRules, 
  addBeneficiaryRule,
  deleteBeneficiaryRule,
  getAICache as getAiCache, 
  addAICache as setAiCache, 
  clearAICache,
  clearAiCache,
  readDb,
  getGoals,
  getGoalById,
  addGoal,
  updateGoal,
  deleteGoal,
  getGoalScenarios,
  addGoalScenario,
  deleteGoalScenario,
  deleteMultipleLaunches,
  listBackups,
  restoreFromBackup,
  importDbFromJsonData,
  exportDbToJsonData,
  resetDatabaseToDefaults,
  getAdminUsers,
  getAdminUserByUsername,
  addAdminUser,
  updateAdminPassword,
  getAppUserByUsername,
  getAppUserByDeviceId,
  getAppUserBySessionToken,
  addAppUser,
  setAppUserSession,
  updateAppUserPassword,
  resetAppAuthentication,
  consumeAuthToken,
  getAuthTokens,
  getAuthTokenByValue,
  addAuthToken,
  deleteAuthToken,
  touchAuthToken
} from './src/db.js';
import os from 'os';
import { spawnSync } from 'child_process';

import { 
  Launch, 
  Category, 
  HomeMember, 
  BeneficiaryRule, 
  DashboardData, 
  BudgetStatus, 
  MarketData, 
  Projection, 
  DuplicateGroup, 
  LaunchType, 
  PaymentMethod, 
  LaunchOrigin,
  Goal,
  GoalScenario,
  GoalAnalysis,
  DbSchema
} from './src/types.js';

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

  return path.resolve(process.cwd(), 'server.ts');
};

const __filename = getModulePath();
const __dirname = path.dirname(__filename);

const app = express();
const DEFAULT_PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

function listenOnPort(port: number, host: string) {
  const server = app.listen(port, host, () => {
    process.env.PORT = String(port);
    console.log(`[My Financer Backend] Running on http://${host === '0.0.0.0' ? '0.0.0.0' : host}:${port}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[My Financer Backend] Port ${port} is busy, trying ${port + 1}...`);
      listenOnPort(port + 1, host);
      return;
    }

    console.error('[My Financer Backend] Failed to start server:', err);
    process.exit(1);
  });
}

// Initialize the database
async function initializeDatabase() {
  try {
    await initDb();
    if (process.env.FINANCER_RESET_AUTH === '1') {
      resetAppAuthentication();
      console.log('[My Financer Backend] App authentication reset completed');
      process.exit(0);
    }
    console.log('Database initialized successfully');
    
    // Check if we need to migrate from JSON to SQLite
    const jsonPath = path.join(process.cwd(), 'financer_db.json');
    if (fs.existsSync(jsonPath)) {
      try {
        console.log('Found financer_db.json, checking for migration...');
        const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (jsonData.launches && jsonData.launches.length > getLaunches().length) {
          console.log('Migrating data from JSON to SQLite...');
          await importDbFromJsonData(jsonData);
          console.log('Migration complete!');
          // Rename JSON to backup
          fs.renameSync(jsonPath, path.join(process.cwd(), 'financer_db.json.backup'));
        }
      } catch (err) {
        console.error('Migration error:', err);
      }
    }
    
    // Log all current launches for verification
    const allLaunches = getLaunches();
    console.log(`\n📊 Current database contains ${allLaunches.length} launches:`);
    allLaunches.forEach(l => {
      console.log(`  ID: ${l.id} | ${l.description} | R$ ${l.value.toFixed(2)} | ${l.competence_month}/${l.competence_year}`);
    });
  } catch (err) {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  }
}

initializeDatabase();

// Middleware
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const { method, path } = req;
  
  // Log when response is finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${method} ${path} - ${res.statusCode} (${duration}ms)`);
  });
  
  next();
});

// -----------------------------------------------------
// Authentication (token-based, local)
// -----------------------------------------------------

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  return candidate === hash;
}

function generateAccessToken(): string {
  return `MF-${crypto.randomBytes(24).toString('hex')}`;
}

function generateAdminSessionToken(): string {
  return `ADM-${crypto.randomBytes(24).toString('hex')}`;
}

// In-memory admin sessions (reset on server restart)
const adminSessions = new Map<string, { username: string; createdAt: number }>();
const appSessions = new Map<string, { username: string; deviceId: string; createdAt: number }>();

function getBearerToken(req: express.Request): string {
  const authHeader = req.headers.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
}

// Protect all /api routes except /api/auth/* and /api/health
app.use('/api', (req, res, next) => {
  const apiPath = req.path;
  if (apiPath.startsWith('/auth') || apiPath === '/health') {
    return next();
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Token de acesso necessário' });
  }

  const session = appSessions.get(token) || getAppUserBySessionToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Token inválido ou revogado' });
  }
  next();
});

// -----------------------------------------------------
// Authentication Endpoints
// -----------------------------------------------------

// Whether an admin account exists yet (first-run setup detection)
app.get('/api/auth/status', (req, res) => {
  const hasAdmin = getAdminUsers().length > 0;
  const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : '';
  res.json({
    status: 'ok',
    hasAdmin,
    setupRequired: !hasAdmin,
    activated: Boolean(deviceId && getAppUserByDeviceId(deviceId))
  });
});

// First-run: create the admin account (only when no admin exists)
app.post('/api/auth/setup', (req, res) => {
  try {
    if (getAdminUsers().length > 0) {
      return res.status(409).json({ error: 'Conta de administrador já existe' });
    }
    const { username, password } = req.body || {};
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({ error: 'Usuário inválido (mínimo 3 caracteres)' });
    }
    if (!password || typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ error: 'Senha inválida (mínimo 4 caracteres)' });
    }
    addAdminUser(username.trim(), hashPassword(password));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao criar conta de administrador' });
  }
});

// Admin login -> returns an admin session token
app.post('/api/auth/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const admin = getAdminUserByUsername(String(username || '').trim());
  if (!admin || !verifyPassword(String(password || ''), admin.password_hash)) {
    return res.status(401).json({ error: 'Credenciais de administrador inválidas' });
  }
  const sessionToken = generateAdminSessionToken();
  adminSessions.set(sessionToken, { username: admin.username, createdAt: Date.now() });
  res.json({ success: true, adminToken: sessionToken, username: admin.username });
});

app.post('/api/auth/admin/logout', (req, res) => {
  const t = req.headers['x-admin-token'];
  if (t && adminSessions.has(t as string)) {
    adminSessions.delete(t as string);
  }
  res.json({ success: true });
});

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const t = req.headers['x-admin-token'];
  if (!t || !adminSessions.has(t as string)) {
    return res.status(401).json({ error: 'Sessão de administrador inválida ou expirada' });
  }
  next();
}

// List generated access tokens (admin only)
app.get('/api/auth/admin/tokens', requireAdmin, (req, res) => {
  res.json(getAuthTokens());
});

// Generate a new access token (admin only)
app.post('/api/auth/admin/tokens', requireAdmin, (req, res) => {
  const { label } = req.body || {};
  const created = addAuthToken(generateAccessToken(), String(label || '').trim() || undefined);
  res.json({ success: true, token: created.token, id: created.id, label: created.label || '' });
});

// Revoke an access token (admin only)
app.delete('/api/auth/admin/tokens/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'ID de token inválido' });
  }
  const deleted = deleteAuthToken(id);
  if (deleted) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Token não encontrado' });
  }
});

// Change admin password (admin only)
app.post('/api/auth/admin/password', requireAdmin, (req, res) => {
  const t = req.headers['x-admin-token'] as string;
  const session = adminSessions.get(t);
  const admin = session ? getAdminUserByUsername(session.username) : undefined;
  const { currentPassword, newPassword } = req.body || {};

  if (!admin || !verifyPassword(String(currentPassword || ''), admin.password_hash)) {
    return res.status(401).json({ error: 'Senha atual incorreta' });
  }
  if (!newPassword || String(newPassword).length < 4) {
    return res.status(400).json({ error: 'Nova senha inválida (mínimo 4 caracteres)' });
  }
  updateAdminPassword(admin.username, hashPassword(String(newPassword)));
  res.json({ success: true });
});

// Reset the app user's password without changing activation or device binding.
app.post('/api/auth/admin/app-password', requireAdmin, (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = req.body?.password;
  if (username.length < 3) {
    return res.status(400).json({ error: 'Usuário inválido' });
  }
  if (typeof password !== 'string' || password.length < 4) {
    return res.status(400).json({ error: 'A nova senha deve ter no mínimo 4 caracteres' });
  }
  if (!updateAppUserPassword(username, hashPassword(password))) {
    return res.status(404).json({ error: 'Usuário do app não encontrado' });
  }
  res.json({ success: true });
});

function validateDeviceId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9-]{16,100}$/i.test(value)) {
    throw new Error('Identificador do computador inválido');
  }
  return value;
}

// One-time activation: consumes the token and creates the local user account.
app.post('/api/auth/activate', (req, res) => {
  try {
    const { token, username, password, deviceId } = req.body || {};
    const normalizedUsername = String(username || '').trim();
    if (!normalizedUsername || normalizedUsername.length < 3) {
      return res.status(400).json({ error: 'Usuário inválido (mínimo 3 caracteres)' });
    }
    if (typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ error: 'Senha inválida (mínimo 4 caracteres)' });
    }
    if (typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ error: 'Informe o token de ativação' });
    }
    const normalizedDeviceId = validateDeviceId(deviceId);
    if (getAppUserByDeviceId(normalizedDeviceId)) {
      return res.status(409).json({ error: 'Este computador já está ativado. Entre com usuário e senha.' });
    }
    if (getAppUserByUsername(normalizedUsername)) {
      return res.status(409).json({ error: 'Este usuário já está cadastrado' });
    }
    const stored = getAuthTokenByValue(token.trim());
    if (!stored) return res.status(401).json({ error: 'Token inválido ou revogado' });
    if (stored.used_at) return res.status(409).json({ error: 'Este token já foi utilizado em outro computador' });
    if (!consumeAuthToken(stored.id, normalizedDeviceId)) {
      return res.status(409).json({ error: 'Este token já foi utilizado em outro computador' });
    }
    const sessionToken = generateAccessToken();
    addAppUser(normalizedUsername, hashPassword(password), normalizedDeviceId, sessionToken);
    appSessions.set(sessionToken, { username: normalizedUsername, deviceId: normalizedDeviceId, createdAt: Date.now() });
    res.json({ success: true, sessionToken, username: normalizedUsername });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Falha ao ativar o computador' });
  }
});

// Daily user login. Activation tokens are never accepted here.
app.post('/api/auth/login', (req, res) => {
  const { username, password, deviceId } = req.body || {};
  let normalizedDeviceId: string;
  try {
    normalizedDeviceId = validateDeviceId(deviceId);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Computador inválido' });
  }
  const user = getAppUserByDeviceId(normalizedDeviceId);
  if (!user || user.username !== String(username || '').trim() || !verifyPassword(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  }
  const sessionToken = generateAccessToken();
  setAppUserSession(user.username, sessionToken);
  appSessions.set(sessionToken, { username: user.username, deviceId: normalizedDeviceId, createdAt: Date.now() });
  res.json({ success: true, token: sessionToken, username: user.username });
});

// Validate a stored token (used on app load)
app.get('/api/auth/validate', (req, res) => {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Sessão necessária' });
  }
  const session = appSessions.get(token) || getAppUserBySessionToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada' });
  }
  res.json({ success: true, username: session.username });
});

// Resolve duplicate group: choose principal and delete others
app.post('/api/launches/duplicates/resolve', (req, res) => {
  try {
    const { ids } = req.body as { ids?: number[], groupId?: string };
    let toProcess: number[] = [];
    if (Array.isArray(ids) && ids.length > 0) {
      toProcess = ids;
    } else if (req.body && (req.body as any).groupId) {
      // attempt to parse groupId like 'group-<id>' and build from monthly duplicates
      const gid = (req.body as any).groupId as string;
      const m = gid.match(/group-(\d+)/);
      if (m) {
        const baseId = parseInt(m[1]);
        // find related similar launches across all launches
        const all = getLaunches();
        const base = all.find(a => a.id === baseId);
        if (base) {
          const related = all.filter(l => isDuplicate(base, l) || l.id === baseId);
          toProcess = related.map(l => l.id);
        }
      }
    }

    if (!toProcess || toProcess.length < 2) {
      return res.status(400).json({ error: 'Provide at least two launch ids to resolve' });
    }

    const launches = getLaunches().filter(l => toProcess.includes(l.id));
    // origin priority heuristic
    const originPriority: Record<string, number> = { manual: 0, planilha: 1, extrato: 2, pdf: 3, itau_statement: 4, extrato_bradesco: 4, extrato_nubank: 4, extrato_itau: 4 };
    const sorted = [...launches].sort((a, b) => {
      const pa = originPriority[a.origin as string] ?? 5;
      const pb = originPriority[b.origin as string] ?? 5;
      if (pa !== pb) return pa - pb;
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });

    const toKeep = sorted[0];
    const toDelete = sorted.slice(1).map(l => l.id);

    for (const id of toDelete) {
      deleteLaunch(id);
    }

    res.json({ kept: toKeep.id, deleted: toDelete });
  } catch (err: any) {
    console.error('Error resolving duplicates:', err);
    res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

// Setup file upload folder
const DATA_DIR = process.env.FINANCER_DATA_DIR || process.cwd();
const uploadsDir = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const storage = multer.memoryStorage();
const upload = multer({ storage });

// Initialize Gemini Client
const geminiApiKey = process.env.GEMINI_API_KEY;
const ai = geminiApiKey ? new GoogleGenAI({
  apiKey: geminiApiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
}) : null;

console.log(`[My Financer Backend] Server starting... Gemini API configured: ${!!ai}`);

// Helper functions for Brazilian formatted numbers and dates
function parseBrazilianNumber(str: string): number {
  let s = str.trim();
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const val = parseFloat(s);
  return isNaN(val) ? 0 : val;
}

// --- PDF text extraction helpers (external tools fallback) ---
function commandExists(cmd: string): boolean {
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const res = spawnSync(which, [cmd], { encoding: 'utf8' });
    return res.status === 0 && res.stdout && res.stdout.trim().length > 0;
  } catch (err) {
    return false;
  }
}

function extractTextWithPdftotext(buffer: Buffer): string | null {
  if (!commandExists('pdftotext')) return null;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-'));
  try {
    const tmpPdf = path.join(tmpDir, 'tmp.pdf');
    fs.writeFileSync(tmpPdf, buffer);
    const proc = spawnSync('pdftotext', ['-layout', tmpPdf, '-'], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    if (proc.status === 0) {
      return proc.stdout || '';
    }
    console.warn('pdftotext failed:', proc.stderr);
    return null;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {};
  }
}

function ocrPdfWithPdftoppmAndTesseract(buffer: Buffer): string | null {
  if (!commandExists('pdftoppm') || !commandExists('tesseract')) return null;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-'));
  try {
    const tmpPdf = path.join(tmpDir, 'tmp.pdf');
    fs.writeFileSync(tmpPdf, buffer);
    const outPrefix = path.join(tmpDir, 'page');
    const conv = spawnSync('pdftoppm', ['-png', tmpPdf, outPrefix], { encoding: 'utf8' });
    if (conv.status !== 0) {
      console.warn('pdftoppm failed:', conv.stderr);
      return null;
    }
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.png')).sort();
    let fullText = '';
    for (const f of files) {
      const imgPath = path.join(tmpDir, f);
      const t = spawnSync('tesseract', [imgPath, 'stdout', '-l', 'por'], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
      if (t.status === 0) {
        fullText += (t.stdout || '') + '\n';
      } else {
        console.warn('tesseract failed for', imgPath, t.stderr);
      }
    }
    return fullText.trim();
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {};
  }
}


function convertBrDateToIso(brDate: string): string {
  const parts = brDate.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return '';
}

// Validation helper for launches
function validateLaunchData(data: any, isUpdate: boolean = false): { valid: boolean; error?: string } {
  const categories = getCategories().map(c => c.name);
  
  // Check required fields for create
  if (!isUpdate) {
    if (!data.beneficiary || data.beneficiary.trim() === '') {
      return { valid: false, error: 'Beneficiário é obrigatório' };
    }
    if (data.value === undefined || data.value === null) {
      return { valid: false, error: 'Valor é obrigatório' };
    }
    if (!data.due_date) {
      return { valid: false, error: 'Data é obrigatória' };
    }
  }

  // Validate value if provided
  if (data.value !== undefined) {
    const value = typeof data.value === 'string' ? parseFloat(data.value) : data.value;
    if (isNaN(value) || value <= 0) {
      return { valid: false, error: 'Valor deve ser um número positivo' };
    }
  }

  // Validate date if provided
  if (data.due_date) {
    const date = new Date(data.due_date);
    if (isNaN(date.getTime())) {
      return { valid: false, error: 'Data inválida' };
    }
  }

  // Validate category if provided
  if (data.category && !categories.includes(data.category)) {
    return { valid: false, error: `Categoria '${data.category}' não existe. Categorias válidas: ${categories.join(', ')}` };
  }

  return { valid: true };
}

// Helper: Extract month/year from filename - flexible pattern matching
function extractMonthYearFromFilename(filename: string): { month: number; year: number } | null {
  const monthNames = {
    'janeiro': 1, 'jan': 1,
    'fevereiro': 2, 'fev': 2,
    'março': 3, 'mar': 3,
    'abril': 4, 'abr': 4,
    'maio': 5, 'mai': 5,
    'junho': 6, 'jun': 6,
    'julho': 7, 'jul': 7,
    'agosto': 8, 'ago': 8,
    'setembro': 9, 'set': 9,
    'outubro': 10, 'out': 10,
    'novembro': 11, 'nov': 11,
    'dezembro': 12, 'dez': 12
  };

  // Try to find month name followed by year (e.g., "Jul_2026" or "julho 2026")
  const monthYearPattern = /(\w+)[\s_-]+(20\d{2})/gi;
  const matches = filename.matchAll(monthYearPattern);
  for (const match of matches) {
    const monthStr = match[1].toLowerCase();
    const yearStr = match[2];
    if (monthNames[monthStr as keyof typeof monthNames] && yearStr) {
      return { month: monthNames[monthStr as keyof typeof monthNames], year: parseInt(yearStr) };
    }
  }

  // Try MM/DD/YYYY or MM-DD-YYYY pattern
  const datePattern = /(\d{1,2})[-/](\d{1,2})[-/](20\d{2})/;
  const dateMatch = filename.match(datePattern);
  if (dateMatch) {
    const m = parseInt(dateMatch[1]);
    const y = parseInt(dateMatch[3]);
    if (m >= 1 && m <= 12) return { month: m, year: y };
  }

  return null;
}

// Helper: Parse Excel personal budget (handles multi-table layouts)
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

  // Helper to check if ANY cell in a row has aggregate keywords
  const hasAggregateKeyword = (row: any[]): boolean => {
    const keywords = ['sub-total', 'sub total', 'subtotal', 'total geral', 'total', 'despesas total mês'];
    for (const cell of row) {
      const cellStr = (cell || '').toString().toLowerCase().trim();
      if (keywords.some(kw => cellStr.includes(kw))) {
        return true;
      }
    }
    return false;
  };

  // Aggregate keywords to skip - only skip EXACT matches or pure numbers
  const isAggregateRow = (text: string): boolean => {
    if (!text) return false;
    const lower = text.toLowerCase().trim();
    
    // Check keywords - only skip EXACT matches!
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
    for (let row = startRow; row <= endRow && row < rawData.length; row++) {
      const rowData = rawData[row] || [];
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
      if (isAggregateRow(desc) || hasAggregateKeyword(rowData)) continue;

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
          if (hasAggregateKeyword(checkRowData)) break;
          // Check if there's a non-empty cell in description column (c+1)
          const descCell = (checkRowData[c+1] || '').toString().toLowerCase().trim();
          if (descCell) endRow = checkRow;
        }
        // Parse Gastos Fixos: description in col c+1, value in col c+2
        if (endRow >= r) {
          parseSection('despesa_fixa', 'Contas de Consumo', r, endRow, c + 1, c + 2);
        }
      }

      // Check for "Gastos Variados" header
      if (cell === 'gastos variados') {
        let endRow = r;
        // First, check the same row (header row) for data (row 2 in our case)
        const headerRowData = rawData[r] || [];
        const headerDescCell = (headerRowData[c+1] || '').toString().toLowerCase().trim();
        if (headerDescCell && !isAggregateRow(headerDescCell)) {
          endRow = r;
        }
        for (let checkRow = r + 1; checkRow < Math.min(r + 20, rawData.length); checkRow++) {
          const checkRowData = rawData[checkRow] || [];
          if (hasAggregateKeyword(checkRowData)) break;
          // Check if there's a non-empty cell in description column (c+1)
          const descCell = (checkRowData[c+1] || '').toString().toLowerCase().trim();
          if (descCell) endRow = checkRow;
        }
        // Parse Gastos Variados: description in col c+1, value in col c+2
        if (endRow >= r) {
          parseSection('despesa_variavel', 'Outros', r, endRow, c + 1, c + 2);
        }
      }

      // Check for "RECEITA" header (only once at top)
      if (cell === 'receita' && r < 25) {
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


// Robust duplicate detector for two launches
const isDuplicate = detectDuplicate;

// Endpoint to create test data for duplicate detection
app.post('/api/test/create-duplicates', (req, res) => {
  const launches = getLaunches();
  const testMonth = req.body.month || 6;
  const testYear = req.body.year || 2026;
  const now = new Date();

  const testData: Array<Omit<Launch, 'id' | 'created_at'>> = [
    {
      type: 'despesa_fixa',
      category: 'Outros',
      description: 'Conta Luz',
      beneficiary: 'Enel',
      value: 150.43,
      due_date: '2026-06-08',
      competence_month: testMonth,
      competence_year: testYear,
      status: 'pago',
      payment_method: 'pix',
      origin: 'manual'
    },
    {
      type: 'despesa_fixa',
      category: 'Contas de Consumo',
      description: 'Pagamento da Conta de Luz',
      beneficiary: 'ENEL Distribuição',
      value: 150.43,
      due_date: '2026-06-08',
      competence_month: testMonth,
      competence_year: testYear,
      status: 'pendente',
      payment_method: 'boleto',
      origin: 'pdf'
    },
    {
      type: 'receita',
      category: 'Salário',
      description: 'Salário Engemon',
      beneficiary: 'Engemon',
      value: 3666.83,
      due_date: '2026-06-05',
      competence_month: testMonth,
      competence_year: testYear,
      status: 'pago',
      origin: 'extrato'
    },
    {
      type: 'receita',
      category: 'Outras Receitas',
      description: 'Depósito Salarial',
      beneficiary: 'Engemon S/A',
      value: 3666.83,
      competence_month: testMonth,
      competence_year: testYear,
      status: 'pendente',
      origin: 'planilha'
    },
    {
      type: 'despesa_variavel',
      category: 'Alimentação',
      description: 'Padaria Doce Vida',
      value: 49.64,
      due_date: '2026-06-12',
      competence_month: testMonth,
      competence_year: testYear,
      status: 'pago',
      origin: 'extrato'
    },
    {
      type: 'despesa_variavel',
      category: 'Alimentação',
      description: 'Compra na Padaria',
      value: 49.64,
      due_date: '2026-06-13',
      competence_month: testMonth,
      competence_year: testYear,
      status: 'pendente',
      origin: 'manual'
    }
  ];

  testData.forEach(launch => addLaunch(launch));
  res.json({ created: testData.length, message: 'Dados de teste para duplicatas criados!' });
});

// -----------------------------------------------------
// API Endpoints
// -----------------------------------------------------

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ app: 'my-financer', status: 'ok', time: new Date().toISOString() });
});

// Configs (Categories, Members, Rules)
app.get('/api/config', (req, res) => {
  res.json({
    categories: getCategories(),
    members: getHomeMembers(),
    rules: getBeneficiaryRules()
  });
});

app.get('/api/v1/config', (req, res) => {
  res.json({
    categories: getCategories(),
    members: getHomeMembers(),
    rules: getBeneficiaryRules()
  });
});

// Category CRUD
app.post('/api/config/categories', (req, res) => {
  const { name, type, budget_target } = req.body;
  if (!name || !type) {
    return res.status(400).json({ error: 'Name and Type are required' });
  }
  try {
    const newCat = addCategory({ name, type, budget_target });
    res.json({ status: 'success', category: newCat });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update category budget target (supports names with special characters)
app.post('/api/config/categories/update', (req, res) => {
  const { name, budget_target } = req.body;
  if (!name || budget_target === undefined) {
    return res.status(400).json({ error: 'name and budget_target are required' });
  }
  try {
    const updated = updateCategoryBudget(name, budget_target);
    if (updated) {
      res.json({ status: 'success', category: updated });
    } else {
      res.status(404).json({ error: 'Category not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/config/categories', (req, res) => {
  const { name, type, budget_target } = req.body;
  if (!name || !type) {
    return res.status(400).json({ error: 'Name and Type are required' });
  }
  try {
    const newCat = addCategory({ name, type, budget_target });
    res.json({ status: 'success', category: newCat });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/config/categories/update', (req, res) => {
  const { name, budget_target } = req.body;
  if (!name || budget_target === undefined) {
    return res.status(400).json({ error: 'name and budget_target are required' });
  }
  try {
    const updated = updateCategoryBudget(name, budget_target);
    if (updated) {
      res.json({ status: 'success', category: updated });
    } else {
      res.status(404).json({ error: 'Category not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config/categories/delete', (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const deleted = deleteCategory(name);
    if (deleted) {
      res.json({ status: 'success' });
    } else {
      res.status(404).json({ error: 'Category not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/config/categories/delete', (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const deleted = deleteCategory(name);
    if (deleted) {
      res.json({ status: 'success' });
    } else {
      res.status(404).json({ error: 'Category not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Members CRUD
app.post('/api/config/members', (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  try {
    const newMember = addHomeMember(name);
    res.json({ status: 'success', member: newMember });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/config/members', (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  try {
    const newMember = addHomeMember(name);
    res.json({ status: 'success', member: newMember });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/config/members/:id', (req, res) => {
  const id = Math.floor(parseFloat(req.params.id));
  if (Number.isNaN(id) || id <= 0) {
    console.warn('[API] delete member called with invalid id:', req.params.id);
    return res.status(400).json({ error: 'Invalid member id' });
  }
  console.log(`[API] Deleting member id=${id}`);
  const deleted = deleteHomeMember(id);
  console.log(`[API] deleteHomeMember result for id=${id}: ${deleted}`);
  if (deleted) {
    res.json({ status: 'success' });
  } else {
    res.status(404).json({ error: 'Member not found' });
  }
});

app.delete('/api/v1/config/members/:id', (req, res) => {
  const id = Math.floor(parseFloat(req.params.id));
  if (Number.isNaN(id) || id <= 0) {
    console.warn('[API] delete member v1 called with invalid id:', req.params.id);
    return res.status(400).json({ error: 'Invalid member id' });
  }
  console.log(`[API] Deleting member v1 id=${id}`);
  const deleted = deleteHomeMember(id);
  console.log(`[API] deleteHomeMember v1 result for id=${id}: ${deleted}`);
  if (deleted) {
    res.json({ status: 'success' });
  } else {
    res.status(404).json({ error: 'Member not found' });
  }
});

// Rules CRUD
app.post('/api/config/rule', (req, res) => {
  const { beneficiary, suggested_category } = req.body;
  if (!beneficiary || !suggested_category) {
    return res.status(400).json({ error: 'Beneficiary and Suggested Category are required' });
  }
  try {
    const newRule = addBeneficiaryRule({ beneficiary, suggested_category });
    res.json({ status: 'success', rule: newRule });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config/rules', (req, res) => {
  const { beneficiary, suggested_category } = req.body;
  if (!beneficiary || !suggested_category) {
    return res.status(400).json({ error: 'Beneficiary and Suggested Category are required' });
  }
  try {
    const newRule = addBeneficiaryRule({ beneficiary, suggested_category });
    res.json({ status: 'success', rule: newRule });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/config/rules/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const deleted = deleteBeneficiaryRule(id);
  if (deleted) {
    res.json({ status: 'success' });
  } else {
    res.status(404).json({ error: 'Rule not found' });
  }
});

// Launches CRUD
app.get('/api/launches', (req, res) => {
  const month = req.query.month ? parseInt(req.query.month as string) : null;
  const year = req.query.year ? parseInt(req.query.year as string) : null;
  const all = req.query.all === 'true';

  let list = getLaunches();

  if (!all && month && year) {
    list = list.filter(l => l.competence_month === month && l.competence_year === year);
  }

  // Sort by due_date or competence ascending, then description
  list.sort((a, b) => {
    const dateA = a.due_date || `${a.competence_year}-${a.competence_month.toString().padStart(2, '0')}-01`;
    const dateB = b.due_date || `${b.competence_year}-${b.competence_month.toString().padStart(2, '0')}-01`;
    return dateA.localeCompare(dateB);
  });

  res.json(list);
});

app.get('/api/v1/launches', (req, res) => {
  const month = req.query.month ? parseInt(req.query.month as string) : null;
  const year = req.query.year ? parseInt(req.query.year as string) : null;
  const all = req.query.all === 'true';

  let list = getLaunches();

  if (!all && month && year) {
    list = list.filter(l => l.competence_month === month && l.competence_year === year);
  }

  list.sort((a, b) => {
    const dateA = a.due_date || `${a.competence_year}-${a.competence_month.toString().padStart(2, '0')}-01`;
    const dateB = b.due_date || `${b.competence_year}-${b.competence_month.toString().padStart(2, '0')}-01`;
    return dateA.localeCompare(dateB);
  });

  res.json(list);
});

app.get('/api/launches/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const launch = getLaunches().find(l => l.id === id);
  if (launch) {
    res.json(launch);
  } else {
    res.status(404).json({ error: 'Launch not found' });
  }
});

app.get('/api/v1/launches/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const launch = getLaunches().find(l => l.id === id);
  if (launch) {
    res.json(launch);
  } else {
    res.status(404).json({ error: 'Launch not found' });
  }
});

app.post('/api/launches', (req, res) => {
  console.log('[Server] /api/launches body:', JSON.stringify(req.body));
  try {
    const validation = validateLaunchData(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    const newLaunch = addLaunch(req.body);
    res.json(newLaunch);
  } catch (err: any) {
    console.error('[Server] Error creating launch:', err);
    res.status(500).json({ error: err?.message || 'Internal server error', stack: err?.stack });
  }
});

app.post('/api/v1/launches', (req, res) => {
  try {
    const validation = validateLaunchData(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    const newLaunch = addLaunch(req.body);
    res.json(newLaunch);
  } catch (err: any) {
    console.error('[Server] Error creating launch:', err);
    res.status(500).json({ error: err?.message || 'Internal server error', stack: err?.stack });
  }
});

app.put('/api/launches/:id', (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const validation = validateLaunchData(req.body, true);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    const updated = updateLaunch(id, req.body);
    if (updated) {
      res.json(updated);
    } else {
      res.status(404).json({ error: 'Launch not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/v1/launches/:id', (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const validation = validateLaunchData(req.body, true);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    const updated = updateLaunch(id, req.body);
    if (updated) {
      res.json(updated);
    } else {
      res.status(404).json({ error: 'Launch not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Batch delete launches (must be before :id route)
app.delete('/api/launches/batch', (req, res) => {
  console.log('[Server] /api/launches/batch called');
  console.log('[Server] Request body:', req.body);
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      console.log('[Server] Error: Ids array required');
      return res.status(400).json({ error: 'Ids array required' });
    }
    let deletedCount = 0;
    for (const id of ids) {
      console.log(`[Server] Trying to delete launch with id: ${id}`);
      if (deleteLaunch(id)) {
        deletedCount++;
        console.log(`[Server] Successfully deleted launch with id: ${id}`);
      } else {
        console.log(`[Server] Failed to delete launch with id: ${id}`);
      }
    }
    console.log(`[Server] Total deleted: ${deletedCount}`);
    res.json({ status: 'success', deleted: deletedCount });
  } catch (err: any) {
    console.log('[Server] Error deleting batch:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/launches/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const deleted = deleteLaunch(id);
  // Don't fail if launch is already gone (idempotent operation)
  res.json({ status: 'success', deleted });
});

app.delete('/api/v1/launches/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const deleted = deleteLaunch(id);
  // Don't fail if launch is already gone (idempotent operation)
  res.json({ status: 'success', deleted });
});

app.post('/api/launches/toggle-paid/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const updated = togglePaid(id);
  if (updated) {
    res.json(updated);
  } else {
    res.status(404).json({ error: 'Launch not found' });
  }
});

app.post('/api/v1/launches/toggle-paid/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const updated = togglePaid(id);
  if (updated) {
    res.json(updated);
  } else {
    res.status(404).json({ error: 'Launch not found' });
  }
});

// Duplicate Manager: Single launch similarity checking
app.get('/api/launches/duplicates', (req, res) => {
  const { description, beneficiary, value } = req.query;
  const numValue = value ? parseFloat(value as string) : 0;
  if (!numValue) {
    return res.json([]);
  }

  const list = getLaunches();
  const duplicates = list.filter(l => {
    const sameVal = Math.abs(l.value - numValue) < 0.05;
    if (!sameVal) return false;

    // exact match
    if (beneficiary && l.beneficiary && l.beneficiary.toLowerCase() === (beneficiary as string).toLowerCase()) {
      return true;
    }
    // fuzzy match
    if (description && stringsAreSimilar(l.description, description as string)) {
      return true;
    }
    return false;
  });

  res.json(duplicates);
});

// Duplicate Manager: All Duplicate Groups inside a month (Verificar Duplicatas)
app.get('/api/launches/duplicates/all', (req, res) => {
  const month = req.query.month ? parseInt(req.query.month as string) : 6;
  const year = req.query.year ? parseInt(req.query.year as string) : 2026;

  const launches = getLaunches();
  
  // Filter for month
  const monthLaunches = launches.filter(l => l.competence_month === month && l.competence_year === year);

  const duplicateGroups: DuplicateGroup[] = [];
  const processedIds = new Set<number>();

  for (let i = 0; i < monthLaunches.length; i++) {
    const l1 = monthLaunches[i];
    if (processedIds.has(l1.id)) continue;

    const groupLaunches: Launch[] = [l1];

    for (let j = i + 1; j < monthLaunches.length; j++) {
      const l2 = monthLaunches[j];
      if (processedIds.has(l2.id)) continue;

      // Use our robust duplicate detector
      if (isDuplicate(l1, l2)) {
        groupLaunches.push(l2);
      }
    }

    if (groupLaunches.length > 1) {
      // Determine overall level of group
      let finalLevel: 'exact' | 'fuzzy' | 'same_value' = 'exact';
      const allDescSimilar = groupLaunches.every((item, idx) => {
        if (idx === 0) return true;
        return stringsAreSimilar(groupLaunches[0].description, item.description);
      });
      
      const allDatesSame = groupLaunches.every((item, idx) => {
        if (idx === 0) return true;
        return item.due_date === groupLaunches[0].due_date;
      });

      if (allDescSimilar && allDatesSame) {
        finalLevel = 'exact';
      } else if (allDescSimilar) {
        finalLevel = 'fuzzy';
      } else {
        finalLevel = 'same_value';
      }

      // Mark as processed
      groupLaunches.forEach(item => processedIds.add(item.id));

      duplicateGroups.push({
        id: `group-${l1.id}`,
        level: finalLevel,
        launches: groupLaunches
      });
    }
  }

    

  res.json(duplicateGroups);
});

// Dashboard Data Endpoint
app.get('/api/dashboard', (req, res) => {
  const month = req.query.month ? parseInt(req.query.month as string) : 6;
  const year = req.query.year ? parseInt(req.query.year as string) : 2026;

  const launches = getLaunches();

  // Filter launches of the month
  const monthLaunches = launches.filter(l => l.competence_month === month && l.competence_year === year);

  // Calculate Summary
  let receita_total = 0;
  let despesa_total = 0;
  let despesa_fixa = 0;
  let despesa_variavel = 0;
  let overdue_count = 0;
  let warning_count = 0;

  const todayStr = new Date().toISOString().split('T')[0];

  monthLaunches.forEach(l => {
    if (l.type === 'receita') {
      receita_total += l.value;
    } else {
      despesa_total += l.value;
      if (l.type === 'despesa_fixa') {
        despesa_fixa += l.value;
      } else if (l.type === 'despesa_variavel') {
        despesa_variavel += l.value;
      } else if (l.type === 'divida_parcelamento') {
        despesa_fixa += l.value; // installments counted as fixed commit
      }

      // Checks for overdue
      if (l.status === 'pendente' && l.due_date && l.due_date < todayStr) {
        overdue_count++;
      }
      // Checks for upcoming within 3 days
      if (l.status === 'pendente' && l.due_date && l.due_date >= todayStr) {
        const diffTime = new Date(l.due_date).getTime() - new Date(todayStr).getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        if (diffDays <= 3) {
          warning_count++;
        }
      }
    }
  });

  // Calculate Categories Breakdown (Only for Expenses)
  const catMap = new Map<string, number>();
  monthLaunches.forEach(l => {
    if (l.type !== 'receita') {
      catMap.set(l.category, (catMap.get(l.category) || 0) + l.value);
    }
  });

  const categories_breakdown = Array.from(catMap.entries()).map(([category, value]) => ({
    category,
    value: parseFloat(value.toFixed(2))
  })).sort((a, b) => b.value - a.value);

  // Pending Bills sorted by due date
  const pending_bills = monthLaunches
    .filter(l => l.type !== 'receita' && l.status === 'pendente')
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));

  // Historical Data: 6 months backward
  const historical_data = [];
  for (let i = 5; i >= 0; i--) {
    let histMonth = month - i;
    let histYear = year;
    if (histMonth <= 0) {
      histMonth += 12;
      histYear -= 1;
    }

    const monthName = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][histMonth - 1];
    const label = `${monthName}/${histYear.toString().slice(-2)}`;

    let monthRec = 0;
    let monthDes = 0;

    launches.forEach(l => {
      const isMatch = (l.competence_month === histMonth && l.competence_year === histYear);

      if (isMatch) {
        if (l.type === 'receita') monthRec += l.value;
        else monthDes += l.value;
      }
    });

    historical_data.push({
      month_label: label,
      receitas: parseFloat(monthRec.toFixed(2)),
      despesas: parseFloat(monthDes.toFixed(2)),
      saldo: parseFloat((monthRec - monthDes).toFixed(2))
    });
  }

  // Debts and Installments tracking
  const debtsList = launches
    .filter(l => l.type === 'divida_parcelamento')
    .map(l => {
      const remaining_installments = (l.installment_total || 1) - (l.installment_current || 1);
      const remaining_value = remaining_installments * l.value;
      // Estimate end date
      let estimated_end = 'N/A';
      if (l.due_date && remaining_installments > 0) {
        const date = new Date(l.due_date);
        date.setMonth(date.getMonth() + remaining_installments);
        estimated_end = date.toLocaleDateString('pt-BR');
      }
      return {
        id: l.id,
        description: l.description,
        installment: `${l.installment_current || 1}/${l.installment_total || 1}`,
        value: l.value,
        remaining_value: parseFloat(remaining_value.toFixed(2)),
        estimated_end
      };
    });

  const total_estimated_debts = debtsList.reduce((acc, curr) => acc + curr.remaining_value, 0);

  const dashboardData: DashboardData = {
    summary: {
      receita_total: parseFloat(receita_total.toFixed(2)),
      despesa_total: parseFloat(despesa_total.toFixed(2)),
      despesa_fixa: parseFloat(despesa_fixa.toFixed(2)),
      despesa_variavel: parseFloat(despesa_variavel.toFixed(2)),
      saldo: parseFloat((receita_total - despesa_total).toFixed(2)),
      overdue_count,
      warning_count
    },
    categories_breakdown,
    pending_bills,
    historical_data,
    debts: {
      total_estimated: parseFloat(total_estimated_debts.toFixed(2)),
      list: debtsList
    }
  };

  res.json(dashboardData);
});

// Budgets Target vs Spent
app.get('/api/budgets', (req, res) => {
  const month = req.query.month ? parseInt(req.query.month as string) : 6;
  const year = req.query.year ? parseInt(req.query.year as string) : 2026;

  const launches = getLaunches();
  const categories = getCategories();

  // Filter launches of the month
  const monthLaunches = launches.filter(l => l.competence_month === month && l.competence_year === year);

  const budgetList: BudgetStatus[] = categories.map(cat => {
    const target = cat.budget_target || 0;
    const spent = monthLaunches
      .filter(l => l.category === cat.name && l.type !== 'receita')
      .reduce((sum, l) => sum + l.value, 0);

    return {
      category: cat.name,
      target,
      spent: parseFloat(spent.toFixed(2)),
      exceeded: target > 0 && spent > target,
      type: cat.type
    };
  });

  res.json(budgetList);
});

// Projections: 12-month forward simulation
app.get('/api/projections', (req, res) => {
  const month = req.query.month ? parseInt(req.query.month as string) : 6;
  const year = req.query.year ? parseInt(req.query.year as string) : 2026;

  const launches = getLaunches();

  // We assume monthly fixed expenses and revenues will persist
  const fixedRevenues = launches.filter(l => l.type === 'receita' && l.category === 'Salário');
  const fixedExpenses = launches.filter(l => l.type === 'despesa_fixa' || l.type === 'divida_parcelamento');

  const monthlyRev = fixedRevenues.reduce((sum, r) => sum + r.value, 0) || 12500; // robust default
  const monthlyExp = fixedExpenses.reduce((sum, e) => sum + e.value, 0) || 5200; // robust default

  const projections: Projection[] = [];

  for (let i = 1; i <= 12; i++) {
    let projMonth = month + i;
    let projYear = year;
    if (projMonth > 12) {
      projMonth -= 12;
      projYear += 1;
    }

    const monthName = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][projMonth - 1];
    const label = `${monthName}/${projYear.toString().slice(-2)}`;

    // Handle reducing installment values over months
    let activeInstallmentExp = 0;
    launches.forEach(l => {
      if (l.type === 'divida_parcelamento' && l.installment_current && l.installment_total) {
        const passedMonths = i;
        const projectedInstallment = l.installment_current + passedMonths;
        if (projectedInstallment <= l.installment_total) {
          activeInstallmentExp += l.value;
        }
      }
    });

    const despesa_prevista = monthlyExp + activeInstallmentExp + 1500; // base expenses + active installments + estimated variable buffer
    const receita_prevista = monthlyRev;

    projections.push({
      month_label: label,
      receita_prevista: parseFloat(receita_prevista.toFixed(2)),
      despesa_prevista: parseFloat(despesa_prevista.toFixed(2)),
      saldo_previsto: parseFloat((receita_prevista - despesa_prevista).toFixed(2))
    });
  }

  res.json(projections);
});

// Market Data (Exchange rates and Stocks)
app.get('/api/market', async (req, res) => {
  try {
    const hgKey = process.env.HG_FINANCE_KEY;
    // Attempt real call to HG Finance if key exists
    if (hgKey) {
      const response = await fetch(`https://api.hgbrasil.com/finance?key=${hgKey}`);
      const data = await response.json();
      if (data && data.results) {
        const currencies = data.results.currencies;
        const stocks = data.results.stocks;
        return res.json({
          usd: currencies.USD.buy,
          eur: currencies.EUR.buy,
          btc: currencies.BTC.buy,
          ibovespa: stocks.IBOVESPA.points,
          updated_at: new Date().toLocaleTimeString('pt-BR')
        });
      }
    }
  } catch (err) {
    console.warn('Could not retrieve market data from HG Finance, using offline mock data...');
  }

  // Offline high quality fallback with realistic ranges
  res.json({
    usd: 5.42 + Math.sin(Date.now() / 100000000) * 0.05,
    eur: 5.82 + Math.sin(Date.now() / 120000000) * 0.05,
    btc: 345240 + Math.cos(Date.now() / 90000000) * 2500,
    ibovespa: 121540 + Math.sin(Date.now() / 80000000) * 800,
    updated_at: new Date().toLocaleTimeString('pt-BR') + ' (Offline)'
  });
});

// AI Advisor with 12-hour Caching and background processing
app.get('/api/recommendations', async (req, res) => {
  const month = req.query.month ? parseInt(req.query.month as string) : 6;
  const year = req.query.year ? parseInt(req.query.year as string) : 2026;

  const launches = getLaunches();
  const categories = getCategories();

  // Create financial summary for advice
  const monthLaunches = launches.filter(l => l.competence_month === month && l.competence_year === year);

  const income = monthLaunches.filter(l => l.type === 'receita').reduce((sum, l) => sum + l.value, 0);
  const expense = monthLaunches.filter(l => l.type !== 'receita').reduce((sum, l) => sum + l.value, 0);
  const fixed = monthLaunches.filter(l => l.type === 'despesa_fixa' || l.type === 'divida_parcelamento').reduce((sum, l) => sum + l.value, 0);
  const variable = monthLaunches.filter(l => l.type === 'despesa_variavel').reduce((sum, l) => sum + l.value, 0);
  const net = income - expense;

  const summaryStr = `Receita: ${income}, Despesa Total: ${expense}, Fixa: ${fixed}, Variavel: ${variable}, Liquido: ${net}, Lançamentos: ${monthLaunches.length}, Categorias: ${categories.length}`;
  
  // Compute secure unique hash key
  const cacheKey = crypto.createHash('md5').update(summaryStr).digest('hex');

  // Check database cache
  const cached = getAiCache(cacheKey);
  if (cached) {
    const adviceText = Array.isArray(cached)
      ? cached[0]?.response ?? ''
      : (cached as any)?.response ?? '';
    return res.json({ advice: String(adviceText), cached: true });
  }

  // Fallback Rule-Based advisor in Portuguese
  const offlineAdvice = buildRecommendationFallbackAdvice({
    net,
    income,
    fixed,
    variable,
    launchesCount: monthLaunches.length,
    categoriesCount: categories.length
  });

  // Return offline advice immediately
  res.json({ advice: offlineAdvice, cached: false, aiInsights: null });

  // Start AI processing in background
  (async () => {
    try {
      const prompt = `Você é um planejador financeiro brasileiro profissional altamente qualificado. 
Analise este resumo financeiro mensal do usuário:
- Receita total: R$ ${income}
- Despesa total: R$ ${expense} (Fixas/Parcelas: R$ ${fixed}, Variáveis: R$ ${variable})
- Saldo líquido: R$ ${net}
- Número de lançamentos efetuados: ${monthLaunches.length}

Por favor, escreva um relatório de recomendações personalizado, amigável e extremamente direto em português do Brasil.
O relatório deve conter:
1. Uma avaliação sincera sobre a saúde financeira deste mês.
2. 3 conselhos práticos e realistas para reduzir gastos e otimizar o dinheiro (focado na realidade brasileira, ex: Selic, IPCA, custos de supermercado, portabilidade de crédito, etc.).
3. Dicas de investimentos ou reserva de emergência baseadas no saldo disponível.

Use formatação Markdown elegante, use bullet points, tabelas curtas se necessário. Sem jargões desnecessários.`;

      const aiAdvice = await generateFinancialAdviceWithFallbacks(prompt, cacheKey);
      if (aiAdvice) {
        console.log('[AI] Generated and cached financial advice');
      }
    } catch (err) {
      console.error('[AI] Error in background AI processing:', err);
    }
  })();
});

// -----------------------------------------------------
// Helper: call leitor_extratos.py (pdfplumber) via CLI
// -----------------------------------------------------
const PYTHON_SCRIPT = path.resolve(__dirname || '.', 'leitor_extratos.py');

function convertPythonDate(dateStr: string): string {
  // Converte "DD/MM/AAAA" ou "DD/MM/AA" para "YYYY-MM-DD"
  if (!dateStr) return '';
  const m = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (m) {
    let y = parseInt(m[3]);
    if (y < 100) y += 2000;
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return dateStr;
}

function mapPythonLaunchToApp(py: any, bank: string): any {
  const isDebito = py.tipo === 'DEBITO';
  const rawDesc = (py.descricao || '').trim();
  const nomeArquivo = py.documento || '';

  return {
    type: isDebito ? 'despesa_variavel' : 'receita',
    category: isDebito ? 'Outros' : 'Outros',
    description: rawDesc || 'Lançamento importado de extrato',
    beneficiary: rawDesc.slice(0, 50),
    value: Math.abs(py.valor || 0),
    due_date: convertPythonDate(py.data),
    competence_month: 0, // will be filled by ensureLaunchCompetenceFields
    competence_year: 0,
    status: 'pendente',
    payment_method: 'pix',
    origin: 'extrato',
  };
}

function runPythonExtractor(filePath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = execFile('python', [PYTHON_SCRIPT, filePath], {
      maxBuffer: 10 * 1024 * 1024, // 10MB
      timeout: 60000, // 60s
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Python error: ${error.message}\n${stderr}`));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        if (result.status === 'error') {
          reject(new Error(result.error || 'Erro desconhecido no leitor_extratos.py'));
          return;
        }
        resolve(result);
      } catch (parseErr: any) {
        reject(new Error(`Falha ao parsear saída do Python: ${parseErr.message}\nStdout: ${stdout.slice(0, 500)}`));
      }
    });
  });
}

// Smart Import: Bank Statement via pdfplumber (Python leitor_extratos.py)
app.post('/api/v1/import/extrato-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  // Save uploaded file temporarily to disk for pdfplumber
  const tempFileName = `${Date.now()}_${req.file.originalname}`;
  const tempFilePath = path.join(uploadsDir, tempFileName);

  try {
    fs.writeFileSync(tempFilePath, req.file.buffer);
    console.log(`[EXTRATO-PDF] Saved temp file: ${tempFilePath} (${req.file.size} bytes)`);

    // Step 1: Run Python pdfplumber extractor
    const pythonResult = await runPythonExtractor(tempFilePath);
    const bank = pythonResult.banco || 'DESCONHECIDO';
    const rawLaunches = pythonResult.lancamentos || [];

    console.log(`[EXTRATO-PDF] Banco detectado: ${bank}, lançamentos brutos: ${rawLaunches.length}`);

    if (rawLaunches.length === 0) {
      return res.status(400).json({ error: 'Nenhuma transação encontrada no extrato.' });
    }

    // Step 2: Map Python launches to app Launch format
    const launches = rawLaunches.map((py: any) => mapPythonLaunchToApp(py, bank));

    // Step 3: Normalize competence fields
    const parsedLaunches = ensureLaunchCompetenceFields(launches, req.file.originalname);

    // Debug mode
    if (req.query && (req.query.debug === 'true' || req.query.debug === '1')) {
      return res.json({ status: 'debug', total_found: parsedLaunches.length, parsedLaunches });
    }

    // Step 4: Save to DB with duplicate detection
    const existing = getLaunches();
    let importedCount = 0;
    let skippedCount = 0;

    parsedLaunches.forEach((pl: any) => {
      const sameMonth = existing.filter((el: any) =>
        el.competence_month === pl.competence_month && el.competence_year === pl.competence_year
      );
      const isDup = sameMonth.some((el: any) => isDuplicate(el, pl));

      if (!isDup) {
        ensureLaunchCategory(pl.category, pl.type);
        addLaunch(pl);
        importedCount++;
      } else {
        skippedCount++;
      }
    });

    // Step 5: Detect most common month/year
    let detectedMonth = new Date().getMonth() + 1;
    let detectedYear = new Date().getFullYear();
    if (parsedLaunches.length > 0) {
      const monthCounts: Record<string, number> = {};
      parsedLaunches.forEach((pl: any) => {
        if (pl.due_date) {
          const parts = pl.due_date.split('-');
          if (parts.length >= 2) {
            const key = `${parseInt(parts[0])}-${parseInt(parts[1])}`;
            monthCounts[key] = (monthCounts[key] || 0) + 1;
          }
        }
      });
      const sorted = Object.entries(monthCounts).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        const [bestKey] = sorted[0];
        const [y, m] = bestKey.split('-');
        detectedMonth = parseInt(m);
        detectedYear = parseInt(y);
      }
    }

    res.json({
      status: 'success',
      banco: bank,
      total_found: parsedLaunches.length,
      imported: importedCount,
      skipped_duplicates: skippedCount,
      detectedMonth,
      detectedYear,
    });

  } catch (err: any) {
    console.error('[EXTRATO-PDF] Error:', err);
    res.status(500).json({ error: `Erro ao processar extrato: ${err.message}` });
  } finally {
    // Clean up temp file
    try {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    } catch { /* ignore */ }
  }
});

// Smart Import: PDF Boleto Extract via PDF Parse & Gemini
app.post('/api/import/pdf', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  try {
    const parser = new PDFParse({ data: req.file.buffer });
    const data = await parser.getText();
    const text = data.text;

    // First do the robust offline regex extraction
    const offlineResult = extractBoletoOffline(text);

    // If Gemini is configured, use it to improve extraction quality
    if (ai) {
      try {
        const prompt = `Analise o seguinte texto extraído de um boleto em PDF e extraia o código de barras, o valor cobrado, o vencimento, o nome do beneficiário e uma sugestão de categoria de despesa.

Retorne APENAS um objeto JSON no formato abaixo, sem tags de markdown adicionais, sem blocos de código \`\`\`json:
{
  "barcode": "string (apenas dígitos, sem pontos ou espaços)",
  "value": number (o valor, ex: 250.45),
  "due_date": "string (YYYY-MM-DD)",
  "beneficiary": "string (nome legível do emissor ou beneficiário)",
  "suggested_category": "string (Moradia, Contas de Consumo, Internet/Celular, Cartão de Crédito, Alimentação, Transporte, Outros)"
}

Se o texto não contiver as informações solicitadas de forma clara, preencha os campos com os melhores valores detectados ou null para o código de barras.

Texto do PDF:
${text.slice(0, 8000)}`;

        const geminiRes = await ai.models.generateContent({
          model: 'gemini-2.0-flash-001',
          contents: prompt,
        });

        if (geminiRes && geminiRes.text) {
          const parsed = JSON.parse(geminiRes.text.trim());
          return res.json({
            barcode: parsed.barcode || offlineResult.barcode,
            value: typeof parsed.value === 'number' ? parsed.value : offlineResult.value,
            due_date: parsed.due_date || offlineResult.due_date,
            beneficiary: parsed.beneficiary || offlineResult.beneficiary,
            suggested_category: parsed.suggested_category || 'Outros',
            parsed_text_preview: text.slice(0, 150)
          });
        }
      } catch (err) {
        console.warn('Gemini extraction failed, using robust offline parsing:', err);
      }
    }

    // Return robust offline results directly
    res.json({
      ...offlineResult,
      suggested_category: 'Outros',
      parsed_text_preview: text.slice(0, 150)
    });
  } catch (err: any) {
    res.status(500).json({ error: `Falha ao ler PDF: ${err.message}` });
  }
});

app.post('/api/v1/import/pdf', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  try {
    const parser = new PDFParse({ data: req.file.buffer });
    const data = await parser.getText();
    const text = data.text;
    const offlineResult = extractBoletoOffline(text);

    if (ai) {
      try {
        const prompt = `Analise o texto do boleto e retorne APENAS um objeto JSON válido:
{
  "barcode": "string (apenas dígitos)",
  "value": number,
  "due_date": "string (YYYY-MM-DD)",
  "beneficiary": "string",
  "suggested_category": "string"
}

Texto:
${text.slice(0, 8000)}`;

        const geminiRes = await ai.models.generateContent({
          model: 'gemini-2.0-flash-001',
          contents: prompt,
        });

        if (geminiRes && geminiRes.text) {
          const parsed = JSON.parse(geminiRes.text.trim());
          return res.json({
            barcode: parsed.barcode || offlineResult.barcode,
            value: typeof parsed.value === 'number' ? parsed.value : offlineResult.value,
            due_date: parsed.due_date || offlineResult.due_date,
            beneficiary: parsed.beneficiary || offlineResult.beneficiary,
            suggested_category: parsed.suggested_category || 'Outros',
            parsed_text_preview: text.slice(0, 150)
          });
        }
      } catch (err) {
        console.warn(err);
      }
    }

    res.json({
      ...offlineResult,
      suggested_category: 'Outros',
      parsed_text_preview: text.slice(0, 150)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Smart Import: Bank Statement parsing & auto integration with duplicate prevention
app.post('/api/import/itau-statement', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  try {
    let text = '';
    try {
      const parser = new PDFParse({ data: req.file.buffer });
      const data = await parser.getText();
      text = data.text || '';
    } catch (parseErr: any) {
      console.error('pdf-parse text extraction failed, relying on direct Gemini parsing:', parseErr.message);
    }

    if (!text || !text.trim()) {
      // Try external pdftotext first
      let extText: string | null = null;
      try {
        extText = extractTextWithPdftotext(req.file.buffer);
        if (extText && extText.trim()) {
          text = extText;
          console.log('[IMPORT] pdftotext succeeded, length=', text.length);
        }
      } catch (e) {
        console.warn('pdftotext attempt error:', e && (e as any).message ? (e as any).message : e);
      }

      // If still empty, try OCR via pdftoppm + tesseract (if available)
      if ((!text || !text.trim()) && commandExists('pdftoppm') && commandExists('tesseract')) {
        try {
          const ocrText = ocrPdfWithPdftoppmAndTesseract(req.file.buffer);
          if (ocrText && ocrText.trim()) {
            text = ocrText;
            console.log('[IMPORT] OCR (pdftoppm+tesseract) succeeded, length=', text.length);
          }
        } catch (e) {
          console.warn('OCR attempt error:', e && (e as any).message ? (e as any).message : e);
        }
      }

      if (!text || !text.trim()) {
        text = req.file.buffer.toString('latin1');
        console.log('[IMPORT] PDF text extraction returned empty, falling back to raw latin1 text length=', text.length);
      }
    }

    const rawParsedLaunches = await parseBankStatementWithAi(text, req.file.buffer);
    const parsedLaunches = ensureLaunchCompetenceFields(rawParsedLaunches, req.file.originalname);

    // Debug mode: return parsed launches without inserting into DB
    if (req.query && (req.query.debug === 'true' || req.query.debug === '1')) {
      console.log(`[IMPORT DEBUG] /api/import/itau-statement debug=true file=${req.file.originalname} parsed=${parsedLaunches.length} raw=${rawParsedLaunches.length}`);
      return res.json({ status: 'debug', total_found: parsedLaunches.length, parsedLaunches, rawParsedCount: rawParsedLaunches.length });
    }
    console.log(`[IMPORT] /api/import/itau-statement file=${req.file.originalname} size=${req.file.size} textLen=${text.length} rawParsed=${rawParsedLaunches.length} correctedParsed=${parsedLaunches.length}`);

    // PASSO 1: Detailed validation logging — check common rejection conditions
    const validationErrors: string[] = [];
    if (!req.file || !req.file.buffer) validationErrors.push('Arquivo ausente ou buffer vazio');
    if (!text || !text.trim()) validationErrors.push('Texto extraído do PDF está vazio');
    if (!parsedLaunches || parsedLaunches.length === 0) validationErrors.push('Nenhuma transação encontrada no extrato');

    if (validationErrors.length > 0) {
      const msg = `Validação falhou: ${validationErrors.join('; ')}`;
      console.warn('[IMPORT][VALIDATION]', msg);
      return res.status(400).json({ error: msg });
    }

    // Save parsed launches to database, filter exact duplicates first
    const existing = getLaunches();
    let importedCount = 0;
    let skippedCount = 0;

    parsedLaunches.forEach(pl => {
      // Only compare against launches in the same competence month
      const sameMonth = existing.filter(el =>
        el.competence_month === pl.competence_month && el.competence_year === pl.competence_year
      );
      const isDup = sameMonth.some(el => isDuplicate(el, pl));

      if (!isDup) {
        ensureLaunchCategory(pl.category, pl.type);
        addLaunch(pl);
        importedCount++;
      } else {
        skippedCount++;
      }
    });

    // Detect year from filename or content (before returning response)
      let detectedMonth = new Date().getMonth() + 1;
      let detectedYear = new Date().getFullYear();
      const detectedBankOrigin = parsedLaunches.length > 0 ? parsedLaunches[0].origin : 'extrato';
      const bankNameMap: Record<string, string> = {
        'extrato_bradesco': 'Bradesco',
        'extrato_nubank': 'Nubank',
        'extrato_itau': 'Itaú',
        'extrato': 'Desconhecido'
      };
      const detectedBankName = bankNameMap[detectedBankOrigin] || 'Desconhecido';
      const filename = (req.file.originalname || '').toLowerCase();
      const monthMap: Record<string, number> = {
        'janeiro': 1,'fevereiro': 2,'março': 3,'marco': 3,'abril': 4,'maio': 5,'junho':6,'julho':7,'agosto':8,'setembro':9,'outubro':10,'novembro':11,'dezembro':12
      };
      
      // Try to detect month/year from parsed launch dates first
      if (parsedLaunches.length > 0) {
        const monthCounts: Record<string, number> = {};
        parsedLaunches.forEach(pl => {
          if (pl.due_date) {
            const parts = pl.due_date.split('-');
            if (parts.length >= 2) {
              const key = `${parseInt(parts[0])}-${parseInt(parts[1])}`;
              monthCounts[key] = (monthCounts[key] || 0) + 1;
            }
          }
        });
        const sortedMonths = Object.entries(monthCounts).sort((a, b) => b[1] - a[1]);
        if (sortedMonths.length > 0) {
          const [bestKey] = sortedMonths[0];
          const [y, m] = bestKey.split('-');
          detectedMonth = parseInt(m);
          detectedYear = parseInt(y);
        }
      }
      
      // Fallback: try to extract from filename
      const monthMatch = Object.keys(monthMap).find(mn => filename.includes(mn));
      const yearMatch = filename.match(/(20\d{2})/);
      if (monthMatch && (!detectedMonth || !detectedYear)) {
        const monthNum = monthMap[monthMatch];
        if (yearMatch && yearMatch[1]) {
          detectedMonth = monthNum;
          detectedYear = parseInt(yearMatch[1]);
        } else {
          // try extract year from content
          const yearFromContent = (function() {
            const m = text.match(/per[ií]odo de visualiza[cç][aã]o\s*:\s*de\s*(\d{2})\/(\d{2})\/(\d{4})\s*at[eé]\s*(\d{2})\/(\d{2})\/(\d{4})/i);
            if (m) return parseInt(m[6]);
            const m2 = text.match(/per[ií]odo\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
            if (m2) return parseInt(m2[3]);
            // Try generic YYYY pattern in content
            const m3 = text.match(/\b(20[2-9]\d)\b/);
            if (m3) return parseInt(m3[1]);
            return null;
          })();
          if (yearFromContent) {
            detectedMonth = monthNum;
            detectedYear = yearFromContent;
          }
          // If still no year, use current year silently (not a hard error)
        }
      }
      
      // If still no valid detection, use current date
      if (!detectedMonth || !detectedYear) {
        detectedMonth = new Date().getMonth() + 1;
        detectedYear = new Date().getFullYear();
      }

    res.json({
      status: 'success',
      total_found: parsedLaunches.length,
      imported: importedCount,
      skipped_duplicates: skippedCount,
      banco: detectedBankName,
      detectedMonth,
      detectedYear
    });
  } catch (err: any) {
    res.status(500).json({ error: `Erro ao importar extrato bancário: ${err.message}` });
  }
});

app.post('/api/v1/import/itau-statement', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  try {
    let text = '';
    try {
      const parser = new PDFParse({ data: req.file.buffer });
      const data = await parser.getText();
      text = data.text || '';
    } catch (parseErr: any) {
      console.error('pdf-parse text extraction failed, relying on direct Gemini parsing:', parseErr.message);
    }

    const rawParsedLaunches = await parseBankStatementWithAi(text, req.file.buffer);
    const parsedLaunches = ensureLaunchCompetenceFields(rawParsedLaunches, req.file.originalname);

    // Debug mode: return parsed launches without inserting into DB
    if (req.query && (req.query.debug === 'true' || req.query.debug === '1')) {
      console.log(`[IMPORT DEBUG] /api/v1/import/itau-statement debug=true file=${req.file.originalname} parsed=${parsedLaunches.length} raw=${rawParsedLaunches.length}`);
      return res.json({ status: 'debug', total_found: parsedLaunches.length, parsedLaunches, rawParsedCount: rawParsedLaunches.length });
    }

    if (!parsedLaunches || parsedLaunches.length === 0) {
      return res.status(400).json({ error: 'Nenhuma transação encontrada.' });
    }

    const existing = getLaunches();
    let importedCount = 0;
    let skippedCount = 0;

    parsedLaunches.forEach(pl => {
      const sameMonth = existing.filter(el =>
        el.competence_month === pl.competence_month && el.competence_year === pl.competence_year
      );
      const isDup = sameMonth.some(el => isDuplicate(el, pl));

      if (!isDup) {
        ensureLaunchCategory(pl.category, pl.type);
        addLaunch(pl);
        importedCount++;
      } else {
        skippedCount++;
      }
    });

    // Find the most common month and year in the imported launches to return
    let detectedMonth = new Date().getMonth() + 1;
    let detectedYear = new Date().getFullYear();
    const detectedBankOrigin = parsedLaunches.length > 0 ? parsedLaunches[0].origin : 'extrato';
    const bankNameMap: Record<string, string> = {
      'extrato_bradesco': 'Bradesco',
      'extrato_nubank': 'Nubank',
      'extrato_itau': 'Itaú',
      'extrato': 'Desconhecido'
    };
    const detectedBankName = bankNameMap[detectedBankOrigin] || 'Desconhecido';
    if (parsedLaunches.length > 0) {
      const monthCounts: Record<string, number> = {};
      parsedLaunches.forEach(pl => {
        if (pl.due_date) {
          const parts = pl.due_date.split('-');
          if (parts.length >= 2) {
            const key = `${parseInt(parts[0])}-${parseInt(parts[1])}`;
            monthCounts[key] = (monthCounts[key] || 0) + 1;
          }
        }
      });
      const sortedMonths = Object.entries(monthCounts).sort((a, b) => b[1] - a[1]);
      if (sortedMonths.length > 0) {
        const [bestKey] = sortedMonths[0];
        const [y, m] = bestKey.split('-');
        detectedMonth = parseInt(m);
        detectedYear = parseInt(y);
      }
    }

    res.json({
      status: 'success',
      total_found: parsedLaunches.length,
      imported: importedCount,
      skipped_duplicates: skippedCount,
      banco: detectedBankName,
      detectedMonth,
      detectedYear
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Smart Import: Excel sheet import with robust multi-table parsing
app.post('/api/import/excel', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });

    let imported = 0;
    let skipped = 0;
    const warnings: string[] = [];
    let allParsedLaunches: ParsedLaunchFromExcel[] = [];

    // Parse ALL sheets
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const rawData = xlsx.utils.sheet_to_json<any>(worksheet, { header: 1 });

      // Try robust parsing first
      const { launches: parsedLaunches, warnings: parseWarnings } = parseExcelPersonalBudget(rawData, req.file.originalname || '');
      warnings.push(...parseWarnings.map(w => `[${sheetName}] ${w}`));
      allParsedLaunches = [...allParsedLaunches, ...parsedLaunches];

      // If no launches found in this sheet, try simple fallback
      if (parsedLaunches.length === 0) {
        warnings.push(`[${sheetName}] Nenhuma tabela reconhecível encontrada. Tentando análise simples...`);
        // Simple fallback: scan for description + value pairs
        rawData.forEach((row: any[]) => {
          if (!row || row.length < 2) return;
          let desc = '';
          let val = 0;
          for (let i = 0; i < row.length; i++) {
            const cell = row[i];
            if (typeof cell === 'string' && cell.trim().length > 3 && !desc) {
              desc = cell.trim();
            } else if (typeof cell === 'number' && cell > 0 && !val) {
              val = cell;
            }
          }
          if (desc && val && !desc.toLowerCase().includes('total') && !desc.toLowerCase().includes('saldo')) {
            allParsedLaunches.push({
              description: desc,
              value: val,
              type: 'despesa_variavel',
              category: 'Outros'
            });
          }
        });
      }
    }

    // Extract month/year from filename
    let detectedMonth = new Date().getMonth() + 1;
    let detectedYear = new Date().getFullYear();
    const monthYearResult = extractMonthYearFromFilename(req.file.originalname || '');
    if (monthYearResult) {
      detectedMonth = monthYearResult.month;
      detectedYear = monthYearResult.year;
    }

    // Create launches and check for duplicates
    const existing = getLaunches();
    for (const launch of allParsedLaunches) {
      const dup = existing.some(
        el =>
          el.description.toLowerCase() === launch.description.toLowerCase() &&
          Math.abs(el.value - launch.value) < 0.05
      );

      if (!dup) {
        try {
          // Ensure category exists
          const cat = getCategories().find(c => c.name === launch.category);
          if (!cat) {
            addCategory(launch.category, launch.type === 'receita' ? 'receita' : 'despesa');
          }

          addLaunch({
            type: launch.type,
            category: launch.category,
            description: launch.description,
            beneficiary: launch.description,
            value: launch.value,
            competence_month: detectedMonth,
            competence_year: detectedYear,
            status: 'pago',
            origin: 'planilha',
            due_date: `${detectedYear}-${String(detectedMonth).padStart(2, '0')}-01`
          });
          imported++;
        } catch (err: any) {
          warnings.push(`Erro ao criar lançamento "${launch.description}": ${err.message}`);
        }
      } else {
        skipped++;
      }
    }

    res.json({
      status: 'success',
      imported,
      skipped_duplicates: skipped,
      detectedMonth,
      detectedYear,
      warnings: warnings.length > 0 ? warnings : undefined
    });
  } catch (err: any) {
    res.status(500).json({ error: `Erro ao importar planilha: ${err.message}` });
  }
});

app.post('/api/v1/import/excel', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });

    let imported = 0;
    let skipped = 0;
    let allParsedLaunches: ParsedLaunchFromExcel[] = [];

    // Parse ALL sheets
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const rawData = xlsx.utils.sheet_to_json<any>(worksheet, { header: 1 });

      const { launches: parsedLaunches } = parseExcelPersonalBudget(rawData, req.file.originalname || '');
      allParsedLaunches = [...allParsedLaunches, ...parsedLaunches];

      if (parsedLaunches.length === 0) {
        rawData.forEach((row: any[]) => {
          if (!row || row.length < 2) return;
          let desc = '';
          let val = 0;
          for (let i = 0; i < row.length; i++) {
            const cell = row[i];
            if (typeof cell === 'string' && cell.trim().length > 3 && !desc) {
              desc = cell.trim();
            } else if (typeof cell === 'number' && cell > 0 && !val) {
              val = cell;
            }
          }
          if (desc && val && !desc.toLowerCase().includes('total') && !desc.toLowerCase().includes('saldo')) {
            allParsedLaunches.push({
              description: desc,
              value: val,
              type: 'despesa_variavel',
              category: 'Outros'
            });
          }
        });
      }
    }

    const monthYearResult = extractMonthYearFromFilename(req.file.originalname || '');
    let detectedMonth = new Date().getMonth() + 1;
    let detectedYear = new Date().getFullYear();
    if (monthYearResult) {
      detectedMonth = monthYearResult.month;
      detectedYear = monthYearResult.year;
    }

    const existing = getLaunches();
    for (const launch of allParsedLaunches) {
      const dup = existing.some(
        el =>
          el.description.toLowerCase() === launch.description.toLowerCase() &&
          Math.abs(el.value - launch.value) < 0.05
      );

      if (!dup) {
        try {
          const cat = getCategories().find(c => c.name === launch.category);
          if (!cat) {
            addCategory(launch.category, launch.type === 'receita' ? 'receita' : 'despesa');
          }

          addLaunch({
            type: launch.type,
            category: launch.category,
            description: launch.description,
            beneficiary: launch.description,
            value: launch.value,
            competence_month: detectedMonth,
            competence_year: detectedYear,
            status: 'pago',
            origin: 'planilha',
            due_date: `${detectedYear}-${String(detectedMonth).padStart(2, '0')}-01`
          });
          imported++;
        } catch (err) {
          // silent skip
        }
      } else {
        skipped++;
      }
    }

    res.json({
      status: 'success',
      imported,
      skipped_duplicates: skipped,
      detectedMonth,
      detectedYear
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Clear AI cache
app.post('/api/ai-cache/clear', (req, res) => {
  clearAiCache();
  res.json({ status: 'success' });
});

app.post('/api/v1/ai-cache/clear', (req, res) => {
  clearAiCache();
  res.json({ status: 'success' });
});

// Backup: Export
app.get('/api/backup/export', (req, res) => {
  try {
    const dbFile = path.join(DATA_DIR, 'financer_db.json');
    exportDbToJsonData(dbFile);
    res.setHeader('Content-disposition', 'attachment; filename=financer_db.json');
    res.setHeader('Content-type', 'application/json');
    const fileStream = fs.createReadStream(dbFile);
    fileStream.pipe(res);
  } catch (err: any) {
    res.status(500).json({ error: `Falha ao exportar backup: ${err.message}` });
  }
});

app.get('/api/v1/backup/export', (req, res) => {
  try {
    const dbFile = path.join(DATA_DIR, 'financer_db.json');
    exportDbToJsonData(dbFile);
    res.setHeader('Content-disposition', 'attachment; filename=financer_db.json');
    res.setHeader('Content-type', 'application/json');
    const fileStream = fs.createReadStream(dbFile);
    fileStream.pipe(res);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Backup: Import
app.post('/api/backup/import', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }
  try {
    const rawContent = req.file.buffer.toString('utf-8');
    const parsed = JSON.parse(rawContent) as DbSchema;

    if (!parsed.launches || !parsed.categories || !parsed.home_members || !parsed.beneficiary_rules) {
      return res.status(400).json({ error: 'Formato de backup inválido' });
    }

    importDbFromJsonData(parsed);
    const dbFile = path.join(DATA_DIR, 'financer_db.json');
    fs.writeFileSync(dbFile, JSON.stringify(parsed, null, 2), 'utf-8');
    res.json({ status: 'success', message: 'Backup restaurado com sucesso!' });
  } catch (err: any) {
    res.status(500).json({ error: `Falha ao restaurar backup: ${err.message}` });
  }
});

app.post('/api/v1/backup/import', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }
  try {
    const rawContent = req.file.buffer.toString('utf-8');
    const parsed = JSON.parse(rawContent) as DbSchema;
    if (!parsed.launches || !parsed.categories || !parsed.home_members || !parsed.beneficiary_rules) {
      return res.status(400).json({ error: 'Formato inválido' });
    }
    importDbFromJsonData(parsed);
    const dbFile = path.join(DATA_DIR, 'financer_db.json');
    fs.writeFileSync(dbFile, JSON.stringify(parsed, null, 2), 'utf-8');
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/db/reset', (req, res) => {
  if (req.body.confirm !== 'RESETAR_BANCO') {
    return res.status(400).json({ error: 'Confirmação necessária. Envie { "confirm": "RESETAR_BANCO" } no corpo da requisição.' });
  }
  try {
    resetDatabaseToDefaults();
    res.json({ status: 'success', message: 'Banco resetado com sucesso!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/db/reset', (req, res) => {
  if (req.body.confirm !== 'RESETAR_BANCO') {
    return res.status(400).json({ error: 'Confirmação necessária. Envie { "confirm": "RESETAR_BANCO" } no corpo da requisição.' });
  }
  try {
    resetDatabaseToDefaults();
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Backup: List automatic backups
app.get('/api/backup/list', (req, res) => {
  try {
    const backups = listBackups();
    res.json(backups);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/backup/list', (req, res) => {
  try {
    const backups = listBackups();
    res.json(backups);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Backup: Restore from an automatic backup
app.post('/api/backup/restore/:filename', (req, res) => {
  try {
    restoreFromBackup(req.params.filename);
    res.json({ status: 'success', message: 'Backup restaurado com sucesso!' });
  } catch (err: any) {
    if (err.message === 'Invalid backup filename') {
      res.status(400).json({ error: err.message });
    } else if (err.message === 'Backup file not found') {
      res.status(404).json({ error: err.message });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

app.post('/api/v1/backup/restore/:filename', (req, res) => {
  try {
    restoreFromBackup(req.params.filename);
    res.json({ status: 'success' });
  } catch (err: any) {
    if (err.message === 'Invalid backup filename') {
      res.status(400).json({ error: err.message });
    } else if (err.message === 'Backup file not found') {
      res.status(404).json({ error: err.message });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// Função auxiliar para extrair mês/ano do nome do arquivo
function extractMonthYearFromFileName(fileName: string): { month: number; year: number } {
  // Mapeamento de nomes de meses em português para números
  const monthMap: Record<string, number> = {
    'janeiro': 1, 'jan': 1,
    'fevereiro': 2, 'fev': 2,
    'março': 3, 'mar': 3,
    'abril': 4, 'abr': 4,
    'maio': 5, 'mai': 5,
    'junho': 6, 'jun': 6,
    'julho': 7, 'jul': 7,
    'agosto': 8, 'ago': 8,
    'setembro': 9, 'set': 9,
    'outubro': 10, 'out': 10,
    'novembro': 11, 'nov': 11,
    'dezembro': 12, 'dez': 12
  };

  const lowerName = fileName.toLowerCase();
  
  // Tentar extrair de formato DD_MM_YYYY ou DD-MM-YYYY
  let dateMatch = lowerName.match(/(\d{2})[_-](\d{2})[_-](\d{4})/);
  if (dateMatch) {
    return { month: parseInt(dateMatch[2]), year: parseInt(dateMatch[3]) };
  }
  
  // Tentar extrair de formato Mês_YYYY (ex: Jun_2026, Julho_2026)
  for (const [monthName, monthNum] of Object.entries(monthMap)) {
    const monthYearMatch = lowerName.match(new RegExp(`${monthName}[_-](\\d{4})`));
    if (monthYearMatch) {
      return { month: monthNum, year: parseInt(monthYearMatch[1]) };
    }
  }
  
  // Fallback para data atual
  return { month: new Date().getMonth() + 1, year: new Date().getFullYear() };
}

function ensureLaunchCategory(category: string, type: LaunchType) {
  if (!getCategories().find(c => c.name === category)) {
    addCategory(category, type === 'receita' ? 'receita' : 'despesa');
  }
}

function ensureLaunchCompetenceFields(launches: any[], fileName?: string): any[] {
  const fileDate = fileName ? extractMonthYearFromFileName(fileName) : { month: new Date().getMonth() + 1, year: new Date().getFullYear() };

  return launches.map(rawLaunch => {
    const launch: any = { ...rawLaunch };

    if (!launch.origin) {
      launch.origin = 'itau_statement';
    }

    const validTypes = ['receita', 'despesa_fixa', 'despesa_variavel', 'divida_parcelamento'];
    if (!launch.type || !validTypes.includes(launch.type)) {
      const t = (launch.type || '').toLowerCase().trim();
      if (t === 'income' || t === 'credit' || t === 'receita') {
        launch.type = 'receita';
      } else {
        launch.type = 'despesa_variavel';
      }
    }

    if (!launch.description || typeof launch.description !== 'string') {
      launch.description = 'Lançamento importado de extrato';
    }

    if (!launch.beneficiary || typeof launch.beneficiary !== 'string') {
      launch.beneficiary = launch.description.slice(0, 30);
    }

    if (!launch.due_date || typeof launch.due_date !== 'string') {
      launch.due_date = `${fileDate.year.toString().padStart(4, '0')}-${fileDate.month.toString().padStart(2, '0')}-01`;
    }

    const dueParts = launch.due_date.split('-');
    const dueYear = dueParts.length >= 1 ? parseInt(dueParts[0], 10) : fileDate.year;
    const dueMonth = dueParts.length >= 2 ? parseInt(dueParts[1], 10) : fileDate.month;

    launch.competence_year = Number.isInteger(dueYear) && dueYear > 1900 ? dueYear : fileDate.year;
    launch.competence_month = Number.isInteger(dueMonth) && dueMonth >= 1 && dueMonth <= 12 ? dueMonth : fileDate.month;

    if (typeof launch.value !== 'number' || Number.isNaN(launch.value) || launch.value <= 0) {
      const parsedValue = parseFloat(String(launch.value || '0').replace(/[^0-9\-,\.]/g, '').replace(/\./g, '').replace(',', '.'));
      launch.value = Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0.01;
    }

    if (!launch.category || typeof launch.category !== 'string') {
      launch.category = 'Outros';
    }

    if (!launch.status || !['pendente', 'pago', 'atrasado'].includes(launch.status)) {
      launch.status = 'pago';
    }

    const validPaymentMethods = ['pix', 'boleto', 'cartao', 'debito_automatico', 'dinheiro'];
    if (!launch.payment_method || typeof launch.payment_method !== 'string' || !validPaymentMethods.includes(launch.payment_method)) {
      const pm = (launch.payment_method || '').toLowerCase().trim();
      if (pm === 'credito' || pm === 'crédito' || pm === 'cartão' || pm === 'debito') {
        launch.payment_method = 'cartao';
      } else if (pm === 'transferencia' || pm === 'transferência' || pm === 'ted' || pm === 'doc') {
        launch.payment_method = 'pix';
      } else {
        launch.payment_method = 'pix';
      }
    }

    return launch;
  });
}



// Batch import from dados-referencia folder (recursive)
function walkFilesRecursive(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let results: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkFilesRecursive(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

app.post('/api/import/batch', async (req, res) => {
  const dadosDir = path.join(process.cwd(), 'dados-referencia');
  if (!fs.existsSync(dadosDir)) {
    return res.status(404).json({ error: 'Pasta dados-referencia não encontrada' });
  }

  const filePaths = walkFilesRecursive(dadosDir);
  const results = {
    total: 0,
    boletos_importados: 0,
    extratos_importados: 0,
    planilhas_importadas: 0,
    skipped_duplicates: 0,
    errors: []
  };

  // Manter uma lista em memória dos lançamentos já adicionados durante este lote
  const addedInBatch: any[] = [];

  for (const filePath of filePaths) {
    const file = path.relative(dadosDir, filePath);
    results.total++;
    const fileExt = path.extname(file).toLowerCase();
    
    // Extrair mês/ano do arquivo primeiro
    const { month: fileMonth, year: fileYear } = extractMonthYearFromFileName(file);

    try {
      if (fileExt === '.pdf') {
        const fileBuffer = fs.readFileSync(filePath);
        const parser = new PDFParse({ data: fileBuffer });
        const data = await parser.getText();
        const text = data.text;

        // Try to detect if it's a bank statement or boleto
        const isExtrato = /extrato|saldo|transação|crédito|débito/i.test(text);
        const isBoleto = /boleto|linha digitável|beneficiário|vencimento/i.test(text);

        if (isExtrato) {
          const transactions = await parseBankStatementWithAi(text, fileBuffer);
          
          for (const pl of transactions) {
            // Garantir que o competence_month/year sejam os mesmos do due_date
            let compMonth = fileMonth;
            let compYear = fileYear;
            
            if (pl.due_date) {
              compMonth = parseInt(pl.due_date.split('-')[1]);
              compYear = parseInt(pl.due_date.split('-')[0]);
            }
            
            const launchWithCorrectMonth = {
              ...pl,
              competence_month: compMonth,
              competence_year: compYear
            };
            
            // Verificar duplicatas usando a função robusta (só no mesmo mês de competência)
            const existing = getLaunches();
            const sameMonthDb = existing.filter(el =>
              el.competence_month === launchWithCorrectMonth.competence_month &&
              el.competence_year === launchWithCorrectMonth.competence_year
            );
            const sameMonthBatch = addedInBatch.filter(el =>
              el.competence_month === launchWithCorrectMonth.competence_month &&
              el.competence_year === launchWithCorrectMonth.competence_year
            );
            const isDuplicateInDb = sameMonthDb.some(el => isDuplicate(el, launchWithCorrectMonth));
            const isDuplicateInBatch = sameMonthBatch.some(el => isDuplicate(el, launchWithCorrectMonth));

            if (!isDuplicateInDb && !isDuplicateInBatch) {
              ensureLaunchCategory(launchWithCorrectMonth.category, launchWithCorrectMonth.type);
              addLaunch(launchWithCorrectMonth);
              addedInBatch.push(launchWithCorrectMonth);
              results.extratos_importados++;
            } else {
              results.skipped_duplicates++;
            }
          }
        } else if (isBoleto) {
          const offlineResult = extractBoletoOffline(text);
          let finalResult = offlineResult;
          
          if (ai) {
            try {
              const prompt = `Analise o texto do boleto e retorne APENAS um objeto JSON válido:
{
  "barcode": "string (apenas dígitos)",
  "value": number,
  "due_date": "string (YYYY-MM-DD)",
  "beneficiary": "string",
  "suggested_category": "string"
}

Texto:
${text.slice(0, 8000)}`;

              const geminiRes = await ai.models.generateContent({
                model: 'gemini-2.0-flash-001',
                contents: prompt,
              });

              if (geminiRes && geminiRes.text) {
                const parsed = JSON.parse(geminiRes.text.trim());
                finalResult = {
                  barcode: parsed.barcode || offlineResult.barcode,
                  value: typeof parsed.value === 'number' ? parsed.value : offlineResult.value,
                  due_date: parsed.due_date || offlineResult.due_date,
                  beneficiary: parsed.beneficiary || offlineResult.beneficiary,
                  suggested_category: parsed.suggested_category || 'Outros',
                };
              }
            } catch (err) {
              console.warn('Gemini failed for boleto, using offline:', err);
            }
          }

          // Usar mês/ano do due_date ou do arquivo
          let padMonth = fileMonth;
          let padYear = fileYear;
          
          if (finalResult.due_date) {
            padMonth = parseInt(finalResult.due_date.split('-')[1]);
            padYear = parseInt(finalResult.due_date.split('-')[0]);
          }

          const pl: Omit<Launch, 'id' | 'created_at'> = {
            type: 'despesa_fixa',
            category: finalResult.suggested_category || 'Outros',
            description: `Pagamento de ${finalResult.beneficiary || 'Boleto'}`,
            beneficiary: finalResult.beneficiary || undefined,
            value: finalResult.value,
            due_date: finalResult.due_date || undefined,
            competence_month: padMonth,
            competence_year: padYear,
            status: 'pendente',
            payment_method: 'boleto',
            barcode: finalResult.barcode || undefined,
            origin: 'pdf'
          };

          const existing = getLaunches();
          const sameMonthDb = existing.filter(el =>
            el.competence_month === pl.competence_month && el.competence_year === pl.competence_year
          );
          const sameMonthBatch = addedInBatch.filter(el =>
            el.competence_month === pl.competence_month && el.competence_year === pl.competence_year
          );
          const isDuplicateInDb = sameMonthDb.some(el => isDuplicate(el, pl));
          const isDuplicateInBatch = sameMonthBatch.some(el => isDuplicate(el, pl));

          if (!isDuplicateInDb && !isDuplicateInBatch) {
            ensureLaunchCategory(pl.category, pl.type);
            addLaunch(pl);
            addedInBatch.push(pl);
            results.boletos_importados++;
          } else {
            results.skipped_duplicates++;
          }
        }
      } else if (fileExt === '.xlsx' || fileExt === '.xls') {
        const fileBuffer = fs.readFileSync(filePath);
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = xlsx.utils.sheet_to_json<any>(worksheet, { header: 1 });

        for (const row of rawData) {
          if (!row || row.length < 2) continue;

          let desc = '';
          let val = 0;

          for (let i = 0; i < row.length; i++) {
            const cell = row[i];
            if (typeof cell === 'string' && cell.trim().length > 3 && !desc) {
              desc = cell.trim();
            } else if (typeof cell === 'number' && cell > 0 && !val) {
              val = cell;
            }
          }

          if (desc && val && !desc.toLowerCase().includes('total') && !desc.toLowerCase().includes('saldo') && !desc.toLowerCase().includes('categoria')) {
            // Melhorar detecção de gastos vs receitas na planilha
            const lowerDesc = desc.toLowerCase();
            const isExpense = lowerDesc.includes('pago') || 
                             lowerDesc.includes('debito') || 
                             lowerDesc.includes('compra') || 
                             lowerDesc.includes('boleto') ||
                             lowerDesc.includes('conta') ||
                             lowerDesc.includes('condominio') ||
                             lowerDesc.includes('gassi') ||
                             lowerDesc.includes('cartão') ||
                             lowerDesc.includes('parcela') ||
                             lowerDesc.includes('empréstimo') ||
                             lowerDesc.includes('tv assinatura') ||
                             lowerDesc.includes('internet') ||
                             lowerDesc.includes('celular') ||
                             lowerDesc.includes('luz') ||
                             lowerDesc.includes('enel') ||
                             lowerDesc.includes('sabesp');
                             
            const isIncome = lowerDesc.includes('salário') || 
                            lowerDesc.includes('remuneração') ||
                            lowerDesc.includes('rendimento');

            const category = isExpense ? 'Outros' : (isIncome ? 'Salário' : 'Outras Receitas');

            const pl: Omit<Launch, 'id' | 'created_at'> = {
              type: isExpense ? 'despesa_variavel' : (isIncome ? 'receita' : 'receita'),
              category,
              description: desc,
              beneficiary: desc,
              value: val,
              competence_month: fileMonth,
              competence_year: fileYear,
              status: 'pago',
              origin: 'planilha'
            };

            const existing = getLaunches();
            const sameMonthDb = existing.filter(el =>
              el.competence_month === pl.competence_month && el.competence_year === pl.competence_year
            );
            const sameMonthBatch = addedInBatch.filter(el =>
              el.competence_month === pl.competence_month && el.competence_year === pl.competence_year
            );
            const isDuplicateInDb = sameMonthDb.some(el => isDuplicate(el, pl));
            const isDuplicateInBatch = sameMonthBatch.some(el => isDuplicate(el, pl));

            if (!isDuplicateInDb && !isDuplicateInBatch) {
              addLaunch(pl);
              addedInBatch.push(pl);
              results.planilhas_importadas++;
            } else {
              results.skipped_duplicates++;
            }
          }
        }
      }
    } catch (err: any) {
      results.errors.push({ file, error: err.message });
    }
  }

  res.json(results);
});

// Serve associated uploads (bills, receipts) if any
app.use('/uploads', express.static(uploadsDir));

// -----------------------------------------------------
// Offline Extractors for PDF Boletos & Itaú Statements
// -----------------------------------------------------

function extractBoletoOffline(text: string) {
  // Try to find a barcode (linha digitável): 47 or 48 characters of digits, spaces, and periods
  // Example format: 34191.79001 01043.513184 91020.150008 7 90000000025000
  const barcodeRegex = /\d{5}[\.\s]?\d{5}[\.\s]?\d{5}[\.\s]?\d{6}[\.\s]?\d{5}[\.\s]?\d{6}[\.\s]?\d[\.\s]?\d{14}/;
  const barcodeMatch = text.match(barcodeRegex);
  let barcode = barcodeMatch ? barcodeMatch[0].replace(/[\s\.]/g, '') : undefined;

  if (!barcode) {
    const simpleBarcodeMatch = text.match(/\d{30,48}/);
    if (simpleBarcodeMatch) barcode = simpleBarcodeMatch[0];
  }

  // Try to extract value
  let value = 0;
  const valueRegexes = [
    /(?:VALOR|COBRADO|DOCUMENTO|PAGAR).*?R\$\s*([\d\.,]+)/i,
    /R\$\s*([\d\.,]+)/i,
    /VALOR DO DOCUMENTO.*?([\d\.,]+)/i,
    /([\d\.,]+)\s*VALOR/i
  ];

  for (const regex of valueRegexes) {
    const match = text.match(regex);
    if (match) {
      const valStr = match[1].replace(/\./g, '').replace(',', '.');
      const parsedVal = parseFloat(valStr);
      if (!isNaN(parsedVal) && parsedVal > 0) {
        value = parsedVal;
        break;
      }
    }
  }

  // Try to extract due date
  let due_date = undefined;
  const dateMatch = text.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (dateMatch) {
    due_date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
  } else {
    const vctoMatch = text.match(/VENCIMENTO.*?(\d{2})[\/\.-](\d{2})[\/\.-](\d{4})/i);
    if (vctoMatch) {
      due_date = `${vctoMatch[3]}-${vctoMatch[2]}-${vctoMatch[1]}`;
    }
  }

  // Try to extract beneficiary
  let beneficiary = undefined;
  const benRegexes = [
    /BENEFICI[ÁA]RIO:\s*([^\n\r]+)/i,
    /CEDENTE:\s*([^\n\r]+)/i,
    /NOME DO BENEFICI[ÁA]RIO\s*([^\n\r]+)/i,
    /Sacador.*?([^\n\r]+)/i
  ];

  for (const regex of benRegexes) {
    const match = text.match(regex);
    if (match && match[1].trim().length > 3) {
      beneficiary = match[1].trim().slice(0, 50);
      break;
    }
  }

  if (!beneficiary) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5 && /[a-zA-Z]/.test(l));
    if (lines.length > 0) {
      beneficiary = lines[0].slice(0, 40);
    } else {
      beneficiary = 'Emissor Boleto';
    }
  }

  return {
    barcode,
    value: value || 150.00,
    due_date: due_date || new Date().toISOString().split('T')[0],
    beneficiary,
    suggested_category: 'Outros'
  };
}

function parseItauStatement(text: string, origin: LaunchOrigin = 'itau_statement'): any[] {
  const lines = text.split('\n');
  const transactions: any[] = [];
  const currentYear = new Date().getFullYear();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const dateMatch = trimmed.match(/^(\d{2})\/(\d{2})(?:\/(\d{4}))?\s+(.+)$/);
    if (!dateMatch) continue;

    const day = dateMatch[1];
    const month = dateMatch[2];
    const year = dateMatch[3] || currentYear.toString();
    const rest = dateMatch[4].trim();

    const valueMatch = rest.match(/(-?[\d\.]+,\d{2})(?:\s*([DCdc-]))?$/);
    if (!valueMatch) continue;

    const rawValStr = valueMatch[1];
    const suffix = valueMatch[2]?.toUpperCase();
    const desc = rest.slice(0, valueMatch.index ?? 0).trim();
    if (!desc) continue;

    const lowerDesc = desc.toLowerCase();
    if (
      lowerDesc.includes('saldo anterior') ||
      lowerDesc.includes('saldo total dispon') ||
      lowerDesc.includes('saldo em conta') ||
      lowerDesc.includes('saldo disponível') ||
      lowerDesc.includes('saldo disponivel') ||
      lowerDesc.startsWith('saldo')
    ) {
      continue;
    }

    let cleanValStr = rawValStr.replace(/-/g, '').replace(/\./g, '').replace(',', '.');
    let value = parseFloat(cleanValStr);
    if (isNaN(value)) continue;

    const isNegative = rawValStr.startsWith('-') || suffix === 'D';
    const absValue = Math.abs(value);
    const isRevenue = !isNegative && value > 0;

    let category = categorizeEntry(lowerDesc, isRevenue);

    transactions.push({
      type: isRevenue ? 'receita' : 'despesa_variavel',
      category,
      description: desc,
      beneficiary: desc.slice(0, 30),
      value: absValue,
      due_date: `${year}-${month}-${day}`,
      status: 'pago',
      payment_method: 'pix',
      origin
    });
  }

  return transactions;
}

function parseNubankStatement(text: string, origin: LaunchOrigin = 'extrato_nubank'): any[] {
  const lines = text.split('\n');
  const transactions: any[] = [];
  const months: Record<string, string> = {
    'JAN': '01', 'FEV': '02', 'MAR': '03', 'ABR': '04', 'MAI': '05', 'JUN': '06',
    'JUL': '07', 'AGO': '08', 'SET': '09', 'OUT': '10', 'NOV': '11', 'DEZ': '12'
  };

  let currentDate: string | null = null;
  let pendingDesc: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect date header: "03 MAR 2026"
    const dateHeaderMatch = trimmed.match(/^(\d{2})\s+([A-ZÇÃÁÉÍÓÚ]{3,})\s+(\d{4})\s/);
    if (dateHeaderMatch) {
      const monthStr = dateHeaderMatch[2].slice(0, 3).toUpperCase();
      const month = months[monthStr];
      if (month) {
        currentDate = `${dateHeaderMatch[3]}-${month}-${dateHeaderMatch[1]}`;
      }
      pendingDesc = null;
      continue;
    }

    // Skip header/footer lines
    if (/^(saldo|total de|rendimento|tem alguma|extrato gerado|caso a|não nos|asseguramos|nu financeira|nu pagamentos|cnpj|agência|conta|cpf)/i.test(trimmed)) continue;
    if (/^\d{1,2}\s+de\s+/i.test(trimmed)) continue;
    if (/^[a-zà-ú]+\s+\d{1,2}\s+de\s+/i.test(trimmed)) continue;

    // Skip "Valor adicionado na conta por cartão de crédito" and similar
    if (/^valor adicionado/i.test(trimmed)) { pendingDesc = trimmed; continue; }

    // Standalone value: "11,74" or "+ 11,74" or "- 5,00"
    const standaloneValue = trimmed.match(/^([+-]?\s*)([\d.]+,\d{2})$/);
    if (standaloneValue && currentDate) {
      const signal = standaloneValue[1].trim();
      const rawVal = standaloneValue[2];
      const cleanVal = parseFloat(rawVal.replace(/\./g, '').replace(',', '.'));
      if (isNaN(cleanVal)) continue;

      // If we have a pending description, emit transaction
      if (pendingDesc) {
        const isNegative = signal === '-' || /enviada|saída|saidas|pagamento|transferência enviada/i.test(pendingDesc);
        const isRevenue = /recebida|entradas|transferência recebida/i.test(pendingDesc);
        const lowerDesc = pendingDesc.toLowerCase();
        let category = categorizeEntry(lowerDesc, isRevenue);
        transactions.push({
          type: isRevenue ? 'receita' : 'despesa_variavel',
          category,
          description: pendingDesc.slice(0, 100),
          beneficiary: pendingDesc.slice(0, 30),
          value: Math.abs(cleanVal),
          due_date: currentDate,
          status: 'pago',
          payment_method: 'pix',
          origin
        });
        pendingDesc = null;
      }
      continue;
    }

    // Line with value at end: "Transferência enviada pelo Pix ... 11,74"
    const valueAtEnd = trimmed.match(/^(.+?)\s+([\d.]+,\d{2})\s*$/);
    if (valueAtEnd && currentDate) {
      let desc = valueAtEnd[1].trim();
      const rawVal = valueAtEnd[2];
      const cleanVal = parseFloat(rawVal.replace(/\./g, '').replace(',', '.'));
      if (isNaN(cleanVal)) continue;

      if (/^(total de entradas|total de saídas|valor adicionado)/i.test(desc)) { pendingDesc = desc; continue; }
      if (/^valor adicionado/i.test(desc)) { pendingDesc = desc; continue; }

      const isNegative = /enviada|saída|saidas|pagamento/i.test(desc);
      const isRevenue = /recebida|entradas/i.test(desc) && !isNegative;
      const lowerDesc = desc.toLowerCase();
      let category = categorizeEntry(lowerDesc, isRevenue);
      transactions.push({
        type: isRevenue ? 'receita' : 'despesa_variavel',
        category,
        description: desc.slice(0, 100),
        beneficiary: desc.slice(0, 30),
        value: Math.abs(cleanVal),
        due_date: currentDate,
        status: 'pago',
        payment_method: 'pix',
        origin
      });
      pendingDesc = null;
      continue;
    }

    // Otherwise, accumulate as pending description
    if (currentDate && !/^(agência|conta:|\d{1,2}\s+de)/i.test(trimmed)) {
      pendingDesc = pendingDesc ? pendingDesc + ' ' + trimmed : trimmed;
    }
  }

  // Clean up descriptions: remove phone numbers and address artifacts
  return transactions.map(tx => {
    let desc = tx.description;
    desc = desc.replace(/\s*\d{4,5}\s*\d{4}\s*/g, ' ').trim(); // phone numbers
    desc = desc.replace(/\s*metropolitanas[^]*$/, '').trim();
    desc = desc.replace(/\s*0800[\d\s-]+/g, '').trim();
    desc = desc.replace(/\s*capitais e regiões[^]*$/, '').trim();
    desc = desc.replace(/\s*[\d:]{4,}\s*-\s*\d+\s*de\s*\d+/g, '').trim();
    tx.description = desc;
    return tx;
  });
}

function parseCaixaStatement(text: string, origin: LaunchOrigin = 'extrato'): any[] {
  const lines = text.split('\n');
  const transactions: any[] = [];
  const currentYear = new Date().getFullYear();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Look for value with C/D suffix like 1.234,56C or 1.234,56 D
    const valueMatch = trimmed.match(/([\d\.]+,\d{2})\s*([CD])\b/i);
    if (!valueMatch) continue;

    // Description is the portion before the value
    const parts = trimmed.split(valueMatch[0]);
    const desc = (parts[0] || '').trim();
    if (!desc) continue;

    const rawValStr = valueMatch[1];
    const suffix = valueMatch[2].toUpperCase();
    const cleanValStr = rawValStr.replace(/\./g, '').replace(',', '.');
    const value = parseFloat(cleanValStr);
    if (isNaN(value)) continue;

    const isRevenue = suffix === 'C';

    const lowerDesc = desc.toLowerCase();
    let category = categorizeEntry(lowerDesc, isRevenue);

    transactions.push({
      type: isRevenue ? 'receita' : 'despesa_variavel',
      category,
      description: desc,
      beneficiary: desc.slice(0, 30),
      value: Math.abs(value),
      due_date: `${currentYear}-01-01`,
      status: 'pago',
      payment_method: 'pix',
      origin
    });
  }

  return transactions;
}

function parseBradescoStatement(text: string, origin: LaunchOrigin = 'extrato_bradesco'): any[] {
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
          const index = match.index!;
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
          const index = match.index!;
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

    // Fallback pattern in case the format is different
    const fallbackDateMatch = trimmed.match(/^(\d{2})[\/\-](\d{2})(?:[\/\-](\d{4}))?\s+(.+?)\s+(-?[\d.,]+)\s*([CD]?)\s*$/i);
    if (fallbackDateMatch) {
      const day = fallbackDateMatch[1];
      const month = fallbackDateMatch[2];
      const year = fallbackDateMatch[3] || currentYear.toString();
      const desc = fallbackDateMatch[4].trim();
      const rawValStr = fallbackDateMatch[5];
      const suffix = (fallbackDateMatch[6] || '').toUpperCase();

      if (!desc) continue;

      const lowerDesc = desc.toLowerCase();
      if (
        lowerDesc.includes('saldo anterior') ||
        lowerDesc.includes('saldo total') ||
        lowerDesc.includes('saldo em conta') ||
        lowerDesc.includes('saldo disponível') ||
        lowerDesc.startsWith('saldo')
      ) {
        continue;
      }

      const cleanValStr = rawValStr.replace(/\./g, '').replace(',', '.');
      const value = parseFloat(cleanValStr);
      if (isNaN(value)) continue;

      const isNegative = rawValStr.startsWith('-') || suffix === 'D' || lowerDesc.includes('débito') || lowerDesc.includes('debito');
      const isRevenue = suffix === 'C' || (!isNegative && value > 0);
      const absValue = Math.abs(value);

      let category = categorizeEntry(lowerDesc, isRevenue);

      transactions.push({
        type: isRevenue ? 'receita' : 'despesa_variavel',
        category,
        description: desc,
        beneficiary: desc.slice(0, 30),
        value: absValue,
        due_date: `${year}-${month}-${day}`,
        status: 'pago',
        payment_method: 'pix',
        origin
      });
      continue;
    }

    // Alternative pattern: value with C/D at end, description before, date somewhere
    const valueMatch = trimmed.match(/([\d\.]+,\d{2})\s*([CD])\b/i);
    if (valueMatch) {
      const parts = trimmed.split(valueMatch[0]);
      const desc = (parts[0] || '').trim();
      if (!desc) continue;

      // Try to find date in the description or line
      let year = currentYear.toString();
      let month = '01';
      let day = '01';
      const dateInDesc = desc.match(/(\d{2})[\/\-](\d{2})(?:[\/\-](\d{4}))?/);
      if (dateInDesc) {
        day = dateInDesc[1];
        month = dateInDesc[2];
        year = dateInDesc[3] || currentYear.toString();
      }

      const lowerDesc = desc.toLowerCase();
      if (
        lowerDesc.includes('saldo anterior') ||
        lowerDesc.includes('saldo total') ||
        lowerDesc.includes('saldo em conta') ||
        lowerDesc.startsWith('saldo')
      ) {
        continue;
      }

      const rawValStr = valueMatch[1];
      const suffix = valueMatch[2].toUpperCase();
      const cleanValStr = rawValStr.replace(/\./g, '').replace(',', '.');
      const value = parseFloat(cleanValStr);
      if (isNaN(value)) continue;

      const isRevenue = suffix === 'C';
      const absValue = Math.abs(value);

      let category = categorizeEntry(lowerDesc, isRevenue);

      transactions.push({
        type: isRevenue ? 'receita' : 'despesa_variavel',
        category,
        description: desc,
        beneficiary: desc.slice(0, 30),
        value: absValue,
        due_date: `${year}-${month}-${day}`,
        status: 'pago',
        payment_method: 'pix',
        origin
      });
    }
  }

  return transactions;
}

function categorizeEntry(lowerDesc: string, isRevenue: boolean): string {
  if (isRevenue) {
    if (lowerDesc.includes('salario') || lowerDesc.includes('vencimento') || lowerDesc.includes('recebido') || lowerDesc.includes('remuneracao') || lowerDesc.includes('remunera') || lowerDesc.includes('salário')) {
      return 'Salário';
    }
    if (lowerDesc.includes('rendimento') || lowerDesc.includes('aplicacao') || lowerDesc.includes('aplicação') || lowerDesc.includes('juros') || lowerDesc.includes('cdb') || lowerDesc.includes('dividendo') || lowerDesc.includes('poupanca')) {
      return 'Outras Receitas';
    }
    return 'Outras Receitas';
  }

  const patterns: [RegExp, string][] = [
    [/\b(r?shop|compra|mercado|pao de acucar|pão de açúcar|shpp|violeta|padaria|restaurante|ifood|supermercado|açougue|açai|acai|feira|verduras|hortifruti|delivery|comida|lanche|pizza|sushi)/i, 'Alimentação'],
    [/\b(uber|taxi|táxi|combustivel|combustível|posto|pedagio|pedágio|gasolina|etanol|estacionamento|transporte|passagem|ônibus|onibus|metrô|metro|99app|99pop|indrive)/i, 'Transporte'],
    [/\b(enel|luz|agua|água|sabesp|gás|gas|claro|telefonica|internet|banda larga|vivo|tim|oi fibra|net? tv|condominio|condomínio|iptu|boleto|gassi)/i, 'Contas de Consumo'],
    [/\b(aluguel|aluga)/i, 'Moradia'],
    [/\b(netflix|spotify|cinema|shows|teatro|lazer|jogos|playstation|xbox|prime video|disney|hbo|globoplay|streaming|app?le tv|deezer|youtube premium)/i, 'Lazer'],
    [/\b(farmacia|farmácia|drogaria|droga raia|drogasil|medicamento|remedio|remédio|hospital|médico|medico|dentista|plano de saude|plano saúde|unimed|bradesco saude|amil)/i, 'Saúde'],
    [/\bescola\b|curso|faculdade|senai|senac|mensalidade|matricula|kumon|wizard|inglês|ingles|material escolar/i, 'Educação'],
    [/\b(roupa|roupas|calçado|calcado|vestuario|vestuário|moda|shopping|magazine|americanas|submarino|shopee|mercado livre|mercadolivre|casas bahia|ponto frio|eletro|eletr)/i, 'Compras'],
    [/\b(seguro|seg saude|seguro auto|seguro residencia|seg vida)/i, 'Seguros'],
  ];

  for (const [regex, category] of patterns) {
    if (regex.test(lowerDesc)) return category;
  }

  return 'Outros';
}

function detectBankFromText(text: string): string {
  const lower = text.toLowerCase();
  if (/bradesco|bia pelo whatsapp|bradesco negócios/i.test(lower)) return 'extrato_bradesco';
  if (/กบ|nu pagamentos|nubank|nu financeira|nu investments/i.test(lower)) return 'extrato_nubank';
  if (/ita[uú]|conta universit[aá]ria|banco ita[uú]/i.test(lower)) return 'extrato_itau';
  if (/santander/i.test(lower)) return 'extrato';
  if (/banco do brasil|bb\s/i.test(lower)) return 'extrato';
  if (/caixa|cef\b|caixa econ/i.test(lower)) return 'extrato';
  return 'extrato';
}

async function parseBankStatementWithAi(text: string, fileBuffer?: Buffer): Promise<any[]> {
  const currentYear = new Date().getFullYear();
  const detectedOrigin = detectBankFromText(text) as LaunchOrigin;
  console.log(`[IMPORT] Banco detectado via regex: ${detectedOrigin}`);

  function extractYearFromContent(txt: string): number | null {
    if (!txt) return null;
    const m = txt.match(/per[ií]odo de visualiza[cç][aã]o\s*:\s*de\s*(\d{2})\/(\d{2})\/(\d{4})\s*at[eé]\s*(\d{2})\/(\d{2})\/(\d{4})/i);
    if (m) return parseInt(m[6]);
    const m2 = txt.match(/per[ií]odo\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
    if (m2) return parseInt(m2[3]);
    return null;
  }

  function buildPrompt() {
    return `Você é um especialista em conciliação e análise de extratos bancários brasileiros.
Analise o extrato de conta corrente fornecido. Ele pode ser de qualquer banco (Itaú, Bradesco, Santander, Banco do Brasil, Nubank, Caixa, etc.).

Sua missão é:
1. IDENTIFICAR o banco emissor analisando o conteúdo do texto.
2. Extrair TODAS as transações financeiras individuais (entradas e saídas de dinheiro).

IDENTIFICAÇÃO DO BANCO (campo "banco"):
- Se o texto contiver 'bradesco', 'BIA pelo WhatsApp' ou menções ao Bradesco → banco = 'Bradesco'
- Se o texto contiver caracteres como 'กบ', 'Nu Pagamentos', 'Nubank' ou 'Nu Financeira' → banco = 'Nubank'
- Se o texto contiver 'Itaú', 'Conta Universitária' ou menções ao Itaú → banco = 'Itaú'
- Se o texto contiver 'Santander' → banco = 'Santander'
- Se o texto contiver 'Banco do Brasil' ou 'BB' → banco = 'Banco do Brasil'
- Se o texto contiver 'Caixa' ou 'CEF' → banco = 'Caixa'
- Caso não consiga identificar, retorne banco = 'Desconhecido'

EXTRAÇÃO DE TRANSAÇÕES (campo "launches"):
Para cada transação, identifique a data, a descrição, se é uma entrada (receita) ou saída (despesa_variavel), a categoria mais adequada e o valor absoluto (sempre positivo).

Regras:
- Ignorar linhas de saldo ("Saldo Anterior", "Saldo em Conta", etc.)
- Ano corrente: ${currentYear}. Se o extrato indicar outro ano, use-o.
- Valores brasileiros: vírgula como decimal (ex: 1.230,45). Retorne como float positivo.
- Sinais: '-' ou 'D'/'Débito' = despesa_variavel. 'C'/'Crédito' ou positivo = receita.
- Categorização: Salário, Outras Receitas, Alimentação, Transporte, Contas de Consumo, Lazer, Moradia, ou Outros.

Retorne APENAS um objeto JSON válido (sem markdown, sem \`\`\`):
{
  "banco": "Nome do Banco",
  "launches": [
    {
      "type": "receita ou despesa_variavel",
      "category": "Categoria",
      "description": "Descrição",
      "beneficiary": "Beneficiário",
      "value": 123.45,
      "due_date": "YYYY-MM-DD",
      "payment_method": "pix"
    }
  ]
}`;
  }

  function mapLaunches(launches: any[], origin: LaunchOrigin): any[] {
    return launches.map(item => {
      let launchType = 'despesa_variavel';
      const t = (item.type || '').toLowerCase().trim();
      if (t === 'receita' || t === 'income' || t === 'credit') {
        launchType = 'receita';
      }
      return {
        type: launchType,
        category: item.category || 'Outros',
        description: item.description || 'Transação Extrato',
        beneficiary: item.beneficiary || (item.description ? item.description.slice(0, 30) : 'Extrato'),
        value: typeof item.value === 'number' ? Math.abs(item.value) : 0,
        due_date: item.due_date || `${currentYear}-01-01`,
        status: 'pago',
        payment_method: (item.payment_method || 'pix').toLowerCase().trim(),
        origin
      };
    }).filter(item => {
      const lowerDesc = item.description.toLowerCase();
      return item.value > 0 &&
             !lowerDesc.includes('saldo anterior') &&
             !lowerDesc.includes('saldo total dispon') &&
             !lowerDesc.includes('saldo em conta') &&
             !lowerDesc.startsWith('saldo');
    });
  }

  function resolveOrigin(bancoDetectado: string): LaunchOrigin {
    const originMap: Record<string, string> = {
      'Bradesco': 'extrato_bradesco',
      'Nubank': 'extrato_nubank',
      'Itaú': 'extrato_itau',
      'Itau': 'extrato_itau',
      'Santander': 'extrato',
      'Banco do Brasil': 'extrato',
      'Caixa': 'extrato',
      'Desconhecido': detectedOrigin
    };
    return (originMap[bancoDetectado] || detectedOrigin) as LaunchOrigin;
  }

  // ===== TENTATIVA 1: GROQ (OpenAI-compatible) =====
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      console.log('[IMPORT] Tentando Groq (llama-3.3-70b-versatile)...');
      const groqPrompt = buildPrompt() + (text ? `\n\nTexto do extrato:\n${text.slice(0, 12000)}` : '');
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: groqPrompt }],
          temperature: 0.1,
          max_tokens: 8000
        })
      });

      if (groqRes.ok) {
        const groqData = await groqRes.json();
        const rawText = groqData.choices?.[0]?.message?.content || '';
        console.log('[IMPORT] Groq respondeu, tamanho:', rawText.length);
        const cleanJson = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const iaResponse = JSON.parse(cleanJson);
        const launches = Array.isArray(iaResponse) ? iaResponse : (iaResponse.launches || []);
        const bancoDetectado = iaResponse.banco || 'Desconhecido';
        const finalOrigin = resolveOrigin(bancoDetectado);
        console.log(`[IMPORT] ✅ Groq → banco: "${bancoDetectado}" → origin: ${finalOrigin}`);
        if (Array.isArray(launches) && launches.length > 0) {
          return mapLaunches(launches, finalOrigin);
        }
      } else {
        const errBody = await groqRes.text();
        console.warn('[IMPORT] Groq erro HTTP', groqRes.status, errBody.slice(0, 200));
      }
    } catch (err: any) {
      console.warn('[IMPORT] Groq falhou:', err.message);
    }
  }

  // ===== TENTATIVA 2: GEMINI (Google GenAI) =====
  if (ai) {
    try {
      console.log('[IMPORT] Tentando Gemini (gemini-2.0-flash-001)...');
      const responseSchema = {
        type: Type.OBJECT,
        description: "Resposta da análise de extrato bancário",
        properties: {
          banco: { type: Type.STRING, description: "Nome do banco: 'Bradesco', 'Nubank', 'Itaú', 'Santander', 'Banco do Brasil', 'Caixa', ou 'Desconhecido'." },
          launches: {
            type: Type.ARRAY,
            description: "Lista de transações",
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, description: "'receita' ou 'despesa_variavel'" },
                category: { type: Type.STRING, description: "Categoria" },
                description: { type: Type.STRING, description: "Descrição" },
                beneficiary: { type: Type.STRING, description: "Beneficiário" },
                value: { type: Type.NUMBER, description: "Valor absoluto positivo" },
                due_date: { type: Type.STRING, description: "YYYY-MM-DD" },
                payment_method: { type: Type.STRING, description: "pix, boleto, cartao, debito_automatico, dinheiro" }
              },
              required: ["type", "category", "description", "value", "due_date", "payment_method"]
            }
          }
        },
        required: ["banco", "launches"]
      };

      const parts: any[] = [];
      if (fileBuffer) {
        parts.push({ inlineData: { mimeType: "application/pdf", data: fileBuffer.toString("base64") } });
      }
      parts.push({ text: buildPrompt() });
      if (text) {
        parts.push({ text: `Texto extraído como referência:\n${text.slice(0, 15000)}` });
      }

      const geminiRes = await ai.models.generateContent({
        model: 'gemini-2.0-flash-001',
        contents: { parts },
        config: { responseMimeType: "application/json", responseSchema }
      });

      if (geminiRes && geminiRes.text) {
        const iaResponse = JSON.parse(geminiRes.text.trim());
        const launches = Array.isArray(iaResponse) ? iaResponse : (iaResponse.launches || []);
        const bancoDetectado = iaResponse.banco || 'Desconhecido';
        const finalOrigin = resolveOrigin(bancoDetectado);
        console.log(`[IMPORT] ✅ Gemini → banco: "${bancoDetectado}" → origin: ${finalOrigin}`);
        if (Array.isArray(launches) && launches.length > 0) {
          return mapLaunches(launches, finalOrigin);
        }
      }
    } catch (err) {
      console.error('[IMPORT] Gemini falhou:', err);
    }
  }

  // ===== FALLBACK: PARSER OFFLINE =====
  console.log('[IMPORT] ⚠️ Todas as IAs falharam. Usando parser offline com origin:', detectedOrigin);
  let transactions: any[] = [];
  
  // Try Bradesco first if it's detected as Bradesco
  if (detectedOrigin === 'extrato_bradesco') {
    transactions = parseBradescoStatement(text, detectedOrigin);
  }
  
  // If still empty, try other parsers
  if (transactions.length === 0) {
    transactions = parseNubankStatement(text, detectedOrigin);
  }
  if (transactions.length === 0) {
    transactions = parseItauStatement(text, detectedOrigin);
  }
  if (transactions.length === 0) {
    transactions = parseCaixaStatement(text, detectedOrigin);
  }

  if (transactions.length === 0) {
    const lines = text.split('\n');
    const mergedLines: string[] = [];

    // First pass: merge multi-line entries (when next line doesn't start with a date)
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
      // Check if current line looks like a transaction start (has date)
      const looksLikeStart = /^[\s]*(\d{2})[\/\-](\d{2})([\/\-]\d{4})?\s+/.test(trimmed);
      // Check if next line looks like a standalone transaction (has its own date)
      const nextLooksLikeStart = nextLine ? /^[\s]*(\d{2})[\/\-](\d{2})([\/\-]\d{4})?\s+/.test(nextLine) : true;

      if (looksLikeStart) {
        // Accumulate continuation lines
        let merged = trimmed;
        let j = i + 1;
        while (j < lines.length) {
          const next = lines[j].trim();
          if (!next) { j++; continue; }
          // If next line looks like a new transaction, stop
          if (/^[\s]*(\d{2})[\/\-](\d{2})([\/\-]\d{4})?\s+/.test(next)) break;
          // Otherwise, append as continuation
          merged += ' ' + next;
          j++;
        }
        mergedLines.push(merged);
        i = j - 1;
      } else if (/\d+,\d{2}/.test(trimmed) || /R?\$/.test(trimmed)) {
        // Line has value but no date — try next line as date context
        let merged = trimmed;
        let j = i + 1;
        while (j < lines.length) {
          const next = lines[j].trim();
          if (!next) { j++; continue; }
          if (/^[\s]*(\d{2})[\/\-](\d{2})([\/\-]\d{4})?\s+/.test(next)) {
            // Put date before description
            merged = next + ' ' + merged;
            j++;
            break;
          }
          merged += ' ' + next;
          j++;
        }
        mergedLines.push(merged);
        i = j - 1;
      } else {
        mergedLines.push(trimmed);
      }
    }

    for (const line of mergedLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // === Pattern 1: DD/MM/YYYY or DD/MM at start, with optional R$ ===
      const dateMatch = trimmed.match(/^(\s*(\d{2})[\/\-](\d{2})([\/\-](\d{4}))?\s+(.+))/);
      if (dateMatch) {
        const day = dateMatch[2];
        const month = dateMatch[3];
        const year = dateMatch[5] || currentYear.toString();
        let rest = dateMatch[6].trim();

        if (!rest) continue;

        // Try to find value — multiple patterns
        let valueMatch: RegExpMatchArray | null;
        let rawValStr: string;
        let desc: string;

        // Pattern 1a: value with R$ prefix and optional C/D suffix: "R$ 1.234,56" or "R$1.234,56D"
        valueMatch = rest.match(/R?\$\s*([\d\.]+,\d{2})\s*([DC\-])?\s*$/i);
        if (valueMatch) {
          rawValStr = valueMatch[1];
          desc = rest.slice(0, valueMatch.index!).trim();
        } else {
          // Pattern 1b: value like 1.234,56 with optional C/D/- suffix at end
          valueMatch = rest.match(/(-?[\d\.]+,\d{2})\s*([DC\-])?\s*$/i);
          if (valueMatch) {
            rawValStr = valueMatch[1];
            const suffix = valueMatch[2] || '';
            desc = rest.slice(0, valueMatch.index!).trim();
          } else {
            // Pattern 1c: value with colon prefix "Valor: 1.234,56"
            valueMatch = rest.match(/[Vv]alor\s*:?\s*R?\$?\s*([\d\.]+,\d{2})/);
            if (valueMatch) {
              rawValStr = valueMatch[1];
              desc = rest.replace(valueMatch[0], '').trim();
            } else {
              continue;
            }
          }
        }

        if (!desc) continue;

        // Skip balance summaries
        const lowerDesc = desc.toLowerCase();
        if (lowerDesc.includes('saldo anterior') || lowerDesc.includes('saldo total dispon') || lowerDesc.includes('saldo em conta') || lowerDesc.includes('saldo disponível') || lowerDesc.includes('saldo disponivel') || lowerDesc.startsWith('saldo')) {
          continue;
        }

        const isNegative = rawValStr.startsWith('-') || desc.includes('DÉBITO') || desc.includes('DEBITO') || desc.includes('Dedução');
        let cleanValStr = rawValStr.replace(/[-DC]/gi, '').trim();
        cleanValStr = cleanValStr.replace(/\./g, '').replace(',', '.');
        
        let value = parseFloat(cleanValStr);
        if (isNaN(value)) continue;

        const isRevenue = !isNegative && value > 0;
        const absValue = Math.abs(value);

        let category = categorizeEntry(lowerDesc, isRevenue);

        transactions.push({
          type: isRevenue ? 'receita' : 'despesa_variavel',
          category,
          description: desc,
          beneficiary: desc.slice(0, 30),
          value: absValue,
          due_date: `${year}-${month}-${day}`,
          status: 'pago',
          payment_method: 'pix',
          origin: detectedOrigin
        });
        continue;
      }

      // === Pattern 2: No date at start — look for "DESC  VALOR" patterns anywhere ===
      const valueMatch = trimmed.match(/([\d\.]+,\d{2})\s*([DC\-])?\s*$/i);
      if (!valueMatch) continue;

      const rawValStr = valueMatch[1];
      const suffix = (valueMatch[2] || '').toUpperCase();
      let desc = trimmed.slice(0, valueMatch.index!).trim();
      if (!desc) continue;

      const lowerDesc = desc.toLowerCase();
      if (lowerDesc.includes('saldo anterior') || lowerDesc.includes('saldo total') || lowerDesc.includes('saldo em conta') || lowerDesc.startsWith('saldo')) continue;

      const isNegative = rawValStr.startsWith('-') || suffix === 'D' || lowerDesc.includes('débito') || lowerDesc.includes('debito') || lowerDesc.includes('dedução');
      let cleanValStr = rawValStr.replace(/[-DC]/gi, '').trim();
      cleanValStr = cleanValStr.replace(/\./g, '').replace(',', '.');
      let value = parseFloat(cleanValStr);
      if (isNaN(value)) continue;

      const isRevenue = suffix === 'C' || (!isNegative && value > 0);
      const absValue = Math.abs(value);
      let category = categorizeEntry(lowerDesc, isRevenue);

      transactions.push({
        type: isRevenue ? 'receita' : 'despesa_variavel',
        category,
        description: desc,
        beneficiary: desc.slice(0, 30),
        value: absValue,
        due_date: `${currentYear}-01-01`,
        status: 'pago',
        payment_method: 'pix',
        origin: detectedOrigin
      });
    }
  }

  return transactions;
}

async function generateFinancialAdviceWithFallbacks(prompt: string, cacheKey: string) {
  const TIMEOUT = 3000; // 3 seconds per provider

  // Helper function to create promise with timeout
  const withTimeout = (promise: Promise<string>, timeoutMs: number, providerName: string) => {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${providerName} timed out`)), timeoutMs)
      )
    ]);
  };

  try {
    // 1. Try Groq (fastest working provider)
    const groqApiKey = process.env.GROQ_API_KEY;
    if (groqApiKey) {
      try {
        console.log('[AI] Trying Groq...');
        const response = await withTimeout(
          fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${groqApiKey}`
            },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.7
            })
          }).then(res => res.json()).then(data => data.choices[0].message.content),
          TIMEOUT,
          'Groq'
        );
        if (response) {
          console.log('[AI] Success with Groq');
          setAiCache(cacheKey, response);
          return response;
        }
      } catch (err) {
        console.warn('[AI] Groq failed:', err);
      }
    }

    // 2. Try Gemini
    if (ai) {
      try {
        console.log('[AI] Trying Gemini...');
        const response = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-2.0-flash-001',
            contents: prompt
          }).then(res => res.text || ''),
          TIMEOUT,
          'Gemini'
        );
        if (response) {
          console.log('[AI] Success with Gemini');
          setAiCache(cacheKey, response);
          return response;
        }
      } catch (err) {
        console.warn('[AI] Gemini failed:', err);
      }
    }

    // 3. Try DeepSeek
    const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
    if (deepseekApiKey) {
      try {
        console.log('[AI] Trying DeepSeek...');
        const response = await withTimeout(
          fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${deepseekApiKey}`
            },
            body: JSON.stringify({
              model: 'deepseek-chat',
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.7
            })
          }).then(res => res.json()).then(data => data.choices[0].message.content),
          TIMEOUT,
          'DeepSeek'
        );
        if (response) {
          console.log('[AI] Success with DeepSeek');
          setAiCache(cacheKey, response);
          return response;
        }
      } catch (err) {
        console.warn('[AI] DeepSeek failed:', err);
      }
    }

    // 4. Try OpenRouter
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    if (openrouterApiKey) {
      try {
        console.log('[AI] Trying OpenRouter...');
        const response = await withTimeout(
          fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openrouterApiKey}`,
              'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
              'X-Title': 'My Financer'
            },
            body: JSON.stringify({
              model: 'google/gemini-2.0-flash-001',
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.7
            })
          }).then(res => res.json()).then(data => data.choices[0].message.content),
          TIMEOUT,
          'OpenRouter'
        );
        if (response) {
          console.log('[AI] Success with OpenRouter');
          setAiCache(cacheKey, response);
          return response;
        }
      } catch (err) {
        console.warn('[AI] OpenRouter failed:', err);
      }
    }

    // 5. Try Ollama (local)
    const ollamaApiUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';
    try {
      console.log('[AI] Trying Ollama...');
      const response = await withTimeout(
        fetch(`${ollamaApiUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama3.2',
            messages: [{ role: 'user', content: prompt }],
            stream: false
          })
        }).then(res => res.json()).then(data => data.message.content),
        TIMEOUT,
        'Ollama'
      );
      if (response) {
        console.log('[AI] Success with Ollama');
        setAiCache(cacheKey, response);
        return response;
      }
    } catch (err) {
      console.warn('[AI] Ollama failed:', err);
    }

    // All failed, return null
    console.warn('[AI] All providers failed');
    return null;
  } catch (err) {
    console.error('[AI] Error in AI fallback chain:', err);
    return null;
  }
}

// -----------------------------------------------------
// Goal Planner Helpers & Endpoints
// -----------------------------------------------------

// Price formula for financing calculation: PMT = PV * (i * (1+i)^n) / ((1+i)^n -1)
function calculatePricePMT(pv: number, monthlyRate: number, n: number): number {
  if (monthlyRate === 0) return pv / n;
  const factor = Math.pow(1 + monthlyRate, n);
  return pv * (monthlyRate * factor) / (factor - 1);
}

// Helper to calculate remaining months between two dates
function getMonthsBetween(startDateStr: string, endDateStr: string): number {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
}

// Helper to get current financial data from launches
function getCurrentFinancialData(month?: number, year?: number) {
  const launches = getLaunches();
  
  // Filter by month/year if provided, else use last 3 months average
  let filteredLaunches = launches;
  if (month && year) {
    filteredLaunches = launches.filter(l => l.competence_month === month && l.competence_year === year);
  } else {
    // Last 3 months
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    filteredLaunches = launches.filter(l => {
      const launchDate = new Date(l.competence_year, l.competence_month - 1, 1);
      return launchDate >= cutoff;
    });
  }

  // Group by category and calculate totals
  let totalIncome = 0;
  let totalExpenses = 0;
  let essentialExpenses = 0;
  let discretionaryExpenses = 0;

  // Essential categories (used to identify discretionary expenses for cuts)
  const essentialCategories = ['Moradia', 'Contas de Consumo', 'Empréstimo/Financiamento', 'Saúde', 'Educação'];

  filteredLaunches.forEach(l => {
    if (l.type === 'receita') {
      totalIncome += l.value;
    } else {
      totalExpenses += l.value;
      if (essentialCategories.includes(l.category)) {
        essentialExpenses += l.value;
      } else {
        discretionaryExpenses += l.value;
      }
    }
  });

  // Average if we're using multiple months
  if (!month || !year) {
    const monthsCount = Math.max(1, Math.min(3, filteredLaunches.length > 0 ? 3 : 1));
    totalIncome /= monthsCount;
    totalExpenses /= monthsCount;
    essentialExpenses /= monthsCount;
    discretionaryExpenses /= monthsCount;
  }

  return {
    avg_monthly_income: totalIncome,
    avg_monthly_expenses: totalExpenses,
    free_cash: totalIncome - totalExpenses,
    essential_expenses: essentialExpenses,
    discretionary_expenses: discretionaryExpenses
  };
}

// Generate projection for a goal
function generateProjection(goal: Goal, monthlyContribution: number) {
  const projection = [];
  let accumulated = goal.current_saved;
  const currentDate = new Date();
  
  let monthsToTarget = 0;
  if (goal.target_date) {
    monthsToTarget = getMonthsBetween(currentDate.toISOString().split('T')[0], goal.target_date);
  } else {
    // If no target date, estimate based on current contribution or required
    const remaining = goal.target_value - goal.current_saved;
    monthsToTarget = Math.max(1, Math.ceil(remaining / (monthlyContribution || 100)));
  }

  for (let i = 0; i < monthsToTarget && accumulated < goal.target_value; i++) {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
    const monthLabel = `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
    accumulated += monthlyContribution;
    if (accumulated > goal.target_value) accumulated = goal.target_value;
    
    projection.push({
      month: monthLabel,
      accumulated: accumulated,
      contribution: monthlyContribution
    });
  }

  return projection;
}

// Goals endpoints
app.get('/api/goals', (req, res) => {
  console.log('GET /api/goals called');
  try {
    const goals = getGoals();
    console.log('getGoals() result:', goals);
    res.json(goals);
  } catch (err: any) {
    console.error('Error in GET /api/goals:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/goals/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const goal = getGoalById(id);
    if (!goal) {
      return res.status(404).json({ error: 'Objetivo não encontrado' });
    }
    res.json(goal);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/goals', (req, res) => {
  try {
    const { name, description, target_value, current_saved, monthly_contribution, start_date, target_date, priority, category } = req.body;
    
    if (!name || !target_value || !start_date) {
      return res.status(400).json({ error: 'Nome, valor alvo e data de início são obrigatórios' });
    }

    const newGoal = addGoal({
      name,
      description: description || '',
      target_value: parseFloat(target_value),
      current_saved: current_saved ? parseFloat(current_saved) : 0,
      monthly_contribution: monthly_contribution ? parseFloat(monthly_contribution) : 0,
      start_date,
      target_date: target_date || undefined,
      priority: priority ? parseInt(priority) : 1,
      status: 'active',
      category: category || 'Reserva'
    });

    res.json({ id: newGoal.id, message: 'Objetivo criado com sucesso', goal: newGoal });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/goals/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updatedGoal = updateGoal(id, req.body);
    
    if (!updatedGoal) {
      return res.status(404).json({ error: 'Objetivo não encontrado' });
    }

    res.json({ message: 'Objetivo atualizado com sucesso', goal: updatedGoal });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/goals/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const success = deleteGoal(id);
    if (!success) {
      return res.status(404).json({ error: 'Objetivo não encontrado' });
    }
    res.json({ message: 'Objetivo excluído com sucesso' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Goal scenarios endpoints
app.get('/api/goals/:id/scenarios', (req, res) => {
  try {
    const goalId = parseInt(req.params.id);
    const scenarios = getGoalScenarios(goalId);
    res.json(scenarios);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/goals/:id/scenarios', (req, res) => {
  try {
    const goalId = parseInt(req.params.id);
    const goal = getGoalById(goalId);
    if (!goal) {
      return res.status(404).json({ error: 'Objetivo não encontrado' });
    }

    const { scenario_type, total_value, down_payment, installments, interest_rate } = req.body;
    let total_cost = total_value || goal.target_value;
    let installment_value = 0;

    if (scenario_type === 'financing' && down_payment !== undefined && installments && interest_rate !== undefined) {
      const financedValue = total_value ? (total_value - down_payment) : (goal.target_value - down_payment);
      installment_value = calculatePricePMT(financedValue, interest_rate, installments);
      total_cost = down_payment + (installment_value * installments);
    } else if (scenario_type === 'savings' && installments) {
      const remaining = (total_value || goal.target_value) - goal.current_saved;
      installment_value = remaining / installments;
    }

    const newScenario = addGoalScenario({
      goal_id: goalId,
      scenario_type,
      total_value: total_value || goal.target_value,
      down_payment: down_payment !== undefined ? parseFloat(down_payment) : undefined,
      installments: installments ? parseInt(installments) : undefined,
      installment_value: parseFloat(installment_value.toFixed(2)),
      interest_rate: interest_rate !== undefined ? parseFloat(interest_rate) : undefined,
      total_cost: parseFloat(total_cost.toFixed(2))
    });

    res.json({ message: 'Cenário adicionado com sucesso', scenario: newScenario });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Goal analysis endpoint
app.get('/api/goals/:id/analysis', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const goal = getGoalById(id);
    if (!goal) {
      return res.status(404).json({ error: 'Objetivo não encontrado' });
    }

    // Get current financial data
    const financialData = getCurrentFinancialData(
      parseInt(req.query.month as string) || undefined,
      parseInt(req.query.year as string) || undefined
    );

    // Calculate required monthly contribution
    let requiredMonthly = 0;
    if (goal.target_date) {
      const monthsLeft = getMonthsBetween(new Date().toISOString().split('T')[0], goal.target_date);
      const remainingValue = goal.target_value - goal.current_saved;
      requiredMonthly = remainingValue / monthsLeft;
    } else if (goal.monthly_contribution > 0) {
      requiredMonthly = goal.monthly_contribution;
    }

    // Check feasibility
    const feasible = requiredMonthly <= financialData.free_cash;
    
    // Identify suggested cuts from discretionary categories
    const suggestedCuts: any[] = [];
    const db = readDb();
    
    // Get expense categories
    const expenseCategories = db.categories.filter(c => c.type === 'despesa');
    const launches = db.launches.filter(l => ['despesa_fixa', 'despesa_variavel'].includes(l.type));
    
    // Group expenses by category
    const categoryTotals: Record<string, number> = {};
    launches.forEach(l => {
      if (!categoryTotals[l.category]) categoryTotals[l.category] = 0;
      categoryTotals[l.category] += l.value;
    });

    // Suggest 20% cuts for non-essential categories
    const nonEssential = expenseCategories.filter(c => !['Moradia', 'Contas de Consumo', 'Empréstimo/Financiamento'].includes(c.name));
    nonEssential.forEach(cat => {
      const current = categoryTotals[cat.name] || 0;
      if (current > 50) {
        const suggestedCut = current * 0.2;
        suggestedCuts.push({
          category: cat.name,
          current: parseFloat(current.toFixed(2)),
          suggested: parseFloat((current - suggestedCut).toFixed(2)),
          saving: parseFloat(suggestedCut.toFixed(2))
        });
      }
    });

    // Alternative scenario (increase target date by 6 months if not feasible)
    let alternativeScenario: any = undefined;
    if (!feasible && goal.target_date) {
      const currentDate = new Date();
      const originalTarget = new Date(goal.target_date);
      const newTarget = new Date(originalTarget.setMonth(originalTarget.getMonth() + 6));
      const newMonthsLeft = getMonthsBetween(currentDate.toISOString().split('T')[0], newTarget.toISOString().split('T')[0]);
      const newRequired = (goal.target_value - goal.current_saved) / newMonthsLeft;
      alternativeScenario = {
        target_date: newTarget.toISOString().split('T')[0],
        monthly_needed: parseFloat(newRequired.toFixed(2))
      };
    }

    // Generate projection
    const projection = generateProjection(goal, feasible ? requiredMonthly : (goal.monthly_contribution || financialData.free_cash));

    // Get AI advice using existing fallback system
    let aiAdvice = buildGoalAnalysisOfflineAdvice({
      goalName: goal.name,
      targetValue: goal.target_value,
      currentSaved: goal.current_saved,
      requiredMonthly,
      feasible,
      freeCash: financialData.free_cash,
      suggestedCuts,
      alternativeScenario
    });
    try {
      // First, get any goal scenarios
      const scenarios = getGoalScenarios(id);
      
      const prompt = `Você é um orientador financeiro pessoal brasileiro, especialista em planejamento de objetivos.
O usuário tem o seguinte objetivo financeiro:
- Nome: ${goal.name}
- Descrição: ${goal.description || 'Nenhuma'}
- Valor alvo: R$ ${goal.target_value.toFixed(2)}
- Valor já economizado: R$ ${goal.current_saved.toFixed(2)}
- Data de início: ${goal.start_date}
- Data alvo: ${goal.target_date || 'Não definida'}
- Prioridade: ${goal.priority === 1 ? 'Alta' : goal.priority === 2 ? 'Média' : 'Baixa'}

Dados financeiros atuais do usuário (média mensal):
- Renda mensal: R$ ${financialData.avg_monthly_income.toFixed(2)}
- Despesas totais: R$ ${financialData.avg_monthly_expenses.toFixed(2)}
- Dinheiro livre disponível: R$ ${financialData.free_cash.toFixed(2)}
- Despesas essenciais: R$ ${financialData.essential_expenses.toFixed(2)}
- Despesas discricionárias (não essenciais): R$ ${financialData.discretionary_expenses.toFixed(2)}

Valor mensal necessário para atingir o objetivo: R$ ${requiredMonthly.toFixed(2)}

Viabilidade atual: ${feasible ? 'VIÁVEL' : 'NÃO VIÁVEL'}

Cenários de financiamento/economia cadastrados:
${scenarios.length > 0 ? scenarios.map(s => `- Tipo: ${s.scenario_type}, Valor total: R$ ${s.total_value?.toFixed(2) || 'N/A'}, Entrada: R$ ${s.down_payment?.toFixed(2) || 'N/A'}, Parcelas: ${s.installments || 'N/A'}, Valor da parcela: R$ ${s.installment_value?.toFixed(2) || 'N/A'}, Custo total: R$ ${s.total_cost?.toFixed(2) || 'N/A'}`).join('\n') : 'Nenhum cenário cadastrado'}

Sugestões de cortes de gastos:
${suggestedCuts.length > 0 ? suggestedCuts.map(c => `- ${c.category}: Cortar R$ ${c.saving.toFixed(2)} (de R$ ${c.current.toFixed(2)} para R$ ${c.suggested.toFixed(2)})`).join('\n') : 'Nenhuma sugestão de corte'}

Por favor, dê conselhos práticos, específicos e diretos em português sobre como o usuário pode atingir este objetivo. Seja realista, mencione os valores e as categorias onde podem ser feitos cortes, e se for o caso, sugira ajustes no prazo ou no valor alvo. Seja encorajador, mas honesto.`;

      // Use existing generateFinancialAdviceWithFallbacks function
      aiAdvice = await generateFinancialAdviceWithFallbacks(prompt, `goal_analysis_${id}`);
    } catch (aiErr: any) {
      console.warn('AI advice failed:', aiErr);
    }

    const analysis: GoalAnalysis = {
      goal,
      current_financials: financialData,
      required_monthly: parseFloat(requiredMonthly.toFixed(2)),
      feasibility: {
        possible: feasible,
        reason: feasible
          ? `O objetivo é viável! Você tem R$ ${financialData.free_cash.toFixed(2)} disponível por mês, e precisa de R$ ${requiredMonthly.toFixed(2)}.`
          : `O objetivo não é viável atualmente. Você precisa de R$ ${requiredMonthly.toFixed(2)} por mês, mas só tem R$ ${financialData.free_cash.toFixed(2)} disponível.`,
        suggested_cuts: suggestedCuts,
        alternative_scenario: alternativeScenario
      },
      projection,
      ai_advice: aiAdvice
    };

    res.json(analysis);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Emergency Reserve AI Analysis (manual target + monthly saving + Objetivos)
app.get('/api/reserve/analysis', async (req, res) => {
  try {
    const month = req.query.month ? parseInt(req.query.month as string) : undefined;
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;

    const currentSaved = parseFloat((req.query.currentSaved as string) || '0') || 0;
    const monthlySaving = parseFloat((req.query.monthlySaving as string) || '0') || 0;
    const manualTarget = req.query.target ? parseFloat(req.query.target as string) : undefined;
    const isManual = req.query.manual === 'true' || req.query.manual === '1';

    // Compute fixed expenses (current month or last 3 months average)
    const launches = getLaunches();
    let fixedExpenses = 0;
    if (month && year) {
      const ml = launches.filter(l => l.competence_month === month && l.competence_year === year);
      fixedExpenses = ml
        .filter(l => l.type === 'despesa_fixa' || l.type === 'divida_parcelamento')
        .reduce((sum, l) => sum + l.value, 0);
    } else {
      const now = new Date();
      const cutoff = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      const recent = launches.filter(l => {
        const d = new Date(l.competence_year, l.competence_month - 1, 1);
        return d >= cutoff;
      });
      const fixedSum = recent
        .filter(l => l.type === 'despesa_fixa' || l.type === 'divida_parcelamento')
        .reduce((sum, l) => sum + l.value, 0);
      fixedExpenses = recent.length ? fixedSum / 3 : 0;
    }

    const recommendedTarget = fixedExpenses * 6 || 15000;
    const reserveTarget = isManual && manualTarget && manualTarget > 0 ? manualTarget : recommendedTarget;

    // Get goals (Objetivos tab)
    const goals = getGoals();

    // Projection math
    const remaining = Math.max(0, reserveTarget - currentSaved);
    const monthsToComplete = monthlySaving > 0 ? Math.ceil(remaining / monthlySaving) : Infinity;

    const financialData = getCurrentFinancialData(month, year);

    // Cache key based on the parameters + goals snapshot
    const goalSnapshot = goals.map(g => `${g.name}:${g.target_value}:${g.current_saved}:${g.monthly_contribution}:${g.priority}`).join('|');
    const cacheKey = crypto
      .createHash('md5')
      .update(`reserve_${currentSaved}_${monthlySaving}_${reserveTarget}_${fixedExpenses}_${goalSnapshot}`)
      .digest('hex');

    const cached = getAiCache(cacheKey);
    if (cached) {
      const adviceText = Array.isArray(cached)
        ? cached[0]?.response ?? ''
        : (cached as any)?.response ?? '';
      return res.json({
        advice: String(adviceText),
        cached: true,
        target: reserveTarget,
        recommended_target: recommendedTarget,
        months_to_complete: isFinite(monthsToComplete) ? monthsToComplete : null
      });
    }

    // Background/await AI generation
    const goalsText = goals.length
      ? goals
          .map(
            g =>
              `- ${g.name} (Prioridade ${g.priority === 1 ? 'Alta' : g.priority === 2 ? 'Média' : 'Baixa'}): Alvo R$ ${g.target_value.toFixed(2)}, Já guardado R$ ${g.current_saved.toFixed(2)}, Aporte mensal R$ ${g.monthly_contribution.toFixed(2)}, Prazo ${g.target_date || 'sem prazo definido'}`
          )
          .join('\n')
      : 'Nenhum objetivo cadastrado na aba Objetivos.';

    const prompt = `Você é um orientador financeiro brasileiro especialista em reserva de emergência e planejamento de objetivos.

Configuração da Reserva de Emergência informada pelo usuário:
- Modo do alvo: ${isManual ? 'Manual (definido pelo usuário)' : 'Recomendado (6 meses de custos fixos)'}
- Alvo da reserva: R$ ${reserveTarget.toFixed(2)}
- Valor atual em mãos (já guardado): R$ ${currentSaved.toFixed(2)}
- Guarda por mês (aporte mensal): R$ ${monthlySaving.toFixed(2)}
- Custos fixos mensais estimados: R$ ${fixedExpenses.toFixed(2)}
- Valor que falta para completar: R$ ${remaining.toFixed(2)}
- Tempo estimado para completar a reserva: ${isFinite(monthsToComplete) ? monthsToComplete + ' meses' : 'indefinido (aporte mensal é zero)'}

Dados financeiros gerais do usuário (média mensal):
- Renda: R$ ${financialData.avg_monthly_income.toFixed(2)}
- Despesas totais: R$ ${financialData.avg_monthly_expenses.toFixed(2)}
- Dinheiro livre: R$ ${financialData.free_cash.toFixed(2)}

Objetivos cadastrados na aba "Objetivos":
${goalsText}

Por favor, gere uma análise personalizada e direta em português do Brasil (formato Markdown) contendo:
1. Diagnóstico da reserva de emergência (se está adequada, comparando com os 6 meses de custos fixos).
2. Tempo estimado para atingir a reserva e se o aporte mensal é realista diante do dinheiro livre disponível.
3. Como conciliar a reserva com os objetivos da aba Objetivos (priorização, possíveis conflitos de fluxo de caixa, sugestão de divisão dos aportes).
4. Sugestões práticas de investimento para a reserva (ex: Tesouro Selic, CDB 100% CDI) e próximos passos.
Seja encorajador, mas honesto e realista.`;

    const aiAdvice = await generateFinancialAdviceWithFallbacks(prompt, cacheKey);

    let advice = aiAdvice;
    if (!advice) {
      advice = buildReserveAnalysisOfflineAdvice({
        reserveTarget,
        currentSaved,
        monthlySaving,
        remaining,
        monthsToComplete: Number.isFinite(monthsToComplete) ? monthsToComplete : null,
        goalsCount: goals.length,
        isManual
      });
      setAiCache(cacheKey, advice);
    }

    res.json({
      advice,
      cached: false,
      target: reserveTarget,
      recommended_target: recommendedTarget,
      months_to_complete: isFinite(monthsToComplete) ? monthsToComplete : null
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------
// Vite Dev Server / Static Files Hosting
// -----------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    // Only import vite in development mode
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[My Financer Backend] Development Mode with Vite Middleware');
  } else {
    const scriptDir = path.dirname(process.argv[1] || __filename || '');
    const distPath = path.resolve(scriptDir);
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('[My Financer Backend] Production Mode serving static dist folder');
  }

  listenOnPort(DEFAULT_PORT, HOST);
}

startServer();
