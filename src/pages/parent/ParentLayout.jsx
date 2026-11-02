import { useEffect, useRef } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useStore } from '../../lib/store.jsx';

const TABS = [
  { to: '/parent', icon: '⭐', label: 'ให้/หักดาว', end: true },
  { to: '/parent/requests', icon: '🎁', label: 'คำขอแลก' },
  { to: '/parent/history', icon: '📜', label: 'ประวัติ' },
  { to: '/parent/manage', icon: '⚙️', label: 'ตั้งค่า' },
];

export default function ParentLayout() {
  const { isParent, data, exitParent } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const wasParent = useRef(isParent);

  // ไม่ได้ใช้นาน session หมดอายุ → กลับหน้าแรกให้ใส่ PIN ใหม่
  useEffect(() => {
    if (wasParent.current && !isParent) toast('หมดเวลาโหมดผู้ปกครอง ใส่ PIN อีกครั้งนะ', { icon: '🔒' });
    wasParent.current = isParent;
  }, [isParent]);

  if (!isParent) return <Navigate to="/" replace state={{ askPin: true, next: location.pathname + location.search }} />;
  const pending = data.requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="pad-top sticky top-0 z-20 bg-night-900/90 px-4 pb-2 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">👨‍👩‍👧 โหมดผู้ปกครอง</h1>
          <button
            className="btn btn-soft min-h-10 px-4 text-sm"
            onClick={async () => {
              await exitParent();
              navigate('/');
            }}
          >
            🔒 ล็อก
          </button>
        </div>
      </header>
      <main className="flex-1 px-4 pb-32 pt-2">
        <Outlet />
      </main>
      <nav className="pad-bottom fixed inset-x-0 bottom-0 z-30 border-t border-night-600/50 bg-night-950/95 backdrop-blur-md" aria-label="เมนูผู้ปกครอง">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => `relative flex flex-col items-center gap-0.5 pt-2 pb-1 ${isActive ? 'text-gold-300' : 'text-mute'}`}
            >
              {({ isActive }) => (
                <>
                  <span className={`text-2xl transition-transform ${isActive ? 'scale-110' : 'opacity-70 grayscale-[50%]'}`}>{t.icon}</span>
                  <span className="text-xs font-semibold">{t.label}</span>
                  {t.to === '/parent/requests' && pending > 0 && (
                    <span className="absolute right-[22%] top-1 grid h-5 min-w-5 place-items-center rounded-full bg-bad px-1 text-[11px] font-bold text-white">{pending}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
