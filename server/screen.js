// มือถือของลูก: จับคู่เครื่อง, กติกาเวลาเล่น, เวลาพิเศษ, คำขอเวลาเพิ่ม
// แอปบนเครื่องลูก (kid_lock) เป็นคนตัดสินว่าต้องล็อคเมื่อไหร่ — ไม่มีเน็ตก็ยังบังคับใช้ได้
// เครื่องมี 2 แบบ: owner (Device Owner ตั้งด้วย QR/ADB) และ standard (ติดตั้งจากเว็บ ใช้ผู้ดูแลอุปกรณ์ + การช่วยเหลือพิเศษ)
// เซิร์ฟเวอร์เก็บกติกา/คำสั่ง แล้วบอกให้เครื่องโหลดใหม่ผ่าน SSE ช่องของมือถือ
import crypto from 'node:crypto';
import express from 'express';
import { getSetting } from './db.js';
import { guessLimiter } from './auth.js';
import { isPhoneOnline, notifyPhones, phoneEventsHandler } from './events.js';
import { HttpError, bad, text, wholeNumber } from './validate.js';
import { STARTER_SITES, STARTER_WORDS, getWebBlock, readWebBlock, saveWebBlock } from './webblock.js';
import { createAppBlock } from './appblock.js';

const TZ = 'Asia/Bangkok';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
export const today = () => dayFmt.format(new Date());

const PAIR_TTL_MS = 10 * 60 * 1000;
// QR ตอนตั้งเครื่องใหม่: ต้องต่อ Wi‑Fi ดาวน์โหลดแอป และผ่านหน้าตั้งค่าหลายหน้าก่อนถึงขั้นจับคู่ — ให้เวลานานกว่า
const PAIR_QR_TTL_MS = 30 * 60 * 1000;
export const TIME_REQUEST_MINUTES = [15, 30, 60];
const LOCK_REASONS = ['manual', 'bedtime', 'limit', 'tamper'];
const MODES = ['owner', 'standard'];
const PROTECTIONS = ['admin', 'accessibility', 'usage', 'notifications', 'location', 'battery', 'installer'];
// สิทธิ์ที่ถ้าหายไปแปลว่าคุมเครื่องไม่ได้แล้ว → แจ้งผู้ปกครอง (แบบ Device Owner ระบบกันส่วนอื่นไว้ให้แล้ว)
const REQUIRED = { owner: ['usage'], standard: ['admin', 'accessibility', 'usage'] };
const PROTECTION_NAMES = { admin: 'ผู้ดูแลอุปกรณ์', accessibility: 'การช่วยเหลือพิเศษ', usage: 'สิทธิ์ดูการใช้งาน' };
// เครื่องส่งสัญญาณทุกนาทีตอนเปิดใช้ และทุก ~20 นาทีตอนหลับ — เงียบเกินนี้แจ้งผู้ปกครอง
export const SILENT_MS = 60 * 60 * 1000;
const SILENT_CHECK_MS = 5 * 60 * 1000;
// ไม่ได้ติดต่อเลยนานเกินนี้ = "หายไป" (ตอนเครื่องหลับยังส่งสัญญาณทุก ~20 นาที)
const GAP_MS = 30 * 60 * 1000;
const UPDATE_STATES = ['downloading', 'waiting', 'failed'];

// วันเรียน = จันทร์–ศุกร์ · เวลานอนแยกตาม "พรุ่งนี้เป็นวันเรียนไหม" (ตัดสินฝั่งเครื่อง)
export const DEFAULT_RULES = {
  enabled: true,
  limits: { school: 120, holiday: 180 },
  bedtime: { school: { start: '21:00', end: '06:30' }, holiday: { start: '22:00', end: '07:30' } },
  allowed: [],
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
// ชื่อแอปที่รู้จัก เผื่อเครื่องยังไม่ได้ส่งรายชื่อแอปมา
const KNOWN_APPS = { 'com.google.android.youtube': 'YouTube', 'com.android.chrome': 'Chrome' };
const PKG = /^[A-Za-z][\w]*(\.[A-Za-z][\w]*)+$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const nowIso = () => new Date().toISOString();
const clockFmt = new Intl.DateTimeFormat('th-TH', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const isoOrNull = (v) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);
const intOrNull = (v) => (Number.isInteger(v) && v >= 0 ? v : null);

function minutesText(ms) {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m} นาที`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} ชม. ${m % 60} นาที` : `${h} ชม.`;
}

/**
 * เครื่องกลับมาแล้ว — ดูจากรายงานก่อนหน้ากับรายงานนี้ (แอป 2.7+ ส่ง bootCount/pid มา):
 * นับการเปิดเครื่องเปลี่ยน = รีสตาร์ท/ปิดเครื่อง (แบตล่าสุด ≤ 5% = แบตหมด) · เลขโปรเซสแอปเปลี่ยน = แอปถูกปิด
 * ไม่เปลี่ยนทั้งคู่แต่หายไปนาน = แอปทำงานอยู่ตลอด แค่ติดต่อไม่ได้ (ไม่มีเน็ต)
 * gapFrom = ติดต่อครั้งสุดท้ายก่อนหายไป (null = ไม่ได้หายไปนาน)
 */
export function classifyReturn(prev, report, gapFrom, silentMs = SILENT_MS) {
  if (!prev?.at || report.bootCount == null) return null;
  const silentFrom = gapFrom ?? prev.at;
  const away = Date.parse(report.at) - Date.parse(silentFrom);
  const rebooted = prev.bootCount != null && prev.bootCount !== report.bootCount;
  const appRestarted = prev.pid != null && report.pid != null && prev.pid !== report.pid && prev.version === report.version;
  let kind = null;
  if (rebooted) kind = prev.battery && prev.battery.level <= 5 && !prev.battery.charging ? 'battery' : 'restart';
  else if (appRestarted && away >= 10 * 60_000) kind = 'app';
  else if (gapFrom && away >= silentMs) kind = 'offline';
  if (!kind) return null;
  return {
    kind,
    silentFrom,
    backAt: report.at,
    bootAt: report.bootAt,
    appStartAt: report.appStartAt,
    battery: prev.battery?.level ?? null,
  };
}

/** สาเหตุเป็นประโยคสั้นๆ (ใช้ทั้งแจ้งเตือนและหน้าเว็บ) */
export function returnSummary(e) {
  const at = (iso) => (iso ? clockFmt.format(new Date(iso)) : '?');
  const lateApp = e.appStartAt && e.bootAt && Date.parse(e.appStartAt) - Date.parse(e.bootAt) > 5 * 60_000;
  const app = lateApp ? ` แต่แอปเพิ่งเริ่มทำงาน ${at(e.appStartAt)} (เครื่องไม่เปิดแอปให้เอง — ตั้ง “เริ่มอัตโนมัติ”)` : '';
  switch (e.kind) {
    case 'battery':
      return `🪫 แบตหมด — เปิดเครื่องใหม่ ${at(e.bootAt)}${app}`;
    case 'restart':
      return `🔄 เครื่องปิดหรือรีสตาร์ท — เปิดเครื่องใหม่ ${at(e.bootAt)}${app}`;
    case 'app':
      return `⛔ แอปล็อคจอถูกปิด — กลับมาทำงาน ${at(e.appStartAt)}`;
    default:
      return '📶 ไม่มีเน็ต — แอปยังทำงานอยู่ตลอด';
  }
}

function readUpdate(u) {
  if (!u || typeof u !== 'object' || !UPDATE_STATES.includes(u.state)) return null;
  return { state: u.state, version: String(u.version ?? '').slice(0, 20), message: String(u.message ?? '').slice(0, 200), at: isoOrNull(u.at) ?? nowIso() };
}

function minutesOrNull(value, label) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 1440) throw bad(`${label}ต้องเป็นนาที 0–1440`);
  return n;
}

function nightOrNull(value, label) {
  if (!value) return null;
  if (!HHMM.test(value.start ?? '') || !HHMM.test(value.end ?? '')) throw bad(`${label}ต้องเป็นเวลา HH:MM`);
  if (value.start === value.end) throw bad(`${label}เวลาเริ่มกับเวลาตื่นต้องไม่ตรงกัน`);
  return { start: value.start, end: value.end };
}

export function readRules(body) {
  const b = body ?? {};
  const allowed = Array.isArray(b.allowed) ? [...new Set(b.allowed.map(String))] : [];
  if (allowed.length > 100 || allowed.some((p) => p.length > 200 || !PKG.test(p))) throw bad('รายชื่อแอปไม่ถูกต้อง');
  return {
    enabled: b.enabled !== false,
    limits: {
      school: minutesOrNull(b.limits?.school, 'เวลาเล่นวันเรียน'),
      holiday: minutesOrNull(b.limits?.holiday, 'เวลาเล่นวันหยุด'),
    },
    bedtime: {
      school: nightOrNull(b.bedtime?.school, 'เวลานอนคืนก่อนวันเรียน'),
      holiday: nightOrNull(b.bedtime?.holiday, 'เวลานอนคืนก่อนวันหยุด'),
    },
    allowed,
  };
}

const validApp = (a) => a && typeof a.pkg === 'string' && a.pkg.length <= 200 && PKG.test(a.pkg);
const appLabel = (a) => String(a.label ?? a.pkg).trim().slice(0, 60) || a.pkg;

function readApps(list) {
  if (!Array.isArray(list)) return null;
  return list.slice(0, 400).filter(validApp).map((a) => ({ pkg: a.pkg, label: appLabel(a) }));
}

/** ช่วงเปิดจอ [[เริ่ม, จบ], ...] (epoch ms) เรียงตามเวลา — ช่วงที่ซ้อนกันหรือห่างกันไม่ถึง 30 วิ รวมเป็นช่วงเดียว */
export function mergeSessions(list) {
  const out = [];
  for (const [a, b] of [...list].sort((x, y) => x[0] - y[0])) {
    const last = out.at(-1);
    if (last && a <= last[1] + 30_000) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

function readSessions(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const s of list.slice(0, 1000)) {
    const a = Math.round(Number(s?.[0]));
    const b = Math.round(Number(s?.[1]));
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) out.push([a, b]);
  }
  return mergeSessions(out);
}

/**
 * [{ day, apps: [{ pkg, label, sec }], sessions?, unlocks? }] — เวลาที่แต่ละแอปอยู่หน้าจอ
 * เครื่องคำนวณยอดทั้งวันใหม่จากบันทึกของระบบทุกครั้ง จึงเขียนทับได้เลย (แก้ตัวเลขย้อนหลังได้ด้วย)
 * แอป 2.5+ แนบช่วงที่เปิดจอ (sessions) และจำนวนครั้งที่ปลดล็อคจอ (unlocks) ของวันนั้นมาด้วย
 */
function readAppUsage(list) {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, 2)
    .filter((d) => d && DAY.test(d.day ?? '') && Array.isArray(d.apps))
    .map((d) => ({
      day: d.day,
      apps: d.apps
        .slice(0, 400)
        .filter(validApp)
        .map((a) => ({ pkg: a.pkg, label: appLabel(a), sec: Math.max(0, Math.min(86_400, Math.round(Number(a.sec) || 0))) })),
      sessions: readSessions(d.sessions),
      unlocks: Number.isInteger(d.unlocks) && d.unlocks >= 0 ? Math.min(d.unlocks, 10_000) : 0,
    }));
}

/** แบตเตอรี่ตอนส่งรายงาน (แอป 2.5+) — ใช้แยก "แบตหมด" กับ "แอปถูกปิด" ตอนเครื่องเงียบไป */
function readBattery(b) {
  const level = Math.round(Number(b?.level));
  if (!b || typeof b !== 'object' || !Number.isFinite(level) || level < 0 || level > 100) return null;
  return { level, charging: b.charging === true };
}

/** ข้อความแจ้งผู้ปกครองตอนเครื่องเงียบ — ดูจากแบตในรายงานสุดท้ายก่อนหายไป */
export function silentHint(report) {
  const bat = report?.battery;
  if (!bat) return 'อาจปิดเครื่อง แบตหมด ไม่มีเน็ต หรือแอปล็อคจอถูกปิด';
  if (bat.level <= 5 && !bat.charging) return `แบตล่าสุด ${bat.level}% — น่าจะแบตหมด`;
  return `แบตล่าสุด ${bat.level}% — แอปล็อคจออาจถูกปิด เครื่องรีสตาร์ท หรือไม่มีเน็ต ลองเปิดแอปล็อคจอบนเครื่องลูก`;
}

function readProtections(p) {
  if (!p || typeof p !== 'object') return null;
  return Object.fromEntries(PROTECTIONS.map((k) => [k, p[k] === true]));
}

/** สิทธิ์ที่จำเป็นที่เพิ่งหายไปในรายงานนี้ (เคยมีในรายงานก่อน) — แจ้งครั้งเดียวต่อการหาย */
function lostProtections(prev, report) {
  if (!report.mode || !report.protections || !prev?.protections) return [];
  return REQUIRED[report.mode].filter((k) => prev.protections[k] && !report.protections[k]);
}

function readLocation(b) {
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw bad('ตำแหน่งไม่ถูกต้อง');
  const accuracy = Number(b.accuracy);
  const at = Date.parse(b.at ?? '');
  return {
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    accuracy: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
    at: Number.isFinite(at) ? new Date(at).toISOString() : nowIso(),
  };
}

const parse = (json, fallback = null) => {
  try {
    return json ? JSON.parse(json) : fallback;
  } catch {
    return fallback;
  }
};

/**
 * deps: db, push, changed (แจ้งหน้าเว็บทุกเครื่อง), mustKid, kidStars(kidId) → { balance, available },
 *       createRequest(kid, reward) → id (คำขอแลกดาว ใช้ตัวเดียวกับหน้าเว็บ), mustReward
 */
export function createScreen({ db, push, changed, mustKid, mustReward, kidStars, createRequest }) {
  const s = {
    phoneByToken: db.prepare('SELECT * FROM phones WHERE token_hash = ?'),
    phone: db.prepare('SELECT * FROM phones WHERE id = ?'),
    phones: db.prepare('SELECT * FROM phones ORDER BY kid_id, id'),
    phoneIdsOfKid: db.prepare('SELECT id FROM phones WHERE kid_id = ?'),
    touch: db.prepare('UPDATE phones SET last_seen_at = ? WHERE id = ?'),
    rules: db.prepare('SELECT rules, paused_until FROM screen_rules WHERE kid_id = ?'),
    saveRules: db.prepare(
      'INSERT INTO screen_rules (kid_id, rules) VALUES (?, ?) ON CONFLICT(kid_id) DO UPDATE SET rules = excluded.rules',
    ),
    savePause: db.prepare(
      'INSERT INTO screen_rules (kid_id, rules, paused_until) VALUES (?, ?, ?) ON CONFLICT(kid_id) DO UPDATE SET paused_until = excluded.paused_until',
    ),
    grantSum: db.prepare('SELECT COALESCE(SUM(minutes), 0) AS v FROM screen_grants WHERE kid_id = ? AND day = ?'),
    insertGrant: db.prepare(`
      INSERT OR IGNORE INTO screen_grants (kid_id, day, minutes, source, request_id, client_id)
      VALUES (@kidId, @day, @minutes, @source, @requestId, @clientId)`),
    // นับเฉพาะเวลาที่ใช้หลังผู้ปกครองกดรีเซ็ตล่าสุด (reset_sec = ยอดของเครื่องนั้นตอนกด)
    usedByKid: db.prepare(`
      SELECT COALESCE(SUM(MAX(0, u.used_sec - u.reset_sec)), 0) AS v FROM screen_usage u JOIN phones p ON p.id = u.phone_id
      WHERE p.kid_id = ? AND u.day = ?`),
    // เครื่องคิดเวลาเหลือจาก "ยอดของตัวเองบนเครื่อง + ช่องนี้" — ส่งยอดตอนรีเซ็ตของตัวเองมาเป็นค่าลบ เครื่องจึงนับใหม่ได้โดยไม่ต้องอัปเดตแอป
    usedElsewhere: db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN u.phone_id = @phoneId THEN -u.reset_sec ELSE MAX(0, u.used_sec - u.reset_sec) END), 0) AS v
      FROM screen_usage u JOIN phones p ON p.id = u.phone_id
      WHERE p.kid_id = @kidId AND u.day = @day`),
    resetUsage: db.prepare('UPDATE screen_usage SET reset_sec = used_sec WHERE day = ? AND phone_id IN (SELECT id FROM phones WHERE kid_id = ?)'),
    clearGrants: db.prepare('DELETE FROM screen_grants WHERE kid_id = ? AND day = ?'),
    saveUsage: db.prepare(`
      INSERT INTO screen_usage (phone_id, day, used_sec) VALUES (?, ?, ?)
      ON CONFLICT(phone_id, day) DO UPDATE SET used_sec = MAX(used_sec, excluded.used_sec)`),
    screenRewards: db.prepare(
      "SELECT id, name, emoji, cost, minutes FROM rewards WHERE category = 'screen' AND minutes IS NOT NULL ORDER BY cost, sort_order, id",
    ),
    kidScreenRequests: db.prepare(`
      SELECT id, reward_name AS name, reward_emoji AS emoji, cost, minutes, status, note
      FROM requests
      WHERE kid_id = ? AND minutes IS NOT NULL
        AND (status = 'pending' OR decided_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day'))
      ORDER BY id DESC LIMIT 10`),
    kidTimeRequests: db.prepare(`
      SELECT id, minutes, status FROM time_requests
      WHERE kid_id = ? AND (status = 'pending' OR decided_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day'))
      ORDER BY id DESC LIMIT 10`),
    timeRequest: db.prepare('SELECT * FROM time_requests WHERE id = ?'),
    timeRequests: db.prepare(`
      SELECT id, kid_id AS kidId, phone_id AS phoneId, minutes, status, created_at AS createdAt, decided_at AS decidedAt
      FROM time_requests
      WHERE status = 'pending' OR decided_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days')
      ORDER BY (status = 'pending') DESC, COALESCE(decided_at, created_at) DESC LIMIT 40`),
    decideTimeRequest: db.prepare(
      "UPDATE time_requests SET status = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    ),
    saveAppUsage: db.prepare(`
      INSERT INTO app_usage (phone_id, day, pkg, label, used_sec) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(phone_id, day, pkg) DO UPDATE SET label = excluded.label, used_sec = excluded.used_sec`),
    appUsageOfKid: db.prepare(`
      SELECT a.day, a.pkg, MAX(a.label) AS label, SUM(a.used_sec) AS sec
      FROM app_usage a JOIN phones p ON p.id = a.phone_id
      WHERE p.kid_id = ? AND a.day >= ?
      GROUP BY a.day, a.pkg
      ORDER BY a.day DESC, sec DESC`),
    saveSessions: db.prepare(`
      INSERT INTO screen_sessions (phone_id, day, sessions, unlocks) VALUES (?, ?, ?, ?)
      ON CONFLICT(phone_id, day) DO UPDATE SET sessions = excluded.sessions, unlocks = excluded.unlocks`),
    sessionsOfKid: db.prepare(`
      SELECT s.day, s.sessions, s.unlocks FROM screen_sessions s JOIN phones p ON p.id = s.phone_id
      WHERE p.kid_id = ? AND s.day >= ?`),
    insertAppChange: db.prepare('INSERT INTO app_changes (phone_id, kind, pkg, label, at) VALUES (?, ?, ?, ?, ?)'),
    appChangesOfKid: db.prepare(`
      SELECT c.kind, c.pkg, c.label, c.at, p.name AS phone FROM app_changes c JOIN phones p ON p.id = c.phone_id
      WHERE p.kid_id = ? AND c.at >= ? ORDER BY c.at DESC, c.id DESC LIMIT 100`),
    insertWebBlock: db.prepare(`
      INSERT OR IGNORE INTO web_blocks (phone_id, kind, text, matched, app, client_id, at)
      VALUES (@phoneId, @kind, @text, @matched, @app, @clientId, @at)`),
    // แจ้งผู้ปกครองครั้งเดียวต่อ "รายการที่ตรง" ใน 10 นาที — ลูกลองเปิดซ้ำๆ จะได้ไม่เด้งรัว
    webBlockNearby: db.prepare(`
      SELECT 1 FROM web_blocks WHERE phone_id = ? AND matched = ? AND id <> ? AND at > ? AND at <= ? LIMIT 1`),
    insertPhoneEvent: db.prepare(`
      INSERT INTO phone_events (phone_id, kind, silent_from, back_at, boot_at, app_start_at, battery)
      VALUES (@phoneId, @kind, @silentFrom, @backAt, @bootAt, @appStartAt, @battery)`),
    lastPhoneEvent: db.prepare('SELECT * FROM phone_events WHERE phone_id = ? AND back_at >= ? ORDER BY back_at DESC, id DESC LIMIT 1'),
    phoneEventsOfKid: db.prepare(`
      SELECT e.*, p.name AS phone FROM phone_events e JOIN phones p ON p.id = e.phone_id
      WHERE p.kid_id = ? AND e.back_at >= ? ORDER BY e.back_at DESC, e.id DESC LIMIT 100`),
    webBlocksOfKid: db.prepare(`
      SELECT w.kind, w.text, w.matched, w.app, w.at, p.id AS phoneId, p.name AS phone FROM web_blocks w JOIN phones p ON p.id = w.phone_id
      WHERE p.kid_id = ? AND w.at >= ? ORDER BY w.at DESC, w.id DESC LIMIT 100`),
  };

  // เก็บรายงานรายแอป ช่วงเปิดจอ แอปที่ติดตั้ง/ลบ และเว็บที่บล็อค ย้อนหลัง 30 วัน — ล้างของเก่าวันละครั้ง
  let prunedDay = '';
  function pruneAppUsage() {
    const day = today();
    if (day === prunedDay) return;
    prunedDay = day;
    const cutoff = new Date(Date.now() - 30 * 86_400_000);
    db.prepare('DELETE FROM app_usage WHERE day < ?').run(dayFmt.format(cutoff));
    db.prepare('DELETE FROM screen_sessions WHERE day < ?').run(dayFmt.format(cutoff));
    db.prepare('DELETE FROM app_changes WHERE at < ?').run(cutoff.toISOString());
    db.prepare('DELETE FROM web_blocks WHERE at < ?').run(cutoff.toISOString());
    appBlock.prune(cutoff.toISOString());
    db.prepare('DELETE FROM phone_events WHERE back_at < ?').run(cutoff.toISOString());
  }

  const eventJson = (e) => ({
    kind: e.kind,
    silentFrom: e.silent_from,
    backAt: e.back_at,
    bootAt: e.boot_at,
    appStartAt: e.app_start_at,
    battery: e.battery,
    summary: returnSummary({ kind: e.kind, bootAt: e.boot_at, appStartAt: e.app_start_at }),
  });

  /** ชื่อแอปที่คนอ่านเข้าใจ จากรายชื่อแอปที่เครื่องส่งมา */
  const labelIn = (appsJson, pkg) => parse(appsJson, []).find((a) => a.pkg === pkg)?.label ?? KNOWN_APPS[pkg] ?? pkg;

  /** เทียบรายชื่อแอปกับครั้งก่อน → บันทึกแอปที่ติดตั้ง/ลบ แล้วแจ้งผู้ปกครอง (ครั้งแรกที่ส่งมายังไม่มีอะไรให้เทียบ) */
  function noteAppChanges(phone, before, after) {
    if (!Array.isArray(before)) return;
    const had = new Set(before.map((a) => a.pkg));
    const has = new Set(after.map((a) => a.pkg));
    const installed = after.filter((a) => !had.has(a.pkg));
    const removed = before.filter((a) => !has.has(a.pkg));
    if (!installed.length && !removed.length) return;
    const at = nowIso();
    db.transaction(() => {
      for (const a of installed) s.insertAppChange.run(phone.id, 'install', a.pkg, a.label, at);
      for (const a of removed) s.insertAppChange.run(phone.id, 'remove', a.pkg, a.label, at);
    })();
    pruneAppUsage();
    const kid = mustKid(phone.kid_id);
    const names = (list) => list.slice(0, 3).map((a) => a.label).join(', ') + (list.length > 3 ? ` และอีก ${list.length - 3} แอป` : '');
    const note = (title) =>
      push.notify({ role: 'parent' }, { title, body: `บน ${phone.name} · แตะเพื่อดูรายงานแอป`, url: '/parent/phones', tag: `apps-${phone.id}-${Date.now()}` });
    if (installed.length) note(`📲 ${kid.avatar} ${kid.name} ติดตั้งแอปใหม่: ${names(installed)}`);
    if (removed.length) note(`🗑️ ${kid.avatar} ${kid.name} ลบแอป: ${names(removed)}`);
  }

  const rulesOf = (kidId) => parse(s.rules.get(kidId)?.rules, DEFAULT_RULES);
  const phoneIdsOf = (kidId) => s.phoneIdsOfKid.all(kidId).map((r) => r.id);
  const mustPhone = (id) => s.phone.get(Number(id)) ?? (() => { throw new HttpError(404, 'ไม่พบมือถือเครื่องนี้'); })();

  /** บอกมือถือให้โหลดสถานะใหม่ (kidId = null → ทุกเครื่อง) + บอกหน้าเว็บผู้ปกครอง */
  function poke(kidId = null) {
    notifyPhones({ type: 'state' }, kidId === null ? null : phoneIdsOf(kidId));
    changed('phones');
  }

  const appBlock = createAppBlock({ db, push, poke, changed, mustKid });

  function addGrant({ kidId, minutes, source, requestId = null, clientId = null, day = today() }) {
    s.insertGrant.run({ kidId, day, minutes, source, requestId, clientId });
    poke(kidId);
  }

  // ---------- รหัสจับคู่ (อยู่ในหน่วยความจำ 10 นาที ใช้ได้ครั้งเดียว) ----------
  const pairCodes = new Map(); // code → { kidId, expires }
  function newPairCode(kidId, ttl) {
    const now = Date.now();
    for (const [c, v] of pairCodes) if (v.expires < now) pairCodes.delete(c);
    let code;
    do code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    while (pairCodes.has(code));
    pairCodes.set(code, { kidId, expires: now + ttl });
    return { code, expiresAt: new Date(now + ttl).toISOString() };
  }

  // ---------- ช่องทางของแอปบนเครื่องลูก (Authorization: Bearer <token>) ----------
  function requirePhone(req, res, next) {
    const m = /^Bearer (.+)$/.exec(req.get('authorization') ?? '');
    const phone = m && s.phoneByToken.get(sha256(m[1]));
    if (!phone) return res.status(401).json({ error: 'phone', message: 'เครื่องนี้ยังไม่ได้จับคู่' });
    // ติดต่อครั้งแรกหลังหายไปนาน → จำจุดเริ่มเงียบไว้ รายงานถัดไปจะบอกสาเหตุ
    if (!phone.gap_from && phone.last_seen_at && Date.now() - Date.parse(phone.last_seen_at) >= GAP_MS) {
      db.prepare('UPDATE phones SET gap_from = ? WHERE id = ?').run(phone.last_seen_at, phone.id);
      phone.gap_from = phone.last_seen_at;
    }
    s.touch.run(nowIso(), phone.id);
    req.phone = phone;
    next();
  }

  function phoneState(phone, day) {
    const kid = mustKid(phone.kid_id);
    const stars = kidStars(kid.id);
    return {
      serverTime: Date.now(),
      day,
      phone: {
        id: phone.id,
        name: phone.name,
        locked: !!phone.locked,
        lockChangedAt: phone.lock_changed_at,
        releasing: !!phone.releasing,
        locateRequestedAt: phone.locate_requested_at,
        updateRequestedAt: phone.update_requested_at,
      },
      kid: { id: kid.id, name: kid.name, avatar: kid.avatar, balance: stars.balance, available: stars.available },
      rules: rulesOf(kid.id),
      pausedUntil: s.rules.get(kid.id)?.paused_until ?? null,
      grantMinutes: s.grantSum.get(kid.id, day).v,
      usedElsewhereSec: s.usedElsewhere.get({ kidId: kid.id, day, phoneId: phone.id }).v,
      pinHash: getSetting(db, 'pin_hash'),
      webBlock: getWebBlock(db),
      rewards: s.screenRewards.all(),
      requests: s.kidScreenRequests.all(kid.id),
      timeRequests: s.kidTimeRequests.all(kid.id),
      appBlock: appBlock.phoneState(kid.id),
    };
  }

  const F = express.Router();

  F.post('/pair', guessLimiter(), (req, res) => {
    const entry = pairCodes.get(String(req.body.code ?? '').trim());
    if (!entry || entry.expires < Date.now()) {
      return res.status(401).json({ error: 'code', message: 'รหัสจับคู่ไม่ถูกต้องหรือหมดอายุ ขอรหัสใหม่จากโหมดผู้ปกครอง' });
    }
    pairCodes.delete(String(req.body.code).trim());
    const kid = mustKid(entry.kidId);
    const token = crypto.randomBytes(32).toString('base64url');
    const name = text(req.body.name || 'มือถือ', 'ชื่อเครื่อง', 60);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO phones (kid_id, name, token_hash, last_seen_at) VALUES (?, ?, ?, ?)')
      .run(kid.id, name, sha256(token), nowIso());
    changed('phones');
    res.json({ token, phoneId: Number(lastInsertRowid), kid: { id: kid.id, name: kid.name, avatar: kid.avatar } });
  });

  F.use(requirePhone);

  F.get('/events', (req, res) => phoneEventsHandler(req.phone.id, () => changed('phones'))(req, res));

  F.get('/state', (req, res) => {
    const day = DAY.test(req.query.day ?? '') ? req.query.day : today();
    res.json(phoneState(req.phone, day));
  });

  // เครื่องรายงานทุกนาที: เวลาที่ใช้วันนี้ (ยอดสะสม) + กำลังล็อคเพราะอะไร
  F.post('/report', (req, res) => {
    const b = req.body ?? {};
    const day = DAY.test(b.day ?? '') ? b.day : today();
    const usedSec = Math.max(0, Math.min(86_400, Math.round(Number(b.usedSec) || 0)));
    const lock = LOCK_REASONS.includes(b.lock) ? b.lock : null;
    const remaining = b.remainingSec === null || b.remainingSec === undefined ? null : Math.round(Number(b.remainingSec));
    const report = {
      day,
      usedSec,
      lock,
      remainingSec: Number.isFinite(remaining) ? remaining : null,
      pausedUntil: typeof b.pausedUntil === 'string' ? b.pausedUntil.slice(0, 40) : null,
      // ตำแหน่งใช้ได้ไหม: ok / off (ปิด GPS) / no-permission (ยังไม่ได้ให้สิทธิ์)
      location: ['ok', 'off', 'no-permission'].includes(b.location) ? b.location : null,
      mode: MODES.includes(b.mode) ? b.mode : null,
      protections: readProtections(b.protections),
      version: String(b.version ?? '').slice(0, 20),
      battery: readBattery(b.battery),
      // แอป 2.7+: นับการเปิดเครื่อง + เลขโปรเซสของแอป ใช้บอกว่าเครื่องรีสตาร์ทหรือแอปถูกปิด
      bootCount: intOrNull(b.bootCount),
      bootAt: isoOrNull(b.bootAt),
      pid: intOrNull(b.pid),
      appStartAt: isoOrNull(b.appStartAt),
      update: readUpdate(b.update),
      at: nowIso(),
    };
    const prev = parse(req.phone.report);
    const lost = lostProtections(prev, report);
    if (lost.length) {
      const kid = mustKid(req.phone.kid_id);
      push.notify(
        { role: 'parent' },
        {
          title: `⚠️ ${kid.avatar} ${kid.name}: ${req.phone.name} ถูกปิด${lost.map((k) => PROTECTION_NAMES[k]).join(', ')}`,
          body: 'เครื่องล็อคไว้แล้ว ใส่ PIN บนเครื่อง → ผู้ปกครอง เพื่อเปิดคืน',
          url: '/parent/phones',
          tag: `protect-${req.phone.id}`,
        },
      );
    }
    const back = classifyReturn(prev, report, req.phone.gap_from);
    if (back) {
      s.insertPhoneEvent.run({ phoneId: req.phone.id, ...back });
      pruneAppUsage();
      // เคยแจ้งผู้ปกครองว่า "เงียบเกิน 1 ชม." ไปแล้ว → แจ้งว่ากลับมาแล้วพร้อมสาเหตุ
      const alerted = req.phone.silent_alerted_at && Date.parse(req.phone.silent_alerted_at) >= Date.parse(back.silentFrom);
      if (alerted) {
        const kid = mustKid(req.phone.kid_id);
        push.notify(
          { role: 'parent' },
          {
            title: `📱 ${kid.avatar} ${kid.name}: ${req.phone.name} กลับมาแล้ว (เงียบไป ${minutesText(Date.parse(back.backAt) - Date.parse(back.silentFrom))})`,
            body: returnSummary(back),
            url: '/parent/phones',
            tag: `back-${req.phone.id}`,
          },
        );
      }
    }
    if (req.phone.gap_from && report.bootCount != null) db.prepare('UPDATE phones SET gap_from = NULL WHERE id = ?').run(req.phone.id);
    s.saveUsage.run(req.phone.id, day, usedSec);
    const appUsage = readAppUsage(b.appUsage);
    if (appUsage.length) {
      db.transaction(() => {
        for (const d of appUsage) {
          for (const a of d.apps) s.saveAppUsage.run(req.phone.id, d.day, a.pkg, a.label, a.sec);
          if (d.sessions) s.saveSessions.run(req.phone.id, d.day, JSON.stringify(d.sessions), d.unlocks);
        }
      })();
      pruneAppUsage();
    }
    const apps = readApps(b.apps);
    if (apps) noteAppChanges(req.phone, parse(req.phone.apps), apps);
    if (apps) db.prepare('UPDATE phones SET report = ?, apps = ? WHERE id = ?').run(JSON.stringify(report), JSON.stringify(apps), req.phone.id);
    else db.prepare('UPDATE phones SET report = ? WHERE id = ?').run(JSON.stringify(report), req.phone.id);
    const protectionsChanged = JSON.stringify(prev?.protections ?? null) !== JSON.stringify(report.protections) || prev?.mode !== report.mode;
    const updateChanged = JSON.stringify(prev?.update ?? null) !== JSON.stringify(report.update) || prev?.version !== report.version;
    if (!prev || prev.lock !== lock || prev.location !== report.location || protectionsChanged || apps || back || updateChanged) changed('phones');
    res.json({ ok: true });
  });

  // แอปปิดเว็บหรือคำค้นที่อยู่ในรายการบล็อค (อาจเกิดตอนออฟไลน์ เครื่องส่งตามมาทีหลัง — client_id กันซ้ำ)
  F.post('/web-blocks', (req, res) => {
    const b = req.body ?? {};
    const value = String(b.text ?? '').trim().slice(0, 300);
    const matched = String(b.matched ?? '').trim().slice(0, 100);
    if (!value || !matched) throw bad('ข้อมูลไม่ครบ');
    const atMs = Date.parse(b.at ?? '');
    const at = Number.isFinite(atMs) && atMs <= Date.now() + 60_000 ? new Date(atMs).toISOString() : nowIso();
    const row = {
      phoneId: req.phone.id,
      kind: b.kind === 'search' ? 'search' : 'site',
      text: value,
      matched,
      app: typeof b.app === 'string' && b.app.length <= 200 && PKG.test(b.app) ? b.app : null,
      clientId: String(b.clientId ?? '').slice(0, 64) || null,
      at,
    };
    const { changes, lastInsertRowid } = s.insertWebBlock.run(row);
    if (changes) {
      pruneAppUsage();
      const since = new Date(Date.parse(at) - 10 * 60_000).toISOString();
      if (!s.webBlockNearby.get(req.phone.id, matched, lastInsertRowid, since, at)) {
        const kid = mustKid(req.phone.kid_id);
        const where = row.app ? ` ใน ${labelIn(req.phone.apps, row.app)}` : '';
        push.notify(
          { role: 'parent' },
          {
            title:
              row.kind === 'search'
                ? `🚫 ${kid.avatar} ${kid.name} ค้นหาคำที่บล็อค${where}`
                : `🚫 ${kid.avatar} ${kid.name} พยายามเปิดเว็บที่บล็อค${where}`,
            body: `${row.kind === 'search' ? `“${value.slice(0, 80)}”` : value.slice(0, 120)} · แอปปิดหน้านั้นแล้ว`,
            url: '/parent/phones',
            tag: `web-${req.phone.id}-${lastInsertRowid}`,
          },
        );
      }
    }
    res.json({ ok: true });
  });

  // ผู้ปกครองใส่ PIN บนเครื่องแล้วให้เวลาเพิ่ม (อาจทำตอนออฟไลน์ เครื่องส่งตามมาทีหลัง — client_id กันซ้ำ)
  F.post('/grants', (req, res) => {
    const minutes = wholeNumber(req.body.minutes, 'จำนวนนาที', 600);
    const clientId = String(req.body.clientId ?? '').slice(0, 64);
    if (!clientId) throw bad('ไม่มีรหัสรายการ');
    const day = DAY.test(req.body.day ?? '') ? req.body.day : today();
    addGrant({ kidId: req.phone.kid_id, minutes, source: 'phone', clientId, day });
    res.json({ ok: true });
  });

  // ตำแหน่งล่าสุด (ทุก 30 นาที หรือเมื่อผู้ปกครองกดขอ) — เก็บแค่ค่าล่าสุด
  F.post('/location', (req, res) => {
    db.prepare('UPDATE phones SET location = ? WHERE id = ?').run(JSON.stringify(readLocation(req.body ?? {})), req.phone.id);
    changed('phones');
    res.json({ ok: true });
  });

  // ผู้ปกครองใส่ PIN บนเครื่องแล้วกดล็อคเครื่องนี้ (แอป 2.6+)
  F.post('/lock', (req, res) => {
    db.prepare('UPDATE phones SET locked = 1, lock_changed_at = ? WHERE id = ?').run(nowIso(), req.phone.id);
    poke(req.phone.kid_id);
    res.json({ ok: true });
  });

  // ผู้ปกครองใส่ PIN บนเครื่องแล้วปลดล็อคที่สั่งไว้
  // แอป 2.4+ แนบ lockChangedAt ของล็อคที่ปลด — กดตอนไม่มีเน็ตแล้วส่งตามมาทีหลัง ถ้าระหว่างนั้นผู้ปกครองสั่งล็อคใหม่ ไม่ปลดล็อคใหม่นั้น
  // แอปรุ่นเก่าไม่แนบ → ปลดเลยเหมือนเดิม
  F.post('/unlock', (req, res) => {
    const body = req.body ?? {};
    if ('lockChangedAt' in body) {
      const seen = body.lockChangedAt == null ? null : Date.parse(body.lockChangedAt);
      const current = req.phone.lock_changed_at == null ? null : Date.parse(req.phone.lock_changed_at);
      if (seen !== current) return res.json({ ok: true, applied: false });
    }
    db.prepare('UPDATE phones SET locked = 0, lock_changed_at = ? WHERE id = ?').run(nowIso(), req.phone.id);
    poke(req.phone.kid_id);
    res.json({ ok: true, applied: true });
  });

  appBlock.mountPhone(F);

  F.post('/time-requests', (req, res) => {
    const minutes = Number(req.body.minutes);
    if (!TIME_REQUEST_MINUTES.includes(minutes)) throw bad('ขอเวลาได้ 15, 30 หรือ 60 นาที');
    const kid = mustKid(req.phone.kid_id);
    const pending = db.prepare("SELECT COUNT(*) AS n FROM time_requests WHERE kid_id = ? AND status = 'pending'").get(kid.id).n;
    if (pending) throw new HttpError(409, 'ขอไปแล้ว รอผู้ปกครองตอบก่อนนะ');
    const { lastInsertRowid } = db
      .prepare('INSERT INTO time_requests (kid_id, phone_id, minutes) VALUES (?, ?, ?)')
      .run(kid.id, req.phone.id, minutes);
    poke(kid.id);
    push.notify(
      { role: 'parent' },
      {
        title: `${kid.avatar} ${kid.name} ขอเวลาเล่นเพิ่ม ${minutes} นาที`,
        body: 'แตะเพื่ออนุมัติหรือไม่อนุมัติ',
        url: '/parent/phones',
        tag: `time-${lastInsertRowid}`,
      },
    );
    res.json({ id: Number(lastInsertRowid) });
  });

  // แลกดาวเป็นเวลาเล่นจากหน้าล็อค — เข้าคิวคำขอแลกตัวเดียวกับหน้าเว็บ
  F.post('/requests', (req, res) => {
    const kid = mustKid(req.phone.kid_id);
    const id = createRequest(kid, mustReward(req.body.rewardId));
    poke(kid.id);
    res.json({ id });
  });

  // เครื่องปลดการควบคุมตัวเองเสร็จแล้ว (ผู้ปกครองสั่งจากเว็บ หรือใส่ PIN บนเครื่อง) — ลบออกจากรายการ
  F.post('/released', (req, res) => {
    db.prepare('DELETE FROM phones WHERE id = ?').run(req.phone.id);
    changed('phones');
    res.json({ ok: true });
  });

  // ---------- เครื่องเงียบไปนาน (ปิดเครื่อง แบตหมด ไม่มีเน็ต หรือแอปถูกปิด) ----------
  const silentPhones = db.prepare(`
    SELECT * FROM phones
    WHERE releasing = 0 AND last_seen_at < ? AND (silent_alerted_at IS NULL OR silent_alerted_at < last_seen_at)`);
  const markSilentAlerted = db.prepare('UPDATE phones SET silent_alerted_at = ? WHERE id = ?');

  /** แจ้งผู้ปกครองครั้งเดียวต่อช่วงที่เงียบ — เครื่องกลับมาส่งสัญญาณแล้วเงียบอีก ก็แจ้งใหม่ */
  function checkSilent(now = Date.now()) {
    const alerted = [];
    for (const p of silentPhones.all(new Date(now - SILENT_MS).toISOString())) {
      if (isPhoneOnline(p.id)) continue; // ยังต่อช่องสัญญาณสดอยู่ = แอปยังทำงาน
      const kid = mustKid(p.kid_id);
      markSilentAlerted.run(new Date(now).toISOString(), p.id);
      push.notify(
        { role: 'parent' },
        {
          title: `📵 ${kid.avatar} ${kid.name}: ${p.name} เงียบไปเกิน 1 ชม.`,
          body: silentHint(parse(p.report)),
          url: '/parent/phones',
          tag: `silent-${p.id}`,
        },
      );
      alerted.push(p.id);
    }
    if (alerted.length) changed('phones');
    return alerted;
  }
  const silentTimer = setInterval(() => {
    try {
      checkSilent();
    } catch (err) {
      console.error('silent check failed', err);
    }
  }, SILENT_CHECK_MS);
  silentTimer.unref(); // ไม่ค้างโปรเซสตอนปิดเซิร์ฟเวอร์/จบเทสต์

  // ---------- โหมดผู้ปกครอง (ติดตั้งใน router /api/parent ของ app.js) ----------
  function mountParent(P) {
    P.get('/phones', (req, res) => {
      const day = today();
      const phones = s.phones.all();
      const appsByKid = new Map();
      for (const p of phones) {
        const list = appsByKid.get(p.kid_id) ?? new Map();
        for (const a of parse(p.apps, [])) list.set(a.pkg, a);
        appsByKid.set(p.kid_id, list);
      }
      const kidIds = db.prepare('SELECT id FROM kids ORDER BY sort_order, id').all().map((k) => k.id);
      res.json({
        today: day,
        phones: phones.map((p) => ({
          id: p.id,
          kidId: p.kid_id,
          name: p.name,
          online: isPhoneOnline(p.id),
          lastSeenAt: p.last_seen_at,
          locked: !!p.locked,
          releasing: !!p.releasing,
          report: parse(p.report),
          location: parse(p.location),
          locateRequestedAt: p.locate_requested_at,
          updateRequestedAt: p.update_requested_at,
          createdAt: p.created_at,
          // กลับมาหลังเงียบไปใน 24 ชม.ล่าสุด (สาเหตุ)
          lastReturn: (() => {
            const e = s.lastPhoneEvent.get(p.id, new Date(Date.now() - 86_400_000).toISOString());
            return e ? eventJson(e) : null;
          })(),
        })),
        kids: Object.fromEntries(
          kidIds.map((id) => [
            id,
            {
              rules: rulesOf(id),
              pausedUntil: s.rules.get(id)?.paused_until ?? null,
              grantMinutes: s.grantSum.get(id, day).v,
              usedSec: s.usedByKid.get(id, day).v,
              apps: [...(appsByKid.get(id)?.values() ?? [])].sort((a, b) => a.label.localeCompare(b.label, 'th')),
              ...appBlock.kidInfo(id, day),
            },
          ]),
        ),
        timeRequests: s.timeRequests.all(),
        appRequests: appBlock.pendingRequests(),
      });
    });

    P.post('/phones/pair-code', (req, res) => {
      res.json(newPairCode(mustKid(req.body.kidId).id, req.body.qr ? PAIR_QR_TTL_MS : PAIR_TTL_MS));
    });

    P.put('/phones/:id', (req, res) => {
      const phone = mustPhone(req.params.id);
      db.prepare('UPDATE phones SET name = ? WHERE id = ?').run(text(req.body.name, 'ชื่อเครื่อง', 60), phone.id);
      changed('phones');
      res.json({ ok: true });
    });

    P.post('/phones/:id/lock', (req, res) => {
      const phone = mustPhone(req.params.id);
      db.prepare('UPDATE phones SET locked = ?, lock_changed_at = ? WHERE id = ?').run(req.body.locked ? 1 : 0, nowIso(), phone.id);
      poke(phone.kid_id);
      res.json({ ok: true, online: isPhoneOnline(phone.id) });
    });

    // ขอตำแหน่งตอนนี้ — เครื่องที่ออนไลน์ส่งตำแหน่งใหม่กลับมาภายในไม่กี่วินาที
    P.post('/phones/:id/locate', (req, res) => {
      const phone = mustPhone(req.params.id);
      db.prepare('UPDATE phones SET locate_requested_at = ? WHERE id = ?').run(nowIso(), phone.id);
      notifyPhones({ type: 'state' }, [phone.id]);
      res.json({ ok: true, online: isPhoneOnline(phone.id) });
    });

    // สั่งให้เครื่องดาวน์โหลดแอปล็อคจอรุ่นใหม่ แล้วขึ้นหน้า "อัปเดต" ให้กดบนเครื่อง (แอป 2.7+)
    P.post('/phones/:id/update', (req, res) => {
      const phone = mustPhone(req.params.id);
      db.prepare('UPDATE phones SET update_requested_at = ? WHERE id = ?').run(nowIso(), phone.id);
      notifyPhones({ type: 'state' }, [phone.id]);
      changed('phones');
      res.json({ ok: true, online: isPhoneOnline(phone.id) });
    });

    // รายงานเวลาใช้งานรายแอปของเด็ก รวมทุกเครื่อง ย้อนหลัง days วัน (รวมวันนี้)
    // + ช่วงที่เปิดจอ/จำนวนครั้งที่ปลดล็อค (แอป 2.5+ · ไม่มีข้อมูล = sessions null) + แอปที่ติดตั้ง/ลบ + เว็บที่บล็อค (30 วัน)
    P.get('/kids/:id/app-usage', (req, res) => {
      const kid = mustKid(req.params.id);
      const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));
      const from = dayFmt.format(new Date(Date.now() - (days - 1) * 86_400_000));
      const byDay = new Map();
      for (const row of s.appUsageOfKid.all(kid.id, from)) {
        const d = byDay.get(row.day) ?? { day: row.day, totalSec: 0, apps: [] };
        d.totalSec += row.sec;
        d.apps.push({ pkg: row.pkg, label: row.label, sec: row.sec });
        byDay.set(row.day, d);
      }
      const screen = new Map(); // day → { sessions, unlocks } รวมทุกเครื่องของเด็ก
      for (const row of s.sessionsOfKid.all(kid.id, from)) {
        const d = screen.get(row.day) ?? { sessions: [], unlocks: 0 };
        d.sessions = mergeSessions([...d.sessions, ...parse(row.sessions, [])]);
        d.unlocks += row.unlocks;
        screen.set(row.day, d);
      }
      const list = [];
      for (let i = 0; i < days; i++) {
        const day = dayFmt.format(new Date(Date.now() - i * 86_400_000));
        list.push({ ...(byDay.get(day) ?? { day, totalSec: 0, apps: [] }), ...(screen.get(day) ?? { sessions: null, unlocks: null }) });
      }
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const appsOfPhone = new Map(s.phones.all().map((p) => [p.id, p.apps]));
      res.json({
        days: list,
        phoneEvents: s.phoneEventsOfKid.all(kid.id, since).map((e) => ({ ...eventJson(e), phone: e.phone })),
        appChanges: s.appChangesOfKid.all(kid.id, since),
        webBlocks: s.webBlocksOfKid.all(kid.id, since).map(({ phoneId, ...w }) => ({
          ...w,
          appLabel: w.app ? labelIn(appsOfPhone.get(phoneId), w.app) : null,
        })),
      });
    });

    // รายการเว็บ/คำค้นที่บล็อค (ใช้กับมือถือลูกทุกเครื่อง) + รายการเริ่มต้นไว้กดเพิ่มคืน
    P.get('/web-block', (req, res) => {
      res.json({ ...getWebBlock(db), starter: { sites: STARTER_SITES, words: STARTER_WORDS } });
    });
    P.put('/web-block', (req, res) => {
      saveWebBlock(db, readWebBlock(req.body));
      poke(null);
      res.json({ ok: true });
    });

    // ปลดการควบคุม: เครื่องจะถอนสิทธิ์ผู้ดูแลของตัวเองแล้วแจ้งกลับ (ต้องออนไลน์) จากนั้นถอนการติดตั้งได้
    P.post('/phones/:id/release', (req, res) => {
      const phone = mustPhone(req.params.id);
      db.prepare('UPDATE phones SET releasing = 1 WHERE id = ?').run(phone.id);
      poke(phone.kid_id);
      res.json({ ok: true, online: isPhoneOnline(phone.id) });
    });

    // ลบออกจากรายการเลย (เครื่องหาย/เสีย) — ถ้าเครื่องกลับมาออนไลน์จะกลายเป็นเครื่องที่ยังไม่จับคู่
    P.delete('/phones/:id', (req, res) => {
      const phone = mustPhone(req.params.id);
      db.prepare('DELETE FROM phones WHERE id = ?').run(phone.id);
      notifyPhones({ type: 'state' }, [phone.id]);
      changed('phones');
      res.json({ ok: true });
    });

    P.put('/kids/:id/screen-rules', (req, res) => {
      const kid = mustKid(req.params.id);
      s.saveRules.run(kid.id, JSON.stringify(readRules(req.body.rules)));
      poke(kid.id);
      res.json({ ok: true });
    });

    P.post('/kids/:id/screen-grants', (req, res) => {
      const kid = mustKid(req.params.id);
      addGrant({ kidId: kid.id, minutes: wholeNumber(req.body.minutes, 'จำนวนนาที', 600), source: 'parent' });
      res.json({ ok: true });
    });

    // เริ่มนับเวลาวันนี้ใหม่: ใช้ไปกลับเป็น 0 และล้างเวลาพิเศษของวันนี้ทั้งหมด (รวมที่แลกดาวมา ดาวไม่คืน)
    P.post('/kids/:id/screen-reset', (req, res) => {
      const kid = mustKid(req.params.id);
      const day = today();
      db.transaction(() => {
        s.resetUsage.run(day, kid.id);
        s.clearGrants.run(kid.id, day);
      })();
      poke(kid.id);
      res.json({ ok: true });
    });

    // ปิดกติกาชั่วคราว minutes นาที (0 = เปิดกติกากลับทันที)
    P.post('/kids/:id/screen-pause', (req, res) => {
      const kid = mustKid(req.params.id);
      const minutes = Number(req.body.minutes);
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) throw bad('ระยะเวลาไม่ถูกต้อง');
      const until = minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
      s.savePause.run(kid.id, JSON.stringify(rulesOf(kid.id)), until);
      poke(kid.id);
      res.json({ ok: true, pausedUntil: until });
    });

    function decide(req, status) {
      const r = s.timeRequest.get(Number(req.params.id));
      if (!r) throw new HttpError(404, 'ไม่พบคำขอนี้');
      if (r.status !== 'pending') throw new HttpError(409, 'คำขอนี้ไม่ได้รออนุมัติแล้ว');
      db.transaction(() => {
        s.decideTimeRequest.run(status, r.id);
        if (status === 'approved') s.insertGrant.run({ kidId: r.kid_id, day: today(), minutes: r.minutes, source: 'request', requestId: null, clientId: null });
      })();
      poke(r.kid_id);
      return r;
    }
    P.post('/time-requests/:id/approve', (req, res) => {
      decide(req, 'approved');
      res.json({ ok: true });
    });
    P.post('/time-requests/:id/reject', (req, res) => {
      decide(req, 'rejected');
      res.json({ ok: true });
    });

    appBlock.mountParent(P);
  }

  return {
    phoneRouter: F,
    mountParent,
    checkSilent,
    /** อนุมัติรางวัลหมวดเล่นโทรศัพท์ → เวลาเพิ่มวันนี้ */
    grantForRequest(request) {
      if (request.minutes) addGrant({ kidId: request.kid_id, minutes: request.minutes, source: 'reward', requestId: request.id });
    },
    /** ยกเลิกรายการแลกที่กดผิด → เอาเวลาที่ให้ไปคืน */
    revokeForRequest(requestId, kidId) {
      if (db.prepare('DELETE FROM screen_grants WHERE request_id = ?').run(requestId).changes) poke(kidId);
    },
    /** PIN ผู้ปกครองเปลี่ยน / ลบเด็ก → เครื่องต้องโหลดใหม่ */
    pokeAll: () => poke(null),
    pokeKid: (kidId) => notifyPhones({ type: 'state' }, phoneIdsOf(kidId)),
    pendingAppRequests: () => appBlock.pendingRequests(),
    pendingTimeRequests: () =>
      db.prepare("SELECT id, kid_id AS kidId, minutes, created_at AS createdAt FROM time_requests WHERE status = 'pending' ORDER BY id").all(),
  };
}
