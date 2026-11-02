import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useStore } from './store.jsx';

const PAGE = 30;
const urlFor = (kidId, before) => `/api/history?limit=${PAGE}${kidId ? `&kid=${kidId}` : ''}${before ? `&before=${before}` : ''}`;

/** ประวัติดาว (ของเด็กคนเดียว หรือทุกคนถ้าไม่ระบุ) — โหลดหน้าแรกใหม่ทุกครั้งที่ข้อมูลเปลี่ยน */
export function useHistory(kidId) {
  const { changeTick } = useStore();
  const [state, setState] = useState({ items: [], more: false, loaded: false, forKid: kidId });
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get(urlFor(kidId))
      .then((r) => alive && setState({ items: r.items, more: r.more, loaded: true, forKid: kidId }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [kidId, changeTick]);

  const loadMore = useCallback(async () => {
    const last = state.items.at(-1);
    if (!last) return;
    setLoadingMore(true);
    try {
      const r = await api.get(urlFor(kidId, last.id));
      setState((s) => ({ ...s, items: [...s.items, ...r.items], more: r.more }));
    } finally {
      setLoadingMore(false);
    }
  }, [state.items, kidId]);

  // เปลี่ยนเด็กแล้วอย่าโชว์ประวัติของคนเก่าค้างไว้
  const fresh = state.forKid === kidId;
  return { items: fresh ? state.items : [], more: fresh && state.more, loaded: fresh && state.loaded, loadMore, loadingMore };
}
