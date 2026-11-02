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

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(parentToken && { 'X-Parent-Token': parentToken }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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
    throw err;
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
};
