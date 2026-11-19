// เรียก API — คุกกี้เครื่องส่งไปเอง, token ผู้ปกครองเก็บใน sessionStorage (ปิดแอปแล้วต้องใส่ PIN ใหม่)
const PARENT_KEY = 'sc_parent';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const listeners = new Set();
export function onAuthLost(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function readToken() {
  try {
    return sessionStorage.getItem(PARENT_KEY) || '';
  } catch {
    return '';
  }
}
let parentToken = readToken();

export const getParentToken = () => parentToken;
export function setParentToken(token) {
  parentToken = token || '';
  try {
    if (parentToken) sessionStorage.setItem(PARENT_KEY, parentToken);
    else sessionStorage.removeItem(PARENT_KEY);
  } catch {
    /* โหมดส่วนตัว — จำในหน่วยความจำอย่างเดียวก็พอ */
  }
}

// เด็กที่ตั้งรหัส: ใส่รหัสถูกแล้วได้ token เก็บใน sessionStorage ทีละคน — กลับหน้าแรก/ปิดแอปแล้วลืม ต้องใส่ใหม่
const KID_KEY = 'sc_kid';
function readKid() {
  try {
    const v = JSON.parse(sessionStorage.getItem(KID_KEY) || 'null');
    return v?.token ? v : null;
  } catch {
    return null;
  }
}
let kidSession = readKid();
const kidListeners = new Set();

export const kidUnlocked = (kidId) => kidSession?.kidId === Number(kidId);
export function onKidLocked(fn) {
  kidListeners.add(fn);
  return () => kidListeners.delete(fn);
}
export function setKidSession(kidId, token) {
  kidSession = token ? { kidId: Number(kidId), token } : null;
  try {
    if (kidSession) sessionStorage.setItem(KID_KEY, JSON.stringify(kidSession));
    else sessionStorage.removeItem(KID_KEY);
  } catch {
    /* โหมดส่วนตัว — จำในหน่วยความจำอย่างเดียวก็พอ */
  }
}
export const lockKids = () => setKidSession(null, null);

async function request(method, url, body) {
  const file = typeof Blob !== 'undefined' && body instanceof Blob; // อัปโหลดรูป: ส่งไฟล์ตรงๆ
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(body !== undefined && { 'Content-Type': file ? body.type : 'application/json' }),
        ...(parentToken && { 'X-Parent-Token': parentToken }),
        ...(kidSession && { 'X-Kid-Token': kidSession.token }),
      },
      body: body === undefined ? undefined : file ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'offline', 'เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ไม่ใช่ JSON */
  }
  if (!res.ok) {
    const err = new ApiError(res.status, data?.error ?? 'server', data?.message ?? 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
    if (res.status === 401 && (err.code === 'device' || err.code === 'parent')) {
      if (err.code === 'parent') setParentToken('');
      listeners.forEach((fn) => fn(err.code));
    }
    // token เด็กหมดอายุ หรือผู้ปกครองเปลี่ยนรหัส → กลับไปหน้าใส่รหัส
    if (res.status === 403 && err.code === 'kid-pin') {
      lockKids();
      kidListeners.forEach((fn) => fn());
    }
    throw err;
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
  upload: (url, blob) => request('POST', url, blob),
};
