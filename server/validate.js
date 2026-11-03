// ตรวจข้อมูลที่ส่งเข้ามา — ผิดเมื่อไหร่โยน HttpError ข้อความภาษาไทย ตัวจัดการ error ท้าย app.js ส่งกลับให้เอง
import { isValidPin, normalizeFamilyCode } from './auth.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const bad = (message) => new HttpError(400, message);

export function text(value, label, max = 60) {
  const s = String(value ?? '').trim();
  if (!s) throw bad(`กรุณาใส่${label}`);
  if (s.length > max) throw bad(`${label}ยาวเกิน ${max} ตัวอักษร`);
  return s;
}
export function optionalText(value, max = 120) {
  const s = String(value ?? '').trim();
  if (s.length > max) throw bad(`ข้อความยาวเกิน ${max} ตัวอักษร`);
  return s || null;
}
export function emoji(value, fallback) {
  const s = String(value ?? '').trim();
  if (!s) return fallback;
  if ([...s].length > 8) throw bad('อีโมจิยาวเกินไป');
  return s;
}
export function wholeNumber(value, label, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) throw bad(`${label}ต้องเป็นเลข 1–${max.toLocaleString('en-US')}`);
  return n;
}
export function oneOf(value, list, label) {
  if (!list.includes(value)) throw bad(`${label}ไม่ถูกต้อง`);
  return value;
}
export function familyCode(value) {
  const code = normalizeFamilyCode(value);
  if (code.length < 6) throw bad('รหัสครอบครัวต้องยาวอย่างน้อย 6 ตัวอักษร');
  if (code.length > 40) throw bad('รหัสครอบครัวยาวเกิน 40 ตัวอักษร');
  return code;
}
export function pin(value) {
  if (!isValidPin(value)) throw bad('PIN ต้องเป็นตัวเลข 4 หลัก');
  return String(value);
}
