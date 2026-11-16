import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../db.js';
import { createApp } from '../app.js';
import { returnSummary, silentHint } from '../screen.js';

let server;
let base;
let app;
let db;
let mediaDir;

before(async () => {
  db = openDb(':memory:');
  mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stars-vocab-'));
  app = createApp(db, { appUrl: 'https://stars.example.test', mediaDir });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  fs.rmSync(mediaDir, { recursive: true, force: true });
});

// เครื่องจำลอง: จำคุกกี้ไว้ + ส่ง token ผู้ปกครองถ้ามี
function client() {
  let cookie = '';
  let parentToken = '';
  async function call(method, url, body, rawType) {
    const res = await fetch(base + url, {
      method,
      headers: {
        'content-type': rawType ?? 'application/json',
        ...(cookie && { cookie }),
        ...(parentToken && { 'x-parent-token': parentToken }),
      },
      body: body === undefined ? undefined : rawType ? body : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') ?? '';
    return { status: res.status, type, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
  }
  return {
    call,
    get: (u) => call('GET', u),
    post: (u, b = {}) => call('POST', u, b),
    put: (u, b = {}) => call('PUT', u, b),
    del: (u) => call('DELETE', u),
    upload: (u, buf, type) => call('POST', u, buf, type),
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

test('คืนดาวคำขอที่อนุมัติพลาด — ดาวกลับมา ไม่นับเป็นดาวสะสม', async () => {
  const stateOf = async () => (await mom.get('/api/state')).body;
  const before = (await stateOf()).kids.find((k) => k.id === kidA);
  const approved = (await stateOf()).requests.find((r) => r.kidId === kidA && r.status === 'approved');
  assert.ok(approved);
  assert.equal((await kidPhone.post(`/api/parent/requests/${approved.id}/refund`)).status, 401, 'เด็กกดคืนเองไม่ได้');
  assert.equal((await mom.post(`/api/parent/requests/${approved.id}/refund`)).status, 200);
  assert.equal((await mom.post(`/api/parent/requests/${approved.id}/refund`)).status, 409, 'คืนซ้ำไม่ได้');
  const after = await stateOf();
  const a = after.kids.find((k) => k.id === kidA);
  assert.equal(a.balance, before.balance + approved.cost, 'ดาวกลับมา');
  assert.equal(a.total, before.total, 'ดาวสะสมไม่เพิ่ม');
  assert.equal(after.requests.find((r) => r.id === approved.id).status, 'cancelled');
  const redeem = (await mom.get(`/api/history?kid=${kidA}`)).body.items.find((t) => t.type === 'redeem');
  assert.ok(redeem.voidedAt, 'รายการแลกในประวัติถูกยกเลิก');
});

test('แลกดาวเป็นเงินแบบกรอกจำนวน — ไม่เกินดาวที่มี', async () => {
  const stateOf = async () => (await mom.get('/api/state')).body;
  const kid = (await stateOf()).kids.find((k) => k.id === kidA);
  const available = kid.balance - kid.reserved;
  assert.ok(available >= 3, `ต้องมีดาวพอทดสอบ (มี ${available})`);
  assert.equal((await stateOf()).moneyRate, 1, 'ค่าเริ่มต้น 1 ดาว = 1 บาท');

  assert.equal((await kidPhone.post('/api/requests', { kidId: kidA, baht: available + 1 })).status, 409, 'เกินดาวที่มี');
  assert.equal((await kidPhone.post('/api/requests', { kidId: kidA, baht: 0 })).status, 400);
  assert.equal((await kidPhone.post('/api/requests', { kidId: kidA, baht: 2.5 })).status, 400);

  assert.equal((await kidPhone.put('/api/parent/money-rate', { rate: 2 })).status, 401, 'เด็กตั้งอัตราเองไม่ได้');
  assert.equal((await mom.put('/api/parent/money-rate', { rate: 2 })).status, 200);
  const res = await kidPhone.post('/api/requests', { kidId: kidA, baht: 5 });
  assert.equal(res.status, 200);
  const r = (await stateOf()).requests.find((x) => x.id === res.body.id);
  assert.equal(r.name, 'เงิน 5 บาท');
  assert.equal(r.cost, 3, '5 บาท ที่ 2 บาท/ดาว ปัดขึ้นเป็น 3 ดาว');
  assert.equal(r.status, 'pending');
  assert.equal((await kidPhone.post(`/api/requests/${r.id}/cancel`)).status, 200);

  assert.equal((await mom.put('/api/parent/money-rate', { rate: 0 })).status, 200);
  assert.equal((await kidPhone.post('/api/requests', { kidId: kidA, baht: 1 })).status, 409, 'ปิดแล้วขอไม่ได้');
  assert.equal((await mom.put('/api/parent/money-rate', { rate: 1 })).status, 200);
});

test('เกมคำศัพท์: สร้างชุด ใส่รูป สอบ — ได้ดาวครั้งแรกที่ผ่าน', async () => {
  const setBody = { title: 'ผลไม้กับสัตว์', weekStart: '2026-11-16', passPct: 80, stars: 5, kidIds: [kidA] };
  assert.equal((await kidPhone.post('/api/parent/vocab', setBody)).status, 401, 'เด็กสร้างชุดเองไม่ได้');
  assert.equal((await mom.post('/api/parent/vocab', { ...setBody, weekStart: 'next week' })).status, 400);
  assert.equal((await mom.post('/api/parent/vocab', { ...setBody, kidIds: [] })).status, 400);
  const setId = (await mom.post('/api/parent/vocab', setBody)).body.id;

  // รูป: ต้องเป็นไฟล์รูปจริง
  assert.equal((await mom.upload('/api/parent/vocab/images', Buffer.from('hello'), 'image/png')).status, 400);
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f1b0e20000000049454e44ae426082', 'hex');
  const up = await mom.upload('/api/parent/vocab/images', png, 'image/png');
  assert.equal(up.status, 200);
  assert.match(up.body.image, /^[a-f0-9]{24}\.png$/);
  assert.ok(fs.existsSync(path.join(mediaDir, up.body.image)));

  const words = [
    { word: 'apple', meaning: 'แอปเปิ้ล', example: 'I eat an apple.', emoji: '🍎', image: up.body.image },
    { word: 'banana', meaning: 'กล้วย', emoji: '🍌' },
    { word: 'cat', meaning: 'แมว', emoji: '🐱' },
    { word: 'ice cream', meaning: 'ไอศกรีม' },
    { word: "don't", meaning: 'อย่า' },
  ];
  assert.equal((await mom.post(`/api/parent/vocab/${setId}/words`, { word: 'แมว', meaning: 'cat' })).status, 400, 'คำศัพท์ต้องเป็นอังกฤษ');
  assert.equal((await mom.post(`/api/parent/vocab/${setId}/words`, { ...words[0], image: '../secret.png' })).status, 400);
  for (const w of words) assert.equal((await mom.post(`/api/parent/vocab/${setId}/words`, w)).status, 200);

  const list = (await kidPhone.get('/api/vocab')).body.sets;
  const set = list.find((s) => s.id === setId);
  assert.deepEqual(set.kidIds, [kidA]);
  assert.equal(set.words.length, 5);
  assert.equal(set.words[0].example, 'I eat an apple.');
  assert.ok(!('reading' in set.words[0]), 'ไม่มีคำอ่านภาษาไทยแล้ว');
  assert.equal((await stranger.get('/api/vocab')).status, 401);

  // รูปเปิดได้จากเครื่องในครอบครัวเท่านั้น
  const img = await kidPhone.get(`/api/vocab/images/${up.body.image}`);
  assert.equal(img.status, 200);
  assert.equal(img.type, 'image/png');
  assert.equal((await stranger.get(`/api/vocab/images/${up.body.image}`)).status, 401);
  assert.equal((await kidPhone.get('/api/vocab/images/..%2Fstars.sqlite')).status, 404);

  const id = Object.fromEntries(set.words.map((w) => [w.word, w.id]));
  const answer = (overrides = {}) => [
    { wordId: id.apple, mode: 'choice', answer: 'แอปเปิ้ล' },
    { wordId: id.banana, mode: 'spell', answer: ' BANANA ' },
    { wordId: id.cat, mode: 'choice', answer: 'แมว' },
    { wordId: id['ice cream'], mode: 'spell', answer: 'ice  cream' },
    { wordId: id["don't"], mode: 'spell', answer: 'don’t' },
  ].map((a) => ({ ...a, ...(overrides[a.wordId] ?? {}) }));
  const attempt = (kidId, answers) => kidPhone.post(`/api/vocab/${setId}/attempts`, { kidId, answers });

  assert.equal((await attempt(kidB, answer())).status, 403, 'ชุดนี้ไม่ได้ให้น้องบี');
  assert.equal((await attempt(kidA, answer().slice(1))).status, 409, 'ต้องตอบครบทุกคำ');

  const before = (await mom.get('/api/state')).body.kids.find((k) => k.id === kidA);
  // ถูก 3/5 = 60% ไม่ผ่าน
  let r = await attempt(kidA, answer({ [id.apple]: { answer: 'กล้วย' }, [id.banana]: { answer: 'bananna' } }));
  assert.deepEqual(r.body, { correct: 3, total: 5, passed: false, stars: 0 });
  // ถูก 5/5 ผ่าน ได้ดาว (ตัวพิมพ์ใหญ่/ช่องว่าง/อัญประกาศโค้งไม่นับว่าผิด)
  r = await attempt(kidA, answer());
  assert.deepEqual(r.body, { correct: 5, total: 5, passed: true, stars: 5 });
  // ผ่านซ้ำไม่ได้ดาวเพิ่ม
  r = await attempt(kidA, answer());
  assert.equal(r.body.stars, 0);
  const after = (await mom.get('/api/state')).body.kids.find((k) => k.id === kidA);
  assert.equal(after.balance, before.balance + 5);
  assert.equal(after.total, before.total + 5, 'นับเป็นดาวสะสม');
  const result = (await kidPhone.get('/api/vocab')).body.sets.find((s) => s.id === setId).results[kidA];
  assert.equal(result.attempts, 3);
  assert.equal(result.best, 1);
  assert.equal(result.passed, true);
  assert.equal(result.rewarded, true);

  // ผู้ปกครองยกเลิกดาวนั้น → สอบผ่านใหม่ได้ดาวอีกครั้ง
  const tx = (await mom.get(`/api/history?kid=${kidA}`)).body.items.find((t) => t.title === 'สอบคำศัพท์ผ่าน: ผลไม้กับสัตว์' && !t.voidedAt);
  assert.equal(tx.emoji, '📚');
  assert.equal((await mom.post(`/api/parent/transactions/${tx.id}/void`)).status, 200);
  assert.equal((await attempt(kidA, answer())).body.stars, 5);

  // แก้ชุด: เพิ่มน้องบี · ลบคำที่มีรูปแล้วไฟล์รูปหายด้วย
  assert.equal((await mom.put(`/api/parent/vocab/${setId}`, { ...setBody, kidIds: [kidA, kidB] })).status, 200);
  assert.equal((await kidPhone.post(`/api/vocab/${setId}/attempts`, { kidId: kidB, answers: answer() })).status, 200);
  assert.equal((await mom.del(`/api/parent/vocab/words/${id.apple}`)).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(!fs.existsSync(path.join(mediaDir, up.body.image)), 'ลบรูปทิ้งด้วย');
  assert.equal((await attempt(kidA, answer())).status, 409, 'ส่งคำที่ถูกลบไปแล้วไม่ได้');

  assert.equal((await mom.del(`/api/parent/vocab/${setId}`)).status, 200);
  assert.ok(!(await kidPhone.get('/api/vocab')).body.sets.some((s) => s.id === setId));
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
  const { code, expiresAt } = (await mom.post('/api/parent/phones/pair-code', { kidId: kidA })).body;
  assert.match(code, /^\d{6}$/);
  assert.ok(Date.parse(expiresAt) - Date.now() <= 10 * 60_000, 'รหัสพิมพ์เองใช้ได้ 10 นาที');
  const qr = (await mom.post('/api/parent/phones/pair-code', { kidId: kidA, qr: true })).body;
  assert.ok(Date.parse(qr.expiresAt) - Date.now() > 25 * 60_000, 'QR ตั้งเครื่องใหม่ให้เวลา 30 นาที');
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

  // แอป 2.4: ปลดบนเครื่องตอนไม่มีเน็ต แล้วส่งตามมาทีหลัง — ปลดเฉพาะล็อคที่เห็นตอนกด
  await mom.post(`/api/parent/phones/${id}/lock`, { locked: true });
  const seen = (await phone.get('/api/phone/state')).body.phone.lockChangedAt;
  await new Promise((r) => setTimeout(r, 5));
  await mom.post(`/api/parent/phones/${id}/lock`, { locked: true }); // ผู้ปกครองล็อคใหม่ระหว่างเครื่องออฟไลน์
  assert.equal((await phone.post('/api/phone/unlock', { lockChangedAt: seen })).body.applied, false);
  assert.equal((await phone.get('/api/phone/state')).body.phone.locked, true, 'ล็อคใหม่ไม่ถูกปลดโดยการปลดที่ส่งตามมา');
  const now = (await phone.get('/api/phone/state')).body.phone.lockChangedAt;
  assert.equal((await phone.post('/api/phone/unlock', { lockChangedAt: now })).body.applied, true);
  assert.equal((await phone.get('/api/phone/state')).body.phone.locked, false);

  // แอป 2.6: ผู้ปกครองใส่ PIN แล้วกดล็อคจากบนเครื่อง
  assert.equal((await phone.post('/api/phone/lock')).status, 200);
  assert.equal((await phone.get('/api/phone/state')).body.phone.locked, true);
  assert.equal((await mom.get('/api/parent/phones')).body.phones[0].locked, true, 'เว็บเห็นตรงกัน');
  await phone.post('/api/phone/unlock');

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

test('รีเซ็ตเวลาวันนี้: ใช้ไปกลับเป็น 0 และล้างเวลาพิเศษ', async () => {
  const kidInfo = async () => (await mom.get('/api/parent/phones')).body.kids[kidA];
  const before = await phone.get('/api/phone/state');
  const used = (await kidInfo()).usedSec;
  assert.ok(used > 0 && before.body.grantMinutes > 0);
  assert.equal(before.body.usedElsewhereSec, 0);

  assert.equal((await mom.post(`/api/parent/kids/${kidA}/screen-reset`)).status, 200);
  assert.equal((await kidInfo()).usedSec, 0);
  assert.equal((await kidInfo()).grantMinutes, 0);
  const after = (await phone.get('/api/phone/state')).body;
  assert.equal(after.grantMinutes, 0);
  assert.equal(after.usedElsewhereSec, -used, 'เครื่องหักยอดตอนรีเซ็ตออกจากยอดบนเครื่องเอง');

  await phone.post('/api/phone/report', { day: after.day, usedSec: used + 120 }); // เล่นต่ออีก 2 นาที
  assert.equal((await kidInfo()).usedSec, 120);
  assert.equal((await phone.get('/api/phone/state')).body.usedElsewhereSec, -used);
  assert.equal((await kidPhone.post(`/api/parent/kids/${kidA}/screen-reset`)).status, 401, 'เด็กรีเซ็ตเองไม่ได้');
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

test('แอป 2.5: แบต, แอปที่ติดตั้ง/ลบ, ช่วงเปิดจอ, บล็อคเว็บ', async () => {
  const sent = [];
  const realNotify = app.locals.push.notify;
  app.locals.push.notify = (target, payload) => sent.push({ target, payload });
  try {
    const day = (await phone.get('/api/phone/state')).body.day;
    const report = (extra) => phone.post('/api/phone/report', { day, usedSec: 0, ...extra });

    await report({ battery: { level: 64, charging: false } });
    assert.deepEqual((await mom.get('/api/parent/phones')).body.phones[0].report.battery, { level: 64, charging: false });
    await report({ battery: { level: 140 } });
    assert.equal((await mom.get('/api/parent/phones')).body.phones[0].report.battery, null, 'ค่าแปลกไม่เก็บ');

    // แอปที่ติดตั้ง/ลบ: เทียบกับรายชื่อที่เครื่องส่งมาครั้งก่อน
    const whatsapp = { pkg: 'com.whatsapp', label: 'WhatsApp' };
    const tiktok = { pkg: 'com.zhiliaoapp.musically', label: 'TikTok' };
    await report({ apps: [whatsapp] });
    sent.length = 0;
    await report({ apps: [whatsapp, tiktok] });
    assert.equal(sent.length, 1);
    assert.match(sent[0].payload.title, /ติดตั้งแอปใหม่: TikTok/);
    await report({ apps: [tiktok] });
    assert.equal(sent.length, 2);
    assert.match(sent[1].payload.title, /ลบแอป: WhatsApp/);
    await report({});
    assert.equal(sent.length, 2, 'ไม่ได้ส่งรายชื่อแอปมา = ไม่มีอะไรเปลี่ยน');

    // ช่วงเปิดจอ + จำนวนครั้งที่ปลดล็อค
    const t0 = Date.parse(`${day}T09:00:00+07:00`);
    const sessions = [[t0, t0 + 600_000], [t0 + 610_000, t0 + 900_000], [t0 + 3_600_000, t0 + 3_700_000]];
    await report({ appUsage: [{ day, apps: [], sessions, unlocks: 4 }] });
    const usage = (await mom.get(`/api/parent/kids/${kidA}/app-usage?days=7`)).body;
    assert.deepEqual(usage.days[0].sessions, [[t0, t0 + 900_000], [t0 + 3_600_000, t0 + 3_700_000]], 'ห่างไม่ถึง 30 วิ รวมเป็นช่วงเดียว');
    assert.equal(usage.days[0].unlocks, 4);
    assert.equal(usage.days[1].sessions, null, 'วันที่เครื่องไม่ได้ส่งช่วงเปิดจอ (แอปรุ่นเก่า)');
    assert.deepEqual(usage.appChanges.map((c) => `${c.kind}:${c.label}`), ['remove:WhatsApp', 'install:TikTok']);

    // รายการบล็อค: เริ่มจากรายการเริ่มต้น เครื่องได้รายการไปพร้อมสถานะ
    const wb = (await mom.get('/api/parent/web-block')).body;
    assert.equal(wb.enabled, true);
    assert.ok(wb.sites.includes('pornhub.com') && wb.words.includes('หนังโป๊'));
    assert.deepEqual(wb.starter.sites, wb.sites);
    assert.deepEqual((await phone.get('/api/phone/state')).body.webBlock.words, wb.words);
    assert.equal((await mom.put('/api/parent/web-block', { enabled: true, sites: ['not a site'], words: [] })).status, 400);
    const saved = await mom.put('/api/parent/web-block', { enabled: true, sites: ['https://www.Bad-Site.com/x', 'bad-site.com'], words: [' Bad  Word ', ''] });
    assert.equal(saved.status, 200);
    assert.deepEqual((await phone.get('/api/phone/state')).body.webBlock, { enabled: true, sites: ['bad-site.com'], words: ['bad word'] });
    assert.equal((await kidPhone.put('/api/parent/web-block', { enabled: false, sites: [], words: [] })).status, 401, 'เด็กแก้รายการเองไม่ได้');

    // เครื่องแจ้งว่าปิดหน้าไปแล้ว → แจ้งผู้ปกครองครั้งเดียวต่อรายการใน 10 นาที
    sent.length = 0;
    const now = Date.now();
    const site = (clientId, at) =>
      phone.post('/api/phone/web-blocks', { clientId, kind: 'site', text: 'bad-site.com/page', matched: 'bad-site.com', app: 'com.android.chrome', at: new Date(at).toISOString() });
    await site('w-1', now - 60_000);
    await site('w-1', now - 60_000); // เน็ตกลับมาแล้วส่งซ้ำ
    await site('w-2', now);
    assert.equal(sent.length, 1);
    assert.match(sent[0].payload.title, /พยายามเปิดเว็บที่บล็อค ใน Chrome/);
    await phone.post('/api/phone/web-blocks', { clientId: 'w-3', kind: 'search', text: 'bad word clip', matched: 'bad word', app: 'com.google.android.youtube' });
    assert.equal(sent.length, 2);
    assert.match(sent[1].payload.title, /ค้นหาคำที่บล็อค ใน YouTube/);
    assert.equal((await phone.post('/api/phone/web-blocks', { kind: 'site', text: '' })).status, 400);
    const blocks = (await mom.get(`/api/parent/kids/${kidA}/app-usage`)).body.webBlocks;
    assert.deepEqual(blocks.map((b) => b.matched), ['bad word', 'bad-site.com', 'bad-site.com']);
    assert.equal(blocks[0].appLabel, 'YouTube');
  } finally {
    app.locals.push.notify = realNotify;
  }
});

test('ข้อความตอนเครื่องเงียบดูจากแบตในรายงานสุดท้าย', () => {
  assert.match(silentHint(null), /อาจปิดเครื่อง/);
  assert.match(silentHint({ battery: { level: 3, charging: false } }), /แบตล่าสุด 3% — น่าจะแบตหมด/);
  assert.match(silentHint({ battery: { level: 3, charging: true } }), /แอปล็อคจออาจถูกปิด/);
  assert.match(silentHint({ battery: { level: 64, charging: false } }), /แบตล่าสุด 64% — แอปล็อคจออาจถูกปิด/);
});

test('แอป 2.7: เครื่องกลับมาหลังเงียบไป บอกสาเหตุได้ + สั่งอัปเดตแอปจากเว็บ', async () => {
  const sent = [];
  const realNotify = app.locals.push.notify;
  app.locals.push.notify = (target, payload) => sent.push({ target, payload });
  try {
    const day = (await phone.get('/api/phone/state')).body.day;
    const id = (await mom.get('/api/parent/phones')).body.phones[0].id;
    const ago = (ms) => new Date(Date.now() - ms).toISOString();
    const H = 3_600_000;
    const base = { day, usedSec: 0, version: '2.7', bootCount: 5, bootAt: ago(5 * H), pid: 100, appStartAt: ago(5 * H) };
    const report = (extra) => phone.post('/api/phone/report', { ...base, ...extra });
    const lastReturn = async () => (await mom.get('/api/parent/phones')).body.phones[0].lastReturn;
    // จำลองว่าเครื่องหายไป: ติดต่อครั้งสุดท้าย (และรายงานล่าสุด) เมื่อ ms ที่แล้ว
    const goSilent = (ms, alertedMs = null) => {
      const row = db.prepare('SELECT report FROM phones WHERE id = ?').get(id);
      const rep = JSON.parse(row.report);
      rep.at = ago(ms);
      db.prepare('UPDATE phones SET last_seen_at = ?, report = ?, silent_alerted_at = ? WHERE id = ?').run(ago(ms), JSON.stringify(rep), alertedMs == null ? null : ago(alertedMs), id);
    };

    await report({}); // รายงานแรกของรุ่น 2.7 — ยังไม่มีอะไรให้เทียบ
    assert.equal(await lastReturn(), null);

    // หายไป 3 ชม. (ได้แจ้งเตือนเงียบไปแล้ว) แล้วกลับมาพร้อมนับการเปิดเครื่องใหม่ = รีสตาร์ท
    goSilent(3 * H, 2 * H);
    await phone.get('/api/phone/state'); // ติดต่อครั้งแรกหลังหายไป
    sent.length = 0;
    await report({ bootCount: 6, bootAt: ago(10 * 60_000), pid: 200, appStartAt: ago(9 * 60_000) });
    let back = await lastReturn();
    assert.equal(back.kind, 'restart');
    assert.match(back.summary, /เครื่องปิดหรือรีสตาร์ท — เปิดเครื่องใหม่/);
    assert.equal(sent.length, 1);
    assert.match(sent[0].payload.title, /กลับมาแล้ว \(เงียบไป 3 ชม\.\)/);
    assert.equal(db.prepare('SELECT gap_from FROM phones WHERE id = ?').get(id).gap_from, null, 'บอกสาเหตุแล้วล้างจุดเริ่มเงียบ');

    // แอปถูกปิดแล้วเพิ่งกลับมา (เครื่องไม่ได้รีสตาร์ท) — ไม่เคยแจ้งว่าเงียบ จึงไม่เด้งแจ้งเตือน
    goSilent(2 * H);
    await report({ bootCount: 6, pid: 300, appStartAt: ago(60_000) });
    assert.equal((await lastReturn()).kind, 'app');
    assert.equal(sent.length, 1);

    // แอปทำงานตลอดแต่ติดต่อไม่ได้ = ไม่มีเน็ต
    goSilent(90 * 60_000);
    await report({ bootCount: 6, pid: 300 });
    assert.equal((await lastReturn()).kind, 'offline');

    // หลับปกติ (ส่งสัญญาณทุก ~20 นาที) ไม่นับเป็นการหายไป
    goSilent(20 * 60_000);
    await report({ bootCount: 6, pid: 300 });

    // แบตเหลือ 3% แล้วหายไป กลับมาพร้อมเปิดเครื่องใหม่ = แบตหมด
    await report({ bootCount: 6, pid: 300, battery: { level: 3, charging: false } });
    goSilent(4 * H);
    await report({ bootCount: 7, bootAt: ago(30 * 60_000), pid: 400, appStartAt: ago(29 * 60_000), battery: { level: 20, charging: true } });
    assert.equal((await lastReturn()).kind, 'battery');
    const kid = (await mom.get('/api/parent/phones')).body.phones[0].kidId;
    const events = (await mom.get(`/api/parent/kids/${kid}/app-usage`)).body.phoneEvents;
    assert.deepEqual(events.map((e) => e.kind), ['battery', 'offline', 'app', 'restart']);

    // ผู้ปกครองสั่งอัปเดตจากเว็บ → เครื่องเห็นในสถานะ · เครื่องรายงานความคืบหน้ากลับมา
    assert.equal((await mom.post(`/api/parent/phones/${id}/update`)).status, 200);
    assert.ok((await phone.get('/api/phone/state')).body.phone.updateRequestedAt);
    await report({ bootCount: 7, pid: 400, update: { state: 'waiting', version: '2.8' } });
    assert.equal((await mom.get('/api/parent/phones')).body.phones[0].report.update.state, 'waiting');
    assert.equal((await kidPhone.post(`/api/parent/phones/${id}/update`)).status, 401, 'เด็กสั่งเองไม่ได้');
  } finally {
    app.locals.push.notify = realNotify;
  }
});

test('สาเหตุตอนกลับมา: รีสตาร์ทแล้วแอปเพิ่งเริ่มทีหลัง บอกให้ตั้งเริ่มอัตโนมัติ', () => {
  const boot = '2026-11-12T19:51:00.000Z';
  assert.match(returnSummary({ kind: 'restart', bootAt: boot, appStartAt: '2026-11-12T19:52:00.000Z' }), /^🔄 เครื่องปิดหรือรีสตาร์ท — เปิดเครื่องใหม่ 02:51$/);
  assert.match(returnSummary({ kind: 'restart', bootAt: boot, appStartAt: '2026-11-13T11:00:00.000Z' }), /แต่แอปเพิ่งเริ่มทำงาน 18:00 .*เริ่มอัตโนมัติ/);
  assert.match(returnSummary({ kind: 'offline' }), /ไม่มีเน็ต/);
});

test('แจ้งผู้ปกครองเมื่อสิทธิ์ที่จำเป็นถูกปิด หรือเครื่องเงียบเกิน 1 ชม.', async () => {
  const sent = [];
  const realNotify = app.locals.push.notify;
  app.locals.push.notify = (target, payload) => sent.push({ target, payload });
  try {
    const day = (await phone.get('/api/phone/state')).body.day;
    const all = { admin: true, accessibility: true, usage: true, notifications: true, location: false, battery: true };
    const report = (protections, lock = null) => phone.post('/api/phone/report', { day, usedSec: 0, lock, mode: 'standard', protections });
    await report(all);
    await report({ ...all, battery: false });
    assert.equal(sent.length, 0, 'สิทธิ์ที่ไม่บังคับหายไม่ต้องแจ้ง');
    await report({ ...all, accessibility: false }, 'tamper');
    await report({ ...all, accessibility: false }, 'tamper');
    assert.equal(sent.length, 1, 'แจ้งครั้งเดียวตอนเพิ่งหาย');
    assert.equal(sent[0].target.role, 'parent');
    assert.match(sent[0].payload.title, /การช่วยเหลือพิเศษ/);
    const p = (await mom.get('/api/parent/phones')).body.phones[0];
    assert.equal(p.report.mode, 'standard');
    assert.equal(p.report.protections.accessibility, false);

    // เครื่องเงียบ: ย้อนเวลาที่เห็นล่าสุด แล้วสั่งตรวจด้วยเวลาที่กำหนดเอง
    const { checkSilent } = app.locals.screen;
    const T = Date.now();
    const iso = (ms) => new Date(ms).toISOString();
    assert.deepEqual(checkSilent(T), [], 'เพิ่งส่งรายงาน ยังไม่เงียบ');
    db.prepare('UPDATE phones SET last_seen_at = ? WHERE id = ?').run(iso(T - 3 * 3_600_000), p.id);
    assert.deepEqual(checkSilent(T - 3_600_000), [p.id]);
    assert.match(sent.at(-1).payload.title, /เงียบไปเกิน 1 ชม/);
    assert.deepEqual(checkSilent(T - 3_000_000), [], 'แจ้งครั้งเดียวต่อช่วงที่เงียบ');
    await phone.get('/api/phone/state'); // เครื่องกลับมา
    assert.deepEqual(checkSilent(T + 30 * 60_000), []);
    assert.deepEqual(checkSilent(T + 61 * 60_000), [p.id], 'กลับมาแล้วเงียบอีก → แจ้งใหม่');
  } finally {
    app.locals.push.notify = realNotify;
  }
});

test('บล็อคแอป: เลือกแอปที่ห้ามเปิด, แจ้งครั้งแรกของวัน, เด็กขอใช้ชั่วคราว', async () => {
  const sent = [];
  const realNotify = app.locals.push.notify;
  app.locals.push.notify = (target, payload) => sent.push({ target, payload });
  try {
    const tiktok = { pkg: 'com.zhiliaoapp.musically', label: 'TikTok' };
    const roblox = { pkg: 'com.roblox.client', label: 'Roblox' };
    const blockUrl = `/api/parent/kids/${kidA}/app-blocks`;
    assert.equal((await kidPhone.put(blockUrl, { apps: [tiktok] })).status, 401, 'เด็กตั้งเองไม่ได้');
    assert.equal((await mom.put(blockUrl, { apps: [{ pkg: 'not a package' }] })).status, 400);
    assert.equal((await mom.put(blockUrl, { apps: [{ pkg: 'site.personalproj.kidlock', label: 'ล็อคจอ' }] })).status, 400, 'บล็อคแอปตัวเองไม่ได้');
    assert.equal((await mom.put(blockUrl, { apps: [tiktok, roblox] })).status, 200);

    let st = (await phone.get('/api/phone/state')).body.appBlock;
    assert.deepEqual(st.blocked.map((a) => a.pkg).sort(), [roblox.pkg, tiktok.pkg]);
    assert.deepEqual(st.passes, []);

    // พยายามเปิด: แจ้งครั้งแรกของวันต่อแอป · client_id ซ้ำไม่นับซ้ำ
    sent.length = 0;
    const hit = (pkg, clientId) => phone.post('/api/phone/app-blocks', { pkg, label: 'TikTok', clientId, at: new Date().toISOString() });
    assert.equal((await hit(tiktok.pkg, 'h1')).status, 200);
    await hit(tiktok.pkg, 'h1');
    await hit(tiktok.pkg, 'h2');
    assert.equal(sent.length, 1, 'แจ้งครั้งเดียวต่อวันต่อแอป');
    assert.match(sent[0].payload.title, /น้องเอ พยายามเปิด TikTok/);
    await hit(roblox.pkg, 'h3');
    assert.equal(sent.length, 2, 'แอปอื่นแจ้งแยก');
    const info = (await mom.get('/api/parent/phones')).body;
    const kidInfo = info.kids[kidA];
    assert.equal(kidInfo.blockedApps.length, 2);
    assert.deepEqual(kidInfo.blockHits.find((h) => h.pkg === tiktok.pkg).count, 2);

    // เด็กขอใช้ → ผู้ปกครองอนุญาต 30 นาที → เครื่องได้ pass
    assert.equal((await phone.post('/api/phone/app-requests', { pkg: tiktok.pkg, minutes: 45 })).status, 400);
    assert.equal((await phone.post('/api/phone/app-requests', { pkg: 'com.whatsapp', minutes: 30 })).status, 409, 'แอปที่ไม่ได้บล็อคขอไม่ได้');
    sent.length = 0;
    const req1 = await phone.post('/api/phone/app-requests', { pkg: tiktok.pkg, minutes: 30 });
    assert.equal(req1.status, 200);
    assert.match(sent[0].payload.title, /ขอใช้ TikTok 30 นาที/);
    assert.equal((await phone.post('/api/phone/app-requests', { pkg: tiktok.pkg, minutes: 15 })).status, 409, 'รอคำตอบก่อน');
    assert.equal((await mom.get('/api/state')).body.appRequests.length, 1, 'ขึ้นป้ายในหน้าผู้ปกครอง');
    assert.equal((await kidPhone.post(`/api/parent/app-requests/${req1.body.id}/approve`)).status, 401);
    const ok = await mom.post(`/api/parent/app-requests/${req1.body.id}/approve`);
    assert.equal(ok.status, 200);
    assert.ok(Math.abs(Date.parse(ok.body.until) - Date.now() - 30 * 60_000) < 5_000);
    st = (await phone.get('/api/phone/state')).body.appBlock;
    assert.deepEqual(st.passes.map((p) => p.pkg), [tiktok.pkg]);
    assert.equal(st.requests.find((r) => r.id === req1.body.id).status, 'approved');
    assert.equal((await mom.post(`/api/parent/app-requests/${req1.body.id}/approve`)).status, 409, 'ตอบซ้ำไม่ได้');

    // หยุดก่อนหมดเวลา
    const pass = (await mom.get('/api/parent/phones')).body.kids[kidA].appPasses[0];
    assert.equal(pass.pkg, tiktok.pkg);
    assert.equal((await mom.post(`/api/parent/app-requests/${pass.id}/end`)).status, 200);
    assert.deepEqual((await phone.get('/api/phone/state')).body.appBlock.passes, []);

    // ไม่อนุญาต · เลิกบล็อคแอป → คำขอที่ค้างของแอปนั้นถูกปิดให้
    const req2 = await phone.post('/api/phone/app-requests', { pkg: roblox.pkg, minutes: 15 });
    assert.equal((await mom.post(`/api/parent/app-requests/${req2.body.id}/reject`)).status, 200);
    const req3 = await phone.post('/api/phone/app-requests', { pkg: tiktok.pkg, minutes: 60 });
    assert.equal((await mom.put(blockUrl, { apps: [roblox] })).status, 200);
    st = (await phone.get('/api/phone/state')).body.appBlock;
    assert.deepEqual(st.blocked.map((a) => a.pkg), [roblox.pkg]);
    assert.equal(st.requests.find((r) => r.id === req3.body.id).status, 'rejected');
    assert.equal((await mom.get('/api/state')).body.appRequests.length, 0);
    assert.equal((await mom.put(blockUrl, { apps: [] })).status, 200);
  } finally {
    app.locals.push.notify = realNotify;
  }
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
