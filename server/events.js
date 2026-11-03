// Server-Sent Events: บอกทุกเครื่องที่เปิดแอปอยู่ว่าข้อมูลเปลี่ยน ให้โหลดใหม่ — จอเด็กเห็นดาวเพิ่มทันทีที่ผู้ปกครองกด
const clients = new Set();
// มือถือของลูก (แอปล็อคจอ) แยกช่องไว้ต่างหาก — รู้ได้ด้วยว่าเครื่องไหนออนไลน์อยู่
const phones = new Map(); // phoneId → Set<res>

function open(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
}

export function eventsHandler(req, res) {
  open(req, res);
  clients.add(res);
  req.on('close', () => clients.delete(res));
}

export function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

/** onOnlineChange(online) ถูกเรียกเมื่อเครื่องนี้เพิ่งต่อเข้ามา (เส้นแรก) หรือหลุดหมด */
export function phoneEventsHandler(phoneId, onOnlineChange) {
  return (req, res) => {
    open(req, res);
    let set = phones.get(phoneId);
    if (!set) phones.set(phoneId, (set = new Set()));
    set.add(res);
    if (set.size === 1) onOnlineChange(true);
    req.on('close', () => {
      set.delete(res);
      if (set.size === 0 && phones.get(phoneId) === set) {
        phones.delete(phoneId);
        onOnlineChange(false);
      }
    });
  };
}

/** phoneIds = null ส่งทุกเครื่อง */
export function notifyPhones(data, phoneIds = null) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const [id, set] of phones) {
    if (phoneIds && !phoneIds.includes(id)) continue;
    for (const res of set) res.write(msg);
  }
}

export const isPhoneOnline = (phoneId) => phones.has(phoneId);

export function dropPhone(phoneId) {
  for (const res of phones.get(phoneId) ?? []) res.end();
}

// ping กันการเชื่อมต่อเงียบนานจนพร็อกซี (Cloudflare ~100 วิ) ตัดทิ้ง
setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
  for (const set of phones.values()) for (const res of set) res.write(': ping\n\n');
}, 25_000).unref();
