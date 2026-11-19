// เกมท่องคำศัพท์ — โหลดชุดคำ, วันที่ของสัปดาห์, เสียงอ่าน (ใช้เสียงของเครื่อง ไม่ต้องต่อเน็ตเพิ่ม), ย่อรูปก่อนอัปโหลด
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useStore } from './store.jsx';
import { dayKey } from './format.js';

/** ชุดคำศัพท์ทั้งหมดของครอบครัว — โหลดใหม่ทุกครั้งที่ข้อมูลเปลี่ยน */
export function useVocab() {
  const { changeTick } = useStore();
  const [state, setState] = useState({ sets: [], loaded: false });
  useEffect(() => {
    let alive = true;
    api
      .get('/api/vocab')
      .then((r) => alive && setState({ sets: r.sets, loaded: true }))
      .catch(() => alive && setState((s) => ({ ...s, loaded: true })));
    return () => {
      alive = false;
    };
  }, [changeTick]);
  return state;
}

export const imageUrl = (name) => `/api/vocab/images/${name}`;

// ---------- วันที่ (เวลาไทย) ----------
export const todayKey = () => dayKey(new Date().toISOString());
const keyToDate = (key) => new Date(`${key}T12:00:00Z`);
export const addDays = (key, n) => new Date(keyToDate(key).getTime() + n * 864e5).toISOString().slice(0, 10);
/** วันจันทร์ของสัปดาห์ที่มีวันนี้ */
export function mondayOf(key = todayKey()) {
  const day = keyToDate(key).getUTCDay(); // 0 = อาทิตย์
  return addDays(key, -((day + 6) % 7));
}
const dm = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const d = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', day: 'numeric' });
/** "16–22 พ.ย." หรือ "30 พ.ย. – 6 ธ.ค." */
export function weekLabel(start) {
  const end = addDays(start, 6);
  const a = keyToDate(start);
  const b = keyToDate(end);
  return a.getUTCMonth() === b.getUTCMonth() ? `${d.format(a)}–${dm.format(b)}` : `${dm.format(a)} – ${dm.format(b)}`;
}
/** 'upcoming' | 'current' | 'past' */
export function weekStatus(start, today = todayKey()) {
  if (today < start) return 'upcoming';
  if (today < addDays(start, 7)) return 'current';
  return 'past';
}
export const WEEK_STATUS = {
  upcoming: { label: 'ยังไม่ถึง', cls: 'text-mute' },
  current: { label: 'สัปดาห์นี้', cls: 'text-purple-600' },
  past: { label: 'ผ่านไปแล้ว', cls: 'text-mute' },
};

// ---------- คำ ----------
export const passCount = (set) => Math.ceil((set.passPct * set.words.length) / 100);

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- เสียงอ่าน ----------
export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
function englishVoice() {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === 'en-US') ?? voices.find((v) => v.lang?.startsWith('en'));
}
export function speak(text, rate = 0.8) {
  if (!canSpeak || !text) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = rate;
  const voice = englishVoice();
  if (voice) u.voice = voice;
  synth.speak(u);
}

// ---------- รูป ----------
/** ย่อรูปจากกล้อง/คลังภาพให้ด้านยาวไม่เกิน max px แล้วแปลงเป็น JPEG (รูปจากมือถือหลาย MB → ราว 100 KB) */
export async function shrinkImage(file, max = 800) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('เปิดรูปนี้ไม่ได้ ลองเลือกรูปอื่น'));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // รูปโปร่งใส → พื้นขาว
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('ย่อรูปไม่สำเร็จ ลองรูปอื่น'))), 'image/jpeg', 0.82),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
