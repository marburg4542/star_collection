// แผนที่รวม: ลูกทุกคนอยู่ตรงไหน — ระหว่างเปิดหน้านี้ ขอตำแหน่งจากมือถือทุกเครื่องทุก 30 วิ
// ปิดหน้านี้ = เครื่องลูกกลับไปส่งเองทุก 30 นาทีตามปกติ (ใช้ปุ่ม "ขอตำแหน่ง" เดิม แอปทุกรุ่นทำได้อยู่แล้ว)
// แผนที่ OpenStreetMap ผ่าน Leaflet — ไฟล์นี้โหลดเฉพาะตอนเปิดแผนที่ (lazy) ไม่ถ่วงหน้าอื่น
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../../lib/api.js';
import { KID_COLORS } from '../../lib/constants.js';
import { ago } from '../../lib/format.js';
import { Avatar } from '../../components/ui.jsx';

const ASK_EVERY_MS = 30_000;
const LIVE_FOR_MS = 15 * 60_000; // เปิดทิ้งไว้ลืมปิด → หยุดขอเอง ไม่เปลืองแบตเครื่องลูก
const FRESH_MS = 2 * 60_000; // ได้ตำแหน่งภายใน 2 นาที = สด · เก่ากว่านั้นหมุดจะจางลง
const BANGKOK = [13.7563, 100.5018]; // ยังไม่มีตำแหน่งของใครเลย

const fresh = (loc) => Date.now() - Date.parse(loc.at) < FRESH_MS;

const NEAR_M = 40; // ลูกอยู่ใกล้กันกว่านี้ (เช่น อยู่บ้านด้วยกัน) → เลื่อนหมุดออกข้างกัน ไม่ทับจนมองไม่เห็นอีกคน
const SPREAD_PX = 80; // กว้างพอให้ป้ายชื่อใต้หมุด (เช่น “น้องข้าวหอม”) ไม่ทับกัน

/** เลื่อนหมุดที่ทับกัน: phoneId → ระยะเลื่อนแนวนอน (px) · วงความแม่นยำยังอยู่ที่จุดจริง */
function spreadOf(phones) {
  const groups = [];
  for (const p of phones) {
    const at = L.latLng(p.location.lat, p.location.lng);
    const group = groups.find((g) => g.at.distanceTo(at) < NEAR_M);
    if (group) group.ids.push(p.id);
    else groups.push({ at, ids: [p.id] });
  }
  const dx = new Map();
  for (const g of groups) g.ids.forEach((id, i) => dx.set(id, (i - (g.ids.length - 1) / 2) * SPREAD_PX));
  return dx;
}

/** หมุดรูปอวตารของลูก + ชื่อใต้หมุด — สร้างเป็น DOM (textContent) ชื่อจะไม่ถูกตีความเป็น HTML */
function pinIcon(kid, stale, dx = 0) {
  const el = document.createElement('div');
  el.style.cssText = `position:relative;width:48px;height:48px;opacity:${stale ? 0.55 : 1}`;
  const face = document.createElement('div');
  const color = KID_COLORS[kid?.color]?.hex ?? '#6cc8ff';
  face.style.cssText = [
    'width:48px;height:48px;border-radius:9999px;display:grid;place-items:center;font-size:27px;line-height:1',
    'border:2.5px solid var(--color-line);box-shadow:0 3px 0 var(--color-line)',
    `background:radial-gradient(circle at 35% 30%, #ffffff80, transparent 60%), ${color}`,
  ].join(';');
  face.textContent = kid?.avatar ?? '🙂';
  const name = document.createElement('div');
  name.style.cssText = [
    'position:absolute;top:53px;left:50%;transform:translateX(-50%);white-space:nowrap',
    'background:var(--color-card);border:2px solid var(--color-line);border-radius:9999px',
    'padding:0 8px;font-size:12px;font-weight:700;line-height:18px;color:var(--color-ink)',
  ].join(';');
  name.textContent = kid?.name ?? '';
  el.append(face, name);
  return L.divIcon({ html: el, className: '', iconSize: [48, 48], iconAnchor: [24 - dx, 24], popupAnchor: [dx, -26] });
}

function popupOf(kid, phone) {
  const el = document.createElement('div');
  el.style.cssText = 'font-family:inherit;font-size:13px;line-height:1.5;min-width:150px';
  const title = document.createElement('div');
  title.style.cssText = 'font-weight:700;font-size:14px';
  title.textContent = `${kid?.avatar ?? ''} ${kid?.name ?? ''}`;
  const sub = document.createElement('div');
  sub.style.color = 'var(--color-mute)';
  const loc = phone.location;
  sub.textContent = `${phone.name} · ${ago(loc.at)}${loc.accuracy ? ` · ±${loc.accuracy} ม.` : ''}`;
  const link = document.createElement('a');
  link.href = `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.textContent = 'เปิดใน Google Maps ↗';
  link.style.cssText = 'display:inline-block;margin-top:4px;font-weight:600';
  el.append(title, sub, link);
  return el;
}

export default function FamilyMap({ phones, kids, onClose }) {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(new Map()); // phoneId → { marker, circle }
  const fittedRef = useRef(false);
  const phonesRef = useRef(phones);
  phonesRef.current = phones;
  const [live, setLive] = useState(true);

  const kidById = useMemo(() => new Map(kids.map((k) => [k.id, k])), [kids]);
  const shown = useMemo(
    () =>
      phones
        .filter((p) => !p.releasing)
        .sort((a, b) => kids.findIndex((k) => k.id === a.kidId) - kids.findIndex((k) => k.id === b.kidId)),
    [phones, kids],
  );
  const phonesPerKid = useMemo(() => {
    const n = new Map();
    for (const p of shown) n.set(p.kidId, (n.get(p.kidId) ?? 0) + 1);
    return n;
  }, [shown]);

  // ปุ่ม Esc ปิด · ล็อคการเลื่อนหน้าด้านหลัง
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // สร้างแผนที่ครั้งเดียว
  useEffect(() => {
    const map = L.map(boxRef.current, { zoomControl: true }).setView(BANGKOK, 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(map);
    mapRef.current = map;
    const layers = layersRef.current;
    return () => {
      map.remove();
      mapRef.current = null;
      layers.clear();
      fittedRef.current = false;
    };
  }, []);

  // หมุดตามตำแหน่งล่าสุด — ข้อมูลใหม่มาเมื่อเครื่องส่งตำแหน่ง (หน้ามือถือโหลดรายการใหม่ให้เอง)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = layersRef.current;
    const located = shown.filter((p) => p.location);
    const spread = spreadOf(located);
    const seen = new Set();
    for (const p of located) {
      const loc = p.location;
      seen.add(p.id);
      const kid = kidById.get(p.kidId);
      const at = [loc.lat, loc.lng];
      const color = KID_COLORS[kid?.color]?.hex ?? '#6cc8ff';
      const icon = pinIcon(kid, !fresh(loc), spread.get(p.id));
      let layer = layers.get(p.id);
      if (!layer) {
        layer = {
          circle: L.circle(at, { radius: loc.accuracy || 0, color, weight: 1.5, fillOpacity: 0.12, interactive: false }).addTo(map),
          marker: L.marker(at, { icon, keyboard: false }).addTo(map),
        };
        layers.set(p.id, layer);
      } else {
        layer.marker.setLatLng(at).setIcon(icon);
        layer.circle.setLatLng(at).setRadius(loc.accuracy || 0);
      }
      layer.marker.bindPopup(popupOf(kid, p));
    }
    for (const [id, layer] of layers) {
      if (seen.has(id)) continue;
      layer.marker.remove();
      layer.circle.remove();
      layers.delete(id);
    }
    // จัดให้เห็นทุกคนครั้งแรกที่มีตำแหน่ง — หลังจากนั้นไม่ขยับเอง (ผู้ปกครองอาจกำลังเลื่อนดูอยู่)
    if (!fittedRef.current && layers.size) {
      fittedRef.current = true;
      fitAll();
    }
  }, [shown, kidById]);

  // อัปเดตสด: ขอตำแหน่งทุกเครื่องทุก 30 วิ เฉพาะตอนหน้านี้เปิดอยู่บนจอ · ครบ 15 นาทีหยุดเอง
  useEffect(() => {
    if (!live) return;
    const stopAt = Date.now() + LIVE_FOR_MS;
    let lastAsk = 0;
    const ask = () => {
      if (Date.now() > stopAt) return setLive(false);
      if (document.visibilityState !== 'visible' || Date.now() - lastAsk < 10_000) return;
      lastAsk = Date.now();
      for (const p of phonesRef.current) if (!p.releasing) api.post(`/api/parent/phones/${p.id}/locate`).catch(() => {});
    };
    ask();
    const timer = setInterval(ask, ASK_EVERY_MS);
    document.addEventListener('visibilitychange', ask);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', ask);
    };
  }, [live]);

  function fitAll() {
    const map = mapRef.current;
    const points = [...layersRef.current.values()].map((l) => l.marker.getLatLng());
    if (!map || !points.length) return;
    if (points.length === 1) map.setView(points[0], 16);
    else map.fitBounds(L.latLngBounds(points), { padding: [56, 56], maxZoom: 16 });
  }

  function focus(phone) {
    const layer = layersRef.current.get(phone.id);
    if (!layer) return;
    mapRef.current?.flyTo(layer.marker.getLatLng(), Math.max(mapRef.current.getZoom(), 16), { duration: 0.6 });
    layer.marker.openPopup();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper" role="dialog" aria-modal="true" aria-label="แผนที่ลูกๆ">
      <header className="pad-top flex items-center gap-3 border-b-2 border-line bg-card px-4 pb-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold">🗺️ ลูกๆ อยู่ไหน</p>
          {live ? (
            <p className="text-[13px] font-semibold text-good">● อัปเดตสด — ขอตำแหน่งทุก 30 วินาที ระหว่างเปิดหน้านี้</p>
          ) : (
            <p className="text-[13px] text-mute">
              หยุดอัปเดตสดแล้ว (เปิดไว้ 15 นาที){' '}
              <button className="font-semibold text-purple-700 underline" onClick={() => setLive(true)}>
                ▶️ อัปเดตต่อ
              </button>
            </p>
          )}
        </div>
        <button className="grid size-10 shrink-0 place-items-center rounded-full bg-soft text-xl" onClick={onClose} aria-label="ปิดแผนที่">
          ✕
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={boxRef} className="family-map size-full" />
        <button className="btn absolute top-3 right-3 z-[1000] min-h-9 border-2 border-line bg-card px-3 text-sm" onClick={fitAll}>
          👥 ดูทุกคน
        </button>
      </div>

      <ul className="pad-bottom max-h-[38dvh] divide-y divide-hair overflow-y-auto border-t-2 border-line bg-card">
        {shown.map((p) => {
          const kid = kidById.get(p.kidId);
          const loc = p.location;
          const status = loc
            ? `${fresh(loc) ? '● ' : ''}${ago(loc.at)}${loc.accuracy ? ` · ±${loc.accuracy} ม.` : ''}`
            : p.report?.location === 'off'
              ? 'GPS ของเครื่องปิดอยู่'
              : p.report?.location === 'no-permission'
                ? 'ยังไม่ได้ให้สิทธิ์ตำแหน่ง'
                : 'ยังไม่มีตำแหน่ง';
          return (
            <li key={p.id}>
              <button className="flex w-full items-center gap-3 px-4 py-2.5 text-left disabled:opacity-70" onClick={() => focus(p)} disabled={!loc}>
                <Avatar kid={kid} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {kid?.name}
                    {phonesPerKid.get(p.kidId) > 1 && <span className="font-normal text-mute"> · {p.name}</span>}
                  </span>
                  <span className={`block text-[13px] ${loc && fresh(loc) ? 'font-semibold text-good' : loc ? 'text-mute' : 'text-bad'}`}>
                    {status}
                    {!p.online && <span className="font-normal text-mute"> · ออฟไลน์</span>}
                  </span>
                </span>
                {loc && <span className="text-mute">›</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
