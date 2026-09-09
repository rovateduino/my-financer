import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const candidates = [
  path.resolve(__dirname, 'financer_db.sqlite'),
  path.resolve(__dirname, 'data', 'financer_db.sqlite')
];

const SQL = await initSqlJs({ locateFile: (filename) => path.resolve(__dirname, 'node_modules', 'sql.js', 'dist', filename) });

for (const dbFile of candidates) {
  console.log('DB', dbFile, 'exists', fs.existsSync(dbFile));
  if (!fs.existsSync(dbFile)) continue;
  const db = new SQL.Database(fs.readFileSync(dbFile));
  const rows = db.exec("SELECT id, token, label, created_at, last_used_at FROM auth_tokens ORDER BY id");
  console.log(JSON.stringify(rows, null, 2));
  const adminRows = db.exec("SELECT id, username FROM admin_users ORDER BY id");
  console.log(JSON.stringify(adminRows, null, 2));
}
