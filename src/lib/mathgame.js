// มินิเกมป๊อปลูกโป่ง — ระดับ, สร้างโจทย์ + ตัวเลือกหลอก, เสียงเอฟเฟกต์, โหลดข้อมูลเกม
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useStore } from './store.jsx';
import { local } from './local.js';

export const ROUND_MS = 60_000;
export const HEARTS = 3;

export const LEVELS = {
  1: { emoji: '🌱', label: 'บวกเลขไม่เกิน 10', example: '3 + 4' },
  2: { emoji: '🌿', label: 'บวกลบไม่เกิน 20', example: '15 − 7' },
  3: { emoji: '🌳', label: 'บวกลบไม่เกิน 100', example: '48 + 27' },
  4: { emoji: '✖️', label: 'สูตรคูณแม่ 2–5', example: '4 × 6' },
  5: { emoji: '🚀', label: 'คูณหาร แม่ 2–12', example: '56 ÷ 7' },
};

/** ข้อมูลมินิเกมของทุกเด็ก (ตั้งค่า + สถิติ) — โหลดใหม่ทุกครั้งที่ข้อมูลเปลี่ยน */
export function useGames() {
  const { changeTick } = useStore();
  const [state, setState] = useState({ math: {}, loaded: false });
  useEffect(() => {
    let alive = true;
    api
      .get('/api/games')
      .then((r) => alive && setState({ math: r.math, loaded: true }))
      .catch(() => alive && setState((s) => ({ ...s, loaded: true })));
    return () => {
      alive = false;
    };
  }, [changeTick]);
  return state;
}

// ---------- โจทย์ ----------
const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** n = ตอบถูกไปแล้วกี่ข้อในรอบนี้ — ยิ่งเล่นไป เลขยิ่งใหญ่ขึ้นนิดหน่อย */
export function makeQuestion(level, n = 0) {
  const ramp = Math.min(1, n / 20); // 0 → 1 ภายใน 20 ข้อ
  switch (level) {
    case 1: {
      const top = 5 + Math.round(5 * ramp);
      const a = rand(0, top - 1);
      const b = rand(1, top - a);
      return { text: `${a} + ${b}`, answer: a + b };
    }
    case 2: {
      const top = 12 + Math.round(8 * ramp);
      if (Math.random() < 0.5) {
        const a = rand(1, top - 1);
        const b = rand(1, top - a);
        return { text: `${a} + ${b}`, answer: a + b };
      }
      const a = rand(3, top);
      const b = rand(1, a);
      return { text: `${a} − ${b}`, answer: a - b };
    }
    case 3: {
      // ช่วงแรกเลขกลมๆ ไม่ต้องทด แล้วค่อยปนเลขที่ต้องทด
      const round = Math.random() > ramp;
      if (Math.random() < 0.5) {
        const a = round ? rand(1, 8) * 10 : rand(10, 89);
        const b = round ? rand(1, 9 - a / 10) * 10 : rand(5, 99 - a);
        return { text: `${a} + ${b}`, answer: a + b };
      }
      const a = round ? rand(2, 9) * 10 : rand(20, 99);
      const b = round ? rand(1, a / 10 - 1) * 10 : rand(5, a - 1);
      return { text: `${a} − ${b}`, answer: a - b };
    }
    case 4: {
      const a = rand(2, 5);
      const b = rand(1, 5 + Math.round(5 * ramp));
      return Math.random() < 0.5 ? { text: `${a} × ${b}`, answer: a * b } : { text: `${b} × ${a}`, answer: a * b };
    }
    default: {
      const a = rand(2, 6 + Math.round(6 * ramp));
      const b = rand(2, 12);
      if (Math.random() < 0.5) return { text: `${a} × ${b}`, answer: a * b };
      return { text: `${a * b} ÷ ${a}`, answer: b };
    }
  }
}

/** คำตอบหลอก 3 ตัว — ใกล้คำตอบจริง (±1, ±2, ±10, คูณผิดแถว) ไม่ติดลบ ไม่ซ้ำ */
export function wrongAnswers(q, count = 3) {
  const x = q.answer;
  const near = [x + 1, x - 1, x + 2, x - 2, x + 3, x - 3];
  if (x >= 10) near.push(x + 10, x - 10); // ทดผิดหลักสิบ — ใช้กับเลขสองหลักขึ้นไป
  const factors = /×/.test(q.text) ? q.text.split('×').map((s) => parseInt(s, 10)) : null;
  if (factors) near.push(x + factors[0], x - factors[0], x + factors[1], x - factors[1]);
  const pool = [...new Set(near.filter((v) => v >= 0 && v !== x))];
  const out = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  let extra = x + 4;
  while (out.length < count) {
    if (!out.includes(extra) && extra !== x) out.push(extra);
    extra++;
  }
  return out;
}

export const BALLOON_COLORS = ['#ff8fbd', '#6cc8ff', '#5fe3b5', '#ffe27a', '#b9a7ff', '#ffb57d'];
export { pick };

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

function tone(freq, endFreq, ms, type = 'sine', gain = 0.12) {
  if (!audio || isMuted()) return;
  const t = audio.currentTime;
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
  end: () => {
    tone(523, 523, 150, 'triangle', 0.1);
    setTimeout(() => tone(784, 784, 260, 'triangle', 0.1), 160);
  },
};
