// สร้างไอคอนแอปทุกขนาดจาก SVG ในไฟล์นี้ → public/icons/ + public/favicon.svg
// รัน: npm run icons (แก้หน้าตาไอคอน = แก้ที่นี่แล้วรันใหม่ · อย่าลืมเปลี่ยนชื่อแคชใน public/sw.js และ ?v= ใน index.html/manifest)
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

// หัวใจขนาด 20×20 (ขยายด้วย scale ตอนใช้)
const heart = 'M10 17s-8-5-8-10.5C2 3.5 4.2 2 6.3 2 8 2 9.3 3 10 4.3 10.7 3 12 2 13.7 2 15.8 2 18 3.5 18 6.5 18 12 10 17 10 17z';

// scale < 1 = ย่อดาวให้อยู่ในพื้นที่ปลอดภัยของไอคอน maskable (Android ตัดขอบเป็นวงกลม/สี่เหลี่ยมมน)
function appIcon({ rounded, scale = 1 }) {
  const s = (n) => 256 + (n - 256) * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="30%" r="85%">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.5" stop-color="#efe4ff"/>
      <stop offset="1" stop-color="#cdb8f0"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffeaa0"/>
      <stop offset="1" stop-color="#ffb21a"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="url(#bg)"/>
  <path d="${heart}" transform="translate(${s(78)} ${s(372)}) scale(${3.4 * scale})" fill="#ffb1d6" stroke="#2b2238" stroke-width="${1.6}" stroke-linejoin="round"/>
  <path d="${sparkle(s(412), s(128), 30 * scale)}" fill="#8b67c9"/>
  <path d="${sparkle(s(424), s(404), 16 * scale)}" fill="#f45ba8"/>
  <circle cx="${s(96)}" cy="${s(120)}" r="${9 * scale}" fill="#8b67c9"/>
  <path d="${starPath(256, s(282), 146 * scale, 68 * scale)}" fill="none" stroke="#2b2238" stroke-width="${60 * scale}" stroke-linejoin="round"/>
  <path d="${starPath(256, s(282), 146 * scale, 68 * scale)}" fill="url(#gold)" stroke="url(#gold)" stroke-width="${30 * scale}" stroke-linejoin="round"/>
  <g transform="translate(${s(252)} ${s(138)}) rotate(-14) scale(${scale})">
    <path d="M0 0L-64 -40v80zM0 0l64 -40v80z" fill="#ff8cc6" stroke="#2b2238" stroke-width="12" stroke-linejoin="round"/>
    <circle r="20" fill="#f45ba8" stroke="#2b2238" stroke-width="10"/>
  </g>
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
