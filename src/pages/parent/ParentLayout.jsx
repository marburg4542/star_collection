import { useEffect, useRef } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useStore } from '../../lib/store.jsx';
import { Logo } from '../../components/ui.jsx';
import { ModeSwitch } from '../../components/ModeSwitch.jsx';

const TABS = [
  { to: '/parent', icon: '⭐', label: 'ให้/หักดาว', end: true },
  { to: '/parent/requests', icon: '🎁', label: 'คำขอแลก' },
  { to: '/parent/phones', icon: '📱', label: 'มือถือ' },
  { to: '/parent/history', icon: '📜', label: 'ประวัติ' },
  { to: '/parent/manage', icon: '⚙️', label: 'ตั้งค่า' },
];

export default function ParentLayout() {
  const { isParent, data, exitParent } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const wasParent = useRef(isParent);
  const locking = useRef(false); // สลับกลับโหมดเด็กเอง — ไม่ใช่หมดเวลา

  // ไม่ได้ใช้นาน session หมดอายุ → กลับหน้าแรกให้ใส่ PIN ใหม่
  useEffect(() => {
    if (wasParent.current && !isParent && !locking.current) toast('หมดเวลาโหมดผู้ปกครอง ใส่ PIN อีกครั้งนะ', { icon: '🔒' });
    wasParent.current = isParent;
  }, [isParent]);

  if (!isParent) return locking.current ? null : <Navigate to="/" replace state={{ askPin: true, next: location.pathname + location.search }} />;
  const pending = data.requests.filter((r) => r.status === 'pending').length;
  const badges = { '/parent/requests': pending, '/parent/phones': data.timeRequests?.length ?? 0 };

  // ไปหน้าแรกก่อนแล้วค่อยออกจากโหมด — ถ้าออกก่อน หน้านี้จะเห็นว่า "ไม่ใช่ผู้ปกครอง" แล้วเด้งแป้น PIN ขึ้นมา
  const toKid = () => {
    locking.current = true;
    navigate('/');
    exitParent();
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="pad-top sticky top-0 z-20 bg-paper/90 px-4 pb-2 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Logo size={30} />
            <h1 className="truncate text-xl font-bold">สะสมดาว</h1>
          </div>
          <ModeSwitch mode="parent" onKid={toKid} />
        </div>
      </header>
      <main className="flex-1 px-4 pb-32 pt-2">
        <Outlet />
      </main>
      <nav className="pad-bottom fixed inset-x-0 bottom-0 z-30 border-t border-hair bg-card/95 backdrop-blur-md" aria-label="เมนูผู้ปกครอง">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => `relative flex flex-col items-center gap-0.5 pt-2 pb-1 ${isActive ? 'text-purple-600' : 'text-mute'}`}
            >
              {({ isActive }) => (
                <>
                  <span className={`text-2xl transition-transform ${isActive ? 'scale-110' : 'opacity-70 grayscale-[50%]'}`}>{t.icon}</span>
                  <span className="text-xs font-semibold">{t.label}</span>
                  {badges[t.to] > 0 && (
                    <span className="absolute right-[18%] top-1 grid h-5 min-w-5 place-items-center rounded-full bg-bad px-1 text-[11px] font-bold text-white">{badges[t.to]}</span>
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
