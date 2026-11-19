import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useStore } from './lib/store.jsx';
import { useNewVersion } from './lib/update.js';
import { Spinner, Star } from './components/ui.jsx';
import Setup from './pages/Setup.jsx';
import FamilyCode from './pages/FamilyCode.jsx';
import Home from './pages/Home.jsx';
import KidPage from './pages/KidPage.jsx';
import ParentLayout from './pages/parent/ParentLayout.jsx';
import Give from './pages/parent/Give.jsx';
import Requests from './pages/parent/Requests.jsx';
import History from './pages/parent/History.jsx';
import Manage from './pages/parent/Manage.jsx';
import Phones from './pages/parent/Phones.jsx';
import { VocabSetPage } from './pages/parent/Vocab.jsx';
import VocabPlay from './pages/VocabPlay.jsx';
import MathPop from './pages/MathPop.jsx';
import ScaleGame from './pages/ScaleGame.jsx';
import ShopGame from './pages/ShopGame.jsx';
import { VocabGame } from './pages/Games.jsx';
import { KidGate } from './components/KidGate.jsx';

export default function App() {
  return (
    <>
      <Toaster
        position="top-center"
        containerStyle={{ top: 'max(env(safe-area-inset-top), 12px)' }}
        toastOptions={{
          style: {
            background: 'var(--color-card)',
            color: 'var(--color-ink)',
            border: '2px solid var(--color-line)',
            boxShadow: 'var(--toast-shadow)',
            borderRadius: 'var(--toast-radius)',
            fontFamily: 'inherit',
            fontWeight: 600,
          },
          success: { iconTheme: { primary: '#1e9466', secondary: '#ffffff' } },
          error: { iconTheme: { primary: '#d93d63', secondary: '#ffffff' } },
        }}
      />
      <UpdateBanner />
      <Screens />
    </>
  );
}

/** แอปที่เปิดค้างไว้ตอนมีอัปเดต — ให้กดโหลดใหม่เอง ไม่โหลดให้อัตโนมัติ เผื่อกำลังกรอกอะไรค้างอยู่ */
function UpdateBanner() {
  const latest = useNewVersion();
  const [dismissed, setDismissed] = useState(null);
  if (!latest || latest === dismissed) return null;
  return (
    <div role="status" className="pad-top sticky top-0 z-40 flex items-center justify-center gap-3 bg-purple-600 px-4 pb-2 text-sm font-semibold text-on-primary">
      <span>✨ สะสมดาวมีรุ่นใหม่</span>
      <button className="update-btn rounded-full bg-white px-3.5 py-1 text-purple-700" onClick={() => window.location.reload()}>
        โหลดใหม่
      </button>
      <button className="-my-2 -mr-2 grid size-10 place-items-center text-base text-on-primary/80" aria-label="ไว้ทีหลัง" onClick={() => setDismissed(latest)}>
        ✕
      </button>
    </div>
  );
}

function Screens() {
  const { status, data, online } = useStore();
  if (!status) return <Spinner />;
  if (status.error) return <Offline />;
  if (!status.setup) return <Setup />;
  if (!status.device) return <FamilyCode />;
  if (!data) return online ? <Spinner /> : <Offline />;
  return (
    <>
      {!online && (
        <div className="pad-top sticky top-0 z-40 bg-bad/90 px-4 pb-1.5 text-center text-sm font-semibold text-white">
          ออฟไลน์อยู่ — ข้อมูลอาจไม่ใช่ล่าสุด
        </div>
      )}
      <Routes>
        <Route path="/" element={<Home />} />
        {/* หน้าของเด็ก — เด็กที่ตั้งรหัสไว้ต้องใส่รหัสก่อน */}
        <Route path="/kid/:id" element={<KidGate />}>
          <Route index element={<KidPage />} />
          <Route path="vocab/:setId" element={<VocabPlay />} />
          <Route path="games/vocab" element={<VocabGame />} />
          <Route path="games/math" element={<MathPop />} />
          <Route path="games/scale" element={<ScaleGame />} />
          <Route path="games/shop" element={<ShopGame />} />
        </Route>
        <Route path="/parent" element={<ParentLayout />}>
          <Route index element={<Give />} />
          <Route path="requests" element={<Requests />} />
          <Route path="phones" element={<Phones />} />
          <Route path="history" element={<History />} />
          <Route path="manage" element={<Manage />} />
          <Route path="vocab/:id" element={<VocabSetPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

function Offline() {
  return (
    <div className="grid min-h-dvh place-items-center p-8 text-center">
      <div>
        <Star size={56} dim className="mx-auto mb-4" />
        <p className="text-xl font-bold">เชื่อมต่อไม่ได้</p>
        <p className="mt-2 text-mute">ตรวจอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง</p>
        <button className="btn btn-primary mt-6" onClick={() => window.location.reload()}>
          ลองใหม่
        </button>
      </div>
    </div>
  );
}
