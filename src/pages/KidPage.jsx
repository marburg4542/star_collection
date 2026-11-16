import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { useHistory } from '../lib/useHistory.js';
import { local } from '../lib/local.js';
import { usePush } from '../lib/push.js';
import { CATEGORIES, KID_COLORS } from '../lib/constants.js';
import { signed } from '../lib/format.js';
import { Avatar, Empty, Segmented, Sheet, Spinner, Star, StarCount } from '../components/ui.jsx';
import { TxList } from '../components/TxList.jsx';
import { Celebration } from '../components/Feedback.jsx';

export default function KidPage() {
  const { id } = useParams();
  const { data, kidById } = useStore();
  const kid = kidById(id);
  const [tab, setTab] = useState('rewards');
  const history = useHistory(kid?.id);
  const [celebrate, setCelebrate] = useState(null);

  // ดาวใหม่ตั้งแต่เปิดดูครั้งก่อน → ฉลอง (ครั้งแรกที่เปิดบนเครื่องนี้แค่จำไว้ ไม่เด้ง)
  useEffect(() => {
    if (!kid || !history.loaded) return;
    const key = `seen:${kid.id}`;
    const seen = local.get(key);
    const newest = history.items[0]?.id ?? 0;
    if (seen !== null) {
      const fresh = history.items.filter((t) => t.id > seen && !t.voidedAt && t.type !== 'redeem');
      // ป๊อปอัปยังเปิดอยู่แล้วมีดาวมาอีก → รวมเข้าไป ไม่ทับของเดิม
      if (fresh.length) setCelebrate((prev) => [...fresh, ...(prev ?? []).filter((p) => !fresh.some((f) => f.id === p.id))]);
    }
    if (seen === null || newest > seen) local.set(key, newest);
  }, [kid, history.loaded, history.items]);

  if (!kid) return <Navigate to="/" replace />;
  const color = KID_COLORS[kid.color]?.hex;
  const available = kid.balance - kid.reserved;
  const mine = data.requests.filter((r) => r.kidId === kid.id);

  return (
    <main className="pad-top mx-auto max-w-md px-4 pb-12">
      <header className="flex items-center justify-between py-2">
        <Link to="/" className="btn btn-soft min-h-11 px-4 text-[15px]" aria-label="กลับหน้าแรก">
          ← หน้าแรก
        </Link>
        <PushBell kid={kid} pushKey={data.pushKey} />
      </header>

      <section
        className="card relative mt-2 overflow-hidden px-5 pb-5 pt-6 text-center"
        style={{ background: `radial-gradient(120% 90% at 50% 0%, ${color}40, transparent 65%), var(--color-card)` }}
      >
        <Avatar kid={kid} size={96} ring className="mx-auto" />
        <h1 className="mt-3 text-2xl font-bold">{kid.name}</h1>
        <p className={`mt-2 flex items-center justify-center gap-2 text-6xl font-bold tabular ${kid.balance < 0 ? 'text-bad' : 'text-ink'}`}>
          <Star size={52} dim={kid.balance < 0} className={kid.balance >= 0 ? 'animate-twinkle' : ''} />
          {kid.balance < 0 ? `−${Math.abs(kid.balance)}` : kid.balance}
        </p>
        <p className="mt-1 text-mute">ดาวที่มีตอนนี้</p>
        {kid.balance < 0 && <p className="mt-3 rounded-2xl bg-bad-soft px-4 py-2 text-[15px] text-bad">ดาวติดลบอยู่ ทำดีเก็บดาวคืนกันนะ 💪</p>}
        <div className="mt-4 flex justify-center gap-2 text-sm">
          <span className="rounded-full bg-sunken px-3 py-1">
            🏆 สะสมทั้งหมด <b className="tabular">{signed(kid.total).replace('+', '')}</b>
          </span>
          {kid.reserved > 0 && (
            <span className="rounded-full bg-sunken px-3 py-1">
              ⏳ รอแลก <b className="tabular">{kid.reserved}</b>
            </span>
          )}
        </div>
      </section>

      <RequestStatus requests={mine} />

      <Segmented
        className="mt-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'rewards', label: '🎁 แลกรางวัล' },
          { value: 'history', label: '📜 ประวัติ' },
        ]}
      />

      <div className="mt-4">
        {tab === 'rewards' ? (
          <Rewards kid={kid} rewards={data.rewards} available={available} moneyRate={data.moneyRate ?? 1} />
        ) : !history.loaded ? (
          <Spinner />
        ) : history.items.length === 0 ? (
          <Empty emoji="🌱" title="ยังไม่มีประวัติ">ทำดีแล้วให้ผู้ปกครองกดให้ดาวนะ</Empty>
        ) : (
          <>
            <TxList items={history.items} />
            {history.more && (
              <button className="btn btn-soft w-full" onClick={history.loadMore} disabled={history.loadingMore}>
                ดูเก่ากว่านี้
              </button>
            )}
          </>
        )}
      </div>

      {celebrate && <Celebration kid={kid} items={celebrate} onClose={() => setCelebrate(null)} />}
    </main>
  );
}

function RequestStatus({ requests }) {
  const pending = requests.filter((r) => r.status === 'pending');
  // ผลการตัดสินใน 3 วันล่าสุด ให้เด็กรู้ว่าได้/ไม่ได้
  const decided = requests.filter((r) => (r.status === 'approved' || r.status === 'rejected') && Date.now() - Date.parse(r.decidedAt) < 3 * 864e5).slice(0, 3);
  if (!pending.length && !decided.length) return null;

  async function cancel(r) {
    try {
      await api.post(`/api/requests/${r.id}/cancel`);
      toast.success('ยกเลิกคำขอแล้ว ดาวกลับมาครบ');
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <section className="mt-4 space-y-2">
      {pending.map((r) => (
        <div key={r.id} className="card flex items-center gap-3 rounded-2xl px-4 py-3">
          <span className="text-3xl">{r.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{r.name}</p>
            <p className="text-sm text-purple-600">⏳ รอผู้ปกครองอนุมัติ · {r.cost} ดาว</p>
          </div>
          <button className="btn btn-ghost min-h-10 px-3 text-sm" onClick={() => cancel(r)}>
            ยกเลิก
          </button>
        </div>
      ))}
      {decided.map((r) => (
        <div key={r.id} className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${r.status === 'approved' ? 'bg-good-soft' : 'bg-sunken'}`}>
          <span className="text-3xl">{r.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{r.name}</p>
            <p className={`text-sm ${r.status === 'approved' ? 'text-good' : 'text-mute'}`}>
              {r.status === 'approved' ? '🎉 ได้รับอนุมัติแล้ว!' : `🙅 ยังไม่อนุมัติ${r.note ? ` — ${r.note}` : ''}`}
            </p>
          </div>
        </div>
      ))}
    </section>
  );
}

function Rewards({ kid, rewards: allRewards, available, moneyRate }) {
  const [cat, setCat] = useState('all');
  const [asking, setAsking] = useState(null);
  const [moneyOpen, setMoneyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // การ์ดเงินราคาตายตัวไม่แสดงในหน้าเด็ก — ใช้การ์ด "แลกเป็นเงิน" ที่กรอกจำนวนเองแทน
  const rewards = useMemo(() => allRewards.filter((r) => r.category !== 'money'), [allRewards]);
  const cats = useMemo(
    () => Object.keys(CATEGORIES).filter((c) => (c === 'money' ? moneyRate > 0 : rewards.some((r) => r.category === c))),
    [rewards, moneyRate],
  );
  const shown = cat === 'all' ? rewards : rewards.filter((r) => r.category === cat);
  const showMoney = moneyRate > 0 && (cat === 'all' || cat === 'money');

  if (!rewards.length && !moneyRate) return <Empty emoji="🎁" title="ยังไม่มีของรางวัล">ให้ผู้ปกครองเพิ่มของรางวัลในหน้าตั้งค่า</Empty>;

  async function ask() {
    setBusy(true);
    try {
      await api.post('/api/requests', { kidId: kid.id, rewardId: asking.id });
      toast.success('ส่งคำขอแล้ว รอผู้ปกครองอนุมัตินะ ⏳');
      setAsking(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {cats.length > 1 && (
        <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="หมวดของรางวัล">
          {[['all', 'ทั้งหมด', '✨'], ...cats.map((c) => [c, CATEGORIES[c].label, CATEGORIES[c].emoji])].map(([value, label, emoji]) => (
            <button
              key={value}
              role="tab"
              aria-selected={cat === value}
              onClick={() => setCat(value)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-[15px] font-semibold ${cat === value ? 'bg-purple-600 text-on-primary' : 'chip-off'}`}
            >
              <span className="text-lg">{emoji}</span>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {showMoney && <MoneyCard rate={moneyRate} available={available} onOpen={() => setMoneyOpen(true)} />}
        {shown.map((r) => {
          const can = available >= r.cost;
          const need = r.cost - available; // ติดลบอยู่ก็ต้องเก็บคืนให้ถึง 0 ก่อน
          const pct = Math.max(0, Math.min(1, available / r.cost));
          return (
            <button
              key={r.id}
              onClick={() => (can ? setAsking(r) : toast(`ยังขาดอีก ${need} ดาว สู้ๆ! 💪`, { icon: '⭐' }))}
              className={`card flex flex-col items-center gap-1.5 px-3 pb-3 pt-4 text-center transition-transform active:scale-95 ${can ? 'border-pink-500 bg-pink-50' : ''}`}
            >
              <span className={`text-5xl ${can ? '' : 'opacity-60 grayscale-[35%]'}`}>{r.emoji}</span>
              <span className="line-clamp-2 min-h-[2.7em] text-[15px] font-semibold leading-snug">{r.name}</span>
              <span className="rounded-full bg-sunken px-3 py-0.5">
                <StarCount value={r.cost} size={16} />
              </span>
              {can ? (
                <span className="mt-1 text-sm font-bold text-purple-600">แตะเพื่อขอแลก</span>
              ) : (
                <span className="mt-1 w-full">
                  <span className="block h-2 overflow-hidden rounded-full bg-sunken">
                    <span className="block h-full rounded-full bg-gold-400" style={{ width: `${pct * 100}%` }} />
                  </span>
                  <span className="mt-1 block text-xs text-mute">อีก {need} ดาว</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Sheet
        open={!!asking}
        onClose={() => setAsking(null)}
        title="ขอแลกรางวัล"
        footer={
          <div className="flex gap-3">
            <button className="btn btn-soft flex-1" onClick={() => setAsking(null)}>
              ยังก่อน
            </button>
            <button className="btn btn-primary flex-[2] text-lg" onClick={ask} disabled={busy}>
              ขอแลกเลย 🙏
            </button>
          </div>
        }
      >
        {asking && (
          <div className="pb-2 text-center">
            <div className="my-2 text-7xl animate-pop">{asking.emoji}</div>
            <p className="text-xl font-bold">{asking.name}</p>
            <p className="mt-3 flex items-center justify-center gap-2 text-mute">
              ใช้ <StarCount value={asking.cost} size={18} className="text-ink" /> · เหลือ <StarCount value={available - asking.cost} size={18} className="text-ink" />
            </p>
            <p className="mt-3 text-sm text-mute">ผู้ปกครองต้องกดอนุมัติก่อน ดาวถึงจะถูกใช้นะ</p>
          </div>
        )}
      </Sheet>
      <MoneySheet open={moneyOpen} onClose={() => setMoneyOpen(false)} kid={kid} rate={moneyRate} available={available} />
    </>
  );
}

function MoneyCard({ rate, available, onOpen }) {
  const can = available >= 1;
  return (
    <button
      onClick={() => (can ? onOpen() : toast(`ยังขาดอีก ${1 - available} ดาว สู้ๆ! 💪`, { icon: '⭐' }))}
      className={`card flex flex-col items-center gap-1.5 px-3 pb-3 pt-4 text-center transition-transform active:scale-95 ${can ? 'border-pink-500 bg-pink-50' : ''}`}
    >
      <span className={`text-5xl ${can ? '' : 'opacity-60 grayscale-[35%]'}`}>💵</span>
      <span className="line-clamp-2 min-h-[2.7em] text-[15px] font-semibold leading-snug">แลกเป็นเงิน</span>
      <span className="flex items-center gap-1 rounded-full bg-sunken px-3 py-0.5 text-[15px] font-semibold">
        <StarCount value={1} size={16} /> = {rate} บาท
      </span>
      {can ? (
        <span className="mt-1 text-sm font-bold text-purple-600">แตะเพื่อขอแลก</span>
      ) : (
        <span className="mt-1 text-xs text-mute">อีก {1 - available} ดาว</span>
      )}
    </button>
  );
}

function MoneySheet({ open, onClose, kid, rate, available }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setAmount('');
  }, [open]);

  const max = Math.max(0, available) * rate; // ไม่เกินดาวที่มี (หักดาวที่จองไว้กับคำขออื่นแล้ว)
  const baht = parseInt(amount, 10) || 0;
  const cost = Math.ceil(baht / rate);
  const over = baht > max;
  const ok = baht >= 1 && !over;
  const quick = [...[20, 50, 100].filter((v) => v < max), max];

  async function ask() {
    setBusy(true);
    try {
      await api.post('/api/requests', { kidId: kid.id, baht });
      toast.success('ส่งคำขอแล้ว รอผู้ปกครองอนุมัตินะ ⏳');
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="แลกดาวเป็นเงิน"
      footer={
        <div className="flex gap-3">
          <button className="btn btn-soft flex-1" onClick={onClose}>
            ยังก่อน
          </button>
          <button className="btn btn-primary flex-[2] text-lg" onClick={ask} disabled={busy || !ok}>
            ขอแลกเลย 🙏
          </button>
        </div>
      }
    >
      <div className="pb-2 text-center">
        <div className="my-2 text-6xl">💵</div>
        <label htmlFor="money-amount" className="text-lg font-bold">
          อยากได้เงินกี่บาท?
        </label>
        <div className="mt-3 flex items-center justify-center gap-2">
          <input
            id="money-amount"
            className={`field w-40 text-center text-3xl font-bold tabular ${over ? 'text-bad' : ''}`}
            inputMode="numeric"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 6))}
            aria-describedby="money-hint"
          />
          <span className="text-xl font-bold">บาท</span>
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {quick.map((v, i) => (
            <button
              key={v}
              type="button"
              onClick={() => setAmount(String(v))}
              aria-pressed={baht === v}
              className={`rounded-full px-3 py-1.5 text-[15px] font-semibold ${baht === v ? 'bg-purple-600 text-on-primary' : 'chip-off'}`}
            >
              {i === quick.length - 1 ? `ทั้งหมด ${v.toLocaleString()}` : v}
            </button>
          ))}
        </div>
        <p id="money-hint" className={`mt-3 text-[15px] ${over ? 'font-semibold text-bad' : 'text-mute'}`}>
          {over ? 'เกินดาวที่มี — ' : ''}ได้สูงสุด {max.toLocaleString()} บาท
        </p>
        {ok && (
          <p className="mt-2 flex items-center justify-center gap-2 text-mute">
            ใช้ <StarCount value={cost} size={18} className="text-ink" /> · เหลือ <StarCount value={available - cost} size={18} className="text-ink" />
          </p>
        )}
        <p className="mt-3 text-sm text-mute">ผู้ปกครองต้องกดอนุมัติก่อน ดาวถึงจะถูกใช้นะ</p>
      </div>
    </Sheet>
  );
}

function PushBell({ kid, pushKey }) {
  const push = usePush({ role: 'kid', kidId: kid.id }, pushKey);
  if (!push.supported && !push.needsInstall) return null;
  return (
    <button
      className={`btn min-h-11 px-4 text-[15px] ${push.on ? 'btn-soft text-purple-600' : 'btn-soft'}`}
      disabled={push.busy}
      onClick={async () => {
        if (push.needsInstall) {
          toast('บน iPhone/iPad ต้องเพิ่มแอปไว้บนหน้าจอโฮมก่อน แล้วเปิดจากไอคอน', { icon: '📲', duration: 6000 });
          return;
        }
        try {
          const result = await push.toggle();
          toast.success(result === 'on' ? `เปิดแจ้งเตือนของ${kid.name}แล้ว` : 'ปิดแจ้งเตือนแล้ว');
        } catch (err) {
          toast.error(err.message);
        }
      }}
      aria-pressed={push.on}
    >
      {push.on ? '🔔 แจ้งเตือนเปิดอยู่' : '🔕 เปิดแจ้งเตือน'}
    </button>
  );
}
