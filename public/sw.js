// Service worker: เปิดแอปได้แม้เน็ตหลุด (แสดงหน้าเปล่าพร้อมแจ้งว่าออฟไลน์) + รับแจ้งเตือนเด้ง
// ข้อมูลดาว (/api) ไม่เก็บแคช — ต้องเป็นค่าล่าสุดจากเซิร์ฟเวอร์เสมอ
const SHELL = 'stars-shell-v1';
const ASSETS = 'stars-assets';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// หน้าเว็บรุ่นใหม่ (deploy ใหม่) = ล้างแคชไฟล์ assets ชุดเก่าทิ้ง ไม่ให้สะสมจนเต็มเครื่อง
async function updateShell(res) {
  const html = await res.text();
  const shell = await caches.open(SHELL);
  const old = await shell.match('/');
  if (old && (await old.text()) !== html) await caches.delete(ASSETS);
  await shell.put('/', new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) event.waitUntil(updateShell(res.clone()));
          return res;
        })
        .catch(async () => (await caches.match('/')) || Response.error()),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              event.waitUntil(caches.open(ASSETS).then((c) => c.put(req, copy)));
            }
            return res;
          }),
      ),
    );
  }
});

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'สะสมดาว', body: event.data?.text() ?? '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'สะสมดาว', {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      tag: data.tag,
      lang: 'th',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of windows) {
        await w.focus();
        if ('navigate' in w) await w.navigate(url).catch(() => {});
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
