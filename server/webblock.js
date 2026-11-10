// รายการเว็บและคำค้นที่บล็อคบนมือถือลูก (ใช้กับทุกเครื่องในครอบครัว)
// แอปล็อคจอ 2.5+ อ่านช่องที่อยู่เว็บในเบราว์เซอร์และช่องค้นหาของ YouTube ผ่านการช่วยเหลือพิเศษ
// ตรงกับรายการ → ปิดหน้านั้น แล้วแจ้งผู้ปกครอง · กันได้ส่วนใหญ่ ไม่ใช่ 100%
import { getSetting, setSetting } from './db.js';
import { bad } from './validate.js';

const KEY = 'web_block';
const MAX_SITES = 500;
const MAX_WORDS = 300;

// รายการเริ่มต้น — ผู้ปกครองลบหรือเพิ่มเองได้บนเว็บ
export const STARTER_SITES = [
  'pornhub.com',
  'xvideos.com',
  'xnxx.com',
  'xhamster.com',
  'redtube.com',
  'youporn.com',
  'spankbang.com',
  'eporner.com',
  'beeg.com',
  'tube8.com',
  'porn.com',
  'youjizz.com',
  'chaturbate.com',
  'stripchat.com',
  'onlyfans.com',
  'rule34.xxx',
  'nhentai.net',
  'missav.com',
  'ufabet.com',
  'sbobet.com',
];

// คำภาษาอังกฤษสั้นๆ (ไม่เกิน 3 ตัว) แอปเทียบทั้งคำ กันไปโดนคำอื่น เช่น "sex" ไม่บล็อค "sussex"
// คำไทยไม่มีช่องว่างแบ่งคำ แอปเทียบแบบ "มีคำนี้อยู่ในข้อความ" — จึงใส่เป็นวลีที่ชัดเจน ไม่ใส่คำสั้นที่ไปซ้อนในคำอื่นได้
export const STARTER_WORDS = [
  'porn',
  'xxx',
  'sex',
  'nsfw',
  'hentai',
  'nude',
  'nudes',
  'naked',
  'onlyfans',
  'xvideos',
  'pornhub',
  'หนังโป๊',
  'คลิปโป๊',
  'รูปโป๊',
  'ภาพโป๊',
  'คลิปหลุด',
  'หนังผู้ใหญ่',
  'เย็ด',
  'บาคาร่า',
  'แทงบอล',
  'เว็บพนัน',
  'พนันออนไลน์',
  'คาสิโนออนไลน์',
  'สล็อตออนไลน์',
  'ufabet',
  'sbobet',
];

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** "https://www.Example.com/path?x" → "example.com" · ไม่ใช่ชื่อเว็บ → null */
export function normalizeSite(value) {
  let s = String(value ?? '').trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
  return HOST.test(s) && s.length <= 253 ? s : null;
}

export function normalizeWord(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[​-‍﻿]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** รายการปัจจุบัน — ยังไม่เคยตั้ง = รายการเริ่มต้น เปิดใช้อยู่ */
export function getWebBlock(db) {
  const saved = getSetting(db, KEY);
  if (!saved) return { enabled: true, sites: [...STARTER_SITES], words: [...STARTER_WORDS] };
  try {
    const v = JSON.parse(saved);
    return { enabled: v.enabled !== false, sites: v.sites ?? [], words: v.words ?? [] };
  } catch {
    return { enabled: true, sites: [...STARTER_SITES], words: [...STARTER_WORDS] };
  }
}

/** ตรวจและจัดรูปจากหน้าเว็บผู้ปกครอง — ชื่อเว็บผิดรูปแบบแจ้งกลับ ไม่ทิ้งเงียบๆ */
export function readWebBlock(body) {
  const b = body ?? {};
  if (!Array.isArray(b.sites) || !Array.isArray(b.words)) throw bad('รายการบล็อคไม่ถูกต้อง');
  const sites = [];
  for (const raw of b.sites) {
    const site = normalizeSite(raw);
    if (!site) throw bad(`“${String(raw).slice(0, 60)}” ไม่ใช่ชื่อเว็บ (ตัวอย่าง: example.com)`);
    if (!sites.includes(site)) sites.push(site);
  }
  const words = [];
  for (const raw of b.words) {
    const word = normalizeWord(raw);
    if (!word) continue;
    if (word.length > 40) throw bad('คำที่บล็อคยาวได้ไม่เกิน 40 ตัวอักษร');
    if (!words.includes(word)) words.push(word);
  }
  if (sites.length > MAX_SITES) throw bad(`บล็อคเว็บได้ไม่เกิน ${MAX_SITES} รายการ`);
  if (words.length > MAX_WORDS) throw bad(`บล็อคคำได้ไม่เกิน ${MAX_WORDS} คำ`);
  return { enabled: b.enabled !== false, sites, words };
}

export function saveWebBlock(db, value) {
  setSetting(db, KEY, JSON.stringify(value));
}
