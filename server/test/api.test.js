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
