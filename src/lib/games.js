// มินิเกม (ใช้ร่วมกันทุกเกม): ข้อมูลเกม/ระดับ, โหลดตั้งค่า+สถิติ, กติกาดาว, ตัวช่วยสุ่ม, เสียงเอฟเฟกต์
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useStore } from './store.jsx';
import { local } from './local.js';
import { KID_COLORS } from './constants.js';

export const HEARTS = 3;

const MATH_LEVELS = {
  1: { emoji: '🌱', label: 'บวกเลขไม่เกิน 10', example: '3 + 4' },
  2: { emoji: '🌿', label: 'บวกลบไม่เกิน 20', example: '15 − 7' },
  3: { emoji: '🌳', label: 'บวกลบไม่เกิน 100', example: '48 + 27' },
  4: { emoji: '✖️', label: 'สูตรคูณแม่ 2–12', example: '7 × 8' },
  5: { emoji: '➗', label: 'หารแม่ 2–12', example: '56 ÷ 7' },
};

/** ลำดับเกมในหน้ามินิเกม — key ตรงกับฝั่งเซิร์ฟเวอร์ (server/games.js) */
export const GAME_KEYS = ['math', 'scale', 'shop'];

export const GAMES = {
  math: {
    title: 'ป๊อปลูกโป่ง',
    short: 'ลูกโป่ง',
    emoji: '🎈',
    color: KID_COLORS.sky.hex,
    sub: 'เกมคิดเลขเร็ว · รอบละ 60 วินาที',
    hint: 'รอบละ 60 วินาที เล่นคล่องๆ ตอบได้ราว 15–25 ข้อ',
    levels: MATH_LEVELS,
  },
  scale: {
    title: 'ตาชั่งตัวเลข',
    short: 'ตาชั่ง',
    emoji: '⚖️',
    color: KID_COLORS.mint.hex,
    sub: 'หาเลขที่หายไป ให้ตาชั่งเท่ากันพอดี',
    hint: 'ไม่จับเวลา เล่นจนพลาดครบ 3 ครั้ง หรือกดจบเอง',
    levels: {
      1: { ...MATH_LEVELS[1], example: '3 + ? = 7' },
      2: { ...MATH_LEVELS[2], example: '? − 5 = 8' },
      3: { ...MATH_LEVELS[3], example: '45 + ? = 72' },
      4: { ...MATH_LEVELS[4], example: '6 × ? = 42' },
      5: { ...MATH_LEVELS[5], example: '? ÷ 4 = 9' },
      6: { emoji: '⚖️', label: 'สองฝั่งมีโจทย์', example: '3 × 4 = 5 + ?' },
    },
  },
  shop: {
    title: 'ร้านค้า',
    short: 'ร้านค้า',
    emoji: '🏪',
    color: KID_COLORS.peach.hex,
    sub: 'นับเงิน จ่ายเงิน ทอนเงิน',
    hint: 'ไม่จับเวลา เล่นจนพลาดครบ 3 ครั้ง หรือกดจบเอง',
    levels: {
      1: { emoji: '🪙', label: 'จ่ายพอดีด้วยเหรียญ ไม่เกิน 10 บาท', example: 'ขนม 7 บาท' },
      2: { emoji: '💵', label: 'จ่ายพอดี ไม่เกิน 100 บาท', example: 'ของเล่น 85 บาท' },
      3: { emoji: '🔁', label: 'ทอนเงิน ไม่เกิน 100 บาท', example: 'ราคา 37 จ่าย 50 ทอนเท่าไหร่' },
      4: { emoji: '🛒', label: 'ซื้อหลายชิ้น รวมราคาแล้วทอน', example: '120 + 45 จ่าย 500' },
    },
  },
};

/** มินิเกมของทุกเด็ก: { [kidId]: { dailyStars, todayStars, math, scale, shop } } — โหลดใหม่ทุกครั้งที่ข้อมูลเปลี่ยน */
export function useGames() {
  const { changeTick } = useStore();
  const [state, setState] = useState({ kids: {}, loaded: false });
  useEffect(() => {
    let alive = true;
    api
      .get('/api/games')
      .then((r) => alive && setState({ kids: r.kids, loaded: true }))
      .catch(() => alive && setState((s) => ({ ...s, loaded: true })));
    return () => {
      alive = false;
    };
  }, [changeTick]);
  return state;
}

/** ดาวที่ยังได้จากมินิเกมวันนี้ (เพดานรวมทุกเกม) */
export const starsLeftToday = (kg) => Math.max(0, (kg?.dailyStars ?? 0) - (kg?.todayStars ?? 0));

/** ตอบถูก correct ข้อในรอบเดียว → ได้กี่ดาว (ไม่เกินที่เหลือวันนี้) */
export const starsFor = (correct, g, left) => Math.min(Math.floor(correct / g.every) * g.stars, left);

/** ตอบถูกติดกันทุก 3 ข้อ คะแนนคูณเพิ่ม (สูงสุด x5) */
export const multiplier = (streak) => Math.min(5, 1 + Math.floor(streak / 3));

// ---------- สุ่ม ----------
export const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** คำตอบหลอกใกล้ๆ คำตอบจริง (±1..3, ±10 สำหรับเลขสองหลัก + extra) ไม่ต่ำกว่า min ไม่ซ้ำ */
export function nearWrong(answer, { count = 3, extra = [], min = 0 } = {}) {
  const near = [answer + 1, answer - 1, answer + 2, answer - 2, answer + 3, answer - 3, ...extra];
  if (answer >= 10) near.push(answer + 10, answer - 10); // ทดผิดหลักสิบ
  const pool = [...new Set(near.filter((v) => Number.isInteger(v) && v >= min && v !== answer))];
  const out = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  let more = answer + 4;
  while (out.length < count) {
    if (!out.includes(more) && more !== answer) out.push(more);
    more++;
  }
  return out;
}

// ---------- เสียง (สังเคราะห์ในเครื่อง ไม่ต้องโหลดไฟล์) ----------
let audio = null;
const MUTE_KEY = 'games:mute';
export const isMuted = () => local.get(MUTE_KEY) === true;
export const setMuted = (v) => local.set(MUTE_KEY, !!v);

/** เรียกครั้งแรกจากการแตะ (เบราว์เซอร์ไม่ให้เปิดเสียงเองก่อนผู้ใช้แตะ) */
export function unlockAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch {
    audio = null;
  }
}

function tone(freq, endFreq, ms, type = 'sine', gain = 0.12, delay = 0) {
  if (!audio || isMuted()) return;
  const t = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(endFreq, t + ms / 1000);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
  osc.connect(g).connect(audio.destination);
  osc.start(t);
  osc.stop(t + ms / 1000 + 0.02);
}

export const sfx = {
  pop: (combo = 1) => tone(500 + combo * 90, 1300 + combo * 120, 110, 'triangle', 0.16),
  wrong: () => tone(220, 120, 260, 'square', 0.06),
  miss: () => tone(400, 180, 300, 'sine', 0.08),
  tick: () => tone(880, 880, 60, 'sine', 0.05),
  go: () => tone(660, 1320, 220, 'triangle', 0.12),
  coin: () => tone(1400, 1900, 70, 'triangle', 0.08),
  clunk: () => tone(160, 90, 180, 'sine', 0.18),
  cash: () => {
    tone(1568, 1568, 90, 'triangle', 0.1);
    tone(2093, 2093, 220, 'triangle', 0.1, 0.09);
  },
  star: () => {
    tone(784, 784, 90, 'triangle', 0.1);
    tone(1047, 1047, 90, 'triangle', 0.1, 0.09);
    tone(1568, 1568, 240, 'triangle', 0.1, 0.18);
  },
  end: () => {
    tone(523, 523, 150, 'triangle', 0.1);
    tone(784, 784, 260, 'triangle', 0.1, 0.16);
  },
};
