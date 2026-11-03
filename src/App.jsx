import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useStore } from './lib/store.jsx';
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

export default function App() {
  return (
    <>
      <Toaster
        position="top-center"
        containerStyle={{ top: 'max(env(safe-area-inset-top), 12px)' }}
        toastOptions={{
          style: {
            background: '#ffffff',
            color: '#2b2238',
            border: '2px solid #2b2238',
            boxShadow: '0 3px 0 #2b2238',
            borderRadius: 16,
            fontFamily: 'inherit',
            fontWeight: 600,
          },
          success: { iconTheme: { primary: '#1e9466', secondary: '#ffffff' } },
          error: { iconTheme: { primary: '#d93d63', secondary: '#ffffff' } },
        }}
      />
      <Screens />
    </>
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
        <Route path="/kid/:id" element={<KidPage />} />
        <Route path="/parent" element={<ParentLayout />}>
          <Route index element={<Give />} />
          <Route path="requests" element={<Requests />} />
          <Route path="history" element={<History />} />
          <Route path="manage" element={<Manage />} />
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
