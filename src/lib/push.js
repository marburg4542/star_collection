// สมัคร/ยกเลิกแจ้งเตือนเด้ง — หนึ่งเครื่องรับได้หลายบทบาท (เช่น แท็บเล็ตกลางบ้านรับของเด็กทุกคน + ผู้ปกครอง)
import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

export const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyToBytes(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

const sameTarget = (a, b) => a.role === b.role && (a.role === 'parent' || a.kidId === b.kidId);

/** target = { role: 'parent' } หรือ { role: 'kid', kidId } */
export function usePush(target, pushKey) {
  const supported = pushSupported();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = JSON.stringify(target);

  useEffect(() => {
    if (!supported) return;
    let alive = true;
    (async () => {
      const sub = await currentSubscription();
      if (!sub || Notification.permission !== 'granted') return alive && setOn(false);
      const { subscriptions } = await api.post('/api/push/status', { endpoint: sub.endpoint });
      if (alive) setOn(subscriptions.some((s) => sameTarget(s, JSON.parse(key))));
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [supported, key]);

  const toggle = useCallback(async () => {
    const t = JSON.parse(key);
    setBusy(true);
    try {
      if (on) {
        const sub = await currentSubscription();
        if (sub) await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint, ...t });
        setOn(false);
        return 'off';
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('ยังไม่ได้อนุญาตการแจ้งเตือน — เปิดได้ในการตั้งค่าเบราว์เซอร์');
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(pushKey) }));
      await api.post('/api/push/subscribe', { subscription: sub.toJSON(), ...t });
      setOn(true);
      return 'on';
    } finally {
      setBusy(false);
    }
  }, [on, key, pushKey]);

  // iPhone/iPad รับแจ้งเตือนได้เฉพาะตอนเปิดจากไอคอนบนหน้าจอโฮม
  const needsInstall = isIos && !isStandalone();
  return { supported: supported && !needsInstall, needsInstall, on, busy, toggle };
}
