import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { Logo } from '../components/ui.jsx';

/** ครั้งแรกที่เปิดแอปบนเซิร์ฟเวอร์ใหม่: ตั้งรหัสครอบครัว + PIN ผู้ปกครอง */
export default function Setup() {
  const { enterParent, loadStatus } = useStore();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (code.trim().length < 6) return setError('รหัสครอบครัวต้องยาวอย่างน้อย 6 ตัวอักษร');
    if (!/^\d{4}$/.test(pin)) return setError('PIN ต้องเป็นตัวเลข 4 หลัก');
    if (pin !== pin2) return setError('PIN ทั้งสองช่องไม่ตรงกัน');
    setBusy(true);
    try {
      const { parentToken } = await api.post('/api/setup', { familyCode: code, pin });
      enterParent(parentToken);
      navigate('/parent/manage?tab=kids&add=1', { replace: true });
      await loadStatus();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="pad-top mx-auto max-w-md px-5 pb-10">
      <div className="py-8 text-center">
        <Logo size={72} className="mx-auto animate-twinkle" />
        <p className="mt-3 text-lg text-mute">ยินดีต้อนรับสู่</p>
        <h1 className="text-4xl font-bold">สะสมดาว</h1>
        <p className="mt-2 text-mute">ตั้งค่าครั้งแรก ใช้เวลาไม่ถึงนาที</p>
      </div>
      <form onSubmit={submit} className="card space-y-5 p-5">
        <div>
          <label className="label" htmlFor="code">
            รหัสครอบครัว
          </label>
          <input id="code" className="field" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" placeholder="เช่น บ้านเรามีดาว" />
          <p className="mt-1.5 text-sm text-mute">ทุกเครื่องในบ้านใส่รหัสนี้ครั้งแรกครั้งเดียว คนนอกที่ไม่รู้รหัสจะเปิดดูไม่ได้</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="pin">
              PIN ผู้ปกครอง
            </label>
            <input id="pin" className="field text-center tracking-[0.4em]" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoComplete="new-password" />
          </div>
          <div>
            <label className="label" htmlFor="pin2">
              ใส่ PIN อีกครั้ง
            </label>
            <input id="pin2" className="field text-center tracking-[0.4em]" type="password" inputMode="numeric" maxLength={4} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} autoComplete="new-password" />
          </div>
        </div>
        <p className="-mt-2 text-sm text-mute">ตัวเลข 4 หลัก ใช้เข้าโหมดให้ดาว/หักดาว/อนุมัติ — อย่าบอกเด็กๆ นะ</p>
        {error && <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        <button className="btn btn-primary w-full text-lg" disabled={busy}>
          เริ่มใช้งาน
        </button>
      </form>
    </main>
  );
}
