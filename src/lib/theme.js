// ธีมของแอป เลือกแยกแต่ละเครื่อง (เก็บในเบราว์เซอร์) — public/theme-init.js ใส่ธีมก่อนหน้าเว็บวาด จอจะได้ไม่กะพริบ
// มินิมอลมีโหมดสว่าง/มืด/ตามเครื่อง · data-theme = ธีม, data-mode = โหมดที่ใช้จริงตอนนี้ (light/dark)
import { useState } from 'react';

const THEME_KEY = 'stars-theme';
const MODE_KEY = 'stars-mode';
const BAR = { default: '#fcf8ff', light: '#fafafa', dark: '#0f0f0f' };

export const THEMES = [
  { value: 'default', label: '🌸 น่ารัก' },
  { value: 'minimal', label: 'มินิมอล' },
];
export const MODES = [
  { value: 'light', label: 'สว่าง' },
  { value: 'dark', label: 'มืด' },
  { value: 'system', label: 'ตามเครื่อง' },
];

function load(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // เบราว์เซอร์ไม่ให้เก็บ — ใช้ได้จนกว่าจะปิดหน้านี้
  }
}

const readTheme = () => (load(THEME_KEY) === 'minimal' ? 'minimal' : 'default');
const readMode = () => (['light', 'dark'].includes(load(MODE_KEY)) ? load(MODE_KEY) : 'system');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

function apply() {
  const root = document.documentElement;
  const theme = readTheme();
  const mode = readMode();
  const actual = mode === 'system' ? (systemDark.matches ? 'dark' : 'light') : mode;
  if (theme === 'minimal') {
    root.dataset.theme = 'minimal';
    root.dataset.mode = actual;
  } else {
    delete root.dataset.theme;
    delete root.dataset.mode;
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[theme === 'minimal' ? actual : 'default']);
  window.dispatchEvent(new Event('stars-theme'));
}

// เครื่องสลับโหมดมืดเอง (เช่น ตั้งเวลาไว้) → เปลี่ยนตามทันทีถ้าเลือก "ตามเครื่อง"
systemDark.addEventListener('change', apply);

export function useTheme() {
  const [theme, setThemeState] = useState(readTheme);
  const [mode, setModeState] = useState(readMode);
  return {
    theme,
    mode,
    setTheme(value) {
      save(THEME_KEY, value);
      apply();
      setThemeState(value);
    },
    setMode(value) {
      save(MODE_KEY, value);
      apply();
      setModeState(value);
    },
  };
}
