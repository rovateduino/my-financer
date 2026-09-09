import { initDb, addAdminUser } from './src/db.ts';
import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';

const testDir = process.env.FINANCER_DATA_DIR;
await initDb();
addAdminUser('boss', 'hash');

const DB_FILE = path.resolve(testDir, 'financer_db.sqlite');
const SQL = await initSqlJs({ locateFile: (f) => path.resolve('node_modules/sql.js/dist', f) });
const db = new SQL.Database(fs.readFileSync(DB_FILE));
try {
  db.run("INSERT INTO admin_users (username, password_hash) VALUES ('hacker', 'hash');");
  console.log('ERROR: DB-level constraint did NOT block second admin');
} catch (e) {
  console.log('DB-level constraint blocked raw insert:', String(e.message).split('\n')[0]);
}
console.log('count:', db.exec('SELECT COUNT(*) FROM admin_users;')[0].values[0][0]);
