import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../../lib/api.js';
import { useStore } from '../../lib/store.jsx';
import { SEVERITY } from '../../lib/constants.js';
import { Avatar, Empty, Segmented, Sheet, StarCount, Stepper } from '../../components/ui.jsx';
import { undoToast } from '../../components/Feedback.jsx';

export default function Give() {
  const { data, kidById } = useStore();
  const kids = data.kids;
  const [selected, setSelected] = useState([]);
  const [mode, setMode] = useState('earn');
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nudge, setNudge] = useState(0);

  // มีเด็กคนเดียวก็เลือกให้เลย
  useEffect(() => {
    if (kids.length === 1) setSelected([kids[0].id]);
  }, [kids]);

  if (!kids.length) {
    return (
      <Empty emoji="👶" title="เพิ่มรายชื่อเด็กก่อนนะ">
        <Link to="/parent/manage?tab=kids&add=1" className="btn btn-primary mt-3">
          + เพิ่มเด็ก
        </Link>
      </Empty>
    );
  }

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allSelected = selected.length === kids.length;

  async function give(payload, label) {
    if (!selected.length) {
      setNudge((n) => n + 1);
      toast('เลือกก่อนว่าจะให้ใคร 👆', { icon: '⭐' });
      return false;
    }
    setBusy(true);
    try {
      const { ids } = await api.post('/api/parent/stars', { kidIds: selected, ...payload });
      const names = selected.map((id) => kidById(id)?.name).join(', ');
      undoToast(`${names} ${label}`, () => Promise.all(ids.map((id) => api.post(`/api/parent/transactions/${id}/void`))));
      return true;
    } catch (err) {
      toast.error(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const earn = data.activities.filter((a) => a.kind === 'earn');
  const penalties = data.activities.filter((a) => a.kind === 'penalty');

  return (
    <div>
      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="font-bold">ให้ใคร?</h2>
          {kids.length > 1 && (
            <button className="text-sm font-semibold text-purple-600" onClick={() => setSelected(allSelected ? [] : kids.map((k) => k.id))}>
              {allSelected ? 'ไม่เลือกเลย' : 'เลือกทุกคน'}
            </button>
          )}
        </div>
        <div key={nudge} className={`no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 ${nudge ? 'animate-shake' : ''}`}>
          {kids.map((k) => {
            const on = selected.includes(k.id);
            return (
              <button
                key={k.id}
                onClick={() => toggle(k.id)}
                aria-pressed={on}
                className={`flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 transition-colors ${on ? 'bg-purple-600 text-on-primary' : 'chip-off'}`}
              >
                <Avatar kid={k} size={38} />
                <span className="text-left leading-tight">
                  <span className="block font-bold">{k.name}</span>
                  <span className={`block text-xs ${on ? 'text-on-primary/80' : 'text-mute'}`}>⭐ {k.balance}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <Segmented
        className="mt-5"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'earn', label: '😊 ทำดี ให้ดาว' },
          { value: 'penalty', label: '😣 ทำผิด หักดาว' },
        ]}
      />

      <div className="mt-4">
        {mode === 'earn' ? (
          <ActivityGrid items={earn} disabled={busy} onPick={(a) => give({ activityId: a.id }, `+${a.stars} ⭐ ${a.name}`)} />
        ) : (
          Object.entries(SEVERITY).map(([sev, info]) => {
            const items = penalties.filter((a) => a.severity === sev);
            if (!items.length) return null;
            return (
              <section key={sev} className="mb-5">
                <h3 className="mb-2 flex items-center gap-2 px-1 font-bold" style={{ color: info.hex }}>
                  <span className="size-3 rounded-full" style={{ background: info.hex }} />
                  ความผิด{info.label}
                </h3>
                <ActivityGrid items={items} disabled={busy} onPick={(a) => give({ activityId: a.id }, `−${a.stars} ⭐ ${a.name}`)} />
              </section>
            );
          })
        )}
        <button className="btn btn-soft mt-3 w-full" onClick={() => setCustom(true)}>
          ✏️ {mode === 'earn' ? 'ให้ดาวแบบกำหนดเอง' : 'หักดาวแบบกำหนดเอง'}
        </button>
        <Link to="/parent/manage?tab=activities" className="mt-2 block py-2 text-center text-sm text-mute underline-offset-4 hover:underline">
          แก้รายการ/จำนวนดาว
        </Link>
      </div>

      <CustomSheet open={custom} mode={mode} onClose={() => setCustom(false)} onSubmit={give} />
    </div>
  );
}

function ActivityGrid({ items, onPick, disabled }) {
  if (!items.length) return <p className="px-1 py-4 text-center text-mute">ยังไม่มีรายการ เพิ่มได้ในหน้าตั้งค่า</p>;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {items.map((a) => {
        const earn = a.kind === 'earn';
        return (
          <button
            key={a.id}
            disabled={disabled}
            onClick={() => onPick(a)}
            className="card flex flex-col items-start gap-1 rounded-2xl p-3 text-left transition-transform active:scale-95"
            style={earn ? undefined : { borderColor: SEVERITY[a.severity]?.hex }}
          >
            <span className="flex w-full items-start justify-between">
              <span className="text-3xl">{a.emoji}</span>
              <span className={`text-xl font-bold tabular ${earn ? 'text-good' : 'text-bad'}`}>
                {earn ? '+' : '−'}
                {a.stars}
              </span>
            </span>
            <span className="text-[15px] font-semibold leading-snug">{a.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function CustomSheet({ open, mode, onClose, onSubmit }) {
  const [title, setTitle] = useState('');
  const [stars, setStars] = useState(1);
  const [severity, setSeverity] = useState('medium');
  const earn = mode === 'earn';

  useEffect(() => {
    if (open) {
      setTitle('');
      setStars(earn ? 2 : 1);
    }
  }, [open, earn]);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return toast.error('ใส่เหตุผลสั้นๆ ด้วยนะ');
    const ok = await onSubmit(
      { kind: mode, stars, title: title.trim(), severity: earn ? undefined : severity },
      `${earn ? '+' : '−'}${stars} ⭐ ${title.trim()}`,
    );
    if (ok) onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={earn ? 'ให้ดาวแบบกำหนดเอง' : 'หักดาวแบบกำหนดเอง'}>
      <form onSubmit={submit} className="space-y-4 pb-3">
        <div>
          <label className="label" htmlFor="reason">
            {earn ? 'ทำดีอะไร' : 'ทำผิดอะไร'}
          </label>
          <input id="reason" className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder={earn ? 'เช่น ช่วยยายถือของ' : 'เช่น แอบกินขนมก่อนข้าว'} />
        </div>
        <div>
          <span className="label">จำนวนดาว</span>
          <Stepper value={stars} onChange={setStars} />
        </div>
        {!earn && (
          <div>
            <span className="label">ความร้ายแรง</span>
            <div className="flex gap-2">
              {Object.entries(SEVERITY).map(([key, info]) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => setSeverity(key)}
                  aria-pressed={severity === key}
                  className="flex-1 rounded-full border-2 py-2 font-semibold"
                  style={severity === key ? { borderColor: info.hex, background: `${info.hex}26`, color: info.hex } : { borderColor: 'transparent', background: 'var(--color-sunken)' }}
                >
                  {info.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <button className={`btn w-full text-lg ${earn ? 'btn-primary' : 'btn-danger'}`}>
          {earn ? 'ให้' : 'หัก'} <StarCount value={stars} size={20} />
        </button>
      </form>
    </Sheet>
  );
}
