import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { getSetting, setSetting } from './db.js';
import {
  checkSecret,
  deviceAuthorized,
  dropParentToken,
  familyVersion,
  forgetDevice,
  guessLimiter,
  hashSecret,
  issueDevice,
  issueParentToken,
  normalizeFamilyCode,
  requireDevice,
  requireParent,
} from './auth.js';
import { broadcast, eventsHandler } from './events.js';
import { createPush } from './push.js';
import { createScreen } from './screen.js';
import { createVocab } from './vocab.js';
import { createGames } from './games.js';
import { HttpError, bad, emoji, familyCode, oneOf, optionalText, pin, text, wholeNumber } from './validate.js';

export const KID_COLORS = ['pink', 'sky', 'mint', 'lemon', 'lavender', 'peach'];
export const SEVERITIES = ['light', 'medium', 'severe'];
export const CATEGORIES = ['money', 'screen', 'snack', 'toy', 'other'];
const MAX_PENDING_PER_KID = 10;

// บริการแจ้งเตือนของเบราว์เซอร์ที่ยอมส่งไปหา — กันไม่ให้ใครใช้เซิร์ฟเวอร์ยิงคำขอไปที่อื่นในบ้าน
const PUSH_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', '.push.apple.com', '.notify.windows.com'];

export function createApp(db, { appUrl, distDir, mediaDir } = {}) {
  const app = express();
  const push = createPush(db, { subject: appUrl || 'https://stars.personal-proj.site' });
  const device = requireDevice(db);
  const parent = requireParent();

  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' });
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  // ข้อมูลดาวต้องสดเสมอ ห้ามเบราว์เซอร์/Cloudflare เก็บแคช
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // ---------- คำสั่ง SQL ที่ใช้บ่อย ----------
  const q = {
    kids: db.prepare(`
      SELECT k.id, k.name, k.avatar, k.color,
        COALESCE((SELECT SUM(amount) FROM transactions t WHERE t.kid_id = k.id AND t.voided_at IS NULL), 0) AS balance,
        COALESCE((SELECT SUM(amount) FROM transactions t WHERE t.kid_id = k.id AND t.voided_at IS NULL AND t.type <> 'redeem'), 0) AS total,
        COALESCE((SELECT SUM(cost) FROM requests r WHERE r.kid_id = k.id AND r.status = 'pending'), 0) AS reserved,
        (SELECT COUNT(*) FROM requests r WHERE r.kid_id = k.id AND r.status = 'pending') AS pendingCount
      FROM kids k ORDER BY k.sort_order, k.id`),
    kid: db.prepare('SELECT * FROM kids WHERE id = ?'),
    balance: db.prepare('SELECT COALESCE(SUM(amount), 0) AS v FROM transactions WHERE kid_id = ? AND voided_at IS NULL'),
    reserved: db.prepare("SELECT COALESCE(SUM(cost), 0) AS v, COUNT(*) AS n FROM requests WHERE kid_id = ? AND status = 'pending'"),
    activities: db.prepare('SELECT id, kind, name, emoji, stars, severity FROM activities ORDER BY sort_order, id'),
    activity: db.prepare('SELECT * FROM activities WHERE id = ?'),
    rewards: db.prepare('SELECT id, name, emoji, category, cost, minutes FROM rewards ORDER BY cost, sort_order, id'),
    reward: db.prepare('SELECT * FROM rewards WHERE id = ?'),
    requests: db.prepare(`
      SELECT id, kid_id AS kidId, reward_id AS rewardId, reward_name AS name, reward_emoji AS emoji, cost, minutes, status, note,
             created_at AS createdAt, decided_at AS decidedAt
      FROM requests
      WHERE status = 'pending' OR decided_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-14 days')
      ORDER BY (status = 'pending') DESC, COALESCE(decided_at, created_at) DESC
      LIMIT 60`),
    request: db.prepare('SELECT * FROM requests WHERE id = ?'),
    insertTx: db.prepare(`
      INSERT INTO transactions (kid_id, type, amount, title, emoji, severity, note, activity_id, request_id)
      VALUES (@kidId, @type, @amount, @title, @emoji, @severity, @note, @activityId, @requestId)`),
    nextOrder: (table) => db.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM ${table}`).get().n,
  };

  const mustKid = (id) => q.kid.get(Number(id)) ?? (() => { throw new HttpError(404, 'ไม่พบเด็กคนนี้'); })();
  const mustReward = (id) => q.reward.get(Number(id)) ?? (() => { throw new HttpError(404, 'ไม่พบของรางวัลนี้'); })();
  const changed = (what) => broadcast({ type: 'change', what });

  // แลกเป็นเงินแบบกรอกจำนวนเอง — 1 ดาว = moneyRate บาท (0 = ผู้ปกครองปิดไว้) ค่าเริ่มต้น 1
  const moneyRate = () => Number(getSetting(db, 'money_rate') ?? 1);
  function moneyReward(value) {
    const rate = moneyRate();
    if (!rate) throw new HttpError(409, 'ผู้ปกครองปิดการแลกเป็นเงินไว้');
    const baht = wholeNumber(value, 'จำนวนเงิน', 100000);
    // ไม่มีเศษดาว — ปัดขึ้น เช่น 1 ดาว = 2 บาท ขอ 5 บาท ใช้ 3 ดาว
    return { id: null, category: 'money', emoji: '💵', name: `เงิน ${baht.toLocaleString('en-US')} บาท`, cost: Math.ceil(baht / rate) };
  }

  function kidStars(kidId) {
    const balance = q.balance.get(kidId).v;
    return { balance, available: balance - q.reserved.get(kidId).v };
  }

  // คำขอแลกจากหน้าเว็บเด็ก และจากหน้าล็อคบนมือถือลูก — จองดาวไว้จนผู้ปกครองตัดสิน
  function createRequest(kid, reward) {
    const id = db.transaction(() => {
      const balance = q.balance.get(kid.id).v;
      const reserved = q.reserved.get(kid.id);
      if (reserved.n >= MAX_PENDING_PER_KID) throw new HttpError(409, 'มีคำขอรออนุมัติเยอะแล้ว รอผู้ปกครองก่อนนะ');
      const available = balance - reserved.v;
      if (available < reward.cost) throw new HttpError(409, `ดาวยังไม่พอ ขาดอีก ${reward.cost - available} ดวง`);
      const minutes = reward.category === 'screen' ? reward.minutes : null;
      const { lastInsertRowid } = db
        .prepare('INSERT INTO requests (kid_id, reward_id, reward_name, reward_emoji, cost, minutes) VALUES (?, ?, ?, ?, ?, ?)')
        .run(kid.id, reward.id, reward.name, reward.emoji, reward.cost, minutes);
      return Number(lastInsertRowid);
    })();
    changed('requests');
    push.notify(
      { role: 'parent' },
      {
        title: `${kid.avatar} ${kid.name} ขอแลกรางวัล`,
        body: `${reward.emoji} ${reward.name} · ${reward.cost} ดาว`,
        url: '/parent/requests',
        tag: `request-${id}`,
      },
    );
    return id;
  }

  const screen = createScreen({ db, push, changed, mustKid, mustReward, kidStars, createRequest });
  Object.assign(app.locals, { push, screen }); // ให้เทสต์ดูการแจ้งเตือน / สั่งตรวจเครื่องเงียบเองได้

  // ดาวจากมินิเกม (คำศัพท์ / คณิต) — นับเป็นดาวสะสมเหมือนทำดี
  function awardStars(kidId, stars, title, emoji = '📚') {
    const { lastInsertRowid } = q.insertTx.run({
      kidId,
      type: 'earn',
      amount: stars,
      title,
      emoji,
      severity: null,
      note: null,
      activityId: null,
      requestId: null,
    });
    screen.pokeKid(kidId);
    return Number(lastInsertRowid);
  }
  const vocab = createVocab({ db, push, changed, mustKid, device, awardStars, mediaDir });
  const games = createGames({ db, push, changed, mustKid, device, awardStars });

  function state() {
    return {
      kids: q.kids.all(),
      activities: q.activities.all(),
      rewards: q.rewards.all(),
      requests: q.requests.all(),
      timeRequests: screen.pendingTimeRequests(),
      appRequests: screen.pendingAppRequests(),
      moneyRate: moneyRate(),
      pushKey: push.publicKey,
    };
  }

  // ---------- เริ่มต้นใช้งาน / เข้าเครื่อง ----------
  app.get('/api/status', (req, res) => {
    res.json({ setup: !!getSetting(db, 'family_code_hash'), device: !!deviceAuthorized(db, req) });
  });

  app.post('/api/setup', (req, res) => {
    if (getSetting(db, 'family_code_hash')) throw new HttpError(409, 'ตั้งค่าไปแล้ว');
    const code = familyCode(req.body.familyCode);
    const parentPin = pin(req.body.pin);
    db.transaction(() => {
      setSetting(db, 'family_code_hash', hashSecret(code));
      setSetting(db, 'pin_hash', hashSecret(parentPin));
      setSetting(db, 'family_version', 1);
    })();
    issueDevice(db, req, res);
    res.json({ parentToken: issueParentToken() });
  });

  app.post('/api/device/login', guessLimiter(), (req, res) => {
    const code = normalizeFamilyCode(req.body.familyCode);
    if (!checkSecret(code, getSetting(db, 'family_code_hash'))) {
      return res.status(401).json({ error: 'code', message: 'รหัสครอบครัวไม่ถูกต้อง' });
    }
    issueDevice(db, req, res);
    res.json({ ok: true });
  });

  app.post('/api/device/logout', (req, res) => {
    forgetDevice(db, req, res);
    res.json({ ok: true });
  });

  // ---------- ข้อมูลสำหรับทุกคนในครอบครัว ----------
  app.get('/api/events', device, eventsHandler);

  app.get('/api/state', device, (req, res) => res.json(state()));

  app.get('/api/history', device, (req, res) => {
    const kidId = req.query.kid ? Number(req.query.kid) : null;
    const before = req.query.before ? Number(req.query.before) : null;
    const limit = Math.min(Number(req.query.limit) || 40, 100);
    const rows = db
      .prepare(`
        SELECT id, kid_id AS kidId, type, amount, title, emoji, severity, note, created_at AS createdAt, voided_at AS voidedAt
        FROM transactions
        WHERE (@kidId IS NULL OR kid_id = @kidId) AND (@before IS NULL OR id < @before)
        ORDER BY id DESC LIMIT @limit`)
      .all({ kidId, before, limit });
    res.json({ items: rows, more: rows.length === limit });
  });

  app.post('/api/requests', device, (req, res) => {
    const kid = mustKid(req.body.kidId);
    const reward = req.body.baht !== undefined ? moneyReward(req.body.baht) : mustReward(req.body.rewardId);
    const id = createRequest(kid, reward);
    screen.pokeKid(kid.id); // ดาวที่ใช้ได้บนหน้าล็อคมือถือลดลง
    res.json({ id });
  });

  app.post('/api/requests/:id/cancel', device, (req, res) => {
    const r = q.request.get(Number(req.params.id));
    if (!r) throw new HttpError(404, 'ไม่พบคำขอนี้');
    if (r.status !== 'pending') throw new HttpError(409, 'คำขอนี้ไม่ได้รออนุมัติแล้ว');
    db.prepare("UPDATE requests SET status = 'cancelled', decided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(r.id);
    changed('requests');
    screen.pokeKid(r.kid_id);
    res.json({ ok: true });
  });

  // ---------- แจ้งเตือน ----------
  function readSubscription(body) {
    const sub = body.subscription ?? {};
    let url;
    try {
      url = new URL(sub.endpoint);
    } catch {
      throw bad('ข้อมูลแจ้งเตือนไม่ถูกต้อง');
    }
    const okHost = PUSH_HOSTS.some((h) => (h.startsWith('.') ? url.hostname.endsWith(h) : url.hostname === h));
    if (url.protocol !== 'https:' || !okHost) throw bad('บริการแจ้งเตือนนี้ไม่รองรับ');
    if (typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string') throw bad('ข้อมูลแจ้งเตือนไม่ถูกต้อง');
    return { endpoint: url.href, keys: JSON.stringify({ p256dh: sub.keys.p256dh, auth: sub.keys.auth }) };
  }
  // ใช้รูปแบบเดียวกับตอนบันทึก (URL.href) ไม่งั้นค้นไม่เจอถ้าเบราว์เซอร์ส่งมาไม่ตรงตัวอักษร
  function endpointOf(body) {
    try {
      return new URL(String(body.endpoint ?? '')).href;
    } catch {
      return '';
    }
  }
  function readTarget(req) {
    const role = oneOf(req.body.role, ['parent', 'kid'], 'ประเภทการแจ้งเตือน');
    return { role, kidId: role === 'kid' ? mustKid(req.body.kidId).id : 0 };
  }

  app.post('/api/push/subscribe', device, (req, res, next) => {
    const target = readTarget(req);
    const save = () => {
      const sub = readSubscription(req.body);
      db.prepare(`
        INSERT INTO push_subs (endpoint, role, kid_id, keys) VALUES (?, ?, ?, ?)
        ON CONFLICT(endpoint, role, kid_id) DO UPDATE SET keys = excluded.keys`).run(sub.endpoint, target.role, target.kidId, sub.keys);
      res.json({ ok: true });
    };
    // แจ้งเตือนฝั่งผู้ปกครองต้องผ่าน PIN ก่อน (ไม่งั้นเด็กสมัครรับแจ้งเตือนผู้ปกครองเองได้)
    if (target.role === 'parent') return parent(req, res, (err) => (err ? next(err) : save()));
    save();
  });

  app.post('/api/push/unsubscribe', device, (req, res) => {
    const target = readTarget(req);
    db.prepare('DELETE FROM push_subs WHERE endpoint = ? AND role = ? AND kid_id = ?').run(endpointOf(req.body), target.role, target.kidId);
    res.json({ ok: true });
  });

  app.post('/api/push/status', device, (req, res) => {
    const rows = db.prepare('SELECT role, kid_id AS kidId FROM push_subs WHERE endpoint = ?').all(endpointOf(req.body));
    res.json({ subscriptions: rows });
  });

  // ---------- โหมดผู้ปกครอง ----------
  app.post('/api/parent/login', device, guessLimiter(), (req, res) => {
    if (!checkSecret(String(req.body.pin ?? ''), getSetting(db, 'pin_hash'))) {
      return res.status(401).json({ error: 'pin', message: 'PIN ไม่ถูกต้อง' });
    }
    res.json({ token: issueParentToken() });
  });

  app.post('/api/parent/logout', (req, res) => {
    dropParentToken(req.get('x-parent-token'));
    res.json({ ok: true });
  });

  const P = express.Router();
  P.use(device, parent);

  // ให้/หักดาว — เลือกจากรายการ (activityId) หรือกำหนดเอง (kind + stars + title) ให้หลายคนพร้อมกันได้
  P.post('/stars', (req, res) => {
    const kidIds = [...new Set((Array.isArray(req.body.kidIds) ? req.body.kidIds : []).map(Number))];
    if (!kidIds.length) throw bad('เลือกเด็กอย่างน้อย 1 คน');
    const kids = kidIds.map(mustKid);

    let entry;
    if (req.body.activityId) {
      const a = q.activity.get(Number(req.body.activityId));
      if (!a) throw new HttpError(404, 'ไม่พบรายการนี้');
      entry = { kind: a.kind, stars: a.stars, title: a.name, emoji: a.emoji, severity: a.severity, activityId: a.id };
    } else {
      const kind = oneOf(req.body.kind, ['earn', 'penalty'], 'ประเภท');
      entry = {
        kind,
        stars: wholeNumber(req.body.stars, 'จำนวนดาว', 1000),
        title: text(req.body.title, 'เหตุผล'),
        emoji: emoji(req.body.emoji, kind === 'earn' ? '⭐' : '⚠️'),
        severity: kind === 'penalty' && req.body.severity ? oneOf(req.body.severity, SEVERITIES, 'ระดับความผิด') : null,
        activityId: null,
      };
    }
    const note = optionalText(req.body.note);
    const amount = entry.kind === 'earn' ? entry.stars : -entry.stars;

    const ids = db.transaction(() =>
      kids.map((kid) =>
        Number(
          q.insertTx.run({
            kidId: kid.id,
            type: entry.kind,
            amount,
            title: entry.title,
            emoji: entry.emoji,
            severity: entry.severity,
            note,
            activityId: entry.activityId,
            requestId: null,
          }).lastInsertRowid,
        ),
      ),
    )();
    changed('stars');
    for (const kid of kids) {
      screen.pokeKid(kid.id); // ยอดดาวบนหน้าล็อคมือถือ
      push.notify(
        { role: 'kid', kidId: kid.id },
        entry.kind === 'earn'
          ? { title: `⭐ ${kid.name} ได้ ${entry.stars} ดาว!`, body: `${entry.emoji} ${entry.title}`, url: `/kid/${kid.id}` }
          : { title: `😢 ${kid.name} โดนหัก ${entry.stars} ดาว`, body: `${entry.emoji} ${entry.title}`, url: `/kid/${kid.id}` },
      );
    }
    res.json({ ids });
  });

  // ยกเลิกรายการที่กดผิด — ไม่ลบทิ้ง แต่ทำเครื่องหมายไว้ ยอดดาวคำนวณใหม่เอง
  // รายการแลกของรางวัล: คำขอถือว่ายกเลิก และเวลาเล่นที่ได้จากรางวัลนั้นถูกเอาคืน
  function voidTransaction(tx) {
    db.transaction(() => {
      db.prepare("UPDATE transactions SET voided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(tx.id);
      if (tx.request_id) db.prepare("UPDATE requests SET status = 'cancelled' WHERE id = ?").run(tx.request_id);
    })();
    if (tx.request_id) screen.revokeForRequest(tx.request_id, tx.kid_id);
    else screen.pokeKid(tx.kid_id);
    changed('stars');
  }

  P.post('/transactions/:id/void', (req, res) => {
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(Number(req.params.id));
    if (!tx) throw new HttpError(404, 'ไม่พบรายการนี้');
    if (tx.voided_at) throw new HttpError(409, 'รายการนี้ถูกยกเลิกไปแล้ว');
    voidTransaction(tx);
    res.json({ ok: true });
  });

  // คืนดาวคำขอที่อนุมัติไปแล้ว (เช่น กดอนุมัติพลาด) — ดาวกลับมา ไม่นับเป็นดาวสะสม (การแลกไม่ได้ลดดาวสะสมตั้งแต่แรก)
  P.post('/requests/:id/refund', (req, res) => {
    const request = q.request.get(Number(req.params.id));
    if (!request) throw new HttpError(404, 'ไม่พบคำขอนี้');
    if (request.status !== 'approved') throw new HttpError(409, 'คำขอนี้ไม่ได้อยู่ในสถานะอนุมัติแล้ว');
    const tx = db.prepare("SELECT * FROM transactions WHERE request_id = ? AND type = 'redeem' AND voided_at IS NULL").get(request.id);
    if (tx) voidTransaction(tx);
    else {
      db.prepare("UPDATE requests SET status = 'cancelled' WHERE id = ?").run(request.id);
      changed('stars');
    }
    changed('requests');
    res.json({ ok: true, stars: request.cost });
  });

  function redeem(request, kid) {
    const balance = q.balance.get(kid.id).v;
    if (balance < request.cost) throw new HttpError(409, `${kid.name} มีดาวไม่พอ (มี ${balance} ต้องใช้ ${request.cost})`);
    db.prepare("UPDATE requests SET status = 'approved', decided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(request.id);
    q.insertTx.run({
      kidId: kid.id,
      type: 'redeem',
      amount: -request.cost,
      title: request.reward_name,
      emoji: request.reward_emoji,
      severity: null,
      note: null,
      activityId: null,
      requestId: request.id,
    });
    screen.grantForRequest(request);
  }

  P.post('/requests/:id/approve', (req, res) => {
    const { request, kid } = db.transaction(() => {
      const request = q.request.get(Number(req.params.id));
      if (!request) throw new HttpError(404, 'ไม่พบคำขอนี้');
      if (request.status !== 'pending') throw new HttpError(409, 'คำขอนี้ไม่ได้รออนุมัติแล้ว');
      const kid = mustKid(request.kid_id);
      redeem(request, kid);
      return { request, kid };
    })();
    changed('requests');
    screen.pokeKid(kid.id);
    push.notify(
      { role: 'kid', kidId: kid.id },
      { title: `🎉 ได้รับอนุมัติแล้ว!`, body: `${request.reward_emoji} ${request.reward_name} (ใช้ ${request.cost} ดาว)`, url: `/kid/${kid.id}`, tag: `request-${request.id}` },
    );
    res.json({ ok: true });
  });

  P.post('/requests/:id/reject', (req, res) => {
    const request = q.request.get(Number(req.params.id));
    if (!request) throw new HttpError(404, 'ไม่พบคำขอนี้');
    if (request.status !== 'pending') throw new HttpError(409, 'คำขอนี้ไม่ได้รออนุมัติแล้ว');
    const note = optionalText(req.body.note);
    db.prepare("UPDATE requests SET status = 'rejected', note = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(note, request.id);
    changed('requests');
    screen.pokeKid(request.kid_id);
    push.notify(
      { role: 'kid', kidId: request.kid_id },
      {
        title: `${request.reward_emoji} ยังแลก${request.reward_name}ไม่ได้นะ`,
        body: note || 'ดาวยังอยู่ครบ ลองขอใหม่ทีหลังได้',
        url: `/kid/${request.kid_id}`,
        tag: `request-${request.id}`,
      },
    );
    res.json({ ok: true });
  });

  // ผู้ปกครองแลกให้เลย (เช่น เด็กเล็กที่ยังกดเองไม่เป็น)
  P.post('/redeem', (req, res) => {
    const kid = db.transaction(() => {
      const kid = mustKid(req.body.kidId);
      const reward = mustReward(req.body.rewardId);
      const { lastInsertRowid } = db
        .prepare('INSERT INTO requests (kid_id, reward_id, reward_name, reward_emoji, cost, minutes) VALUES (?, ?, ?, ?, ?, ?)')
        .run(kid.id, reward.id, reward.name, reward.emoji, reward.cost, reward.category === 'screen' ? reward.minutes : null);
      redeem(q.request.get(Number(lastInsertRowid)), kid);
      return kid;
    })();
    changed('requests');
    screen.pokeKid(kid.id);
    res.json({ ok: true, kidId: kid.id });
  });

  // ---------- จัดการรายการ ----------
  const kidBody = (b) => ({
    name: text(b.name, 'ชื่อ', 30),
    avatar: emoji(b.avatar, '🐻'),
    color: oneOf(b.color, KID_COLORS, 'สี'),
  });
  P.post('/kids', (req, res) => {
    const k = kidBody(req.body);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO kids (name, avatar, color, sort_order) VALUES (?, ?, ?, ?)')
      .run(k.name, k.avatar, k.color, q.nextOrder('kids'));
    changed('kids');
    res.json({ id: Number(lastInsertRowid) });
  });
  P.put('/kids/:id', (req, res) => {
    const kid = mustKid(req.params.id);
    const k = kidBody(req.body);
    db.prepare('UPDATE kids SET name = ?, avatar = ?, color = ? WHERE id = ?').run(k.name, k.avatar, k.color, kid.id);
    changed('kids');
    res.json({ ok: true });
  });
  P.delete('/kids/:id', (req, res) => {
    const kid = mustKid(req.params.id);
    screen.pokeKid(kid.id); // มือถือของเด็กคนนี้จะเห็นว่าหลุดการจับคู่
    db.transaction(() => {
      db.prepare("DELETE FROM push_subs WHERE role = 'kid' AND kid_id = ?").run(kid.id);
      db.prepare('DELETE FROM kids WHERE id = ?').run(kid.id);
    })();
    changed('kids');
    res.json({ ok: true });
  });

  const activityBody = (b) => {
    const kind = oneOf(b.kind, ['earn', 'penalty'], 'ประเภท');
    return {
      kind,
      name: text(b.name, 'ชื่อรายการ'),
      emoji: emoji(b.emoji, kind === 'earn' ? '⭐' : '⚠️'),
      stars: wholeNumber(b.stars, 'จำนวนดาว', 1000),
      severity: kind === 'penalty' ? oneOf(b.severity, SEVERITIES, 'ระดับความผิด') : null,
    };
  };
  P.post('/activities', (req, res) => {
    const a = activityBody(req.body);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO activities (kind, name, emoji, stars, severity, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
      .run(a.kind, a.name, a.emoji, a.stars, a.severity, q.nextOrder('activities'));
    changed('activities');
    res.json({ id: Number(lastInsertRowid) });
  });
  P.put('/activities/:id', (req, res) => {
    const existing = q.activity.get(Number(req.params.id));
    if (!existing) throw new HttpError(404, 'ไม่พบรายการนี้');
    const a = activityBody({ ...req.body, kind: existing.kind });
    db.prepare('UPDATE activities SET name = ?, emoji = ?, stars = ?, severity = ? WHERE id = ?').run(a.name, a.emoji, a.stars, a.severity, existing.id);
    changed('activities');
    res.json({ ok: true });
  });
  P.delete('/activities/:id', (req, res) => {
    db.prepare('DELETE FROM activities WHERE id = ?').run(Number(req.params.id));
    changed('activities');
    res.json({ ok: true });
  });

  const rewardBody = (b) => {
    const category = oneOf(b.category, CATEGORIES, 'หมวด');
    return {
      name: text(b.name, 'ชื่อของรางวัล'),
      emoji: emoji(b.emoji, '🎁'),
      category,
      cost: wholeNumber(b.cost, 'ราคา', 100000),
      // หมวดเล่นโทรศัพท์: อนุมัติแล้วมือถือลูกได้เวลาเพิ่มเท่านี้
      minutes: category === 'screen' ? wholeNumber(b.minutes, 'จำนวนนาที', 1440) : null,
    };
  };
  P.post('/rewards', (req, res) => {
    const r = rewardBody(req.body);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO rewards (name, emoji, category, cost, minutes, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
      .run(r.name, r.emoji, r.category, r.cost, r.minutes, q.nextOrder('rewards'));
    changed('rewards');
    screen.pokeAll();
    res.json({ id: Number(lastInsertRowid) });
  });
  P.put('/rewards/:id', (req, res) => {
    const existing = mustReward(req.params.id);
    const r = rewardBody(req.body);
    db.prepare('UPDATE rewards SET name = ?, emoji = ?, category = ?, cost = ?, minutes = ? WHERE id = ?').run(
      r.name,
      r.emoji,
      r.category,
      r.cost,
      r.minutes,
      existing.id,
    );
    changed('rewards');
    screen.pokeAll();
    res.json({ ok: true });
  });
  P.delete('/rewards/:id', (req, res) => {
    db.prepare('DELETE FROM rewards WHERE id = ?').run(Number(req.params.id));
    changed('rewards');
    screen.pokeAll();
    res.json({ ok: true });
  });

  P.put('/money-rate', (req, res) => {
    const rate = req.body.rate === 0 ? 0 : wholeNumber(req.body.rate, 'จำนวนบาทต่อดาว', 1000);
    setSetting(db, 'money_rate', rate);
    changed('rewards');
    res.json({ ok: true });
  });

  // ---------- ความปลอดภัย ----------
  P.put('/pin', (req, res) => {
    if (!checkSecret(String(req.body.currentPin ?? ''), getSetting(db, 'pin_hash'))) {
      throw bad('PIN เดิมไม่ถูกต้อง');
    }
    setSetting(db, 'pin_hash', hashSecret(pin(req.body.newPin)));
    screen.pokeAll(); // มือถือลูกใช้ PIN นี้ปลดล็อคตอนไม่มีเน็ต ต้องได้ของใหม่
    res.json({ ok: true });
  });

  // เปลี่ยนรหัสครอบครัว = ทุกเครื่องหลุดออก ต้องใส่รหัสใหม่ (ยกเว้นเครื่องที่กดเปลี่ยน)
  P.put('/family-code', (req, res) => {
    const code = familyCode(req.body.familyCode);
    db.transaction(() => {
      setSetting(db, 'family_code_hash', hashSecret(code));
      setSetting(db, 'family_version', familyVersion(db) + 1);
      db.prepare('DELETE FROM devices').run();
    })();
    issueDevice(db, req, res);
    broadcast({ type: 'family-code' });
    res.json({ ok: true });
  });

  screen.mountParent(P);
  vocab.mountParent(P);
  games.mountParent(P);
  app.use('/api/parent', P);
  app.use('/api/vocab', vocab.router);
  app.use('/api/games', games.router);
  app.use('/api/phone', screen.phoneRouter);
  app.use('/api', (req, res) => res.status(404).json({ error: 'not-found', message: 'ไม่พบ API นี้' }));

  // ---------- ไฟล์หน้าเว็บ (production) ----------
  if (distDir && fs.existsSync(path.join(distDir, 'index.html'))) {
    app.use(
      express.static(distDir, {
        index: false,
        setHeaders(res, file) {
          // ไฟล์ใน assets/ มี hash ในชื่อ เก็บนานได้ · ที่เหลือ (sw.js, manifest, ไอคอน) ต้องเช็กใหม่ทุกครั้ง
          const hashed = file.includes(`${path.sep}assets${path.sep}`);
          res.set('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
        },
      }),
    );
    app.get('*', (req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: 'bad', message: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad', message: 'ข้อมูลไม่ถูกต้อง' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'bad', message: 'ไฟล์ใหญ่เกินไป' });
    console.error(err);
    res.status(500).json({ error: 'server', message: 'เซิร์ฟเวอร์ขัดข้อง ลองใหม่อีกครั้ง' });
  });

  return app;
}
