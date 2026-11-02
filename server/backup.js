// สำรองฐานข้อมูลวันละครั้ง เก็บย้อนหลัง 30 วัน — ไฟล์เดียวเล็กๆ ไม่ต้องมี cron แยก
import fs from 'node:fs';
import path from 'node:path';

const KEEP_DAYS = 30;
const bangkokDate = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

export function scheduleBackups(db, dir) {
  if (db.name === ':memory:') return;
  fs.mkdirSync(dir, { recursive: true });

  async function run() {
    const file = path.join(dir, `stars-${bangkokDate()}.sqlite`);
    if (fs.existsSync(file)) return;
    try {
      await db.backup(file);
      const old = fs.readdirSync(dir).filter((f) => /^stars-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort();
      for (const f of old.slice(0, Math.max(0, old.length - KEEP_DAYS))) fs.unlinkSync(path.join(dir, f));
      console.log(`💾 สำรองข้อมูลแล้ว ${path.basename(file)}`);
    } catch (err) {
      console.error('สำรองข้อมูลไม่สำเร็จ', err);
    }
  }

  run();
  setInterval(run, 60 * 60 * 1000).unref();
}
