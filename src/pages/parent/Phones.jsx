// มือถือของลูก: ดูเวลาที่ใช้วันนี้, ล็อค/ปลดล็อค, ให้เวลาเพิ่ม, ปิดกติกาชั่วคราว, ตั้งกติกา, จับคู่เครื่องใหม่
// แอปบนมือถือลูก (ล็อคจอ) เป็นคนบังคับใช้ — หน้านี้แค่ส่งคำสั่งและแสดงสิ่งที่เครื่องรายงานมา
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api.js';
import { useStore } from '../../lib/store.jsx';
import { ago, dayLabel, dayToDate, duration, minutesUntil, timeOf, todayType, weekdayShort } from '../../lib/format.js';
import { Avatar, Empty, Sheet, Spinner } from '../../components/ui.jsx';
import { Confirm } from '../../components/Feedback.jsx';

const LOCK = {
  manual: { icon: '🔒', text: 'ผู้ปกครองล็อคไว้' },
  bedtime: { icon: '😴', text: 'เวลานอน' },
  limit: { icon: '⌛', text: 'หมดเวลาเล่นวันนี้' },
  tamper: { icon: '⚠️', text: 'สิทธิ์ในเครื่องถูกปิด ต้องให้ผู้ปกครองแก้' },
};
const GRANT_CHOICES = [15, 30, 60, 120];

export default function Phones() {
  const { data, changeTick, kidById } = useStore();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setInfo(await api.get('/api/parent/phones'));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // SSE บอกเมื่อเครื่องต่อ/หลุด/เปลี่ยนสถานะ · เวลาที่ใช้ขยับทุกนาทีจึงโหลดซ้ำทุก 30 วิ ระหว่างเปิดหน้านี้
  useEffect(() => {
    load();
  }, [load, changeTick]);
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (!info) return error ? <p className="py-10 text-center text-mute">{error}</p> : <Spinner />;

  const byKid = data.kids.map((k) => ({ kid: k, phones: info.phones.filter((p) => p.kidId === k.id) })).filter((g) => g.phones.length);
  const requests = info.timeRequests.filter((r) => r.status === 'pending');

  return (
    <div>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-lg font-bold">มือถือของลูก</h2>
        <button className="btn btn-soft min-h-10 px-4 text-sm" onClick={() => setAdding(true)} disabled={!data.kids.length}>
          + เพิ่มมือถือ
        </button>
      </div>

      {requests.length > 0 && (
        <ul className="mb-5 space-y-3">
          {requests.map((r) => (
            <TimeRequestCard key={r.id} request={r} kid={kidById(r.kidId)} onDone={load} />
          ))}
        </ul>
      )}

      {byKid.length === 0 ? (
        <div className="card rounded-2xl">
          <Empty emoji="📱" title="ยังไม่มีมือถือที่จับคู่">
            ติดตั้งแอป “ล็อคจอ” บนมือถือลูกและตั้งเป็น Device Owner ก่อน แล้วกด “เพิ่มมือถือ” เพื่อรับรหัสจับคู่
          </Empty>
        </div>
      ) : (
        <div className="space-y-4">
          {byKid.map(({ kid, phones }) => (
            <KidCard key={kid.id} kid={kid} phones={phones} info={info.kids[kid.id]} today={info.today} onChanged={load} />
          ))}
        </div>
      )}

      <AddPhoneSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

// ---------- คำขอเวลาเพิ่มจากเครื่องลูก ----------

function TimeRequestCard({ request, kid, onDone }) {
  const [busy, setBusy] = useState(false);
  async function decide(action) {
    setBusy(true);
    try {
      await api.post(`/api/parent/time-requests/${request.id}/${action}`);
      toast.success(action === 'approve' ? `ให้${kid?.name ?? ''}เล่นเพิ่ม ${request.minutes} นาทีแล้ว` : 'แจ้งเครื่องลูกแล้ว');
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="card animate-rise rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <Avatar kid={kid} size={44} />
        <div className="min-w-0 flex-1">
          <p className="font-bold">
            {kid?.name} ขอเวลาเล่นเพิ่ม {request.minutes} นาที
          </p>
          <p className="text-[13px] text-mute">
            {dayLabel(request.createdAt)} {timeOf(request.createdAt)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button className="btn btn-soft flex-1" onClick={() => decide('reject')} disabled={busy}>
          ✗ ไม่อนุมัติ
        </button>
        <button className="btn btn-primary flex-[1.4]" onClick={() => decide('approve')} disabled={busy}>
          ✓ ให้เล่นเพิ่ม
        </button>
      </div>
    </li>
  );
}

// ---------- การ์ดของเด็กแต่ละคน ----------

function KidCard({ kid, phones, info, today, onChanged }) {
  const [sheet, setSheet] = useState(null); // 'grant' | 'pause' | 'rules' | { phone }
  const rules = info.rules;
  const limit = rules.enabled ? rules.limits[todayType()] : null;
  const allowance = limit === null ? null : limit * 60 + info.grantMinutes * 60;
  const paused = info.pausedUntil && Date.parse(info.pausedUntil) > Date.now();
  const pct = allowance ? Math.min(100, (info.usedSec / allowance) * 100) : 0;

  return (
    <section className="card rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <Avatar kid={kid} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{kid.name}</p>
          <p className="text-[13px] text-mute">
            {!rules.enabled ? 'ปิดกติกาเวลาอยู่' : paused ? `⏸️ ปิดกติกาถึง ${timeOf(info.pausedUntil)}` : limit === null ? 'วันนี้ไม่จำกัดเวลา' : `วันนี้ได้ ${duration(allowance)}`}
            {info.grantMinutes > 0 && ` (มีเวลาพิเศษ +${duration(info.grantMinutes * 60)})`}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-sunken px-3 py-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-mute">ใช้ไปวันนี้</span>
          <span className="font-bold tabular">
            {duration(info.usedSec)}
            {allowance !== null && <span className="font-normal text-mute"> / {duration(allowance)}</span>}
          </span>
        </div>
        {allowance !== null && (
          <div className="mt-2 h-2.5 overflow-hidden rounded-full border-2 border-line bg-card">
            <div className={`h-full ${pct >= 100 ? 'bg-bad' : 'bg-purple-500'}`} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      <ul className="mt-3 divide-y divide-hair">
        {phones.map((p) => (
          <PhoneRow key={p.id} phone={p} today={today} onMenu={() => setSheet({ phone: p })} onChanged={onChanged} />
        ))}
      </ul>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="btn btn-soft min-h-11 whitespace-nowrap px-2 text-sm" onClick={() => setSheet('grant')}>
          ⏱️ เพิ่มเวลา
        </button>
        <button className="btn btn-soft min-h-11 whitespace-nowrap px-2 text-sm" onClick={() => setSheet('pause')}>
          {paused ? '▶️ เปิดกติกา' : '⏸️ พักกติกา'}
        </button>
        <button className="btn btn-soft min-h-11 whitespace-nowrap px-2 text-sm" onClick={() => setSheet('report')}>
          📊 รายงานแอป
        </button>
        <button className="btn btn-soft min-h-11 whitespace-nowrap px-2 text-sm" onClick={() => setSheet('rules')}>
          ⚙️ กติกา
        </button>
      </div>

      <ReportSheet open={sheet === 'report'} kid={kid} onClose={() => setSheet(null)} />
      <GrantSheet open={sheet === 'grant'} kid={kid} onClose={() => setSheet(null)} onDone={onChanged} />
      <PauseSheet open={sheet === 'pause'} kid={kid} paused={paused} onClose={() => setSheet(null)} onDone={onChanged} />
      <RulesSheet open={sheet === 'rules'} kid={kid} info={info} onClose={() => setSheet(null)} onDone={onChanged} />
      <PhoneMenu phone={sheet?.phone ?? null} onClose={() => setSheet(null)} onDone={onChanged} />
    </section>
  );
}

function PhoneRow({ phone, today, onMenu, onChanged }) {
  const [busy, setBusy] = useState(false);
  const report = phone.report?.day === today ? phone.report : null;
  const lock = report?.lock ? LOCK[report.lock] : null;

  async function toggleLock() {
    setBusy(true);
    try {
      const { online } = await api.post(`/api/parent/phones/${phone.id}/lock`, { locked: !phone.locked });
      toast.success(phone.locked ? 'ปลดล็อคแล้ว' : online ? 'ล็อคเครื่องแล้ว' : 'สั่งล็อคแล้ว — เครื่องจะล็อคเมื่อต่อเน็ต');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-2xl" aria-hidden="true">
          📱
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{phone.name}</p>
          <p className="text-[13px] text-mute">
            {phone.releasing ? (
              <span className="text-bad">กำลังยกเลิกการควบคุม รอเครื่องต่อเน็ต</span>
            ) : phone.online ? (
              <span className="font-semibold text-good">● ออนไลน์</span>
            ) : (
              `ออฟไลน์ · ล่าสุด ${phone.lastSeenAt ? `${dayLabel(phone.lastSeenAt)} ${timeOf(phone.lastSeenAt)}` : '-'}`
            )}
            {lock && ` · ${lock.icon} ${lock.text}`}
            {!lock && report?.remainingSec != null && ` · เหลือ ${duration(report.remainingSec)}`}
          </p>
        </div>
        <button className={`btn min-h-10 shrink-0 px-3 text-sm ${phone.locked ? 'btn-primary' : 'btn-soft'}`} onClick={toggleLock} disabled={busy || phone.releasing}>
          {phone.locked ? '🔓 ปลดล็อค' : '🔒 ล็อคเลย'}
        </button>
        <button onClick={onMenu} className="grid size-10 shrink-0 place-items-center rounded-full text-xl text-mute" aria-label={`ตัวเลือกของ ${phone.name}`}>
          ⋯
        </button>
      </div>
      <LocationLine phone={phone} onChanged={onChanged} />
    </li>
  );
}

/** ตำแหน่งล่าสุดของเครื่อง + ขอตำแหน่งตอนนี้ + เปิดใน Google Maps */
function LocationLine({ phone, onChanged }) {
  const [asking, setAsking] = useState(false);
  const loc = phone.location;
  const status = phone.report?.location;
  // ขอไปแล้วแต่ตำแหน่งใหม่ยังไม่มา (รอไม่เกิน 2 นาที)
  const waiting =
    phone.locateRequestedAt &&
    Date.now() - Date.parse(phone.locateRequestedAt) < 120_000 &&
    (!loc || Date.parse(loc.at) < Date.parse(phone.locateRequestedAt) - 60_000);

  async function locate() {
    setAsking(true);
    try {
      const { online } = await api.post(`/api/parent/phones/${phone.id}/locate`);
      if (!online) toast('เครื่องออฟไลน์อยู่ จะส่งตำแหน่งเมื่อต่อเน็ต', { icon: '📍' });
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAsking(false);
    }
  }

  const note =
    status === 'no-permission'
      ? 'ยังไม่ได้ให้สิทธิ์ตำแหน่ง (ใส่ PIN บนเครื่อง → ให้สิทธิ์ตำแหน่ง)'
      : status === 'off'
        ? 'ตำแหน่ง (GPS) ของเครื่องปิดอยู่'
        : null;

  return (
    <div className="mt-1.5 pl-9 text-[13px]">
      <p className="text-mute">
        📍 ตำแหน่ง{' '}
        {waiting ? 'กำลังขอ…' : loc ? `${ago(loc.at)}${loc.accuracy ? ` · แม่นยำ ±${loc.accuracy} ม.` : ''}` : 'ยังไม่มี'}
      </p>
      {note && <p className="text-bad">{note}</p>}
      <div className="mt-1.5 flex flex-wrap gap-2">
        {loc && (
          <a
            className="btn btn-soft min-h-9 px-3 text-[13px]"
            href={`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            🗺️ แผนที่
          </a>
        )}
        <button className="btn btn-soft min-h-9 px-3 text-[13px]" onClick={locate} disabled={asking || waiting || phone.releasing} aria-label="ขอตำแหน่งตอนนี้">
          🔄 ขอตำแหน่ง
        </button>
      </div>
    </div>
  );
}

// ---------- หน้าต่างคำสั่ง ----------

function useAction(onDone, onClose) {
  const [busy, setBusy] = useState(false);
  const run = async (fn, message) => {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return [busy, run];
}

function GrantSheet({ open, kid, onClose, onDone }) {
  const [busy, run] = useAction(onDone, onClose);
  return (
    <Sheet open={open} onClose={onClose} title={`ให้${kid.name}เล่นเพิ่มวันนี้`}>
      <p className="mb-3 text-mute">เพิ่มจากเวลาที่ได้ตามกติกา ใช้ได้ถึงเที่ยงคืน (เวลานอนยังล็อคตามปกติ)</p>
      <div className="grid grid-cols-2 gap-2 pb-3">
        {GRANT_CHOICES.map((m) => (
          <button
            key={m}
            className="btn btn-soft text-lg"
            disabled={busy}
            onClick={() => run(() => api.post(`/api/parent/kids/${kid.id}/screen-grants`, { minutes: m }), `ให้${kid.name}เล่นเพิ่ม ${duration(m * 60)}แล้ว`)}
          >
            +{duration(m * 60)}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function PauseSheet({ open, kid, paused, onClose, onDone }) {
  const [busy, run] = useAction(onDone, onClose);
  const pause = (minutes, message) => run(() => api.post(`/api/parent/kids/${kid.id}/screen-pause`, { minutes }), message);
  const choices = [
    { label: '30 นาที', minutes: 30 },
    { label: '1 ชั่วโมง', minutes: 60 },
    { label: '2 ชั่วโมง', minutes: 120 },
    { label: 'ถึงพรุ่งนี้ 07:00', minutes: minutesUntil('07:00') },
  ];
  return (
    <Sheet open={open} onClose={onClose} title={paused ? 'เปิดกติกากลับ' : `พักกติกาของ${kid.name}`}>
      {paused ? (
        <div className="pb-3">
          <p className="mb-3 text-mute">กลับไปนับเวลาและล็อคตามกติกาทันที</p>
          <button className="btn btn-primary w-full" disabled={busy} onClick={() => pause(0, 'เปิดกติกากลับแล้ว')}>
            ▶️ เปิดกติกาตอนนี้
          </button>
        </div>
      ) : (
        <div className="pb-3">
          <p className="mb-3 text-mute">ไม่นับเวลาและไม่ล็อคตามกติกาชั่วคราว (เช่น ใช้ทำการบ้าน หรือเดินทาง) — ถ้าผู้ปกครองสั่งล็อคไว้ยังล็อคอยู่</p>
          <div className="grid grid-cols-2 gap-2">
            {choices.map((c) => (
              <button key={c.label} className="btn btn-soft" disabled={busy} onClick={() => pause(c.minutes, `พักกติกา ${c.label}`)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ---------- รายงานการใช้แอป ----------

const TOP_APPS = 12;

function ReportSheet({ open, kid, onClose }) {
  const [days, setDays] = useState(null);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0); // 0 = วันนี้

  useEffect(() => {
    if (!open) return;
    setDays(null);
    setError('');
    setIndex(0);
    api
      .get(`/api/parent/kids/${kid.id}/app-usage?days=7`)
      .then((r) => setDays(r.days))
      .catch((err) => setError(err.message));
  }, [open, kid.id]);

  const day = days?.[index];
  const apps = day?.apps ?? [];
  const top = apps.slice(0, TOP_APPS);
  const rest = apps.slice(TOP_APPS);
  const longest = Math.max(1, top[0]?.sec ?? 0);

  return (
    <Sheet open={open} onClose={onClose} title={`การใช้แอปของ${kid.name}`}>
      {!days ? (
        error ? <p className="py-8 text-center text-mute">{error}</p> : <Spinner label="กำลังโหลดรายงาน…" />
      ) : (
        <div className="pb-3">
          <WeekBars days={days} index={index} onSelect={setIndex} />

          <div className="mt-4 flex items-baseline justify-between gap-3">
            <h3 className="font-bold">{index === 0 ? 'วันนี้' : dayLabel(dayToDate(day.day).toISOString())}</h3>
            <span className="font-bold tabular">{duration(day.totalSec)}</span>
          </div>
          <p className="text-[13px] text-mute">นับทุกแอปที่เปิดอยู่บนหน้าจอ รวมโทรศัพท์และแอปที่ใช้ได้เสมอ</p>

          {apps.length === 0 ? (
            <p className="mt-3 rounded-2xl bg-sunken px-3 py-4 text-center text-sm text-mute">
              {index === 0 ? 'ยังไม่มีข้อมูลวันนี้ — มือถือส่งรายงานทุก 5 นาทีเมื่อต่อเน็ต' : 'ไม่มีการใช้แอปในวันนี้'}
            </p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {top.map((a) => (
                <li key={a.pkg}>
                  <div className="flex items-baseline justify-between gap-3 text-[15px]">
                    <span className="min-w-0 truncate font-semibold">{a.label}</span>
                    <span className="shrink-0 tabular text-mute">{a.sec < 60 ? 'ไม่ถึง 1 นาที' : duration(a.sec)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-sunken">
                    <div className="h-full rounded-full bg-purple-500" style={{ width: `${Math.max(2, (a.sec / longest) * 100)}%` }} />
                  </div>
                </li>
              ))}
              {rest.length > 0 && (
                <li className="flex items-baseline justify-between gap-3 text-[15px] text-mute">
                  <span>อื่นๆ อีก {rest.length} แอป</span>
                  <span className="tabular">{duration(rest.reduce((s, a) => s + a.sec, 0))}</span>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}

/** กราฟแท่งเวลารวม 7 วัน (เก่า → ใหม่) แตะแท่งเพื่อดูรายแอปของวันนั้น */
function WeekBars({ days, index, onSelect }) {
  const max = Math.max(1, ...days.map((d) => d.totalSec));
  const ordered = days.map((d, i) => ({ ...d, i })).reverse();
  return (
    <div role="group" aria-label="เวลาใช้แอปรวม 7 วันล่าสุด" className="flex h-36 items-stretch gap-1.5 rounded-2xl bg-sunken px-2 pb-2 pt-3">
      {ordered.map((d) => {
        const active = d.i === index;
        const label = d.i === 0 ? 'วันนี้' : weekdayShort(d.day);
        return (
          <button
            key={d.day}
            type="button"
            onClick={() => onSelect(d.i)}
            aria-pressed={active}
            aria-label={`${label} ใช้แอปรวม ${duration(d.totalSec)}`}
            title={`${label} · ${duration(d.totalSec)}`}
            className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg"
          >
            <span className="flex w-full flex-1 items-end">
              <span
                className={`w-full rounded-t-[4px] ${active ? 'bg-purple-600 outline-2 outline-line' : 'bg-purple-500'}`}
                style={{ height: d.totalSec ? `${Math.max(3, (d.totalSec / max) * 100)}%` : '2px', opacity: d.totalSec ? 1 : 0.35 }}
              />
            </span>
            <span className={`text-[11px] leading-none ${active ? 'font-bold text-ink' : 'text-mute'}`}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- ตั้งกติกา ----------

function LimitField({ label, value, onChange }) {
  const unlimited = value === null;
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-soft size-11 !p-0 text-xl" disabled={unlimited || value <= 0} onClick={() => onChange(Math.max(0, value - 15))} aria-label="ลด 15 นาที">
          −
        </button>
        <span className="flex-1 text-center text-lg font-bold">{unlimited ? 'ไม่จำกัด' : value === 0 ? 'ห้ามเล่น' : duration(value * 60)}</span>
        <button type="button" className="btn btn-soft size-11 !p-0 text-xl" disabled={!unlimited && value >= 1440} onClick={() => onChange(unlimited ? 120 : Math.min(1440, value + 15))} aria-label="เพิ่ม 15 นาที">
          +
        </button>
      </div>
      <label className="mt-2 flex items-center gap-2 text-[15px]">
        <input type="checkbox" className="size-5 accent-purple-600" checked={unlimited} onChange={(e) => onChange(e.target.checked ? null : 120)} />
        ไม่จำกัดเวลา
      </label>
    </div>
  );
}

function BedtimeField({ label, value, onChange, fallback }) {
  const id = label.replace(/\s/g, '');
  return (
    <div>
      <label className="label flex items-center gap-2">
        <input type="checkbox" className="size-5 accent-purple-600" checked={!!value} onChange={(e) => onChange(e.target.checked ? fallback : null)} />
        {label}
      </label>
      {value && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-mute" htmlFor={`${id}-start`}>
              ล็อคตั้งแต่
            </label>
            <input id={`${id}-start`} type="time" className="field" value={value.start} onChange={(e) => onChange({ ...value, start: e.target.value })} />
          </div>
          <div>
            <label className="text-sm text-mute" htmlFor={`${id}-end`}>
              ถึง (เช้าวันถัดไป)
            </label>
            <input id={`${id}-end`} type="time" className="field" value={value.end} onChange={(e) => onChange({ ...value, end: e.target.value })} />
          </div>
        </div>
      )}
    </div>
  );
}

function RulesSheet({ open, kid, info, onClose, onDone }) {
  const [rules, setRules] = useState(info.rules);
  const [search, setSearch] = useState('');
  const [busy, run] = useAction(onDone, onClose);
  useEffect(() => {
    if (open) {
      setRules(info.rules);
      setSearch('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (patch) => setRules((r) => ({ ...r, ...patch }));
  const allowed = new Set(rules.allowed);
  const apps = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? info.apps.filter((a) => a.label.toLowerCase().includes(term) || a.pkg.includes(term)) : info.apps;
  }, [info.apps, search]);

  function save(e) {
    e.preventDefault();
    run(() => api.put(`/api/parent/kids/${kid.id}/screen-rules`, { rules }), 'บันทึกกติกาแล้ว — มือถือได้รับทันทีที่ต่อเน็ต');
  }

  return (
    <Sheet open={open} onClose={onClose} title={`กติกาของ${kid.name}`}>
      <form onSubmit={save} className="space-y-5 pb-3">
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-sunken px-4 py-3 font-semibold">
          ใช้กติกาเวลา
          <input type="checkbox" className="size-6 accent-purple-600" checked={rules.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        </label>

        <fieldset disabled={!rules.enabled} className={`space-y-5 ${rules.enabled ? '' : 'opacity-50'}`}>
          <LimitField label="เล่นได้ต่อวัน · วันเรียน (จ–ศ)" value={rules.limits.school} onChange={(v) => set({ limits: { ...rules.limits, school: v } })} />
          <LimitField label="เล่นได้ต่อวัน · วันหยุด (ส–อา)" value={rules.limits.holiday} onChange={(v) => set({ limits: { ...rules.limits, holiday: v } })} />
          <BedtimeField
            label="เวลานอน คืนก่อนวันเรียน (อา–พฤ)"
            value={rules.bedtime.school}
            fallback={{ start: '21:00', end: '06:30' }}
            onChange={(v) => set({ bedtime: { ...rules.bedtime, school: v } })}
          />
          <BedtimeField
            label="เวลานอน คืนก่อนวันหยุด (ศ–ส)"
            value={rules.bedtime.holiday}
            fallback={{ start: '22:00', end: '07:30' }}
            onChange={(v) => set({ bedtime: { ...rules.bedtime, holiday: v } })}
          />
        </fieldset>

        <div>
          <span className="label">แอปที่ใช้ได้เสมอ (ไม่นับเวลา ใช้ได้ตอนล็อค)</span>
          <p className="mb-2 text-sm text-mute">โทรศัพท์และข้อความใช้ได้เสมออยู่แล้ว</p>
          {info.apps.length === 0 ? (
            <p className="rounded-2xl bg-sunken px-3 py-2.5 text-sm text-mute">ยังไม่มีรายชื่อแอป — เปิดมือถือลูกให้ต่อเน็ตสักครู่ แล้วเปิดหน้านี้ใหม่</p>
          ) : (
            <>
              {info.apps.length > 10 && <input className="field mb-2" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาแอป" aria-label="ค้นหาแอป" />}
              <ul className="max-h-64 divide-y divide-hair overflow-y-auto rounded-2xl bg-sunken">
                {apps.map((a) => (
                  <li key={a.pkg}>
                    <label className="flex items-center gap-3 px-3 py-2">
                      <input
                        type="checkbox"
                        className="size-5 accent-purple-600"
                        checked={allowed.has(a.pkg)}
                        onChange={(e) => {
                          const next = new Set(allowed);
                          if (e.target.checked) next.add(a.pkg);
                          else next.delete(a.pkg);
                          set({ allowed: [...next] });
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate">{a.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <button className="btn btn-primary w-full text-lg" disabled={busy}>
          บันทึกกติกา
        </button>
      </form>
    </Sheet>
  );
}

// ---------- ตัวเลือกของเครื่อง: เปลี่ยนชื่อ / ยกเลิกการควบคุม / ลบ ----------

function PhoneMenu({ phone, onClose, onDone }) {
  const [view, setView] = useState('menu'); // menu | rename | release | remove
  const [name, setName] = useState('');
  const [busy, run] = useAction(onDone, onClose);
  useEffect(() => {
    if (phone) {
      setView('menu');
      setName(phone.name);
    }
  }, [phone]);
  if (!phone) return null;

  return (
    <>
      <Sheet open={view === 'menu' || view === 'rename'} onClose={onClose} title={phone.name}>
        {view === 'rename' ? (
          <form
            className="space-y-3 pb-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => api.put(`/api/parent/phones/${phone.id}`, { name }), 'เปลี่ยนชื่อแล้ว');
            }}
          >
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="ชื่อเครื่อง" />
            <button className="btn btn-primary w-full" disabled={busy}>
              บันทึก
            </button>
          </form>
        ) : (
          <div className="space-y-2 pb-3">
            <button className="btn btn-soft w-full justify-start" onClick={() => setView('rename')}>
              ✏️ เปลี่ยนชื่อเครื่อง
            </button>
            <button className="btn btn-soft w-full justify-start" onClick={() => setView('release')}>
              🔓 ยกเลิกการควบคุมเครื่องนี้
            </button>
            <button className="btn btn-ghost w-full justify-start text-bad" onClick={() => setView('remove')}>
              🗑️ ลบออกจากรายการ (เครื่องหาย/เสีย)
            </button>
          </div>
        )}
      </Sheet>
      <Confirm
        open={view === 'release'}
        title="ยกเลิกการควบคุมเครื่องนี้?"
        confirmLabel="ยกเลิกการควบคุม"
        danger
        onClose={onClose}
        onConfirm={async () => {
          const { online } = await api.post(`/api/parent/phones/${phone.id}/release`);
          toast.success(online ? 'สั่งแล้ว เครื่องกำลังปลดการควบคุม' : 'สั่งแล้ว เครื่องจะปลดการควบคุมเมื่อต่อเน็ต');
          onDone();
        }}
      >
        {phone.name} จะเลิกนับเวลา เลิกล็อค และถอนสิทธิ์ Device Owner ของตัวเอง หลังจากนั้นถอนการติดตั้งแอปได้ตามปกติ (เครื่องต้องต่อเน็ตอยู่)
      </Confirm>
      <Confirm
        open={view === 'remove'}
        title="ลบออกจากรายการ?"
        confirmLabel="ลบ"
        danger
        onClose={onClose}
        onConfirm={async () => {
          await api.del(`/api/parent/phones/${phone.id}`);
          toast.success('ลบแล้ว');
          onDone();
        }}
      >
        ใช้เมื่อเครื่องหายหรือเสีย — ถ้าเครื่องยังใช้งานอยู่ แอปจะยังเป็น Device Owner แต่เลิกบังคับกติกา ถ้าจะเลิกใช้จริงให้เลือก “ยกเลิกการควบคุม” แทน
      </Confirm>
    </>
  );
}

// ---------- จับคู่เครื่องใหม่ ----------

function AddPhoneSheet({ open, onClose }) {
  const { data } = useStore();
  const [kidId, setKidId] = useState(null);
  const [pair, setPair] = useState(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  // รีเซ็ตเฉพาะตอนเปิดหน้าต่าง — data.kids เป็น array ใหม่ทุกครั้งที่มีอะไรเปลี่ยน ถ้าใส่ไว้ใน deps รหัสที่ขึ้นอยู่จะหาย
  useEffect(() => {
    if (open) {
      setKidId(data.kids.length === 1 ? data.kids[0].id : null);
      setPair(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!pair) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [pair]);

  async function getCode() {
    setBusy(true);
    try {
      setPair(await api.post('/api/parent/phones/pair-code', { kidId }));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const left = pair ? Math.max(0, Date.parse(pair.expiresAt) - Date.now()) : 0;
  const kid = data.kids.find((k) => k.id === kidId);

  return (
    <Sheet open={open} onClose={onClose} title="เพิ่มมือถือของลูก">
      {!pair ? (
        <div className="pb-3">
          <p className="label">มือถือของใคร</p>
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
              </button>
            ))}
          </div>
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-[15px] text-mute">
            <li>ติดตั้งแอป “ล็อคจอ” บนมือถือลูก แล้วตั้งเป็น Device Owner ด้วย ADB</li>
            <li>เปิดแอป แล้วเปิดสิทธิ์ตามที่แอปขอ</li>
            <li>กดปุ่มด้านล่างเพื่อรับรหัส แล้วใส่ในแอป</li>
          </ol>
          <button className="btn btn-primary w-full" onClick={getCode} disabled={!kidId || busy}>
            ขอรหัสจับคู่
          </button>
        </div>
      ) : (
        <div className="pb-4 text-center">
          <p className="text-mute">ใส่รหัสนี้ในแอปบนมือถือของ{kid?.name}</p>
          <p className="my-3 font-bold tabular tracking-[0.25em] text-5xl">{pair.code}</p>
          {left > 0 ? (
            <p className="text-sm text-mute">
              หมดอายุใน {Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, '0')} นาที · ใช้ได้ครั้งเดียว
            </p>
          ) : (
            <button className="btn btn-soft mt-1" onClick={getCode} disabled={busy}>
              รหัสหมดอายุ ขอใหม่
            </button>
          )}
          <p className="mt-4 rounded-2xl bg-sunken px-3 py-2.5 text-left text-sm text-mute">
            ที่อยู่เซิร์ฟเวอร์ในแอป: <span className="font-semibold text-ink">{window.location.origin}</span>
          </p>
        </div>
      )}
    </Sheet>
  );
}
