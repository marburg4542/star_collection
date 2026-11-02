// สำรองฐานข้อมูลทันที (deploy.sh เรียกก่อนอัปเดตทุกครั้ง) — เก็บ 10 ชุดล่าสุดใน data/backups/pre-deploy-*.sqlite
// เปิดแบบอ่านอย่างเดียวด้วย better-sqlite3 ตรงๆ ไม่ผ่าน db.js — จะได้ไม่เผลอรัน migration ของโค้ดรุ่นใหม่ก่อนเวลา
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(serverDir, '.env'), quiet: true });
const dbFile = path.resolve(serverDir, process.env.DB_PATH || 'data/stars.sqlite');

if (!fs.existsSync(dbFile)) {
  console.log('ยังไม่มีฐานข้อมูล — ข้ามการสำรอง');
  process.exit(0);
}
const dir = path.join(path.dirname(dbFile), 'backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace(/[T:]/g, '-');
const file = path.join(dir, `pre-deploy-${stamp}.sqlite`);

const db = new Database(dbFile, { readonly: true });
await db.backup(file);
db.close();

const old = fs.readdirSync(dir).filter((f) => f.startsWith('pre-deploy-')).sort();
for (const f of old.slice(0, Math.max(0, old.length - 10))) fs.unlinkSync(path.join(dir, f));
console.log(`💾 ${path.relative(serverDir, file)}`);
