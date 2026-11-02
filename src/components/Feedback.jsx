// ป๊อปอัปฉลองตอนได้ดาว, toast ที่กดยกเลิกได้, และหน้าต่างยืนยัน
import { useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { signed } from '../lib/format.js';
import { Sheet, Star } from './ui.jsx';

const BURST = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  const dist = 120 + (i % 3) * 40;
  return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, rot: (i % 2 ? 1 : -1) * (90 + i * 20), size: 18 + (i % 4) * 7, delay: (i % 5) * 40 };
});

export function Celebration({ kid, items, onClose }) {
  const net = items.reduce((sum, t) => sum + t.amount, 0);
  const good = net >= 0;
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-night-950/85 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="ดาวใหม่">
      <div className="relative w-full max-w-sm text-center animate-pop">
        {good &&
          BURST.map((b, i) => (
            <span
              key={i}
              className="burst-star"
              style={{ '--dx': `${b.dx}px`, '--dy': `${b.dy}px`, '--rot': `${b.rot}deg`, animationDelay: `${b.delay}ms` }}
            >
              <Star size={b.size} />
            </span>
          ))}
        <div className="text-7xl">{good ? '🎉' : '🥺'}</div>
        <p className="mt-3 text-2xl font-bold">{good ? `เย้! ${kid.name} ได้ดาวเพิ่ม` : `โอ๊ะ ${kid.name} โดนหักดาว`}</p>
        <p className={`my-3 flex items-center justify-center gap-2 text-6xl font-bold tabular ${good ? 'text-gold-300' : 'text-bad'}`}>
          {signed(net)} <Star size={54} dim={!good} />
        </p>
        <ul className="card mb-4 max-h-52 overflow-y-auto p-2 text-left">
          {items.slice(0, 8).map((t) => (
            <li key={t.id} className="flex items-center gap-2 px-2 py-1.5">
              <span className="text-2xl">{t.emoji}</span>
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <span className={`font-bold tabular ${t.amount > 0 ? 'text-good' : 'text-bad'}`}>{signed(t.amount)}</span>
            </li>
          ))}
        </ul>
        {!good && <p className="mb-4 text-mute">ไม่เป็นไรนะ ทำดีใหม่ เก็บดาวคืนได้</p>}
        <button className="btn btn-gold w-full text-lg" onClick={onClose} autoFocus>
          {good ? 'เก่งมาก! 👍' : 'จะตั้งใจใหม่ 💪'}
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** toast "ทำแล้ว" พร้อมปุ่มยกเลิก — กันกดผิด */
export function undoToast(text, onUndo) {
  toast.custom(
    (t) => (
      <div className={`card flex w-[min(92vw,26rem)] items-center gap-3 rounded-2xl px-4 py-3 shadow-xl ${t.visible ? 'animate-rise' : 'opacity-0'}`}>
        <span className="min-w-0 flex-1 text-[15px] font-semibold">{text}</span>
        <button
          className="btn btn-soft min-h-10 shrink-0 px-4 text-sm"
          onClick={async () => {
            toast.dismiss(t.id);
            try {
              await onUndo();
              toast.success('ยกเลิกแล้ว');
            } catch (err) {
              toast.error(err.message);
            }
          }}
        >
          ↩ ยกเลิก
        </button>
      </div>
    ),
    { duration: 6000 },
  );
}

export function Confirm({ open, title, children, confirmLabel = 'ยืนยัน', danger = false, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-3">
          <button className="btn btn-soft flex-1" onClick={onClose}>
            ไม่ใช่
          </button>
          <button
            className={`btn flex-[2] ${danger ? 'btn-danger' : 'btn-gold'}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } catch (err) {
                toast.error(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div className="pb-2 text-mute">{children}</div>
    </Sheet>
  );
}
