import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api.js';
import { useStore } from '../../lib/store.jsx';
import { dayLabel, timeOf } from '../../lib/format.js';
import { Avatar, Empty, Sheet, StarCount } from '../../components/ui.jsx';

const STATUS = {
  approved: { label: '✅ อนุมัติแล้ว', cls: 'text-good' },
  rejected: { label: '🙅 ไม่อนุมัติ', cls: 'text-mute' },
  cancelled: { label: '↩ ยกเลิก', cls: 'text-mute' },
};
const REJECT_REASONS = ['ไว้วันหลังนะ', 'ไว้วันหยุดนะ', 'ทำการบ้านให้เสร็จก่อน', 'ตอนนี้ยังไม่สะดวก'];

export default function Requests() {
  const { data, kidById } = useStore();
  const pending = data.requests.filter((r) => r.status === 'pending');
  const done = data.requests.filter((r) => r.status !== 'pending');
  const [rejecting, setRejecting] = useState(null);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);

  async function approve(r) {
    setBusyId(r.id);
    try {
      await api.post(`/api/parent/requests/${r.id}/approve`);
      toast.success(`อนุมัติ ${r.emoji} ${r.name} ให้${kidById(r.kidId)?.name ?? ''}แล้ว`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-lg font-bold">รออนุมัติ {pending.length > 0 && <span className="text-purple-600">({pending.length})</span>}</h2>
        <button className="btn btn-soft min-h-10 px-4 text-sm" onClick={() => setRedeemOpen(true)}>
          🎁 แลกให้เลย
        </button>
      </div>

      {pending.length === 0 ? (
        <div className="card rounded-2xl">
          <Empty emoji="📭" title="ไม่มีคำขอค้างอยู่">เมื่อเด็กกดขอแลกของรางวัล จะขึ้นที่นี่</Empty>
        </div>
      ) : (
        <ul className="space-y-3">
          {pending.map((r) => {
            const kid = kidById(r.kidId);
            const short = kid && kid.balance < r.cost;
            return (
              <li key={r.id} className="card rounded-2xl p-4 animate-rise">
                <div className="flex items-center gap-3">
                  <Avatar kid={kid} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{kid?.name} ขอแลก</p>
                    <p className="text-[13px] text-mute">
                      {dayLabel(r.createdAt)} {timeOf(r.createdAt)} · มี ⭐ {kid?.balance}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3 rounded-2xl bg-sunken px-3 py-2.5">
                  <span className="text-4xl">{r.emoji}</span>
                  <span className="min-w-0 flex-1 font-semibold">{r.name}</span>
                  <StarCount value={r.cost} size={20} className="text-lg" />
                </div>
                {short && <p className="mt-2 text-sm text-bad">ดาวไม่พอแล้ว (อาจโดนหักหลังขอ) — อนุมัติไม่ได้</p>}
                <div className="mt-3 flex gap-2">
                  <button className="btn btn-soft flex-1" onClick={() => setRejecting(r)} disabled={busyId === r.id}>
                    ✗ ไม่อนุมัติ
                  </button>
                  <button className="btn btn-primary flex-[1.4]" onClick={() => approve(r)} disabled={busyId === r.id || short}>
                    ✓ อนุมัติ
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {done.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 px-1 text-lg font-bold">ล่าสุด (14 วัน)</h2>
          <ul className="card divide-y divide-hair rounded-2xl">
            {done.map((r) => {
              const kid = kidById(r.kidId);
              return (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="text-2xl">{r.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.name}</p>
                    <p className="text-[13px] text-mute">
                      {kid?.avatar} {kid?.name} · {dayLabel(r.decidedAt ?? r.createdAt)}
                      {r.note && ` · “${r.note}”`}
                    </p>
                  </div>
                  <span className={`shrink-0 text-sm font-semibold ${STATUS[r.status]?.cls}`}>{STATUS[r.status]?.label}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <RejectSheet request={rejecting} onClose={() => setRejecting(null)} />
      <RedeemSheet open={redeemOpen} onClose={() => setRedeemOpen(false)} />
    </div>
  );
}

function RejectSheet({ request, onClose }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setNote(''), [request]);

  async function reject() {
    setBusy(true);
    try {
      await api.post(`/api/parent/requests/${request.id}/reject`, { note });
      toast.success('แจ้งเด็กแล้ว ดาวยังอยู่ครบ');
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!request}
      onClose={onClose}
      title="ไม่อนุมัติคำขอ"
      footer={
        <button className="btn btn-danger w-full" onClick={reject} disabled={busy}>
          ไม่อนุมัติ {request?.emoji} {request?.name}
        </button>
      }
    >
      <p className="mb-3 text-mute">บอกเหตุผลให้เด็กรู้ (ไม่ใส่ก็ได้)</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {REJECT_REASONS.map((r) => (
          <button key={r} type="button" onClick={() => setNote(r)} className={`rounded-full px-3 py-1.5 text-sm ${note === r ? 'bg-purple-600 text-white' : 'bg-sunken'}`}>
            {r}
          </button>
        ))}
      </div>
      <input className="field mb-2" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="หรือพิมพ์เอง" aria-label="เหตุผล" />
    </Sheet>
  );
}

function RedeemSheet({ open, onClose }) {
  const { data } = useStore();
  const [kidId, setKidId] = useState(null);
  const [rewardId, setRewardId] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setKidId(data.kids.length === 1 ? data.kids[0].id : null);
      setRewardId(null);
    }
  }, [open, data.kids]);

  const kid = data.kids.find((k) => k.id === kidId);
  const reward = data.rewards.find((r) => r.id === rewardId);
  const available = kid ? kid.balance - kid.reserved : 0;

  async function redeem() {
    setBusy(true);
    try {
      await api.post('/api/parent/redeem', { kidId, rewardId });
      toast.success(`แลก ${reward.emoji} ${reward.name} ให้${kid.name}แล้ว`);
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
      title="แลกของรางวัลให้"
      footer={
        <button className="btn btn-primary w-full text-lg" onClick={redeem} disabled={busy || !kid || !reward || available < reward.cost}>
          {reward ? (
            <>
              แลกให้ (ใช้ <StarCount value={reward.cost} size={18} />)
            </>
          ) : (
            'เลือกเด็กและของรางวัล'
          )}
        </button>
      }
    >
      <p className="label">ให้ใคร</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {data.kids.map((k) => (
          <button
            key={k.id}
            onClick={() => setKidId(k.id)}
            aria-pressed={kidId === k.id}
            className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 ${kidId === k.id ? 'bg-purple-600 text-white' : 'bg-sunken'}`}
          >
            <Avatar kid={k} size={32} />
            <span className="font-semibold">{k.name}</span>
            <span className="text-xs opacity-75">⭐ {k.balance - k.reserved}</span>
          </button>
        ))}
      </div>
      <p className="label">ของรางวัล</p>
      <ul className="space-y-1.5 pb-2">
        {data.rewards.map((r) => {
          const can = !kid || available >= r.cost;
          return (
            <li key={r.id}>
              <button
                onClick={() => setRewardId(r.id)}
                disabled={!can}
                aria-pressed={rewardId === r.id}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left ${rewardId === r.id ? 'bg-purple-300/40 ring-2 ring-purple-500' : 'bg-sunken'} ${can ? '' : 'opacity-40'}`}
              >
                <span className="text-2xl">{r.emoji}</span>
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <StarCount value={r.cost} size={16} />
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
