// มือถือของลูก: ดูเวลาที่ใช้วันนี้, ล็อค/ปลดล็อค, ให้เวลาเพิ่ม, ปิดกติกาชั่วคราว, ตั้งกติกา, จับคู่เครื่องใหม่
// แอปบนมือถือลูก (ล็อคจอ) เป็นคนบังคับใช้ — หน้านี้แค่ส่งคำสั่งและแสดงสิ่งที่เครื่องรายงานมา
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api.js';
import { useStore } from '../../lib/store.jsx';
import { ago, dayKey, dayLabel, dayToDate, duration, minutesUntil, timeOf, todayType, weekdayShort } from '../../lib/format.js';
import { Avatar, Empty, Segmented, Sheet, Spinner } from '../../components/ui.jsx';
import { Confirm } from '../../components/Feedback.jsx';

const LOCK = {
  manual: { icon: '🔒', text: 'ผู้ปกครองล็อคไว้' },
  bedtime: { icon: '😴', text: 'เวลานอน' },
  limit: { icon: '⌛', text: 'หมดเวลาเล่นวันนี้' },
  tamper: { icon: '⚠️', text: 'สิทธิ์ในเครื่องถูกปิด ต้องให้ผู้ปกครองแก้' },
};
const GRANT_CHOICES = [15, 30, 60, 120];
// สิทธิ์ที่ต้องมีเพื่อคุมเครื่องได้ (ตรงกับฝั่งเซิร์ฟเวอร์) — แบบ Device Owner ระบบกันส่วนอื่นไว้ให้แล้ว
const REQUIRED = { owner: ['usage'], standard: ['admin', 'accessibility', 'usage'] };
const PROTECTION_NAMES = { admin: 'ผู้ดูแลอุปกรณ์', accessibility: 'การช่วยเหลือพิเศษ', usage: 'สิทธิ์ดูการใช้งาน' };
const MODE = { owner: '🛡️ แบบเข้ม', standard: '📲 แบบปกติ' };
const SILENT_MS = 60 * 60 * 1000;
// แผนที่ใช้ Leaflet (~150 KB) — โหลดเฉพาะตอนกดเปิด
const FamilyMap = lazy(() => import('./FamilyMap.jsx'));

/** 🔋 64% · ⚡ ชาร์จอยู่ · 🪫 แบตใกล้หมด (แอป 2.5+ ส่งมากับรายงาน) */
const batteryText = (b) => `${b.charging ? '⚡' : b.level <= 15 ? '🪫' : '🔋'} ${b.level}%`;

/** a เก่ากว่า b ไหม — เทียบทีละส่วน (2.10 ใหม่กว่า 2.9) */
function olderVersion(a, b) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff < 0;
  }
  return false;
}

export default function Phones() {
  const { data, changeTick, kidById } = useStore();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [appLatest, setAppLatest] = useState(null); // รุ่นล่าสุดของแอปล็อคจอที่ให้ดาวน์โหลดจากเว็บนี้
  const [mapOpen, setMapOpen] = useState(false);
  const [webOpen, setWebOpen] = useState(false);

  useEffect(() => {
    fetch('/kidlock/info.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((app) => setAppLatest(app?.version ?? null))
      .catch(() => {});
  }, []);

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

      {info.phones.some((p) => !p.releasing) && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button className="btn btn-soft whitespace-nowrap px-2 text-sm" onClick={() => setMapOpen(true)}>
            🗺️ ดูทุกคนบนแผนที่
          </button>
          <button className="btn btn-soft whitespace-nowrap px-2 text-sm" onClick={() => setWebOpen(true)}>
            🌐 บล็อคเว็บ/คำค้น
          </button>
        </div>
      )}
      <WebBlockSheet open={webOpen} onClose={() => setWebOpen(false)} />
      {mapOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 grid place-items-center bg-paper"><Spinner /></div>}>
          <FamilyMap phones={info.phones} kids={data.kids} onClose={() => setMapOpen(false)} />
        </Suspense>
      )}

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
            กด “เพิ่มมือถือ” แล้วทำตามขั้นตอน: ดาวน์โหลดแอป “ล็อคจอ” ลงมือถือลูก เปิดสิทธิ์ตามที่แอปขอ แล้วใส่รหัสจับคู่
          </Empty>
        </div>
      ) : (
        <div className="space-y-4">
          {byKid.map(({ kid, phones }) => (
            <KidCard key={kid.id} kid={kid} phones={phones} info={info.kids[kid.id]} today={info.today} appLatest={appLatest} onChanged={load} />
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

function KidCard({ kid, phones, info, today, appLatest, onChanged }) {
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
          <PhoneRow key={p.id} phone={p} today={today} appLatest={appLatest} onMenu={() => setSheet({ phone: p })} onChanged={onChanged} />
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

      <ReportSheet open={sheet === 'report'} kid={kid} rules={rules} onClose={() => setSheet(null)} />
      <GrantSheet open={sheet === 'grant'} kid={kid} info={info} limit={limit} onClose={() => setSheet(null)} onDone={onChanged} />
      <PauseSheet open={sheet === 'pause'} kid={kid} paused={paused} onClose={() => setSheet(null)} onDone={onChanged} />
      <RulesSheet open={sheet === 'rules'} kid={kid} info={info} onClose={() => setSheet(null)} onDone={onChanged} />
      <PhoneMenu phone={sheet?.phone ?? null} onClose={() => setSheet(null)} onDone={onChanged} />
    </section>
  );
}

function PhoneRow({ phone, today, appLatest, onMenu, onChanged }) {
  const [busy, setBusy] = useState(false);
  const report = phone.report?.day === today ? phone.report : null;
  const lock = report?.lock ? LOCK[report.lock] : null;
  // โหมด สิทธิ์ และรุ่นแอป ใช้รายงานล่าสุดเสมอ (แม้เป็นของเมื่อวาน) · แอปรุ่นเก่าไม่ได้ส่งมา
  const latest = phone.report;
  const lost = latest?.mode && latest.protections ? REQUIRED[latest.mode].filter((k) => !latest.protections[k]) : [];
  // แอปในเครื่องไม่อัปเดตเอง — ต้องติดตั้งไฟล์รุ่นใหม่ทับบนเครื่องลูก
  const outdated = !phone.releasing && latest?.version && appLatest && olderVersion(latest.version, appLatest);
  const silent = !phone.online && !phone.releasing && phone.lastSeenAt && Date.now() - Date.parse(phone.lastSeenAt) > SILENT_MS;
  // ยังจำกัดแบตเตอรี่อยู่ → มือถือบางยี่ห้อปิดแอปเองตอนเครื่องว่าง/รีสตาร์ท แล้วไม่มีอะไรล็อค (เจอกับ OPPO ของจริง)
  const batteryLimited = !phone.releasing && latest?.protections && !latest.protections.battery;
  const bat = latest?.battery; // แบตตอนส่งรายงานล่าสุด (เครื่องออฟไลน์ = ค่าก่อนหายไป)
  const back = !silent && phone.lastReturn; // กลับมาหลังเงียบไป (24 ชม.ล่าสุด)
  // แอป 2.7+ อัปเดตตัวเองได้: ผู้ปกครองกดจากเว็บ แล้วกด "อัปเดต" ที่หน้าต่างบนเครื่องลูก
  const selfUpdate = outdated && !olderVersion(latest.version, '2.7');
  const [updating, setUpdating] = useState(false);

  async function requestUpdate() {
    setUpdating(true);
    try {
      const { online } = await api.post(`/api/parent/phones/${phone.id}/update`);
      toast.success(online ? 'สั่งแล้ว — กด “อัปเดต” ที่หน้าต่างบนเครื่องลูก' : 'สั่งแล้ว — เครื่องจะเริ่มอัปเดตเมื่อต่อเน็ต');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUpdating(false);
    }
  }

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
              <span className={silent ? 'font-semibold text-bad' : undefined}>
                {silent && '📵 '}ออฟไลน์ · ล่าสุด {phone.lastSeenAt ? `${dayLabel(phone.lastSeenAt)} ${timeOf(phone.lastSeenAt)}` : '-'}
              </span>
            )}
            {latest?.mode && ` · ${MODE[latest.mode]}`}
            {latest?.version && ` · แอป ${latest.version}`}
            {bat && !phone.releasing && ` · ${batteryText(bat)}`}
            {lock && ` · ${lock.icon} ${lock.text}`}
          </p>
        </div>
        <button className={`btn min-h-10 shrink-0 px-3 text-sm ${phone.locked ? 'btn-primary' : 'btn-soft'}`} onClick={toggleLock} disabled={busy || phone.releasing}>
          {phone.locked ? '🔓 ปลดล็อค' : '🔒 ล็อคเลย'}
        </button>
        <button onClick={onMenu} className="grid size-10 shrink-0 place-items-center rounded-full text-xl text-mute" aria-label={`ตัวเลือกของ ${phone.name}`}>
          ⋯
        </button>
      </div>
      {back && (
        <p className="mt-1.5 rounded-xl bg-sunken px-3 py-2 text-[13px]">
          <span className="font-semibold">
            ↩️ กลับมา {ago(back.backAt)} หลังเงียบไป {duration((Date.parse(back.backAt) - Date.parse(back.silentFrom)) / 1000)}
          </span>
          <span className="text-mute"> — {back.summary}</span>
        </p>
      )}
      {silent && bat && (
        <p className="mt-1.5 rounded-xl bg-sunken px-3 py-2 text-[13px]">
          {bat.level <= 5 && !bat.charging ? (
            <>
              <span className="font-semibold">🪫 น่าจะแบตหมด</span>
              <span className="text-mute"> — แบตเหลือ {bat.level}% ตอนส่งรายงานล่าสุด ชาร์จแล้วเปิดเครื่อง และเปิดแอปล็อคจอดูว่าทำงานอยู่</span>
            </>
          ) : (
            <>
              <span className="font-semibold text-bad">📵 แบตยังเหลือ {bat.level}% แต่เครื่องเงียบไป</span>
              <span className="text-mute"> — แอปล็อคจอน่าจะถูกปิด เครื่องรีสตาร์ท หรือไม่มีเน็ต · เปิดแอปล็อคจอบนเครื่องลูก</span>
            </>
          )}
        </p>
      )}
      {lost.length > 0 && (
        <p className="mt-1.5 rounded-xl bg-sunken px-3 py-2 text-[13px]">
          <span className="font-semibold text-bad">⚠️ ถูกปิด: {lost.map((k) => PROTECTION_NAMES[k]).join(', ')}</span>
          <span className="text-mute"> — ใส่ PIN บนเครื่อง → “ผู้ปกครอง” แล้วกดปุ่มเปิดคืน</span>
        </p>
      )}
      {batteryLimited && (
        <div className="mt-1.5 rounded-xl bg-sunken px-3 py-2 text-[13px]">
          <p className="font-semibold">
            🔋 แอปล็อคจอยังถูกจำกัดแบตเตอรี่ — เครื่องอาจปิดแอปเองตอนว่างหรือรีสตาร์ท แล้วจะไม่ล็อคเลย (เจอบ่อยใน OPPO, realme, Xiaomi, vivo)
          </p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-mute">
            {latest.mode === 'standard' && (
              <li>
                เปิดแอปล็อคจอ → ใส่ PIN (ถ้ายังไม่ขึ้นแป้น กด 🔒 ผู้ปกครองก่อน) → <b className="text-ink">“เปิดหน้าตั้งค่าเครื่อง (ปลดการกัน 10 นาที)”</b>
              </li>
            )}
            <li>ตั้งค่า → แอป → แอปล็อคจอ → แบตเตอรี่ → เลือก “ไม่จำกัด”</li>
            <li>OPPO / realme: เปิด “อนุญาตให้ทำงานในเบื้องหลัง” และ “เริ่มอัตโนมัติ” ด้วย แล้วล็อคการ์ดแอปล็อคจอไว้ในหน้าแอปล่าสุด กัน “ล้างทั้งหมด”</li>
            {latest.mode === 'standard' && <li>กลับมาที่แอปล็อคจอ → “▶️ เปิดกติกากลับ”</li>}
          </ol>
        </div>
      )}
      {selfUpdate && (
        <div className="mt-1.5 rounded-xl bg-sunken px-3 py-2 text-[13px]">
          <p className="font-semibold">
            ⬆️ แอปล็อคจอยังเป็นรุ่น {latest.version} (มีรุ่น {appLatest} แล้ว)
          </p>
          <UpdateStatus phone={phone} latest={latest} />
          <button className="btn btn-soft mt-2 min-h-10 w-full text-sm" onClick={requestUpdate} disabled={updating || phone.releasing}>
            ⬆️ อัปเดตเป็นรุ่น {appLatest} ตอนนี้
          </button>
          {latest.protections && !latest.protections.installer && (
            <p className="mt-1.5 text-mute">
              ครั้งแรกต้องอนุญาตให้แอปอัปเดตตัวเอง: เปิดแอปล็อคจอบนเครื่องลูก → ใส่ PIN → “อัปเดตแอปเองได้” → เปิด
            </p>
          )}
        </div>
      )}
      {outdated && !selfUpdate && (
        <div className="mt-1.5 rounded-xl bg-sunken px-3 py-2 text-[13px]">
          <p className="font-semibold">
            ⬆️ แอปล็อคจอยังเป็นรุ่น {latest.version} (มีรุ่น {appLatest} แล้ว) — อัปเดตบนมือถือลูก:
          </p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-mute">
            {/* แบบปกติ แอปกันหน้าติดตั้งที่มีชื่อ “ล็อคจอ” (กันถอนแอป) — ต้องปลดก่อน ไม่งั้นขึ้น “หน้านี้ต้องให้ผู้ปกครองใส่ PIN…” */}
            {latest.mode === 'standard' && (
              <li>
                เปิดแอปล็อคจอ → ใส่ PIN (ถ้ายังไม่ขึ้นแป้น กด 🔒 ผู้ปกครองก่อน) → กด <b className="text-ink">“ปลดการกัน 10 นาที”</b> แล้วทำข้อต่อไปให้เสร็จใน 10 นาที
              </li>
            )}
            <li>ปิด Play Protect ชั่วคราว (Play Store → รูปโปรไฟล์ → Play Protect → ⚙️)</li>
            <li>ดาวน์โหลดจาก “+ เพิ่มมือถือ → 📲 ติดตั้งจากเว็บ” แล้วติดตั้งทับ ไม่ต้องจับคู่ใหม่</li>
            <li>เปิด Play Protect คืน</li>
          </ol>
        </div>
      )}
      <LocationLine phone={phone} onChanged={onChanged} />
    </li>
  );
}

/** ความคืบหน้าการอัปเดตที่เครื่องรายงานมา (แอป 2.7+) */
function UpdateStatus({ phone, latest }) {
  const u = latest.update;
  // สั่งไปแล้ว แต่เครื่องยังไม่ได้รายงานอะไรหลังจากนั้น (รายงานหลังสั่ง 1 นาทีแล้ว = เครื่องรับคำสั่งไปแล้ว)
  const asked =
    phone.updateRequestedAt &&
    Date.now() - Date.parse(phone.updateRequestedAt) < 10 * 60_000 &&
    !(latest.at && Date.parse(latest.at) > Date.parse(phone.updateRequestedAt) + 60_000);
  if (u && Date.now() - Date.parse(u.at) < 30 * 60_000) {
    if (u.state === 'downloading') return <p className="mt-1 text-mute">⏳ กำลังดาวน์โหลดรุ่นใหม่…</p>;
    if (u.state === 'waiting') return <p className="mt-1 font-semibold text-purple-700">👆 รอกด “อัปเดต” ที่หน้าต่างบนเครื่องลูก</p>;
    if (u.state === 'failed') return <p className="mt-1 font-semibold text-bad">⚠️ อัปเดตไม่สำเร็จ: {u.message || 'ลองใหม่อีกครั้ง'}</p>;
  }
  if (asked) return <p className="mt-1 text-mute">⏳ สั่งแล้ว รอเครื่องรับคำสั่ง (เครื่องต้องต่อเน็ต)</p>;
  return <p className="mt-1 text-mute">กดปุ่มนี้ แล้วกด “อัปเดต” ที่หน้าต่างที่ขึ้นบนเครื่องลูก — ไม่ต้องดาวน์โหลดเองหรือจับคู่ใหม่</p>;
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

function GrantSheet({ open, kid, info, limit, onClose, onDone }) {
  const [busy, run] = useAction(onDone, onClose);
  const [confirmReset, setConfirmReset] = useState(false);
  const grant = (minutes, message) => run(() => api.post(`/api/parent/kids/${kid.id}/screen-grants`, { minutes }), message);
  // รีเซ็ต = เริ่มนับใหม่เหมือนต้นวัน: ใช้ไปกลับเป็น 0 + ล้างเวลาพิเศษของวันนี้ · ยอดใช้ไปมาจากรายงานล่าสุดของเครื่อง อาจช้ากว่าบนเครื่องราวหนึ่งนาที
  const canReset = limit !== null && (info.usedSec > 0 || info.grantMinutes > 0);
  return (
    <>
      <Sheet open={open && !confirmReset} onClose={onClose} title={`ให้${kid.name}เล่นเพิ่มวันนี้`}>
        <p className="mb-3 text-mute">เพิ่มจากเวลาที่ได้ตามกติกา ใช้ได้ถึงเที่ยงคืน (เวลานอนยังล็อคตามปกติ)</p>
        <div className="grid grid-cols-2 gap-2 pb-3">
          {GRANT_CHOICES.map((m) => (
            <button key={m} className="btn btn-soft text-lg" disabled={busy} onClick={() => grant(m, `ให้${kid.name}เล่นเพิ่ม ${duration(m * 60)}แล้ว`)}>
              +{duration(m * 60)}
            </button>
          ))}
        </div>
        {canReset && (
          <div className="border-t border-hair pt-3 pb-3">
            <button className="btn btn-soft w-full" disabled={busy} onClick={() => setConfirmReset(true)}>
              🔄 รีเซ็ตเวลาวันนี้
            </button>
            <p className="mt-1.5 text-[13px] text-mute">เริ่มนับใหม่เหมือนต้นวัน — เช่น หลังทดสอบเครื่องหรือแก้กติกา</p>
          </div>
        )}
      </Sheet>
      <Confirm
        open={open && confirmReset}
        title={`รีเซ็ตเวลาวันนี้ของ${kid.name}?`}
        confirmLabel="รีเซ็ต"
        onClose={() => setConfirmReset(false)}
        onConfirm={async () => {
          await api.post(`/api/parent/kids/${kid.id}/screen-reset`);
          toast.success(`รีเซ็ตแล้ว ${kid.name}เล่นได้อีก ${duration(limit * 60)}`);
          onDone();
          onClose();
        }}
      >
        ใช้ไปวันนี้ {duration(info.usedSec)} จะกลับเป็น 0
        {info.grantMinutes > 0 && ` และเวลาพิเศษ +${duration(info.grantMinutes * 60)} ของวันนี้จะหายด้วย (ดาวที่แลกเวลาไปแล้วไม่คืน)`}
        {` — ${kid.name}จะเล่นได้อีก ${duration(limit * 60)} ตามกติกาวันนี้`}
      </Confirm>
    </>
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

function ReportSheet({ open, kid, rules, onClose }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0); // 0 = วันนี้

  useEffect(() => {
    if (!open) return;
    setReport(null);
    setError('');
    setIndex(0);
    api
      .get(`/api/parent/kids/${kid.id}/app-usage?days=7`)
      .then(setReport)
      .catch((err) => setError(err.message));
  }, [open, kid.id]);

  const days = report?.days;
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

          <DayTimeline day={day} rules={rules} today={index === 0} />

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

          <ActivityList
            title="📵 ช่วงที่เครื่องเงียบไป"
            empty="ยังไม่มี — บอกสาเหตุได้เมื่อเครื่องใช้แอปล็อคจอ 2.7 ขึ้นไป"
            items={report.phoneEvents.map((e) => ({
              key: `${e.phone}-${e.backAt}`,
              main: (
                <>
                  <b>
                    เงียบ {timeOf(e.silentFrom)}–{timeOf(e.backAt)}
                  </b>
                  <span className="text-mute"> ({duration((Date.parse(e.backAt) - Date.parse(e.silentFrom)) / 1000)})</span> · {e.summary}
                </>
              ),
              at: e.backAt,
            }))}
          />
          <ActivityList
            title="📲 ติดตั้ง / ลบแอป"
            empty="ยังไม่มี — มือถือแจ้งเมื่อรายชื่อแอปเปลี่ยน (ผู้ปกครองได้แจ้งเตือนด้วย)"
            items={report.appChanges.map((c) => ({
              key: `${c.kind}-${c.pkg}-${c.at}`,
              main: (
                <>
                  {c.kind === 'install' ? '📲 ติดตั้ง ' : '🗑️ ลบ '}
                  <b>{c.label}</b>
                </>
              ),
              at: c.at,
            }))}
          />
          <ActivityList
            title="🚫 เว็บและคำค้นที่ถูกบล็อค"
            empty="ยังไม่มี — ตั้งรายการได้ที่ปุ่ม “🌐 บล็อคเว็บ/คำค้น” (แอปล็อคจอ 2.5 ขึ้นไป)"
            items={report.webBlocks.map((w) => ({
              key: `${w.at}-${w.matched}-${w.text}`,
              main: (
                <>
                  {w.kind === 'search' ? (
                    <>
                      ค้นหา <b>“{w.text}”</b>
                    </>
                  ) : (
                    <>
                      เปิด <b className="break-all">{w.text}</b>
                    </>
                  )}
                  {w.appLabel && <span className="text-mute"> ใน {w.appLabel}</span>}
                  <span className="text-mute"> (ตรงกับ “{w.matched}”)</span>
                </>
              ),
              at: w.at,
            }))}
          />
        </div>
      )}
    </Sheet>
  );
}

const DAY_MIN = 1440;
const minutesOf = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const nextDay = (day) => dayKey(new Date(dayToDate(day).getTime() + 86_400_000).toISOString());
const isSchoolDay = (day) => ![0, 6].includes(dayToDate(day).getUTCDay());

/**
 * ช่วงเวลานอนในวันนั้น [[นาทีเริ่ม, นาทีจบ]] นับจากเที่ยงคืน — ตรงกับแอปบนเครื่อง:
 * เลือกชุดกติกาตาม "วันที่ตื่น" (คืนก่อนวันเรียนใช้ชุดวันเรียน) · ใช้กติกาปัจจุบันกับวันย้อนหลังด้วย
 */
function bedtimeRanges(rules, day) {
  if (!rules?.enabled) return [];
  const night = (d) => (isSchoolDay(d) ? rules.bedtime.school : rules.bedtime.holiday);
  const out = [];
  const morning = night(day); // คืนที่ตื่นเช้าวันนี้
  if (morning) {
    const s = minutesOf(morning.start);
    const e = minutesOf(morning.end);
    out.push(s > e ? [0, e] : [s, e]);
  }
  const evening = night(nextDay(day)); // คืนนี้ (ตื่นพรุ่งนี้) — ส่วนก่อนเที่ยงคืน
  if (evening) {
    const s = minutesOf(evening.start);
    const e = minutesOf(evening.end);
    if (s > e) out.push([s, DAY_MIN]);
  }
  return out;
}

/** แบ่งช่วงที่ใช้เครื่องเป็นท่อนๆ ตามว่าอยู่ในเวลานอนไหม (นาทีจากเที่ยงคืน) */
function splitByBedtime([a, b], beds) {
  const cuts = [a, b, ...beds.flat().filter((x) => x > a && x < b)].sort((x, y) => x - y);
  const parts = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const [s, e] = [cuts[i], cuts[i + 1]];
    if (e > s) parts.push({ s, e, bed: beds.some(([bs, be]) => s >= bs && e <= be) });
  }
  return parts;
}

/** แถบ 24 ชม.: ช่วงที่ปลดล็อคใช้เครื่อง (ไม่นับตอนอยู่หน้าล็อค) · ใช้ช่วงเวลานอนเป็นสีแดง */
function DayTimeline({ day, rules, today }) {
  if (day.sessions === null) {
    return (
      <p className="mt-3 rounded-2xl bg-sunken px-3 py-3 text-[13px] text-mute">
        ⏰ ช่วงเวลาที่ใช้เครื่องและจำนวนครั้งที่ปลดล็อคจอ ต้องใช้แอปล็อคจอรุ่น 2.5 ขึ้นไป
      </p>
    );
  }
  const dayStart = Date.parse(`${day.day}T00:00:00+07:00`);
  const beds = bedtimeRanges(rules, day.day);
  const parts = day.sessions
    .map(([a, b]) => [Math.max(0, (a - dayStart) / 60_000), Math.min(DAY_MIN, (b - dayStart) / 60_000)])
    .filter(([a, b]) => b > a)
    .flatMap((r) => splitByBedtime(r, beds));
  const bedMin = Math.round(parts.filter((x) => x.bed).reduce((sum, x) => sum + x.e - x.s, 0));
  const first = day.sessions[0]?.[0];
  const last = day.sessions.at(-1)?.[1];
  const pct = (m) => `${(m / DAY_MIN) * 100}%`;
  const iso = (ms) => new Date(ms).toISOString();

  return (
    <div className="mt-3 rounded-2xl bg-sunken px-3 pt-3 pb-2.5">
      <p className="mb-2 text-[13px] font-semibold">⏰ ช่วงที่ปลดล็อคใช้เครื่อง</p>
      <div
        className="relative h-7 overflow-hidden rounded-lg border-2 border-line bg-card"
        role="img"
        aria-label={`ใช้เครื่อง ${day.sessions.length} ช่วง${bedMin ? ` ช่วงเวลานอน ${bedMin} นาที` : ''}`}
      >
        {beds.map(([a, b]) => (
          <div key={`bed-${a}`} className="absolute inset-y-0 bg-night/70" style={{ left: pct(a), width: pct(b - a) }} />
        ))}
        {parts.map((x) => (
          <div
            key={`${x.s}-${x.e}`}
            className={`absolute inset-y-1 rounded-[2px] ${x.bed ? 'bg-bad' : 'bg-purple-500'}`}
            style={{ left: pct(x.s), width: `max(2px, ${pct(x.e - x.s)})` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] leading-none text-mute tabular" aria-hidden="true">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
      <p className="mt-2 text-[13px]">
        {day.sessions.length === 0 ? (
          <span className="text-mute">{today ? 'ยังไม่ได้ใช้เครื่องวันนี้' : 'ไม่ได้ใช้เครื่องวันนี้'}</span>
        ) : (
          <>
            ใช้ครั้งแรก <b className="tabular">{timeOf(iso(first))}</b> · ล่าสุด <b className="tabular">{timeOf(iso(last))}</b> · ปลดล็อคจอ{' '}
            <b className="tabular">{day.unlocks}</b> ครั้ง
          </>
        )}
      </p>
      {bedMin > 0 && (
        <p className="mt-1 text-[13px] font-semibold text-bad">
          😴 ใช้เครื่องช่วงเวลานอน {duration(bedMin * 60)}
          <span className="font-normal text-mute"> (รวมรับสายและแอปที่ใช้ได้เสมอ)</span>
        </p>
      )}
      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-mute">
        <span>
          <i className="mr-1 inline-block size-2.5 rounded-[2px] bg-purple-500 align-middle" />
          ใช้เครื่อง
        </span>
        <span>
          <i className="mr-1 inline-block size-2.5 rounded-[2px] bg-bad align-middle" />
          ใช้ช่วงเวลานอน
        </span>
        <span>
          <i className="mr-1 inline-block size-2.5 rounded-[2px] bg-night align-middle" />
          เวลานอนตามกติกา
        </span>
      </p>
    </div>
  );
}

/** รายการย้อนหลัง 30 วัน ใหม่ → เก่า */
function ActivityList({ title, empty, items }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 8);
  return (
    <section className="mt-5">
      <h3 className="mb-1.5 font-bold">
        {title} <span className="text-[13px] font-normal text-mute">· 30 วัน</span>
      </h3>
      {items.length === 0 ? (
        <p className="rounded-2xl bg-sunken px-3 py-3 text-[13px] text-mute">{empty}</p>
      ) : (
        <>
          <ul className="divide-y divide-hair rounded-2xl bg-sunken px-3">
            {shown.map((x) => (
              <li key={x.key} className="py-2 text-[14px]">
                <span className="break-words">{x.main}</span>
                <span className="block text-[12px] text-mute">{ago(x.at)}</span>
              </li>
            ))}
          </ul>
          {items.length > shown.length && (
            <button type="button" className="mt-1.5 text-[13px] font-semibold text-purple-700 underline" onClick={() => setAll(true)}>
              ดูทั้งหมด ({items.length})
            </button>
          )}
        </>
      )}
    </section>
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

// ---------- บล็อคเว็บและคำค้น (ใช้กับมือถือลูกทุกเครื่อง) ----------

const SITE_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
/** "https://www.Example.com/x" → "example.com" (ตรงกับที่เซิร์ฟเวอร์จัดรูป) */
function cleanSite(value) {
  const s = value
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .split(/[/?#]/)[0]
    .replace(/:\d+$/, '')
    .replace(/^www\./, '')
    .replace(/\.$/, '');
  return SITE_HOST.test(s) ? s : null;
}
const cleanWord = (value) => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

function ChipList({ items, onRemove, label }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 30);
  if (!items.length) return <p className="rounded-2xl bg-sunken px-3 py-3 text-[13px] text-mute">ยังไม่มีรายการ</p>;
  return (
    <div>
      <ul className="flex flex-wrap gap-1.5" aria-label={label}>
        {shown.map((x) => (
          <li key={x} className="chip-off inline-flex max-w-full items-center gap-1 rounded-full py-1 pr-1 pl-3 text-[14px]">
            <span className="min-w-0 truncate">{x}</span>
            <button type="button" className="grid size-7 shrink-0 place-items-center rounded-full text-mute" onClick={() => onRemove(x)} aria-label={`เอา ${x} ออก`}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      {items.length > shown.length && (
        <button type="button" className="mt-1.5 text-[13px] font-semibold text-purple-700 underline" onClick={() => setAll(true)}>
          ดูทั้งหมด ({items.length})
        </button>
      )}
    </div>
  );
}

function WebBlockSheet({ open, onClose }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [site, setSite] = useState('');
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setList(null);
    setError('');
    api
      .get('/api/parent/web-block')
      .then(setList)
      .catch((err) => setError(err.message));
  }, [open]);

  const set = (patch) => setList((l) => ({ ...l, ...patch }));
  function addSite(e) {
    e.preventDefault();
    const s = cleanSite(site);
    if (!s) return toast.error('ใส่ชื่อเว็บ เช่น example.com');
    if (!list.sites.includes(s)) set({ sites: [s, ...list.sites] });
    setSite('');
  }
  function addWord(e) {
    e.preventDefault();
    const w = cleanWord(word);
    if (!w) return;
    if (w.length > 40) return toast.error('คำยาวได้ไม่เกิน 40 ตัวอักษร');
    if (!list.words.includes(w)) set({ words: [w, ...list.words] });
    setWord('');
  }
  async function save() {
    setBusy(true);
    try {
      await api.put('/api/parent/web-block', { enabled: list.enabled, sites: list.sites, words: list.words });
      toast.success('บันทึกแล้ว — มือถือลูกได้รับทันทีที่ต่อเน็ต');
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const missing = list ? [...list.starter.sites.filter((x) => !list.sites.includes(x)), ...list.starter.words.filter((x) => !list.words.includes(x))] : [];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="บล็อคเว็บและคำค้น"
      footer={
        list && (
          <button className="btn btn-primary w-full text-lg" onClick={save} disabled={busy}>
            บันทึก
          </button>
        )
      }
    >
      {!list ? (
        error ? <p className="py-8 text-center text-mute">{error}</p> : <Spinner />
      ) : (
        <div className="space-y-5 pb-3">
          <p className="text-[13px] text-mute">
            ใช้กับมือถือลูกทุกเครื่อง (แอปล็อคจอ 2.5 ขึ้นไป ที่เปิดการช่วยเหลือพิเศษ) — แอปดูช่องที่อยู่เว็บในเบราว์เซอร์และช่องค้นหาของ YouTube
            ถ้าตรงกับรายการจะปิดหน้านั้นแล้วแจ้งผู้ปกครอง · กันได้ส่วนใหญ่ แต่ไม่ 100%
          </p>
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-sunken px-4 py-3 font-semibold">
            เปิดใช้การบล็อค
            <input type="checkbox" className="size-6 accent-purple-600" checked={list.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          </label>

          <fieldset disabled={!list.enabled} className={`space-y-5 ${list.enabled ? '' : 'opacity-50'}`}>
            <div>
              <span className="label">เว็บที่บล็อค ({list.sites.length}) — รวมเว็บย่อยด้วย เช่น m.example.com</span>
              <form onSubmit={addSite} className="mb-2 flex gap-2">
                <input className="field" value={site} onChange={(e) => setSite(e.target.value)} placeholder="example.com" inputMode="url" autoCapitalize="off" aria-label="ชื่อเว็บที่จะบล็อค" />
                <button className="btn btn-soft shrink-0 px-4">เพิ่ม</button>
              </form>
              <ChipList items={list.sites} label="เว็บที่บล็อค" onRemove={(x) => set({ sites: list.sites.filter((s) => s !== x) })} />
            </div>

            <div>
              <span className="label">คำที่บล็อค ({list.words.length}) — ในช่องค้นหาและที่อยู่เว็บ</span>
              <p className="mb-2 text-[13px] text-mute">คำภาษาอังกฤษ 3 ตัวอักษรหรือสั้นกว่าต้องตรงทั้งคำ (sex ไม่บล็อค sussex) · คำไทยบล็อคเมื่อมีคำนี้อยู่ในข้อความ จึงควรใช้วลีที่ชัดเจน</p>
              <form onSubmit={addWord} className="mb-2 flex gap-2">
                <input className="field" value={word} onChange={(e) => setWord(e.target.value)} placeholder="คำหรือวลี" autoCapitalize="off" aria-label="คำที่จะบล็อค" />
                <button className="btn btn-soft shrink-0 px-4">เพิ่ม</button>
              </form>
              <ChipList items={list.words} label="คำที่บล็อค" onRemove={(x) => set({ words: list.words.filter((w) => w !== x) })} />
            </div>

            {missing.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost w-full text-sm"
                onClick={() =>
                  set({
                    sites: [...list.sites, ...list.starter.sites.filter((x) => !list.sites.includes(x))],
                    words: [...list.words, ...list.starter.words.filter((x) => !list.words.includes(x))],
                  })
                }
              >
                ↩️ เพิ่มรายการเริ่มต้นที่ลบไปคืน ({missing.length})
              </button>
            )}
          </fieldset>
        </div>
      )}
    </Sheet>
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
          <p className="mb-2 text-sm text-mute">
            รับสายเข้าได้เสมออยู่แล้ว — ถ้าอยากให้ลูกโทรออกหรือส่งข้อความตอนล็อค ให้ติ๊กแอปโทรศัพท์/ข้อความด้วย (แอป “ล็อคจอ” รุ่น 2.3 ขึ้นไป)
          </p>
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
        {phone.name} จะเลิกนับเวลา เลิกล็อค และถอนสิทธิ์ผู้ดูแลของตัวเอง หลังจากนั้นถอนการติดตั้งแอปได้ตามปกติ (เครื่องต้องต่อเน็ตอยู่)
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
        ใช้เมื่อเครื่องหายหรือเสีย — ถ้าเครื่องยังใช้งานอยู่ แอปจะยังถือสิทธิ์ผู้ดูแลแต่เลิกบังคับกติกา ถ้าจะเลิกใช้จริงให้เลือก “ยกเลิกการควบคุม” แทน
      </Confirm>
    </>
  );
}

// ---------- จับคู่เครื่องใหม่ ----------

const SETUP_METHODS = [
  { value: 'web', label: '📲 ติดตั้งจากเว็บ' },
  { value: 'qr', label: '🛡️ แบบเข้ม (QR)' },
];

/**
 * ข้อความใน QR สำหรับหน้าตั้งค่าเครื่องของ Android (แตะหน้าแรก 6 ครั้ง)
 * ระบบดาวน์โหลดแอปจากเว็บนี้ ตรวจลายเซ็น ตั้งเป็น Device Owner แล้วส่ง { server, code } ให้แอปจับคู่เอง
 */
function provisioningQr(app, code) {
  const origin = window.location.origin;
  return JSON.stringify({
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME': app.component,
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION': new URL(app.apk, origin).href,
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM': app.checksum,
    // ไม่งั้นระบบจะปิดแอปติดเครื่องที่ไม่จำเป็น (กล้อง, Chrome ฯลฯ) ตอนตั้งแบบผู้ดูแลจัดการทั้งเครื่อง
    'android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED': true,
    'android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE': { server: origin, code },
  });
}

function AddPhoneSheet({ open, onClose }) {
  const { data } = useStore();
  const [kidId, setKidId] = useState(null);
  const [method, setMethod] = useState('web');
  const [pair, setPair] = useState(null); // { code, expiresAt, qr? }
  const [app, setApp] = useState(undefined); // ไฟล์แอปบนเซิร์ฟเวอร์ (/kidlock/info.json) · null = ยังไม่มี
  const [downloadQr, setDownloadQr] = useState(null); // QR ของลิงก์ดาวน์โหลดแอป ให้มือถือลูกสแกนจากจอนี้
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  // รีเซ็ตเฉพาะตอนเปิดหน้าต่าง — data.kids เป็น array ใหม่ทุกครั้งที่มีอะไรเปลี่ยน ถ้าใส่ไว้ใน deps รหัสที่ขึ้นอยู่จะหาย
  useEffect(() => {
    if (!open) return;
    setKidId(data.kids.length === 1 ? data.kids[0].id : null);
    setPair(null);
    fetch('/kidlock/info.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setApp)
      .catch(() => setApp(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!pair) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [pair]);
  const apkUrl = app ? new URL(app.apk, window.location.origin).href : null;
  useEffect(() => {
    if (!apkUrl) return;
    let alive = true;
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toString(apkUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 }))
      .then((svg) => alive && setDownloadQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`))
      .catch(() => alive && setDownloadQr(null));
    return () => {
      alive = false;
    };
  }, [apkUrl]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(apkUrl);
      toast.success('คัดลอกลิงก์แล้ว');
    } catch {
      toast.error('คัดลอกไม่ได้ — กดค้างที่ลิงก์เพื่อคัดลอกเอง');
    }
  }

  async function getCode() {
    setBusy(true);
    try {
      const qr = method === 'qr';
      const next = await api.post('/api/parent/phones/pair-code', { kidId, qr });
      if (qr) {
        const { default: QRCode } = await import('qrcode');
        const svg = await QRCode.toString(provisioningQr(app, next.code), { type: 'svg', errorCorrectionLevel: 'L', margin: 2 });
        next.qr = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      }
      setPair(next);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const left = pair ? Math.max(0, Date.parse(pair.expiresAt) - Date.now()) : 0;
  const countdown = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
  const kid = data.kids.find((k) => k.id === kidId);

  if (pair?.qr) {
    return (
      <Sheet open={open} onClose={onClose} title={`ตั้งมือถือของ${kid?.name}ด้วย QR`}>
        <div className="pb-4 text-center">
          {left > 0 ? (
            <>
              <img src={pair.qr} alt="QR สำหรับตั้งเครื่อง" className="mx-auto w-full max-w-[300px] rounded-2xl border-2 border-line bg-white" />
              <p className="mt-3 text-[15px]">สแกนด้วยมือถือที่อยู่หน้าตั้งค่าเครื่อง (หลังแตะหน้าแรก 6 ครั้ง)</p>
              <p className="mt-1 text-sm text-mute">ใช้ได้อีก {countdown} นาที · ใช้ได้ครั้งเดียว</p>
            </>
          ) : (
            <button className="btn btn-soft mt-2" onClick={getCode} disabled={busy}>
              QR หมดอายุ สร้างใหม่
            </button>
          )}
          <p className="mt-4 rounded-2xl bg-sunken px-3 py-2.5 text-left text-sm text-mute">
            เครื่องจะดาวน์โหลดแอปล็อคจอและจับคู่เอง จากนั้นตั้งเครื่องต่อจนเสร็จ แล้วเปิดแอป “ล็อคจอ” เพื่อเปิดสิทธิ์ดูการใช้งาน
          </p>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title="เพิ่มมือถือของลูก">
      {!pair ? (
        <div className="pb-3">
          <Segmented className="mb-3" value={method} onChange={setMethod} options={SETUP_METHODS} />
          {method === 'qr' ? (
            <div className="mb-4 rounded-2xl bg-sunken px-3 py-2.5 text-[15px]">
              <p className="font-semibold">สำหรับเครื่องใหม่ หรือเครื่องที่ล้างได้ — ไม่ต้องใช้คอม</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-mute">
                <li>สำรองข้อมูล แล้ว<b className="text-ink">ลบบัญชี Google ออกก่อน</b> ค่อยล้างเครื่อง (ไม่งั้นหลังล้างจะถามรหัสบัญชีเดิม)</li>
                <li>หน้า “ยินดีต้อนรับ” แตะที่ว่างบนจอจุดเดิม 6 ครั้ง กล้องสแกน QR จะเปิด (ต่อ Wi‑Fi ถ้าเครื่องถาม)</li>
                <li>เลือกชื่อลูก กด “สร้าง QR” แล้วสแกน</li>
              </ol>
              <p className="mt-2 text-sm text-mute">
                แบบนี้กันได้มากกว่า (กันล้างเครื่อง กันเซฟโหมด) แต่ต้องล้างเครื่อง — เครื่องที่ใช้อยู่แล้วเลือก “ติดตั้งจากเว็บ”
              </p>
            </div>
          ) : (
            <div className="mb-4 rounded-2xl bg-sunken px-3 py-2.5 text-[15px]">
              <p className="font-semibold">ใช้กับเครื่องที่ใช้อยู่ได้เลย ไม่ต้องล้างเครื่อง ไม่ต้องใช้คอม</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-mute">
                <li>
                  บนมือถือลูก สแกน QR นี้ด้วยกล้อง (หรือเปิดลิงก์) เพื่อดาวน์โหลดแอป “ล็อคจอ”
                  {app && (
                    <span className="mt-2 flex items-center gap-3">
                      {downloadQr && <img src={downloadQr} alt="QR ดาวน์โหลดแอปล็อคจอ" className="size-28 shrink-0 rounded-xl border-2 border-line bg-white" />}
                      <span className="min-w-0 text-sm">
                        <a href={apkUrl} className="block break-all font-semibold text-ink underline">
                          {apkUrl}
                        </a>
                        <button type="button" className="btn btn-soft mt-1.5 min-h-9 px-3 text-sm" onClick={copyLink}>
                          คัดลอกลิงก์
                        </button>
                      </span>
                    </span>
                  )}
                </li>
                <li>เปิดไฟล์ที่โหลดมาเพื่อติดตั้ง — ถ้าเครื่องถาม ให้อนุญาต “ติดตั้งแอปที่ไม่รู้จัก” ให้เบราว์เซอร์</li>
                <li>
                  เปิดแอป แล้วเปิดสิทธิ์ตามรายการในแอปให้ครบ: <b className="text-ink">ผู้ดูแลอุปกรณ์ · การช่วยเหลือพิเศษ · ดูการใช้งาน</b>
                </li>
                <li>เลือกชื่อลูกด้านล่าง กด “ขอรหัสจับคู่” แล้วใส่รหัสในแอป</li>
              </ol>
              <p className="mt-2 text-sm text-mute">
                Android 13 ขึ้นไป: ถ้าสวิตช์ “การช่วยเหลือพิเศษ” กดไม่ได้ ให้เข้าหน้าข้อมูลแอป → ⋮ → “อนุญาตการตั้งค่าที่จำกัด” ก่อน (ในแอปมีปุ่มพาไป)
              </p>
            </div>
          )}
          <p className="label">มือถือของใคร</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {data.kids.map((k) => (
              <button
                key={k.id}
                onClick={() => setKidId(k.id)}
                aria-pressed={kidId === k.id}
                className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 ${kidId === k.id ? 'bg-purple-600 text-on-primary' : 'bg-sunken'}`}
              >
                <Avatar kid={k} size={32} />
                <span className="font-semibold">{k.name}</span>
              </button>
            ))}
          </div>
          {app === null && <p className="mb-2 text-sm text-bad">ยังไม่มีไฟล์แอปบนเซิร์ฟเวอร์ — ติดตั้งแอปเองแล้วใช้ “ขอรหัสจับคู่” ไปก่อน</p>}
          <button
            className="btn btn-primary w-full"
            onClick={getCode}
            disabled={!kidId || busy || (method === 'qr' && !app)}
          >
            {method === 'qr' ? 'สร้าง QR' : 'ขอรหัสจับคู่'}
          </button>
        </div>
      ) : (
        <div className="pb-4 text-center">
          <p className="text-mute">ใส่รหัสนี้ในแอปบนมือถือของ{kid?.name}</p>
          <p className="my-3 font-bold tabular tracking-[0.25em] text-5xl">{pair.code}</p>
          {left > 0 ? (
            <p className="text-sm text-mute">หมดอายุใน {countdown} นาที · ใช้ได้ครั้งเดียว</p>
          ) : (
            <button className="btn btn-soft mt-1" onClick={getCode} disabled={busy}>
              รหัสหมดอายุ ขอใหม่
            </button>
          )}
          <p className="mt-4 rounded-2xl bg-sunken px-3 py-2.5 text-left text-sm text-mute">
            ที่อยู่เซิร์ฟเวอร์ในแอป: <span className="font-semibold text-ink">{window.location.origin}</span>
            <br />
            ตั้ง Device Owner ด้วย ADB เองก็ใช้รหัสนี้ได้เหมือนกัน
          </p>
        </div>
      )}
    </Sheet>
  );
}
