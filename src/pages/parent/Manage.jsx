import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../../lib/api.js';
import { useStore } from '../../lib/store.jsx';
import { usePush } from '../../lib/push.js';
import { AVATARS, CATEGORIES, EARN_EMOJIS, KID_COLORS, PENALTY_EMOJIS, REWARD_EMOJIS, SEVERITY } from '../../lib/constants.js';
import { Avatar, EmojiPicker, Segmented, Sheet, StarCount, Stepper } from '../../components/ui.jsx';
import { Confirm } from '../../components/Feedback.jsx';

const TABS = [
  { value: 'kids', label: 'เด็กๆ' },
  { value: 'activities', label: 'ดี/ผิด' },
  { value: 'rewards', label: 'รางวัล' },
  { value: 'system', label: 'ระบบ' },
];

export default function Manage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'kids';
  const autoAdd = params.get('add') === '1';

  return (
    <div>
      <Segmented value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} options={TABS} />
      <div className="mt-5">
        {tab === 'kids' && <KidsTab autoAdd={autoAdd} />}
        {tab === 'activities' && <ActivitiesTab />}
        {tab === 'rewards' && <RewardsTab />}
        {tab === 'system' && <SystemTab />}
      </div>
    </div>
  );
}

// ---------- ส่วนประกอบร่วม ----------

function Row({ onClick, left, title, sub, right }) {
  return (
    <li>
      <button onClick={onClick} className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-night-700/40">
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

function AddButton({ onClick, children }) {
  return (
    <button onClick={onClick} className="btn mt-3 w-full border-2 border-dashed border-night-500 text-mute">
      + {children}
    </button>
  );
}

/** หน้าต่างแก้ไขแบบมาตรฐาน: บันทึก + ลบ (ถ้าเป็นของเดิม) */
function EditorSheet({ open, title, onClose, onSave, onDelete, deleteText, children }) {
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
          <button className="btn btn-gold w-full text-lg" disabled={busy}>
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

// ---------- เด็กๆ ----------

function KidsTab({ autoAdd }) {
  const { data } = useStore();
  const [editing, setEditing] = useState(autoAdd ? {} : null);
  return (
    <section>
      {data.kids.length > 0 && (
        <ul className="card divide-y divide-night-600/40 rounded-2xl">
          {data.kids.map((k) => (
            <Row key={k.id} onClick={() => setEditing(k)} left={<Avatar kid={k} size={42} />} title={k.name} right={<StarCount value={k.balance} size={18} />} />
          ))}
        </ul>
      )}
      {data.kids.length === 0 && <p className="px-1 pb-1 text-mute">เริ่มจากเพิ่มรายชื่อเด็กในบ้านก่อน — ใส่ชื่อเล่น เลือกรูปสัตว์และสีประจำตัว</p>}
      <AddButton onClick={() => setEditing({})}>เพิ่มเด็ก</AddButton>
      <KidEditor kid={editing} onClose={() => setEditing(null)} />
    </section>
  );
}

function KidEditor({ kid, onClose }) {
  const { data } = useStore();
  const navigate = useNavigate();
  const isNew = !kid?.id;
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [color, setColor] = useState('sky');

  useEffect(() => {
    if (!kid) return;
    const used = new Set(data.kids.map((k) => k.avatar));
    setName(kid.name ?? '');
    setAvatar(kid.avatar ?? AVATARS.find((a) => !used.has(a)) ?? AVATARS[0]);
    setColor(kid.color ?? Object.keys(KID_COLORS)[data.kids.length % 6]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kid]);

  return (
    <EditorSheet
      open={!!kid}
      title={isNew ? 'เพิ่มเด็ก' : `แก้ไข ${kid?.name}`}
      onClose={() => {
        onClose();
        navigate('/parent/manage?tab=kids', { replace: true });
      }}
      onSave={async () => {
        const body = { name, avatar, color };
        if (isNew) await api.post('/api/parent/kids', body);
        else await api.put(`/api/parent/kids/${kid.id}`, body);
        toast.success(isNew ? `เพิ่ม${name.trim()}แล้ว` : 'บันทึกแล้ว');
      }}
      onDelete={isNew ? null : () => api.del(`/api/parent/kids/${kid.id}`)}
      deleteText={`ลบ ${kid?.name} ออกจากแอป — ดาวและประวัติทั้งหมดของ${kid?.name}จะหายไปด้วย กู้คืนไม่ได้`}
    >
      <div className="flex justify-center">
        <Avatar kid={{ avatar, color }} size={88} />
      </div>
      <div>
        <label className="label" htmlFor="kid-name">
          ชื่อเล่น
        </label>
        <input id="kid-name" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="เช่น น้องมะลิ" />
      </div>
      <div>
        <span className="label">สีประจำตัว</span>
        <div className="flex gap-2">
          {Object.entries(KID_COLORS).map(([key, c]) => (
            <button
              type="button"
              key={key}
              onClick={() => setColor(key)}
              aria-label={c.label}
              aria-pressed={color === key}
              className={`size-10 rounded-full transition-transform ${color === key ? 'scale-110 ring-4 ring-ink/80' : ''}`}
              style={{ background: c.hex }}
            />
          ))}
        </div>
      </div>
      <div>
        <span className="label">รูปประจำตัว</span>
        <EmojiPicker value={avatar} onChange={setAvatar} choices={AVATARS} />
      </div>
    </EditorSheet>
  );
}

// ---------- ทำดี / ทำผิด ----------

function ActivitiesTab() {
  const { data } = useStore();
  const [kind, setKind] = useState('earn');
  const [editing, setEditing] = useState(null);
  const items = data.activities.filter((a) => a.kind === kind);
  const groups = kind === 'earn' ? [[null, items]] : Object.keys(SEVERITY).map((s) => [s, items.filter((a) => a.severity === s)]);

  return (
    <section>
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'earn', label: '😊 ทำดี (ได้ดาว)' },
          { value: 'penalty', label: '😣 ทำผิด (หักดาว)' },
        ]}
      />
      {groups.map(([sev, list]) => (
        <div key={sev ?? 'earn'} className="mt-4">
          {sev && (
            <h3 className="mb-2 flex items-center gap-2 px-1 font-bold" style={{ color: SEVERITY[sev].hex }}>
              <span className="size-3 rounded-full" style={{ background: SEVERITY[sev].hex }} />
              ความผิด{SEVERITY[sev].label}
            </h3>
          )}
          {list.length > 0 ? (
            <ul className="card divide-y divide-night-600/40 rounded-2xl">
              {list.map((a) => (
                <Row
                  key={a.id}
                  onClick={() => setEditing(a)}
                  left={<span className="w-9 text-center text-2xl">{a.emoji}</span>}
                  title={a.name}
                  right={
                    <span className={`font-bold tabular ${kind === 'earn' ? 'text-good' : 'text-bad'}`}>
                      {kind === 'earn' ? '+' : '−'}
                      {a.stars}
                    </span>
                  }
                />
              ))}
            </ul>
          ) : (
            <p className="px-1 text-sm text-mute">ยังไม่มีรายการ</p>
          )}
        </div>
      ))}
      <AddButton onClick={() => setEditing({ kind, severity: 'medium' })}>{kind === 'earn' ? 'เพิ่มเรื่องทำดี' : 'เพิ่มความผิด'}</AddButton>
      <ActivityEditor activity={editing} onClose={() => setEditing(null)} />
    </section>
  );
}

function ActivityEditor({ activity, onClose }) {
  const isNew = !activity?.id;
  const earn = activity?.kind === 'earn';
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [stars, setStars] = useState(1);
  const [severity, setSeverity] = useState('medium');

  useEffect(() => {
    if (!activity) return;
    setName(activity.name ?? '');
    setEmoji(activity.emoji ?? (activity.kind === 'earn' ? '⭐' : '⚠️'));
    setStars(activity.stars ?? (activity.kind === 'earn' ? 1 : 2));
    setSeverity(activity.severity ?? 'medium');
  }, [activity]);

  return (
    <EditorSheet
      open={!!activity}
      title={isNew ? (earn ? 'เพิ่มเรื่องทำดี' : 'เพิ่มความผิด') : 'แก้ไขรายการ'}
      onClose={onClose}
      onSave={async () => {
        const body = { kind: activity.kind, name, emoji, stars, severity: earn ? undefined : severity };
        if (isNew) await api.post('/api/parent/activities', body);
        else await api.put(`/api/parent/activities/${activity.id}`, body);
        toast.success('บันทึกแล้ว');
      }}
      onDelete={isNew ? null : () => api.del(`/api/parent/activities/${activity.id}`)}
      deleteText={`ลบ "${activity?.name}" ออกจากรายการ — ประวัติดาวที่เคยให้ไปแล้วยังอยู่ครบ`}
    >
      <div>
        <label className="label" htmlFor="act-name">
          {earn ? 'ทำดีอะไร' : 'ทำผิดอะไร'}
        </label>
        <input id="act-name" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </div>
      <div>
        <span className="label">{earn ? 'ได้กี่ดาว' : 'หักกี่ดาว'}</span>
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
                style={severity === key ? { borderColor: info.hex, background: `${info.hex}26`, color: info.hex } : { borderColor: 'transparent', background: 'var(--color-night-950)' }}
              >
                {info.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <span className="label">อีโมจิ</span>
        <EmojiPicker value={emoji} onChange={setEmoji} choices={earn ? EARN_EMOJIS : PENALTY_EMOJIS} />
      </div>
    </EditorSheet>
  );
}

// ---------- ของรางวัล ----------

function RewardsTab() {
  const { data } = useStore();
  const [editing, setEditing] = useState(null);
  return (
    <section>
      <p className="mb-3 px-1 text-sm text-mute">เรียงจากดาวน้อยไปมาก — ของยิ่งแพง ยิ่งต้องใช้ดาวเยอะ</p>
      {data.rewards.length > 0 && (
        <ul className="card divide-y divide-night-600/40 rounded-2xl">
          {data.rewards.map((r) => (
            <Row
              key={r.id}
              onClick={() => setEditing(r)}
              left={<span className="w-9 text-center text-2xl">{r.emoji}</span>}
              title={r.name}
              sub={CATEGORIES[r.category]?.label}
              right={<StarCount value={r.cost} size={18} />}
            />
          ))}
        </ul>
      )}
      <AddButton onClick={() => setEditing({ category: 'snack' })}>เพิ่มของรางวัล</AddButton>
      <RewardEditor reward={editing} onClose={() => setEditing(null)} />
    </section>
  );
}

function RewardEditor({ reward, onClose }) {
  const isNew = !reward?.id;
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🎁');
  const [category, setCategory] = useState('snack');
  const [cost, setCost] = useState(5);

  useEffect(() => {
    if (!reward) return;
    setName(reward.name ?? '');
    setEmoji(reward.emoji ?? '🎁');
    setCategory(reward.category ?? 'snack');
    setCost(reward.cost ?? 5);
  }, [reward]);

  return (
    <EditorSheet
      open={!!reward}
      title={isNew ? 'เพิ่มของรางวัล' : 'แก้ไขของรางวัล'}
      onClose={onClose}
      onSave={async () => {
        const body = { name, emoji, category, cost };
        if (isNew) await api.post('/api/parent/rewards', body);
        else await api.put(`/api/parent/rewards/${reward.id}`, body);
        toast.success('บันทึกแล้ว');
      }}
      onDelete={isNew ? null : () => api.del(`/api/parent/rewards/${reward.id}`)}
      deleteText={`ลบ "${reward?.name}" — คำขอที่รออนุมัติอยู่ยังอนุมัติได้ตามปกติ`}
    >
      <div>
        <label className="label" htmlFor="reward-name">
          ของรางวัล
        </label>
        <input id="reward-name" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="เช่น ไอติม 1 แท่ง" />
      </div>
      <div>
        <span className="label">หมวด</span>
        <div className="flex flex-wrap gap-2">
          {Object.entries(CATEGORIES).map(([key, c]) => (
            <button
              type="button"
              key={key}
              onClick={() => setCategory(key)}
              aria-pressed={category === key}
              className={`rounded-full px-3 py-1.5 text-[15px] font-semibold ${category === key ? 'bg-gold-400 text-[#3a2600]' : 'bg-night-950'}`}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="label">ใช้กี่ดาว</span>
        <Stepper value={cost} onChange={setCost} max={100000} />
      </div>
      <div>
        <span className="label">อีโมจิ</span>
        <EmojiPicker value={emoji} onChange={setEmoji} choices={REWARD_EMOJIS} />
      </div>
    </EditorSheet>
  );
}

// ---------- ระบบ ----------

function SystemTab() {
  const { data, loadStatus } = useStore();
  const push = usePush({ role: 'parent' }, data.pushKey);
  const [pinOpen, setPinOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  return (
    <section className="space-y-3">
      <div className="card rounded-2xl p-4">
        <p className="font-bold">🔔 แจ้งเตือนเมื่อเด็กขอแลกรางวัล</p>
        <p className="mt-1 text-sm text-mute">เปิดบนเครื่องของผู้ปกครองแต่ละคน (เปิดได้หลายเครื่อง)</p>
        {push.needsInstall ? (
          <p className="mt-2 text-sm text-gold-300">บน iPhone/iPad ต้องเพิ่มแอปไว้บนหน้าจอโฮม แล้วเปิดจากไอคอนก่อน</p>
        ) : !push.supported ? (
          <p className="mt-2 text-sm text-mute">เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน</p>
        ) : (
          <button
            className={`btn mt-3 w-full ${push.on ? 'btn-soft' : 'btn-gold'}`}
            disabled={push.busy}
            onClick={async () => {
              try {
                toast.success((await push.toggle()) === 'on' ? 'เปิดแจ้งเตือนแล้ว' : 'ปิดแจ้งเตือนแล้ว');
              } catch (err) {
                toast.error(err.message);
              }
            }}
          >
            {push.on ? '🔕 ปิดแจ้งเตือนบนเครื่องนี้' : '🔔 เปิดแจ้งเตือนบนเครื่องนี้'}
          </button>
        )}
      </div>

      <ul className="card divide-y divide-night-600/40 rounded-2xl">
          <Row onClick={() => setPinOpen(true)} left={<span className="w-9 text-center text-2xl">🔢</span>} title="เปลี่ยน PIN ผู้ปกครอง" />
          <Row
            onClick={() => setCodeOpen(true)}
            left={<span className="w-9 text-center text-2xl">🏠</span>}
            title="เปลี่ยนรหัสครอบครัว"
            sub="ทุกเครื่องต้องใส่รหัสใหม่ (ยกเว้นเครื่องนี้)"
          />
          <Row onClick={() => setLogoutOpen(true)} left={<span className="w-9 text-center text-2xl">🚪</span>} title="ออกจากระบบบนเครื่องนี้" sub="ต้องใส่รหัสครอบครัวใหม่" />
      </ul>

      <PinSheet open={pinOpen} onClose={() => setPinOpen(false)} />
      <FamilyCodeSheet open={codeOpen} onClose={() => setCodeOpen(false)} />
      <Confirm
        open={logoutOpen}
        title="ออกจากระบบบนเครื่องนี้?"
        confirmLabel="ออกจากระบบ"
        danger
        onClose={() => setLogoutOpen(false)}
        onConfirm={async () => {
          await api.post('/api/device/logout');
          await loadStatus();
        }}
      >
        เครื่องนี้จะกลับไปหน้าใส่รหัสครอบครัว ข้อมูลดาวไม่หาย
      </Confirm>
    </section>
  );
}

function PinSheet({ open, onClose }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) [setCurrent, setNext, setAgain].forEach((f) => f(''));
  }, [open]);

  async function submit(e) {
    e.preventDefault();
    if (!/^\d{4}$/.test(next)) return toast.error('PIN ใหม่ต้องเป็นตัวเลข 4 หลัก');
    if (next !== again) return toast.error('PIN ใหม่ทั้งสองช่องไม่ตรงกัน');
    setBusy(true);
    try {
      await api.put('/api/parent/pin', { currentPin: current, newPin: next });
      toast.success('เปลี่ยน PIN แล้ว');
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const pinField = (id, label, value, set) => (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="field text-center tracking-[0.4em]"
        type="password"
        inputMode="numeric"
        maxLength={4}
        value={value}
        onChange={(e) => set(e.target.value.replace(/\D/g, ''))}
        autoComplete="off"
      />
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} title="เปลี่ยน PIN ผู้ปกครอง">
      <form onSubmit={submit} className="space-y-4 pb-3">
        {pinField('pin-current', 'PIN เดิม', current, setCurrent)}
        <div className="grid grid-cols-2 gap-3">
          {pinField('pin-new', 'PIN ใหม่', next, setNext)}
          {pinField('pin-again', 'PIN ใหม่อีกครั้ง', again, setAgain)}
        </div>
        <button className="btn btn-gold w-full" disabled={busy}>
          เปลี่ยน PIN
        </button>
      </form>
    </Sheet>
  );
}

function FamilyCodeSheet({ open, onClose }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setCode('');
  }, [open]);

  async function submit(e) {
    e.preventDefault();
    if (code.trim().length < 6) return toast.error('รหัสครอบครัวต้องยาวอย่างน้อย 6 ตัวอักษร');
    setBusy(true);
    try {
      await api.put('/api/parent/family-code', { familyCode: code });
      toast.success('เปลี่ยนรหัสครอบครัวแล้ว — เครื่องอื่นต้องใส่รหัสใหม่');
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="เปลี่ยนรหัสครอบครัว">
      <form onSubmit={submit} className="space-y-4 pb-3">
        <p className="text-mute">ทุกเครื่องที่ใช้อยู่ (ยกเว้นเครื่องนี้) จะต้องใส่รหัสใหม่ — ใช้ตอนรหัสหลุดไปถึงคนนอก</p>
        <input className="field" value={code} onChange={(e) => setCode(e.target.value)} placeholder="รหัสครอบครัวใหม่ (6 ตัวอักษรขึ้นไป)" aria-label="รหัสครอบครัวใหม่" autoComplete="off" />
        <button className="btn btn-gold w-full" disabled={busy}>
          เปลี่ยนรหัส
        </button>
      </form>
    </Sheet>
  );
}
