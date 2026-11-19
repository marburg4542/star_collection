// หน้าของเด็กที่ผู้ปกครองตั้งรหัสไว้: ต้องใส่รหัสของเด็กคนนั้นก่อน (โหมดผู้ปกครองข้ามได้)
// ใส่แล้วจำไว้จนกลับหน้าแรกหรือปิดแอป · เซิร์ฟเวอร์บอกว่า token หมดอายุ/รหัสถูกเปลี่ยน → ล็อคกลับเอง
import { useCallback, useEffect, useReducer } from 'react';
import { Link, Navigate, Outlet, useNavigate, useParams } from 'react-router-dom';
import { api, kidUnlocked, onKidLocked, setKidSession } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { Avatar } from './ui.jsx';
import { PinPad } from './PinPad.jsx';

export function KidGate() {
  const { id } = useParams();
  const { kidById, isParent } = useStore();
  const kid = kidById(id);
  const [, refresh] = useReducer((n) => n + 1, 0);
  useEffect(() => onKidLocked(refresh), []);
  if (!kid) return <Navigate to="/" replace />;
  if (!kid.hasPin || isParent || kidUnlocked(kid.id)) return <Outlet />;
  return <KidLock kid={kid} onUnlocked={refresh} />;
}

function KidLock({ kid, onUnlocked }) {
  const navigate = useNavigate();
  const submit = useCallback(
    async (pin) => {
      try {
        const r = await api.post(`/api/kids/${kid.id}/unlock`, { pin });
        setKidSession(kid.id, r.token);
        onUnlocked();
        return null;
      } catch (err) {
        return err.code === 'pin' ? 'รหัสไม่ถูกต้อง ลองใหม่นะ' : err.message;
      }
    },
    [kid.id, onUnlocked],
  );
  return (
    <main className="pad-top mx-auto flex min-h-dvh max-w-md flex-col items-center px-4 pt-14 text-center">
      <Avatar kid={kid} size={96} />
      <p className="mt-3 text-2xl font-bold">{kid.name}</p>
      <p className="mt-1 text-mute">🔒 ใส่รหัสก่อนเข้าหน้านี้</p>
      <Link to="/" className="btn btn-soft mt-6 px-5">
        ← หน้าแรก
      </Link>
      <PinPad open title={`🔒 รหัสของ${kid.name}`} onClose={() => navigate('/')} onSubmit={submit} />
    </main>
  );
}
