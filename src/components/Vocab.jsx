// ส่วนประกอบเกมคำศัพท์ที่ใช้ทั้งหน้าผู้ปกครองและหน้าเด็ก
import { imageUrl, letters } from '../lib/vocab.js';

/** รูปของคำ: รูปที่อัปโหลด → อีโมจิ → 🔤 · hideName = ไม่บอกคำใน alt (ตอนสอบสะกด) */
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

/** ตัวอักษรแยกทีละตัว: A P P L E */
export function Spelling({ word, size = 'md' }) {
  const big = size === 'md';
  return (
    <span className="flex flex-wrap justify-center gap-1" lang="en" aria-label={`สะกดว่า ${letters(word).join(' ')}`}>
      {letters(word).map((c, i) =>
        c === ' ' ? (
          <span key={i} className="w-3" />
        ) : (
          <span
            key={i}
            aria-hidden="true"
            className={`grid place-items-center rounded-xl bg-purple-300/30 font-bold text-purple-600 ${big ? 'h-10 min-w-9 px-1.5 text-xl' : 'h-7 min-w-6 px-1 text-[15px]'}`}
          >
            {c}
          </span>
        ),
      )}
    </span>
  );
}
