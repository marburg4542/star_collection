// บล็อคแอปบนมือถือลูก — ผู้ปกครองเลือกแอปที่ห้ามเปิด (เด็กหนึ่งคนใช้ชุดเดียวกันทุกเครื่อง)
// เด็กกด "ขอใช้" จากหน้าบล็อคได้ → ผู้ปกครองอนุญาตชั่วคราว 15/30/60 นาที
// เด็กพยายามเปิดแอปที่บล็อค → แจ้งผู้ปกครองครั้งแรกของวันต่อแอป (นับจำนวนครั้งไว้ดูในหน้ามือถือ)
import { HttpError, bad } from './validate.js';

const TZ = 'Asia/Bangkok';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const PKG = /^[A-Za-z][\w]*(\.[A-Za-z][\w]*)+$/;
const OWN_APP = 'site.personalproj.kidlock';
export const APP_REQUEST_MINUTES = [15, 30, 60];
const MAX_BLOCKED = 200;

const nowIso = () => new Date().toISOString();
const labelOf = (value, pkg) => String(value ?? '').trim().slice(0, 60) || pkg;

export function createAppBlock({ db, push, poke, changed, mustKid }) {
  const s = {
    blocked: db.prepare('SELECT pkg, label FROM app_blocks WHERE kid_id = ? ORDER BY label COLLATE NOCASE, pkg'),
    block: db.prepare('SELECT * FROM app_blocks WHERE kid_id = ? AND pkg = ?'),
    request: db.prepare('SELECT * FROM app_requests WHERE id = ?'),
    pendingFor: db.prepare("SELECT 1 FROM app_requests WHERE kid_id = ? AND pkg = ? AND status = 'pending' LIMIT 1"),
    // ใช้ได้อยู่ตอนนี้ (อนุญาตแล้วและยังไม่หมดเวลา)
    passes: db.prepare(`
      SELECT id, pkg, label, until FROM app_requests
      WHERE kid_id = ? AND status = 'approved' AND until > ? ORDER BY until`),
    // คำขอล่าสุด 1 วัน — ให้หน้าบล็อคบนเครื่องรู้ว่าขอไปแล้ว/ถูกปฏิเสธ
    recentOfKid: db.prepare(`
      SELECT id, pkg, minutes, status, until FROM app_requests
      WHERE kid_id = ? AND (status = 'pending' OR decided_at > ?) ORDER BY id DESC LIMIT 20`),
    pending: db.prepare(`
      SELECT id, kid_id AS kidId, pkg, label, minutes, created_at AS createdAt FROM app_requests
      WHERE status = 'pending' ORDER BY id`),
    insertHit: db.prepare(`
      INSERT OR IGNORE INTO app_block_hits (phone_id, day, pkg, label, client_id, at)
      VALUES (@phoneId, @day, @pkg, @label, @clientId, @at)`),
    hitsOfKidDay: db.prepare(`
      SELECT h.pkg, MAX(h.label) AS label, COUNT(*) AS count, MAX(h.at) AS lastAt
      FROM app_block_hits h JOIN phones p ON p.id = h.phone_id
      WHERE p.kid_id = ? AND h.day = ? GROUP BY h.pkg ORDER BY count DESC`),
    hitCount: db.prepare(`
      SELECT COUNT(*) AS n FROM app_block_hits h JOIN phones p ON p.id = h.phone_id
      WHERE p.kid_id = ? AND h.day = ? AND h.pkg = ?`),
  };

  const mustRequest = (id) => s.request.get(Number(id)) ?? (() => { throw new HttpError(404, 'ไม่พบคำขอนี้'); })();
  const dayAgo = () => new Date(Date.now() - 86_400_000).toISOString();

  /** ส่งไปกับสถานะของเครื่อง */
  function phoneState(kidId) {
    return {
      blocked: s.blocked.all(kidId),
      passes: s.passes.all(kidId, nowIso()).map(({ pkg, until }) => ({ pkg, until })),
      requests: s.recentOfKid.all(kidId, dayAgo()),
    };
  }

  /** ส่งไปกับหน้ามือถือของผู้ปกครอง */
  function kidInfo(kidId, day) {
    return {
      blockedApps: s.blocked.all(kidId),
      blockHits: s.hitsOfKidDay.all(kidId, day),
      appPasses: s.passes.all(kidId, nowIso()),
    };
  }

  function prune(cutoffIso) {
    db.prepare('DELETE FROM app_block_hits WHERE at < ?').run(cutoffIso);
    db.prepare("DELETE FROM app_requests WHERE status <> 'pending' AND COALESCE(until, decided_at) < ?").run(cutoffIso);
  }

  // ---------- จากเครื่องลูก ----------
  function mountPhone(F) {
    // เด็กพยายามเปิดแอปที่บล็อค (อาจเกิดตอนออฟไลน์ เครื่องส่งตามมาทีหลัง — client_id กันซ้ำ)
    F.post('/app-blocks', (req, res) => {
      const b = req.body ?? {};
      const pkg = String(b.pkg ?? '');
      if (pkg.length > 200 || !PKG.test(pkg)) throw bad('ชื่อแอปไม่ถูกต้อง');
      const atMs = Date.parse(b.at ?? '');
      const at = Number.isFinite(atMs) && atMs <= Date.now() + 60_000 ? new Date(atMs).toISOString() : nowIso();
      const day = dayFmt.format(new Date(at));
      const kid = mustKid(req.phone.kid_id);
      const label = labelOf(b.label, s.block.get(kid.id, pkg)?.label ?? pkg);
      const { changes } = s.insertHit.run({ phoneId: req.phone.id, day, pkg, label, clientId: String(b.clientId ?? '').slice(0, 64) || null, at });
      if (changes) {
        // ครั้งแรกของวันของแอปนี้ (นับทุกเครื่องของเด็กคนนี้) → แจ้งผู้ปกครอง
        if (s.hitCount.get(kid.id, day, pkg).n === 1) {
          push.notify(
            { role: 'parent' },
            {
              title: `🚫 ${kid.avatar} ${kid.name} พยายามเปิด ${label}`,
              body: 'แอปนี้ถูกบล็อคอยู่ · แจ้งเฉพาะครั้งแรกของวัน ดูจำนวนครั้งได้ในหน้ามือถือ',
              url: '/parent/phones',
              tag: `appblock-${kid.id}-${day}-${pkg}`,
            },
          );
        }
        changed('phones');
      }
      res.json({ ok: true });
    });

    // เด็กกด "ขอใช้" จากหน้าบล็อค
    F.post('/app-requests', (req, res) => {
      const pkg = String(req.body?.pkg ?? '');
      const minutes = Number(req.body?.minutes);
      if (!APP_REQUEST_MINUTES.includes(minutes)) throw bad('ขอใช้ได้ 15, 30 หรือ 60 นาที');
      const kid = mustKid(req.phone.kid_id);
      const block = s.block.get(kid.id, pkg);
      if (!block) throw new HttpError(409, 'แอปนี้ไม่ได้ถูกบล็อคแล้ว เปิดได้เลย');
      if (s.pendingFor.get(kid.id, pkg)) throw new HttpError(409, 'ขอไปแล้ว รอผู้ปกครองตอบก่อนนะ');
      const { lastInsertRowid } = db
        .prepare('INSERT INTO app_requests (kid_id, phone_id, pkg, label, minutes) VALUES (?, ?, ?, ?, ?)')
        .run(kid.id, req.phone.id, pkg, block.label, minutes);
      poke(kid.id);
      push.notify(
        { role: 'parent' },
        {
          title: `${kid.avatar} ${kid.name} ขอใช้ ${block.label} ${minutes} นาที`,
          body: 'แอปนี้ถูกบล็อคอยู่ · แตะเพื่ออนุญาตหรือไม่อนุญาต',
          url: '/parent/phones',
          tag: `app-request-${lastInsertRowid}`,
        },
      );
      res.json({ id: Number(lastInsertRowid) });
    });
  }

  // ---------- ผู้ปกครอง ----------
  function mountParent(P) {
    // แทนที่รายการแอปที่บล็อคทั้งชุด
    P.put('/kids/:id/app-blocks', (req, res) => {
      const kid = mustKid(req.params.id);
      const list = Array.isArray(req.body?.apps) ? req.body.apps : null;
      if (!list || list.length > MAX_BLOCKED) throw bad('รายชื่อแอปไม่ถูกต้อง');
      const apps = new Map();
      for (const a of list) {
        const pkg = String(a?.pkg ?? '');
        if (pkg.length > 200 || !PKG.test(pkg)) throw bad('รายชื่อแอปไม่ถูกต้อง');
        if (pkg === OWN_APP) throw bad('บล็อคแอปล็อคจอเองไม่ได้');
        apps.set(pkg, labelOf(a.label, pkg));
      }
      db.transaction(() => {
        const keep = new Set(apps.keys());
        for (const row of s.blocked.all(kid.id)) {
          if (!keep.has(row.pkg)) db.prepare('DELETE FROM app_blocks WHERE kid_id = ? AND pkg = ?').run(kid.id, row.pkg);
        }
        const upsert = db.prepare(`
          INSERT INTO app_blocks (kid_id, pkg, label) VALUES (?, ?, ?)
          ON CONFLICT(kid_id, pkg) DO UPDATE SET label = excluded.label`);
        for (const [pkg, label] of apps) upsert.run(kid.id, pkg, label);
        // แอปที่เลิกบล็อคแล้ว — คำขอที่ค้างอยู่ไม่มีความหมาย ตอบให้เลย
        db.prepare(
          `UPDATE app_requests SET status = 'rejected', decided_at = ? WHERE kid_id = ? AND status = 'pending'
           AND pkg NOT IN (SELECT pkg FROM app_blocks WHERE kid_id = ?)`,
        ).run(nowIso(), kid.id, kid.id);
      })();
      poke(kid.id);
      res.json({ ok: true });
    });

    function decide(req, status) {
      const r = mustRequest(req.params.id);
      if (r.status !== 'pending') throw new HttpError(409, 'คำขอนี้ไม่ได้รออนุมัติแล้ว');
      const until = status === 'approved' ? new Date(Date.now() + r.minutes * 60_000).toISOString() : null;
      db.prepare('UPDATE app_requests SET status = ?, until = ?, decided_at = ? WHERE id = ?').run(status, until, nowIso(), r.id);
      poke(r.kid_id);
      return { ...r, until };
    }
    P.post('/app-requests/:id/approve', (req, res) => {
      const r = decide(req, 'approved');
      res.json({ ok: true, until: r.until });
    });
    P.post('/app-requests/:id/reject', (req, res) => {
      decide(req, 'rejected');
      res.json({ ok: true });
    });
    // หยุดการอนุญาตชั่วคราวก่อนหมดเวลา
    P.post('/app-requests/:id/end', (req, res) => {
      const r = mustRequest(req.params.id);
      if (r.status !== 'approved') throw new HttpError(409, 'คำขอนี้ไม่ได้อนุญาตอยู่');
      db.prepare('UPDATE app_requests SET until = ? WHERE id = ? AND until > ?').run(nowIso(), r.id, nowIso());
      poke(r.kid_id);
      res.json({ ok: true });
    });
  }

  return { phoneState, kidInfo, prune, mountPhone, mountParent, pendingRequests: () => s.pending.all() };
}
