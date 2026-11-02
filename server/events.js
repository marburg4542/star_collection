// Server-Sent Events: บอกทุกเครื่องที่เปิดแอปอยู่ว่าข้อมูลเปลี่ยน ให้โหลดใหม่ — จอเด็กเห็นดาวเพิ่มทันทีที่ผู้ปกครองกด
const clients = new Set();

export function eventsHandler(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
}

export function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

// ping กันการเชื่อมต่อเงียบนานจนพร็อกซี (Cloudflare ~100 วิ) ตัดทิ้ง
setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
}, 25_000).unref();
