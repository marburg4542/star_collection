import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { createApp } from '../app.js';

let server;
let base;

before(async () => {
  const app = createApp(openDb(':memory:'), { appUrl: 'https://stars.example.test' });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

// เครื่องจำลอง: จำคุกกี้ไว้ + ส่ง token ผู้ปกครองถ้ามี
function client() {
  let cookie = '';
  let parentToken = '';
  async function call(method, url, body) {
    const res = await fetch(base + url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(cookie && { cookie }),
        ...(parentToken && { 'x-parent-token': parentToken }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json() };
  }
  return {
    call,
    get: (u) => call('GET', u),
    post: (u, b = {}) => call('POST', u, b),
    put: (u, b = {}) => call('PUT', u, b),
    setParent: (t) => (parentToken = t),
  };
}

const mom = client();
const kidPhone = client();
const stranger = client();
let kidA;
let kidB;

test('ตั้งค่าครั้งแรกได้ครั้งเดียว', async () => {
  assert.deepEqual((await mom.get('/api/status')).body, { setup: false, device: false });
  assert.equal((await mom.post('/api/setup', { familyCode: 'abc', pin: '1234' })).status, 400);
  const res = await mom.post('/api/setup', { familyCode: ' Star-Home ', pin: '1234' });
  assert.equal(res.status, 200);
  mom.setParent(res.body.parentToken);
  assert.equal((await stranger.post('/api/setup', { familyCode: 'hijack-123', pin: '0000' })).status, 409);
});

test('คนนอกไม่มีรหัสครอบครัวดูข้อมูลไม่ได้', async () => {
  assert.equal((await stranger.get('/api/state')).status, 401);
  assert.equal((await stranger.post('/api/device/login', { familyCode: 'wrong-code' })).status, 401);
  assert.equal((await kidPhone.post('/api/device/login', { familyCode: 'star-home' })).status, 200);
  const state = await kidPhone.get('/api/state');
  assert.equal(state.status, 200);
  assert.ok(state.body.activities.length > 0, 'มีรายการตัวอย่าง');
  assert.ok(state.body.rewards.length > 0, 'มีของรางวัลตัวอย่าง');
});

test('เด็กเข้าโหมดผู้ปกครองไม่ได้ถ้าไม่มี PIN', async () => {
  assert.equal((await kidPhone.post('/api/parent/kids', { name: 'แฮก', color: 'sky' })).status, 401);
  assert.equal((await kidPhone.post('/api/parent/login', { pin: '9999' })).status, 401);
});

test('เพิ่มเด็ก ให้ดาว หักดาว ยอดติดลบได้', async () => {
  kidA = (await mom.post('/api/parent/kids', { name: 'น้องเอ', avatar: '🦁', color: 'sky' })).body.id;
  kidB = (await mom.post('/api/parent/kids', { name: 'น้องบี', avatar: '🐰', color: 'pink' })).body.id;
  const { activities } = (await mom.get('/api/state')).body;
  const dishes = activities.find((a) => a.name === 'ช่วยล้างจาน');
  const lie = activities.find((a) => a.name === 'โกหก');

  assert.equal((await mom.post('/api/parent/stars', { kidIds: [kidA, kidB], activityId: dishes.id })).status, 200);
  await mom.post('/api/parent/stars', { kidIds: [kidB], activityId: lie.id });
  await mom.post('/api/parent/stars', { kidIds: [kidA], kind: 'earn', stars: 10, title: 'ช่วยยายถือของ' });

  const kids = Object.fromEntries((await kidPhone.get('/api/state')).body.kids.map((k) => [k.id, k]));
  assert.equal(kids[kidA].balance, 12);
  assert.equal(kids[kidB].balance, -3, 'โดนหักเกินที่มี ติดลบได้');
  assert.equal(kids[kidB].total, -3);
});

test('ขอแลก → จองดาว → อนุมัติแล้วหักจริง · ยอดสะสมไม่ลดเมื่อแลก', async () => {
  const { rewards } = (await kidPhone.get('/api/state')).body;
  const iceCream = rewards.find((r) => r.name === 'ไอติม 1 แท่ง'); // 5 ดาว
  const toy = rewards.find((r) => r.cost === 40);

  assert.equal((await kidPhone.post('/api/requests', { kidId: kidB, rewardId: iceCream.id })).status, 409, 'ติดลบแลกไม่ได้');
  assert.equal((await kidPhone.post('/api/requests', { kidId: kidA, rewardId: toy.id })).status, 409, 'ดาวไม่พอ');

  const r1 = (await kidPhone.post('/api/requests', { kidId: kidA, rewardId: iceCream.id })).body.id;
  const r2 = (await kidPhone.post('/api/requests', { kidId: kidA, rewardId: iceCream.id })).body.id;
  assert.equal((await kidPhone.post('/api/requests', { kidId: kidA, rewardId: iceCream.id })).status, 409, 'ดาวที่จองไว้นับด้วย (12 − 10 < 5)');

  assert.equal((await kidPhone.post(`/api/parent/requests/${r1}/approve`)).status, 401, 'เด็กอนุมัติเองไม่ได้');
  assert.equal((await mom.post(`/api/parent/requests/${r1}/approve`)).status, 200);
  assert.equal((await mom.post(`/api/parent/requests/${r2}/reject`, { note: 'ไว้พรุ่งนี้นะ' })).status, 200);
  assert.equal((await mom.post(`/api/parent/requests/${r2}/approve`)).status, 409, 'ตัดสินไปแล้ว');

  const a = (await kidPhone.get('/api/state')).body.kids.find((k) => k.id === kidA);
  assert.equal(a.balance, 7);
  assert.equal(a.total, 12, 'ยอดสะสมไม่นับการแลก');
  assert.equal(a.reserved, 0);
});

test('ยกเลิกรายการที่กดผิด', async () => {
  const { items } = (await mom.get(`/api/history?kid=${kidB}`)).body;
  const lie = items.find((t) => t.title === 'โกหก');
  assert.equal((await mom.post(`/api/parent/transactions/${lie.id}/void`)).status, 200);
  assert.equal((await mom.post(`/api/parent/transactions/${lie.id}/void`)).status, 409);
  const b = (await kidPhone.get('/api/state')).body.kids.find((k) => k.id === kidB);
  assert.equal(b.balance, 2);
});

test('เปลี่ยนรหัสครอบครัวแล้วเครื่องอื่นหลุด', async () => {
  assert.equal((await mom.put('/api/parent/pin', { currentPin: '0000', newPin: '4321' })).status, 400);
  assert.equal((await mom.put('/api/parent/pin', { currentPin: '1234', newPin: '4321' })).status, 200);
  assert.equal((await mom.put('/api/parent/family-code', { familyCode: 'new-home-code' })).status, 200);
  assert.equal((await kidPhone.get('/api/state')).status, 401);
  assert.equal((await mom.get('/api/state')).status, 200, 'เครื่องที่เปลี่ยนรหัสยังใช้ได้');
  assert.equal((await kidPhone.post('/api/device/login', { familyCode: 'NEW-HOME-CODE' })).status, 200);
});

// ---------- มือถือของลูก (แอปล็อคจอ) ----------

// แอปบนมือถือลูกส่ง token ใน Authorization ไม่ใช้คุกกี้
function phoneClient() {
  let token = '';
  async function call(method, url, body) {
    const res = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }
  return { get: (u) => call('GET', u), post: (u, b = {}) => call('POST', u, b), setToken: (t) => (token = t) };
}
const phone = phoneClient();
const grantOf = async () => (await phone.get('/api/phone/state')).body.grantMinutes;

test('รางวัลเล่นโทรศัพท์ตัวอย่างอ่านจำนวนนาทีจากชื่อ', async () => {
  const { rewards } = (await mom.get('/api/state')).body;
  assert.equal(rewards.find((r) => r.name === 'เล่นโทรศัพท์ 30 นาที').minutes, 30);
  assert.equal(rewards.find((r) => r.name === 'เล่นโทรศัพท์ 1 ชั่วโมง').minutes, 60);
  assert.equal(rewards.find((r) => r.name === 'ไอติม 1 แท่ง').minutes, null);
  assert.equal((await mom.post('/api/parent/rewards', { name: 'เล่นเกม', category: 'screen', cost: 3 })).status, 400, 'หมวดนี้ต้องใส่นาที');
});

test('จับคู่มือถือด้วยรหัสจากโหมดผู้ปกครอง ใช้ได้ครั้งเดียว', async () => {
  assert.equal((await kidPhone.post('/api/parent/phones/pair-code', { kidId: kidA })).status, 401, 'เด็กขอรหัสเองไม่ได้');
  const { code } = (await mom.post('/api/parent/phones/pair-code', { kidId: kidA })).body;
  assert.match(code, /^\d{6}$/);
  assert.equal((await phone.post('/api/phone/pair', { code: '000000', name: 'x' })).status, 401);
  const paired = await phone.post('/api/phone/pair', { code, name: 'Galaxy A15' });
  assert.equal(paired.status, 200);
  assert.equal(paired.body.kid.id, kidA);
  assert.equal((await stranger.post('/api/phone/pair', { code, name: 'ซ้ำ' })).status, 401, 'รหัสใช้แล้ว');
  assert.equal((await phone.get('/api/phone/state')).status, 401, 'ยังไม่ได้ใส่ token');
  phone.setToken(paired.body.token);

  const s = (await phone.get('/api/phone/state')).body;
  assert.equal(s.kid.name, 'น้องเอ');
  assert.equal(s.rules.limits.school, 120, 'กติกาเริ่มต้น');
  assert.match(s.pinHash, /^\$2[aby]\$/, 'ได้ hash ของ PIN ไว้ปลดล็อคตอนออฟไลน์');
  assert.ok(s.rewards.every((r) => r.minutes > 0));
});

test('ตั้งกติกา รายงานเวลา และสั่งล็อคจากโหมดผู้ปกครอง', async () => {
  const rules = {
    enabled: true,
    limits: { school: 90, holiday: null },
    bedtime: { school: { start: '20:30', end: '06:30' }, holiday: null },
    allowed: ['com.whatsapp'],
  };
  assert.equal((await mom.put(`/api/parent/kids/${kidA}/screen-rules`, { rules: { ...rules, bedtime: { school: { start: '25:00', end: '06:00' } } } })).status, 400);
  assert.equal((await mom.put(`/api/parent/kids/${kidA}/screen-rules`, { rules })).status, 200);
  assert.deepEqual((await phone.get('/api/phone/state')).body.rules, rules);

  const day = (await phone.get('/api/phone/state')).body.day;
  await phone.post('/api/phone/report', { day, usedSec: 600, lock: null, remainingSec: 4800, apps: [{ pkg: 'com.whatsapp', label: 'WhatsApp' }] });
  await phone.post('/api/phone/report', { day, usedSec: 300, lock: 'limit', remainingSec: 0 }); // ยอดสะสมไม่ลดลง
  const list = (await mom.get('/api/parent/phones')).body;
  assert.equal(list.phones[0].name, 'Galaxy A15');
  assert.equal(list.phones[0].report.lock, 'limit');
  assert.equal(list.kids[kidA].usedSec, 600);
  assert.deepEqual(list.kids[kidA].apps, [{ pkg: 'com.whatsapp', label: 'WhatsApp' }]);

  const id = list.phones[0].id;
  await mom.post(`/api/parent/phones/${id}/lock`, { locked: true });
  assert.equal((await phone.get('/api/phone/state')).body.phone.locked, true);
  await phone.post('/api/phone/unlock'); // ผู้ปกครองใส่ PIN บนเครื่อง
  assert.equal((await phone.get('/api/phone/state')).body.phone.locked, false);

  await mom.post(`/api/parent/kids/${kidA}/screen-pause`, { minutes: 60 });
  assert.ok((await phone.get('/api/phone/state')).body.pausedUntil);
  await mom.post(`/api/parent/kids/${kidA}/screen-pause`, { minutes: 0 });
  assert.equal((await phone.get('/api/phone/state')).body.pausedUntil, null);
});

test('เวลาเพิ่ม: ขอจากเครื่อง, แลกดาว, ใส่ PIN บนเครื่อง, ผู้ปกครองให้', async () => {
  assert.equal(await grantOf(), 0);

  assert.equal((await phone.post('/api/phone/time-requests', { minutes: 45 })).status, 400);
  const tr = (await phone.post('/api/phone/time-requests', { minutes: 30 })).body.id;
  assert.equal((await phone.post('/api/phone/time-requests', { minutes: 15 })).status, 409, 'ขอซ้ำระหว่างรอไม่ได้');
  assert.deepEqual((await kidPhone.get('/api/state')).body.timeRequests.map((t) => t.id), [tr], 'ขึ้นป้ายแจ้งในโหมดผู้ปกครอง');
  await mom.post(`/api/parent/time-requests/${tr}/approve`);
  assert.equal(await grantOf(), 30);

  const reward = (await phone.get('/api/phone/state')).body.rewards.find((r) => r.minutes === 30); // 5 ดาว น้องเอมี 7
  const reqId = (await phone.post('/api/phone/requests', { rewardId: reward.id })).body.id;
  await mom.post(`/api/parent/requests/${reqId}/approve`);
  assert.equal(await grantOf(), 60, 'อนุมัติแลกดาว → ได้เวลาเพิ่มอัตโนมัติ');

  const redeemTx = (await mom.get(`/api/history?kid=${kidA}`)).body.items.find((t) => t.type === 'redeem' && t.title === reward.name);
  await mom.post(`/api/parent/transactions/${redeemTx.id}/void`);
  assert.equal(await grantOf(), 30, 'ยกเลิกการแลก → เอาเวลาคืน');

  await phone.post('/api/phone/grants', { clientId: 'g-1', minutes: 15 });
  await phone.post('/api/phone/grants', { clientId: 'g-1', minutes: 15 }); // เน็ตกลับมาแล้วส่งซ้ำ
  await mom.post(`/api/parent/kids/${kidA}/screen-grants`, { minutes: 10 });
  assert.equal(await grantOf(), 55);
});

test('รายงานรายแอปย้อนหลัง และตำแหน่งล่าสุด', async () => {
  const day = (await phone.get('/api/phone/state')).body.day;
  const youtube = { pkg: 'com.google.android.youtube', label: 'YouTube' };
  await phone.post('/api/phone/report', {
    day,
    usedSec: 900,
    appUsage: [{ day, apps: [{ ...youtube, sec: 600 }, { pkg: 'com.whatsapp', label: 'WhatsApp', sec: 120 }, { pkg: 'bad pkg', sec: 5 }] }],
  });
  await phone.post('/api/phone/report', { day, usedSec: 960, appUsage: [{ day, apps: [{ ...youtube, sec: 660 }] }] }); // ยอดทั้งวันชุดใหม่เขียนทับ
  const { days } = (await mom.get(`/api/parent/kids/${kidA}/app-usage?days=7`)).body;
  assert.equal(days.length, 7);
  assert.equal(days[0].day, day);
  assert.deepEqual(days[0].apps, [
    { pkg: youtube.pkg, label: 'YouTube', sec: 660 },
    { pkg: 'com.whatsapp', label: 'WhatsApp', sec: 120 },
  ]);
  assert.equal(days[0].totalSec, 780);
  assert.equal((await kidPhone.get(`/api/parent/kids/${kidA}/app-usage`)).status, 401, 'เด็กดูรายงานเองไม่ได้');

  const id = (await mom.get('/api/parent/phones')).body.phones[0].id;
  assert.equal((await mom.post(`/api/parent/phones/${id}/locate`)).status, 200);
  assert.ok((await phone.get('/api/phone/state')).body.phone.locateRequestedAt, 'เครื่องเห็นว่าถูกขอตำแหน่ง');
  assert.equal((await phone.post('/api/phone/location', { lat: 200, lng: 0 })).status, 400);
  await phone.post('/api/phone/location', { lat: 13.7563309, lng: 100.5017651, accuracy: 18.4, at: '2026-11-03T10:00:00Z' });
  const p = (await mom.get('/api/parent/phones')).body.phones[0];
  assert.deepEqual(p.location, { lat: 13.756331, lng: 100.501765, accuracy: 18, at: '2026-11-03T10:00:00.000Z' });
});

test('ปลดการควบคุม: เครื่องยืนยันแล้วหายจากรายการ', async () => {
  const id = (await mom.get('/api/parent/phones')).body.phones[0].id;
  await mom.post(`/api/parent/phones/${id}/release`);
  assert.equal((await phone.get('/api/phone/state')).body.phone.releasing, true);
  assert.equal((await phone.post('/api/phone/released')).status, 200);
  assert.equal((await phone.get('/api/phone/state')).status, 401);
  assert.equal((await mom.get('/api/parent/phones')).body.phones.length, 0);
});

test('รับแจ้งเตือนเฉพาะบริการที่รู้จัก', async () => {
  const keys = { p256dh: 'x', auth: 'y' };
  const evil = { endpoint: 'http://192.168.1.1/admin', keys };
  assert.equal((await kidPhone.post('/api/push/subscribe', { role: 'kid', kidId: kidA, subscription: evil })).status, 400);
  const fcm = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys };
  assert.equal((await kidPhone.post('/api/push/subscribe', { role: 'kid', kidId: kidA, subscription: fcm })).status, 200);
  assert.equal((await kidPhone.post('/api/push/subscribe', { role: 'parent', subscription: fcm })).status, 401, 'แจ้งเตือนผู้ปกครองต้องใช้ PIN');
  const status = await kidPhone.post('/api/push/status', { endpoint: fcm.endpoint });
  assert.deepEqual(status.body.subscriptions, [{ role: 'kid', kidId: kidA }]);
});
