import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { useLocalState, local } from '../lib/local.js';
import { isIos, isStandalone } from '../lib/push.js';
import { Avatar, Empty, Logo, Segmented, StarCount } from '../components/ui.jsx';
import { Podium } from '../components/Podium.jsx';
import { PinPad } from '../components/PinPad.jsx';
import { ModeSwitch } from '../components/ModeSwitch.jsx';

export default function Home() {
  const { data, isParent, enterParent } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [pinOpen, setPinOpen] = useState(!!location.state?.askPin);
  const [board, setBoard] = useLocalState('board', 'total');
  const next = location.state?.next;
  const kids = data.kids;
  const pending = data.requests.filter((r) => r.status === 'pending').length;

  const openParent = () => (isParent ? navigate('/parent') : setPinOpen(true));
  const closePin = useCallback(() => {
    setPinOpen(false);
    if (location.state) navigate('.', { replace: true, state: null });
  }, [location.state, navigate]);

  const submitPin = useCallback(
    async (pin) => {
      try {
        const { token } = await api.post('/api/parent/login', { pin });
        enterParent(token);
        setPinOpen(false);
        navigate(next || '/parent', { replace: !!next });
      } catch (err) {
        return err.message;
      }
    },
    [enterParent, navigate, next],
  );

  return (
    <main className="pad-top mx-auto max-w-md px-4 pb-12">
      <header className="flex items-center justify-between gap-2 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Logo size={34} className="animate-twinkle" />
          <h1 className="truncate text-2xl font-bold">สะสมดาว</h1>
        </div>
        <ModeSwitch mode="kid" onParent={openParent} pending={pending} />
      </header>

      {kids.length === 0 ? (
        <Empty emoji="👶" title="ยังไม่มีรายชื่อเด็ก">
          ผู้ปกครองสลับเป็น 🔒 ผู้ปกครอง → ตั้งค่า → เด็กๆ เพื่อเพิ่มชื่อ
        </Empty>
      ) : (
        <>
          <section className="card mt-3 px-3 pb-4 pt-4" aria-label="แท่นจัดอันดับ">
            <h2 className="px-1 text-lg font-bold">🏆 แท่นจัดอันดับ</h2>
            <Segmented
              className="mt-3"
              value={board}
              onChange={setBoard}
              options={[
                { value: 'total', label: 'สะสมทั้งหมด' },
                { value: 'balance', label: 'ดาวคงเหลือ' },
              ]}
            />
            <p className="mt-2 px-1 text-center text-[13px] text-mute">
              {board === 'total' ? 'ดาวที่ได้ทั้งหมดตั้งแต่เริ่ม (หักความผิดแล้ว ไม่นับที่แลกไป)' : 'ดาวที่มีอยู่ตอนนี้ ใช้แลกของรางวัลได้'}
            </p>
            <Podium kids={kids} field={board} />
          </section>

          <section className="mt-7">
            <h2 className="mb-3 px-1 text-lg font-bold">👋 แตะชื่อตัวเองเลย</h2>
            <div className="grid grid-cols-2 gap-3">
              {kids.map((k) => (
                <Link key={k.id} to={`/kid/${k.id}`} className="card flex flex-col items-center gap-2 px-3 py-4 transition-transform active:scale-95">
                  <Avatar kid={k} size={76} />
                  <span className="max-w-full truncate text-lg font-bold">{k.name}</span>
                  <StarCount value={k.balance} size={24} className="text-2xl" />
                  {k.pendingCount > 0 && <span className="text-xs text-mute">⏳ รออนุมัติ {k.pendingCount}</span>}
                </Link>
              ))}
            </div>
          </section>
        </>
      )}

      <InstallHint />
      <PinPad open={pinOpen} onClose={closePin} onSubmit={submitPin} />
    </main>
  );
}

function InstallHint() {
  const [prompt, setPrompt] = useState(() => window.__installPrompt ?? null);
  const [hidden, setHidden] = useState(() => isStandalone() || local.get('installHintHidden', false));

  useEffect(() => {
    const onInstallable = () => setPrompt(window.__installPrompt);
    window.addEventListener('installable', onInstallable);
    return () => window.removeEventListener('installable', onInstallable);
  }, []);

  if (hidden || (!prompt && !isIos)) return null;
  const hide = () => {
    local.set('installHintHidden', true);
    setHidden(true);
  };

  return (
    <aside className="card mt-8 flex items-start gap-3 p-4">
      <span className="text-3xl">📲</span>
      <div className="flex-1 text-[15px]">
        <p className="font-bold">ติดตั้งสะสมดาวไว้บนหน้าจอ</p>
        {prompt ? (
          <button
            className="btn btn-primary mt-2 min-h-10 text-sm"
            onClick={async () => {
              prompt.prompt();
              await prompt.userChoice;
              window.__installPrompt = null;
              setPrompt(null);
            }}
          >
            ติดตั้งแอป
          </button>
        ) : (
          <p className="mt-1 text-mute">กดปุ่ม แชร์ ⬆️ แล้วเลือก "เพิ่มไปยังหน้าจอโฮม" — เปิดจากไอคอนแล้วจะรับแจ้งเตือนได้</p>
        )}
      </div>
      <button onClick={hide} className="grid size-8 place-items-center rounded-full text-mute" aria-label="ไม่ต้องแสดงอีก">
        ✕
      </button>
    </aside>
  );
}
