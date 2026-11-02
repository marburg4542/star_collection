// ข้อมูลกลางของแอป: สถานะการเข้าใช้, ข้อมูลครอบครัว (/api/state) และการฟังเหตุการณ์สดจากเซิร์ฟเวอร์
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getParentToken, onAuthLost, setParentToken } from './api.js';

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [status, setStatus] = useState(null); // { setup, device } | { error }
  const [data, setData] = useState(null);
  const [parentToken, setParentTokenState] = useState(getParentToken());
  const [changeTick, setChangeTick] = useState(0); // เพิ่มขึ้นทุกครั้งที่ข้อมูลเปลี่ยน — หน้าประวัติใช้โหลดใหม่
  const [online, setOnline] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api.get('/api/status'));
      setOnline(true);
    } catch (err) {
      setStatus((s) => s ?? { error: err.message });
      setOnline(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      setData(await api.get('/api/state'));
      setChangeTick((t) => t + 1);
      setOnline(true);
    } catch (err) {
      if (err.code === 'offline') setOnline(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(
    () =>
      onAuthLost((code) => {
        if (code === 'device') {
          setData(null);
          setStatus((s) => ({ ...s, device: false }));
        } else setParentTokenState('');
      }),
    [],
  );

  const authorized = !!status?.device;

  // ฟังการเปลี่ยนแปลงสดๆ — หลุดแล้วต่อใหม่เอง, กลับมาเปิดแอปก็โหลดใหม่
  useEffect(() => {
    if (!authorized) return;
    refresh();
    let es;
    let retry;
    let closed = false;
    const connect = () => {
      es = new EventSource('/api/events');
      es.onopen = () => refresh();
      es.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'family-code') loadStatus();
        refresh();
      };
      es.onerror = () => {
        // ถูกปฏิเสธ (เช่น รหัสครอบครัวเปลี่ยน) เบราว์เซอร์จะไม่ต่อใหม่เอง — เช็กสถานะแล้วลองใหม่
        if (es.readyState === EventSource.CLOSED && !closed) {
          retry = setTimeout(() => {
            loadStatus();
            connect();
          }, 5000);
        }
      };
    };
    connect();
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', refresh);
    return () => {
      closed = true;
      clearTimeout(retry);
      es?.close();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', refresh);
    };
  }, [authorized, refresh, loadStatus]);

  const enterParent = useCallback((token) => {
    setParentToken(token);
    setParentTokenState(token);
  }, []);

  const exitParent = useCallback(async () => {
    const token = getParentToken();
    setParentToken('');
    setParentTokenState('');
    if (token) await api.post('/api/parent/logout').catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      status,
      data,
      online,
      changeTick,
      isParent: !!parentToken,
      refresh,
      loadStatus,
      enterParent,
      exitParent,
      kidById: (id) => data?.kids.find((k) => k.id === Number(id)),
    }),
    [status, data, online, changeTick, parentToken, refresh, loadStatus, enterParent, exitParent],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);
