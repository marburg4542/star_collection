import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { scheduleBackups } from './backup.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// ใช้ชื่อ API_PORT ไม่ใช่ PORT — เครื่องมือรัน dev หลายตัวตั้ง PORT ให้หน้าเว็บ (Vite) แล้วเซิร์ฟเวอร์จะไปแย่งพอร์ตเดียวกัน
const PORT = Number(process.env.API_PORT || 5100);
const HOST = process.env.HOST || '127.0.0.1'; // Cloudflare tunnel ต่อเข้ามาทาง localhost อยู่แล้ว ไม่ต้องเปิดรับจากวง LAN
const dbFile = path.resolve(here, process.env.DB_PATH || 'data/stars.sqlite');

const db = openDb(dbFile);
const app = createApp(db, {
  appUrl: process.env.APP_URL || 'https://stars.personal-proj.site',
  distDir: path.join(here, '..', 'dist'),
});
scheduleBackups(db, path.join(path.dirname(dbFile), 'backups'));

app.listen(PORT, HOST, () => {
  console.log(`⭐ สะสมดาว พร้อมใช้งานที่ http://${HOST}:${PORT} (ฐานข้อมูล ${dbFile})`);
});
