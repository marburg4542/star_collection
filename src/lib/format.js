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

export const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
export const num = (n) => n.toLocaleString('th-TH');
