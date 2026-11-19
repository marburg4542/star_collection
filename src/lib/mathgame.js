// ป๊อปลูกโป่ง — สร้างโจทย์ตามระดับ + ตัวเลือกหลอก (ระดับ/เสียง/สุ่มอยู่ใน games.js)
import { nearWrong, rand } from './games.js';

export const ROUND_MS = 60_000;
export const BALLOON_COLORS = ['#ff8fbd', '#6cc8ff', '#5fe3b5', '#ffe27a', '#b9a7ff', '#ffb57d'];

/** n = ตอบถูกไปแล้วกี่ข้อในรอบนี้ — ยิ่งเล่นไป เลขยิ่งใหญ่ขึ้นนิดหน่อย */
export function makeQuestion(level, n = 0) {
  const ramp = Math.min(1, n / 20); // 0 → 1 ภายใน 20 ข้อ
  // สูตรคูณ/หาร: เริ่มจากแม่เล็กๆ ก่อน แล้วขยายจนครบแม่ 12 ภายใน 12 ข้อ
  const table = 7 + Math.round(5 * Math.min(1, n / 12));
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
      const a = rand(2, table);
      const b = rand(2, table);
      // คำตอบหลอก: คูณผิดแถว (บวก/ลบตัวคูณไปหนึ่งแถว)
      return { text: `${a} × ${b}`, answer: a * b, extra: [a * b + a, a * b - a, a * b + b, a * b - b] };
    }
    default: {
      const d = rand(2, table);
      const q = rand(2, table);
      return { text: `${d * q} ÷ ${d}`, answer: q, extra: [d] };
    }
  }
}

/** คำตอบหลอก 3 ตัว */
export const wrongAnswers = (q) => nearWrong(q.answer, { extra: q.extra ?? [] });
