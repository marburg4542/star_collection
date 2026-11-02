import { useEffect, useState } from 'react';
import { Sheet } from './ui.jsx';

/** แป้นใส่ PIN 4 หลัก — ครบ 4 ตัวส่งเองอัตโนมัติ; onSubmit คืน error message ถ้าผิด */
export function PinPad({ open, onClose, onSubmit, title = 'ใส่ PIN ผู้ปกครอง' }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  useEffect(() => {
    if (open) {
      setPin('');
      setError('');
    }
  }, [open]);

  useEffect(() => {
    if (pin.length !== 4 || busy) return;
    setBusy(true);
    Promise.resolve(onSubmit(pin))
      .then((err) => {
        if (err) {
          setError(err);
          setShake((n) => n + 1);
          setPin('');
        }
      })
      .finally(() => setBusy(false));
  }, [pin, busy, onSubmit]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < 4 ? p + e.key : p));
      if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const press = (d) => {
    setError('');
    setPin((p) => (p.length < 4 ? p + d : p));
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="pb-4 pt-2">
        <div key={shake} className={`mb-2 flex justify-center gap-4 ${shake ? 'animate-shake' : ''}`} aria-live="polite">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`size-4 rounded-full border-2 transition-colors ${i < pin.length ? 'border-gold-400 bg-gold-400' : 'border-night-500'}`}
            />
          ))}
        </div>
        <p className="mb-4 h-6 text-center text-sm text-bad">{error}</p>
        <div className="mx-auto grid max-w-72 grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <PadKey key={d} onClick={() => press(d)} disabled={busy}>
              {d}
            </PadKey>
          ))}
          <span />
          <PadKey onClick={() => press('0')} disabled={busy}>
            0
          </PadKey>
          <PadKey onClick={() => setPin((p) => p.slice(0, -1))} disabled={busy} label="ลบ">
            ⌫
          </PadKey>
        </div>
      </div>
    </Sheet>
  );
}

function PadKey({ children, label, ...props }) {
  return (
    <button
      type="button"
      className="grid aspect-square place-items-center rounded-full bg-night-700 text-3xl font-bold tabular transition-transform active:scale-90 active:bg-night-600"
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  );
}
