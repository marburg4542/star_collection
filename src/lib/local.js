// localStorage สำหรับของเล็กๆ ประจำเครื่อง (แท็บที่เลือกไว้, ดาวที่เห็นแล้ว) — ใช้ไม่ได้ก็แค่ไม่จำ
import { useCallback, useState } from 'react';

export const local = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* โหมดส่วนตัว/พื้นที่เต็ม */
    }
  },
};

export function useLocalState(key, initial) {
  const [value, setValue] = useState(() => local.get(key, initial));
  const set = useCallback(
    (next) => {
      setValue(next);
      local.set(key, next);
    },
    [key],
  );
  return [value, set];
}
