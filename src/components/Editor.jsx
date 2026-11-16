// ส่วนประกอบของหน้าตั้งค่า (ใช้ร่วมกับหน้าคำศัพท์): แถวรายการ, ปุ่มเพิ่ม, หน้าต่างแก้ไข บันทึก/ลบ
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Sheet } from './ui.jsx';
import { Confirm } from './Feedback.jsx';

export function Row({ onClick, left, title, sub, right }) {
  return (
    <li>
      <button onClick={onClick} className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-sunken">
        {left}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{title}</span>
          {sub && <span className="block text-[13px] text-mute">{sub}</span>}
        </span>
        {right}
        <span className="text-mute" aria-hidden="true">
          ›
        </span>
      </button>
    </li>
  );
}

export function AddButton({ onClick, children }) {
  return (
    <button onClick={onClick} className="btn mt-3 w-full border-2 border-dashed border-lilac text-mute">
      + {children}
    </button>
  );
}

/** หน้าต่างแก้ไขแบบมาตรฐาน: บันทึก + ลบ (ถ้าเป็นของเดิม) */
export function EditorSheet({ open, title, onClose, onSave, onDelete, deleteText, children }) {
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Sheet open={open && !confirmDelete} onClose={onClose} title={title}>
        <form onSubmit={save} className="space-y-4 pb-3">
          {children}
          <button className="btn btn-primary w-full text-lg" disabled={busy}>
            บันทึก
          </button>
          {onDelete && (
            <button type="button" className="btn btn-ghost w-full text-bad" onClick={() => setConfirmDelete(true)}>
              ลบ
            </button>
          )}
        </form>
      </Sheet>
      <Confirm
        open={confirmDelete}
        title="ลบจริงไหม?"
        confirmLabel="ลบ"
        danger
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await onDelete();
          onClose();
        }}
      >
        {deleteText}
      </Confirm>
    </>
  );
}
