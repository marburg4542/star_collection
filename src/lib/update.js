// เว็บรุ่นใหม่ขึ้นเซิร์ฟเวอร์แล้วหรือยัง — แอปที่เปิดค้างไว้ในพื้นหลังยังรันโค้ดรุ่นเก่าในหน่วยความจำ จนกว่าจะโหลดหน้าใหม่
// เทียบไฟล์ใน assets/ ที่หน้านี้โหลดมา กับที่ index.html บนเซิร์ฟเวอร์ชี้อยู่ตอนนี้ (ชื่อไฟล์มี hash เปลี่ยนทุกครั้งที่โค้ดหน้าเว็บเปลี่ยน)
// อัปเดตเฉพาะฝั่งเซิร์ฟเวอร์ = ชื่อไฟล์เหมือนเดิม = ไม่ต้องโหลดใหม่
import { useEffect, useState } from 'react';

const ASSET_TAGS = 'script[type="module"][src*="/assets/"], link[rel="stylesheet"][href*="/assets/"]';

function buildOf(doc) {
  return [...doc.querySelectorAll(ASSET_TAGS)]
    .map((el) => new URL(el.getAttribute('src') ?? el.getAttribute('href'), window.location.origin).pathname)
    .sort()
    .join(' ');
}

// จำไว้ตั้งแต่เปิดหน้า — ทีหลัง Vite จะเติม <link> ของไฟล์ที่โหลดเพิ่มทีหลังลงใน <head> อีก
// ว่าง = โหมดพัฒนา (vite dev ไม่มีไฟล์ใน assets/) ไม่ต้องเช็ก
const loaded = buildOf(document);
const listeners = new Set();
let found = null; // รุ่นบนเซิร์ฟเวอร์ที่ไม่ตรงกับหน้านี้
let lastCheck = 0;

export async function checkForUpdate() {
  if (!loaded || Date.now() - lastCheck < 10_000) return;
  lastCheck = Date.now();
  try {
    const res = await fetch('/', { cache: 'no-store' });
    if (!res.ok) return;
    const latest = buildOf(new DOMParser().parseFromString(await res.text(), 'text/html'));
    if (latest && latest !== loaded && latest !== found) {
      found = latest;
      listeners.forEach((fn) => fn(latest));
    }
  } catch {
    /* ออฟไลน์ — ไว้เช็กรอบหน้า */
  }
}

/** รุ่นใหม่ที่เจอ (null = ยังเป็นรุ่นล่าสุด) — เช็กทุกครั้งที่กลับมาเปิดแอปหรือเน็ตกลับมา (ต่อสายสดใหม่หลัง deploy ก็เช็ก ดู store.jsx) */
export function useNewVersion() {
  const [latest, setLatest] = useState(found);
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && checkForUpdate();
    listeners.add(setLatest);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', checkForUpdate);
    return () => {
      listeners.delete(setLatest);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', checkForUpdate);
    };
  }, []);
  return latest;
}
