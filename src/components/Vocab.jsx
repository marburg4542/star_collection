// ส่วนประกอบเกมคำศัพท์ที่ใช้ทั้งหน้าผู้ปกครองและหน้าเด็ก
import { imageUrl } from '../lib/vocab.js';

/** รูปของคำ: รูปที่อัปโหลด → อีโมจิ → 🔤 · hideName = ไม่บอกคำใน alt (ตอนพิมพ์สะกดในภารกิจ) */
export function WordPicture({ word, size = 48, hideName = false, className = '' }) {
  const box = { width: size, height: size };
  if (word.image) {
    return (
      <img
        src={imageUrl(word.image)}
        alt={hideName ? 'รูปของคำศัพท์' : word.word}
        style={box}
        className={`shrink-0 rounded-2xl bg-sunken object-cover ${className}`}
        loading="lazy"
        draggable={false}
      />
    );
  }
  return (
    <span
      style={{ ...box, fontSize: size * 0.62 }}
      className={`grid shrink-0 place-items-center rounded-2xl bg-sunken leading-none ${className}`}
      aria-hidden="true"
    >
      {word.emoji || '🔤'}
    </span>
  );
}
