// การเข้าใช้ 2 ชั้น
//  1) เครื่อง: ใส่รหัสครอบครัวครั้งเดียว → ได้คุกกี้ httpOnly อายุยาว (เปลี่ยนรหัสครอบครัว = ทุกเครื่องต้องใส่ใหม่)
//  2) ผู้ปกครอง: ใส่ PIN → ได้ token สั้นๆ ส่งมาใน header X-Parent-Token ไม่ได้ใช้ 15 นาทีหมดอายุเอง
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { getSetting } from './db.js';

export const DEVICE_COOKIE = 'sc_device';
const DEVICE_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000; // เพดานที่เบราว์เซอร์ยอมให้คุกกี้มีอายุ
const DEVICE_REFRESH_MS = 24 * 60 * 60 * 1000;
export const PARENT_IDLE_MS = 15 * 60 * 1000;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');

// รหัสครอบครัวไม่สนตัวพิมพ์เล็ก/ใหญ่และช่องว่างหัวท้าย — เด็ก/ปู่ย่าพิมพ์ง่ายขึ้น
export const normalizeFamilyCode = (code) => String(code ?? '').trim().toLowerCase();
export const isValidPin = (pin) => /^\d{4}$/.test(String(pin ?? ''));
export const hashSecret = (s) => bcrypt.hashSync(s, 10);
export const checkSecret = (s, hash) => !!hash && bcrypt.compareSync(s, hash);

export const familyVersion = (db) => Number(getSetting(db, 'family_version') ?? 1);

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function setDeviceCookie(req, res, token) {
  res.cookie(DEVICE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    maxAge: DEVICE_MAX_AGE_MS,
    path: '/',
  });
}

export function issueDevice(db, req, res) {
  const token = newToken();
  db.prepare('INSERT INTO devices (token_hash, family_version) VALUES (?, ?)').run(sha256(token), familyVersion(db));
  setDeviceCookie(req, res, token);
}

export function forgetDevice(db, req, res) {
  const token = readCookie(req, DEVICE_COOKIE);
  if (token) db.prepare('DELETE FROM devices WHERE token_hash = ?').run(sha256(token));
  res.clearCookie(DEVICE_COOKIE, { path: '/' });
}

export function deviceAuthorized(db, req) {
  const token = readCookie(req, DEVICE_COOKIE);
  if (!token) return null;
  const row = db.prepare('SELECT token_hash, family_version, last_seen FROM devices WHERE token_hash = ?').get(sha256(token));
  if (!row || row.family_version !== familyVersion(db)) return null;
  return { token, row };
}

export function requireDevice(db) {
  return (req, res, next) => {
    const auth = deviceAuthorized(db, req);
    if (!auth) return res.status(401).json({ error: 'device', message: 'กรุณาใส่รหัสครอบครัว' });
    // ต่ออายุคุกกี้วันละครั้ง — เครื่องที่ใช้อยู่เรื่อยๆ จะไม่ต้องใส่รหัสใหม่
    if (Date.now() - Date.parse(auth.row.last_seen) > DEVICE_REFRESH_MS) {
      db.prepare("UPDATE devices SET last_seen = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token_hash = ?").run(auth.row.token_hash);
      setDeviceCookie(req, res, auth.token);
    }
    next();
  };
}

// session ผู้ปกครองเก็บในหน่วยความจำ — เซิร์ฟเวอร์รีสตาร์ทแล้วต้องใส่ PIN ใหม่ ซึ่งรับได้
const parentSessions = new Map();

export function issueParentToken() {
  const token = newToken();
  parentSessions.set(token, Date.now() + PARENT_IDLE_MS);
  return token;
}

export function dropParentToken(token) {
  parentSessions.delete(token);
}

export function dropAllParentTokens() {
  parentSessions.clear();
}

export function requireParent() {
  return (req, res, next) => {
    const token = req.get('x-parent-token');
    const expires = token && parentSessions.get(token);
    if (!expires || expires < Date.now()) {
      if (token) parentSessions.delete(token);
      return res.status(401).json({ error: 'parent', message: 'กรุณาใส่ PIN ผู้ปกครองอีกครั้ง' });
    }
    parentSessions.set(token, Date.now() + PARENT_IDLE_MS);
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [token, expires] of parentSessions) if (expires < now) parentSessions.delete(token);
}, 60_000).unref();

// ผ่าน Cloudflare tunnel ทุกคำขอมาจาก localhost — ใช้ IP จริงที่ Cloudflare แนบมาแทน
const clientKey = (req) => ipKeyGenerator(req.get('cf-connecting-ip') || req.ip || '0.0.0.0');

export const guessLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: clientKey,
    message: { error: 'rate', message: 'ใส่ผิดหลายครั้งเกินไป ลองใหม่ในอีก 15 นาที' },
  });
