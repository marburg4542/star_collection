const TZ = 'Asia/Bangkok';
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('th-TH', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('th-TH', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

export const dayKey = (iso) => dayKeyFmt.format(new Date(iso));
export const timeOf = (iso) => timeFmt.format(new Date(iso));

export function dayLabel(iso) {
  const key = dayKey(iso);
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 864e5).toISOString());
  if (key === today) return 'วันนี้';
  if (key === yesterday) return 'เมื่อวาน';
  return dayFmt.format(new Date(iso));
}

// จัดรายการเป็นกลุ่มตามวัน (รายการเรียงใหม่ → เก่าอยู่แล้ว)
export function groupByDay(items) {
  const groups = [];
  for (const item of items) {
    const key = dayKey(item.createdAt);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, label: dayLabel(item.createdAt), items: [item] });
  }
  return groups;
}

/** วินาที → "1 ชม. 5 นาที" / "45 นาที" */
export function duration(sec) {
  const m = Math.max(0, Math.round(sec / 60));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} นาที`;
  return r ? `${h} ชม. ${r} นาที` : `${h} ชม.`;
}

const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
/** วันนี้เป็นวันเรียน (จ–ศ) หรือวันหยุด — ตรงกับที่แอปบนมือถือลูกใช้ตัดสิน */
export const todayType = () => (['Sat', 'Sun'].includes(weekdayFmt.format(new Date())) ? 'holiday' : 'school');

/** "เมื่อสักครู่" / "5 นาทีที่แล้ว" / "2 ชม.ที่แล้ว" / "เมื่อวาน 18:30" */
export function ago(iso) {
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'เมื่อสักครู่';
  if (min < 60) return `${min} นาทีที่แล้ว`;
  if (min < 6 * 60) return `${Math.floor(min / 60)} ชม.ที่แล้ว`;
  return `${dayLabel(iso)} ${timeOf(iso)}`;
}

const weekdayShortFmt = new Intl.DateTimeFormat('th-TH', { timeZone: TZ, weekday: 'narrow' });
/** วันที่แบบ YYYY-MM-DD (เวลาไทย) → Date ตอนเที่ยงของวันนั้น ใช้กับตัวจัดรูปแบบวันที่ */
export const dayToDate = (day) => new Date(`${day}T12:00:00+07:00`);
export const weekdayShort = (day) => weekdayShortFmt.format(dayToDate(day));

/** นาทีจากตอนนี้ถึง HH:MM ครั้งถัดไป (เวลาไทย) */
export function minutesUntil(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const now = new Date();
  const bkk = (now.getUTCHours() * 60 + now.getUTCMinutes() + 7 * 60) % 1440; // ไทยไม่มีเวลาออมแสง
  return (h * 60 + m - bkk + 1440) % 1440 || 1440;
}

export const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
export const num = (n) => n.toLocaleString('th-TH');
