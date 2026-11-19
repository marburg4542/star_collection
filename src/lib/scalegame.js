// ตาชั่งตัวเลข — สร้างโจทย์ "หาเลขที่หายไป" ให้สองฝั่งเท่ากัน
// ฝั่งหนึ่งของตาชั่ง = { n } (ตัวเลขเดียว) หรือ { a, op, b } โดย a หรือ b เป็น null = ช่องว่าง (?)
import { nearWrong, pick, rand, shuffle } from './games.js';

const OPS = { '+': (a, b) => a + b, '−': (a, b) => a - b, '×': (a, b) => a * b, '÷': (a, b) => a / b };

export const hasBlank = (side) => !('n' in side) && (side.a === null || side.b === null);

/** ค่าของฝั่งนี้ เมื่อใส่ x ลงในช่องว่าง */
export function sideValue(side, x) {
  if ('n' in side) return side.n;
  return OPS[side.op](side.a ?? x, side.b ?? x);
}

/** ฝั่งที่มีช่องว่าง: วางช่องว่างหน้าหรือหลังเครื่องหมาย (สลับได้เฉพาะ + กับ ×) */
const blankAt = (known, op, front) => (front ? { a: null, op, b: known } : { a: known, op, b: null });

function equation(blankSide, otherSide, answer) {
  const blankLeft = Math.random() < 0.6;
  return { left: blankLeft ? blankSide : otherSide, right: blankLeft ? otherSide : blankSide, answer };
}

function core(level, n) {
  const ramp = Math.min(1, n / 15);
  const table = 7 + Math.round(5 * Math.min(1, n / 12));
  switch (level) {
    case 1: {
      const c = rand(3, 6 + Math.round(4 * ramp));
      const x = rand(1, c - 1);
      return equation(blankAt(c - x, '+', Math.random() < 0.4), { n: c }, x);
    }
    case 2:
    case 3: {
      const big = level === 3;
      const low = big ? 20 : 4;
      const top = big ? 40 + Math.round(59 * ramp) : 12 + Math.round(8 * ramp);
      const r = Math.random();
      if (r < 0.4) {
        const c = rand(low + 1, top);
        const x = rand(1, c - 1);
        return equation(blankAt(c - x, '+', Math.random() < 0.4), { n: c }, x);
      }
      if (r < 0.7) {
        const x = rand(low, top);
        const b = rand(1, x - 1);
        return equation({ a: null, op: '−', b }, { n: x - b }, x);
      }
      const a = rand(low, top);
      const x = rand(1, a - 1);
      return equation({ a, op: '−', b: null }, { n: a - x }, x);
    }
    case 4: {
      const a = rand(2, table);
      const x = rand(2, table);
      return equation(blankAt(a, '×', Math.random() < 0.4), { n: a * x }, x);
    }
    case 5: {
      const d = rand(2, table);
      const q = rand(2, table);
      return Math.random() < 0.5 ? equation({ a: null, op: '÷', b: d }, { n: q }, d * q) : equation({ a: d * q, op: '÷', b: null }, { n: q }, d);
    }
    default: {
      // สองฝั่งมีโจทย์: ฝั่งหนึ่งคิดได้เลย อีกฝั่งมีช่องว่าง
      let known;
      if (Math.random() < 0.5) {
        const a = rand(2, 5 + Math.round(4 * ramp));
        known = { a, op: '×', b: rand(2, 5 + Math.round(4 * ramp)) };
      } else {
        known = { a: rand(3, 9 + Math.round(9 * ramp)), op: '+', b: rand(2, 9 + Math.round(3 * ramp)) };
      }
      const v = sideValue(known);
      const r = Math.random();
      const factors = [2, 3, 4, 5, 6, 7, 8, 9].filter((f) => v % f === 0 && v / f >= 2 && v / f <= 12);
      if (r < 0.2 && factors.length) {
        const f = pick(factors);
        return equation(blankAt(f, '×', false), known, v / f);
      }
      if (r < 0.55) {
        const p = rand(1, 9);
        return equation({ a: null, op: '−', b: p }, known, v + p);
      }
      const p = rand(1, v - 1);
      return equation(blankAt(p, '+', Math.random() < 0.3), known, v - p);
    }
  }
}

/** โจทย์ใหม่: สุ่มระดับจากที่ผู้ปกครองเลือก · ลูกตุ้มให้เลือก 4 ลูก (ถูก 1) */
export function makePuzzle(levels, n, id) {
  const level = pick(levels);
  const p = core(level, n);
  const side = hasBlank(p.left) ? p.left : p.right;
  const extra = side.op === '×' ? [p.answer + 1, p.answer * 2] : side.op === '÷' ? [p.answer * 2] : [];
  const options = shuffle([p.answer, ...nearWrong(p.answer, { extra, min: 1 })]);
  return { ...p, id, level, options };
}

/** เอียงกี่องศา (+ = ฝั่งขวาลง) เมื่อใส่ x — ต่างกันมากก็เอียงมาก แต่ไม่เกิน 14° */
export function tiltFor(puzzle, x) {
  const diff = sideValue(puzzle.right, x) - sideValue(puzzle.left, x);
  if (diff === 0) return 0;
  const scale = Math.max(1, Math.abs(sideValue(hasBlank(puzzle.left) ? puzzle.right : puzzle.left, x)));
  return Math.sign(diff) * Math.min(14, 6 + (Math.abs(diff) / scale) * 16);
}
