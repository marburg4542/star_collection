// ชิ้นส่วนหน้าตาที่ใช้ทั่วแอป
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { KID_COLORS } from '../lib/constants.js';
import { num } from '../lib/format.js';

const STAR_PATH = 'M12 2.8L14.7 9.08L21.51 9.71L16.37 14.22L17.88 20.89L12 17.4L6.12 20.89L7.63 14.22L2.49 9.71L9.3 9.08Z';

export function Star({ size = 24, className = '', dim = false }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`inline-block shrink-0 ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={dim ? '#8a8fc4' : '#ffeaa0'} />
          <stop offset="1" stopColor={dim ? '#5a5f99' : '#ffb21a'} />
        </linearGradient>
      </defs>
      <path d={STAR_PATH} fill={`url(#${id})`} stroke={`url(#${id})`} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/** จำนวนดาว + ไอคอน — ติดลบเป็นสีแดง */
export function StarCount({ value, size = 20, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 font-bold tabular ${value < 0 ? 'text-bad' : ''} ${className}`}>
      <Star size={size} dim={value < 0} />
      {value < 0 ? `−${num(Math.abs(value))}` : num(value)}
    </span>
  );
}

export function Avatar({ kid, size = 56, ring = false, className = '' }) {
  const color = KID_COLORS[kid?.color]?.hex ?? '#6cc8ff';
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.56,
        background: `radial-gradient(circle at 35% 30%, #ffffff66, transparent 60%), ${color}`,
        boxShadow: ring ? `0 0 0 4px var(--color-night-900), 0 0 0 7px ${color}` : undefined,
      }}
      aria-hidden="true"
    >
      <span style={{ lineHeight: 1 }}>{kid?.avatar}</span>
    </span>
  );
}

export function Segmented({ value, onChange, options, className = '' }) {
  return (
    <div className={`flex rounded-full bg-night-950/70 p-1 ${className}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-full px-3 py-2 text-[15px] font-bold transition-colors ${
            value === o.value ? 'bg-night-600 text-ink shadow' : 'text-mute'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** หน้าต่างเลื่อนขึ้นจากด้านล่าง (มือถือ) / กลางจอ (จอใหญ่) */
export function Sheet({ open, onClose, title, children, footer }) {
  const panel = useRef(null);
  // เก็บ onClose ล่าสุดไว้ใน ref — ถ้าใส่ไว้ใน dependency ของ effect ด้านล่าง ผู้เรียกที่ส่งฟังก์ชันใหม่ทุก render
  // จะทำให้ effect รันทุกครั้งที่พิมพ์ แล้ว focus ย้ายไปที่กล่อง → พิมพ์ได้ทีละตัว
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && closeRef.current?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus(); // ครั้งเดียวตอนเปิด
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-night-950/75 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        className="card relative flex max-h-[92dvh] w-full max-w-md animate-rise flex-col rounded-b-none outline-none sm:rounded-b-3xl"
      >
        {title && (
          <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-2">
            <h2 className="text-lg font-bold">{title}</h2>
            <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-night-700 text-mute" aria-label="ปิด">
              ✕
            </button>
          </div>
        )}
        <div className="overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="pad-bottom border-t border-night-600/50 px-5 pt-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Stepper({ value, onChange, min = 1, max = 1000 }) {
  const set = (v) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <div className="flex items-center gap-3">
      <button type="button" className="btn btn-soft size-12 !p-0 text-2xl" onClick={() => set(value - 1)} disabled={value <= min} aria-label="ลด">
        −
      </button>
      <input
        className="field w-24 text-center text-xl font-bold tabular"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
          onChange(Number.isNaN(n) ? min : Math.min(max, n));
        }}
        aria-label="จำนวน"
      />
      <button type="button" className="btn btn-soft size-12 !p-0 text-2xl" onClick={() => set(value + 1)} disabled={value >= max} aria-label="เพิ่ม">
        +
      </button>
    </div>
  );
}

export function EmojiPicker({ value, onChange, choices }) {
  return (
    <div>
      <div className="grid grid-cols-8 gap-1.5">
        {choices.map((e) => (
          <button
            type="button"
            key={e}
            onClick={() => onChange(e)}
            className={`grid aspect-square place-items-center rounded-xl text-2xl ${value === e ? 'bg-gold-400/25 ring-2 ring-gold-400' : 'bg-night-950/60'}`}
            aria-label={e}
            aria-pressed={value === e}
          >
            {e}
          </button>
        ))}
      </div>
      <input
        className="field mt-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={12}
        placeholder="หรือพิมพ์อีโมจิเอง"
        aria-label="อีโมจิ"
      />
    </div>
  );
}

export function Spinner({ label = 'กำลังโหลด…' }) {
  return (
    <div className="grid place-items-center gap-3 py-16 text-mute">
      <Star size={44} className="animate-twinkle" />
      <span>{label}</span>
    </div>
  );
}

export function Empty({ emoji, title, children }) {
  return (
    <div className="grid place-items-center gap-2 px-6 py-10 text-center">
      <span className="text-5xl animate-float">{emoji}</span>
      <p className="text-lg font-bold">{title}</p>
      {children && <div className="text-mute">{children}</div>}
    </div>
  );
}
