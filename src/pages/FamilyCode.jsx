import { useState } from 'react';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { Star } from '../components/ui.jsx';

export default function FamilyCode() {
  const { loadStatus } = useStore();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  async function submit(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.post('/api/device/login', { familyCode: code });
      await loadStatus();
    } catch (err) {
      setError(err.message);
      setShake((n) => n + 1);
      setBusy(false);
    }
  }

  return (
    <main className="pad-top mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pb-16">
      <div className="mb-8 text-center">
        <Star size={84} className="mx-auto animate-twinkle" />
        <h1 className="mt-4 text-3xl font-bold">สะสมดาว</h1>
        <p className="mt-2 text-mute">ใส่รหัสครอบครัวเพื่อเข้าใช้งานบนเครื่องนี้</p>
      </div>
      <form key={shake} onSubmit={submit} className={`card space-y-4 p-5 ${shake ? 'animate-shake' : ''}`}>
        <input
          className="field text-center text-lg"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="รหัสครอบครัว"
          aria-label="รหัสครอบครัว"
          autoComplete="off"
          autoFocus
        />
        {error && <p className="text-center text-sm text-bad">{error}</p>}
        <button className="btn btn-gold w-full text-lg" disabled={busy || !code.trim()}>
          เข้าใช้งาน
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-mute">ไม่รู้รหัส? ถามพ่อแม่หรือผู้ปกครองนะ</p>
    </main>
  );
}
