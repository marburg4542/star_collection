import { useLayoutEffect, useRef, useState } from 'react';

// จำโหมดล่าสุดข้ามหน้า — หน้าแรกกับโหมดผู้ปกครองมีสวิตช์คนละตัว พอสลับแล้วหน้าใหม่จะเห็นปุ่มกลมเลื่อนมาจากฝั่งเดิม
let lastMode = null;

/**
 * สวิตช์สลับโหมด เด็ก | ผู้ปกครอง — ฝั่งที่ใช้อยู่มีปุ่มกลมทับ (เด็ก = ม่วง, ผู้ปกครอง = ชมพู)
 * กดฝั่งที่ไม่ได้ใช้อยู่เพื่อสลับ: onParent (เช่น เปิดแป้น PIN) / onKid (ล็อกกลับหน้าเด็ก)
 */
export function ModeSwitch({ mode, onKid, onParent, pending = 0 }) {
  const kidRef = useRef(null);
  const parentRef = useRef(null);
  const [knob, setKnob] = useState(null);
  const parentOn = mode === 'parent';

  useLayoutEffect(() => {
    const target = parentOn ? parentRef : kidRef;
    const place = (ref) => ref.current && setKnob({ left: ref.current.offsetLeft, width: ref.current.offsetWidth });
    const from = lastMode && lastMode !== mode ? (lastMode === 'parent' ? parentRef : kidRef) : target;
    lastMode = mode;
    place(from);
    let frame;
    if (from !== target) frame = requestAnimationFrame(() => requestAnimationFrame(() => place(target)));
    // ฟอนต์โหลดเสร็จทีหลังได้ หรือเปลี่ยนธีมแล้วฟอนต์เปลี่ยน ความกว้างตัวอักษรเปลี่ยน — วัดใหม่อีกรอบ
    const again = () => place(target);
    document.fonts?.ready.then(again);
    document.fonts?.addEventListener('loadingdone', again);
    window.addEventListener('stars-theme', again);
    return () => {
      cancelAnimationFrame(frame);
      document.fonts?.removeEventListener('loadingdone', again);
      window.removeEventListener('stars-theme', again);
    };
  }, [mode, parentOn]);

  const side = 'relative z-10 rounded-full px-2.5 py-2 text-sm font-bold whitespace-nowrap transition-colors duration-300';
  return (
    <div role="radiogroup" aria-label="สลับโหมด" className="relative flex shrink-0 rounded-full border-2 border-line bg-card p-1 shadow-[0_3px_0_var(--color-line)]">
      {knob && (
        <span
          aria-hidden="true"
          className={`absolute inset-y-1 rounded-full border-2 border-line transition-all duration-300 ease-out ${parentOn ? 'bg-pink-300' : 'bg-purple-600'}`}
          style={{ left: knob.left, width: knob.width }}
        />
      )}
      <button ref={kidRef} type="button" role="radio" aria-checked={!parentOn} onClick={() => parentOn && onKid?.()} className={`${side} ${parentOn ? 'text-mute' : 'text-on-primary'}`}>
        เด็ก
      </button>
      <button ref={parentRef} type="button" role="radio" aria-checked={parentOn} onClick={() => !parentOn && onParent?.()} className={`${side} ${parentOn ? 'text-on-accent' : 'text-mute'}`}>
        {!parentOn && <span className="mr-1 text-xs">🔒</span>}
        ผู้ปกครอง
      </button>
      {pending > 0 && (
        <span
          className="absolute -right-2 -top-2 z-20 grid h-6 min-w-6 place-items-center rounded-full border-2 border-line bg-bad px-1 text-xs font-bold text-white"
          aria-label={`มีคำขอแลก ${pending} รายการ`}
        >
          {pending}
        </span>
      )}
    </div>
  );
}
