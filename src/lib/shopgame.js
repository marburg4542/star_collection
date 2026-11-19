// ร้านค้า — ลูกค้ามาซื้อของ: ระดับ 1–2 ช่วยหยิบเงินจ่ายให้พอดี · ระดับ 3–4 ทอนเงินให้ลูกค้า
import { pick, rand } from './games.js';

/** เหรียญ/ธนบัตรที่หยิบได้ในแต่ละระดับ */
const DENOMS = {
  1: [1, 2, 5, 10],
  2: [1, 2, 5, 10, 20, 50, 100],
  3: [1, 2, 5, 10, 20, 50],
  4: [1, 2, 5, 10, 20, 50, 100, 500],
};

const ITEMS = {
  cheap: [
    ['🍭', 'อมยิ้ม'],
    ['🍬', 'ลูกอม'],
    ['🍌', 'กล้วย'],
    ['🥚', 'ไข่'],
    ['✏️', 'ดินสอ'],
    ['🍪', 'คุกกี้'],
    ['🧃', 'น้ำผลไม้'],
    ['🍡', 'ลูกชิ้น'],
  ],
  mid: [
    ['🍦', 'ไอติม'],
    ['📒', 'สมุด'],
    ['⚽', 'ลูกบอล'],
    ['🚗', 'รถของเล่น'],
    ['🖍️', 'สีเทียน'],
    ['🪁', 'ว่าว'],
    ['🧁', 'คัพเค้ก'],
    ['🍞', 'ขนมปัง'],
    ['🥛', 'นม'],
    ['🍉', 'แตงโม'],
    ['🍕', 'พิซซ่า'],
  ],
  big: [
    ['🧸', 'ตุ๊กตาหมี'],
    ['🎒', 'กระเป๋า'],
    ['👟', 'รองเท้า'],
    ['🤖', 'หุ่นยนต์'],
    ['🎲', 'เกมกระดาน'],
    ['📚', 'หนังสือ'],
    ['🧩', 'จิ๊กซอว์'],
    ['🛼', 'โรลเลอร์สเก็ต'],
  ],
};

export const CUSTOMERS = ['🐻', '🐰', '🐼', '🦊', '🐸', '🐱', '🐶', '🐯', '🐨', '🐷', '🐵', '🦁', '🐮', '🐧'];

const item = (tier, price) => {
  const [emoji, name] = pick(ITEMS[tier]);
  return { emoji, name, price };
};

/** ราคาที่ลงท้าย 0 หรือ 5 (ช่วงแรกของระดับ 4 คิดง่ายขึ้น) */
const roundish = (min, max) => Math.round(rand(min, max) / 5) * 5;

/** เงินน้อยชิ้นที่สุดที่รวมได้ amount (เหรียญ/ธนบัตรไทยใช้วิธีหยิบใบใหญ่ก่อนได้เลย) */
export function minPieces(amount, denoms) {
  let left = amount;
  let count = 0;
  for (const d of [...denoms].sort((a, b) => b - a)) {
    count += Math.floor(left / d);
    left %= d;
  }
  return left === 0 ? count : Infinity;
}

/** โจทย์ใหม่: { id, level, customer, mode: 'pay'|'change', items, paid: [ธนบัตร/เหรียญที่ลูกค้าจ่ายมา], target, denoms } */
export function makeOrder(level, n, id) {
  const ramp = Math.min(1, n / 12);
  const customer = pick(CUSTOMERS);
  const base = { id, level, customer, denoms: DENOMS[level] };
  switch (level) {
    case 1: {
      const price = rand(1, 5 + Math.round(5 * ramp));
      return { ...base, mode: 'pay', items: [item('cheap', price)], paid: [], target: price };
    }
    case 2: {
      const price = rand(11, 40 + Math.round(59 * ramp));
      return { ...base, mode: 'pay', items: [item(price <= 20 ? 'cheap' : 'mid', price)], paid: [], target: price };
    }
    case 3: {
      // ช่วงแรกทอนจากแบงก์ 20 ก่อน แล้วค่อยขยับเป็น 50 / 100
      const price = ramp < 0.3 ? rand(1, 19) : rand(5, 99);
      const notes = [10, 20, 50, 100].filter((v) => v > price);
      const paid = Math.random() < 0.75 || notes.length === 1 ? notes[0] : notes[1];
      return { ...base, mode: 'change', items: [item(price <= 10 ? 'cheap' : 'mid', price)], paid: [paid], target: paid - price };
    }
    default: {
      const count = ramp > 0.5 && Math.random() < 0.5 ? 3 : 2;
      let items;
      let total;
      do {
        items = Array.from({ length: count }, (_, i) => {
          const tier = i === 0 && Math.random() < 0.6 ? 'big' : 'mid';
          const price = tier === 'big' ? (ramp < 0.5 ? roundish(100, 350) : rand(99, 350)) : ramp < 0.5 ? roundish(10, 90) : rand(10, 95);
          return item(tier, price);
        });
        total = items.reduce((sum, it) => sum + it.price, 0);
      } while (total >= 1000);
      // จ่ายด้วยแบงก์ใบใหญ่ใบเดียว หรือแบงก์ร้อยหลายใบให้เกินนิดหน่อย
      const hundreds = Math.ceil((total + 1) / 100);
      const big = [500, 1000].find((v) => v > total);
      const paid = hundreds <= 9 && Math.random() < 0.4 ? Array(hundreds).fill(100) : [big];
      const sum = paid.reduce((a, b) => a + b, 0);
      return { ...base, mode: 'change', items, paid, target: sum - total };
    }
  }
}
