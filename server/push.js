// แจ้งเตือนเด้ง (Web Push) — สร้างกุญแจ VAPID ครั้งแรกแล้วเก็บในฐานข้อมูล ไม่ต้องตั้งค่าเอง
import webpush from 'web-push';
import { getSetting, setSetting } from './db.js';

export function createPush(db, { subject }) {
  let publicKey = getSetting(db, 'vapid_public');
  let privateKey = getSetting(db, 'vapid_private');
  if (!publicKey || !privateKey) {
    ({ publicKey, privateKey } = webpush.generateVAPIDKeys());
    setSetting(db, 'vapid_public', publicKey);
    setSetting(db, 'vapid_private', privateKey);
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const removeEndpoint = db.prepare('DELETE FROM push_subs WHERE endpoint = ?');

  async function send({ role, kidId = 0 }, payload) {
    const subs = db.prepare('SELECT DISTINCT endpoint, keys FROM push_subs WHERE role = ? AND kid_id = ?').all(role, kidId);
    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: JSON.parse(s.keys) }, body, { TTL: 60 * 60 * 24 });
        } catch (err) {
          // 404/410 = เครื่องนั้นยกเลิกการแจ้งเตือนไปแล้ว ลบทิ้ง
          if (err.statusCode === 404 || err.statusCode === 410) removeEndpoint.run(s.endpoint);
          else console.warn('push failed', err.statusCode ?? err.message);
        }
      }),
    );
  }

  return {
    publicKey,
    // ไม่รอผล — การแจ้งเตือนช้า/พลาดไม่ควรทำให้การให้ดาวช้าตาม
    notify(target, payload) {
      send(target, payload).catch((err) => console.warn('push error', err.message));
    },
  };
}
