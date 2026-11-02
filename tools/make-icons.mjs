// สร้างไอคอนแอปทุกขนาดจาก SVG ในไฟล์นี้ → public/icons/ + public/favicon.svg
// รัน: npm run icons (แก้หน้าตาไอคอน = แก้ที่นี่แล้วรันใหม่ · อย่าลืมเปลี่ยนชื่อแคชใน public/sw.js)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'icons');
fs.mkdirSync(out, { recursive: true });

// ดาว 5 แฉกกลางภาพ — R = รัศมีปลายแฉก, r = รัศมีเว้า (สัดส่วนอ้วนๆ น่ารัก)
function starPath(cx, cy, R, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (-90 + i * 36) * (Math.PI / 180);
    const rad = i % 2 ? r : R;
    pts.push(`${(cx + Math.cos(a) * rad).toFixed(1)} ${(cy + Math.sin(a) * rad).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}

function sparkle(cx, cy, s) {
  return `M${cx} ${cy - s}Q${cx} ${cy} ${cx + s} ${cy}Q${cx} ${cy} ${cx} ${cy + s}Q${cx} ${cy} ${cx - s} ${cy}Q${cx} ${cy} ${cx} ${cy - s}Z`;
}

// scale < 1 = ย่อดาวให้อยู่ในพื้นที่ปลอดภัยของไอคอน maskable (Android ตัดขอบเป็นวงกลม/สี่เหลี่ยมมน)
function appIcon({ rounded, scale = 1 }) {
  const s = (n) => 256 + (n - 256) * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="sky" cx="50%" cy="22%" r="90%">
      <stop offset="0" stop-color="#3a41ad"/>
      <stop offset="0.55" stop-color="#1c205a"/>
      <stop offset="1" stop-color="#11143a"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffeaa0"/>
      <stop offset="1" stop-color="#ffb21a"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="url(#sky)"/>
  <path d="${starPath(256, s(276), 150 * scale, 70 * scale)}" fill="url(#gold)" stroke="url(#gold)" stroke-width="${36 * scale}" stroke-linejoin="round"/>
  <path d="${starPath(256, s(276), 150 * scale, 70 * scale)}" fill="none" stroke="#fff6" stroke-width="${6 * scale}" stroke-linejoin="round" transform="translate(0 ${-4 * scale})" opacity=".5"/>
  <path d="${sparkle(s(118), s(124), 26 * scale)}" fill="#fff1c2"/>
  <path d="${sparkle(s(400), s(150), 18 * scale)}" fill="#fff1c2" opacity=".85"/>
  <circle cx="${s(410)}" cy="${s(392)}" r="${7 * scale}" fill="#fff1c2" opacity=".7"/>
</svg>`;
}

// ไอคอนเล็กบนแถบแจ้งเตือน Android: ต้องเป็นสีขาวพื้นโปร่ง
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <path d="${starPath(48, 52, 36, 17)}" fill="#fff" stroke="#fff" stroke-width="8" stroke-linejoin="round"/>
</svg>`;

const jobs = [
  ['icon-192.png', appIcon({ rounded: true }), 192],
  ['icon-512.png', appIcon({ rounded: true }), 512],
  ['maskable-512.png', appIcon({ rounded: false, scale: 0.8 }), 512],
  ['apple-touch-icon.png', appIcon({ rounded: false }), 180], // iOS ตัดมุมให้เอง
  ['badge-72.png', badge, 72],
];

for (const [name, svg, size] of jobs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(out, name));
  console.log('✓', name);
}
fs.writeFileSync(path.join(root, 'public', 'favicon.svg'), appIcon({ rounded: true }));
console.log('✓ favicon.svg');
