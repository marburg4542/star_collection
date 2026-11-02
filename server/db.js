// ฐานข้อมูล SQLite ไฟล์เดียว — เปิด, สร้างตาราง, ใส่ตัวอย่างงาน/ความผิด/ของรางวัลตอนสร้างครั้งแรก
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SEED_ACTIVITIES, SEED_REWARDS } from './seed.js';

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

// แต่ละช่องคือการเปลี่ยนโครงสร้างหนึ่งครั้ง — เพิ่มต่อท้ายเท่านั้น ห้ามแก้ของเดิม (PRAGMA user_version บอกว่าทำถึงช่องไหนแล้ว)
const MIGRATIONS = [
  (db) => {
    db.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

      CREATE TABLE kids (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        avatar TEXT NOT NULL,
        color TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT ${NOW}
      );

      -- รายการที่ผู้ปกครองกดให้/หักดาว: earn = ทำดี, penalty = ความผิด (มีระดับ light/medium/severe)
      CREATE TABLE activities (
        id INTEGER PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('earn','penalty')),
        name TEXT NOT NULL,
        emoji TEXT NOT NULL,
        stars INTEGER NOT NULL CHECK (stars > 0),
        severity TEXT CHECK (severity IN ('light','medium','severe')),
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE rewards (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        emoji TEXT NOT NULL,
        category TEXT NOT NULL,
        cost INTEGER NOT NULL CHECK (cost > 0),
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      -- คำขอแลกของเด็ก — เก็บชื่อ/ราคาตอนขอไว้ด้วย ผู้ปกครองแก้ราคาทีหลังจะไม่กระทบคำขอที่ค้างอยู่
      CREATE TABLE requests (
        id INTEGER PRIMARY KEY,
        kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
        reward_id INTEGER REFERENCES rewards(id) ON DELETE SET NULL,
        reward_name TEXT NOT NULL,
        reward_emoji TEXT NOT NULL,
        cost INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
        note TEXT,
        created_at TEXT NOT NULL DEFAULT ${NOW},
        decided_at TEXT
      );

      -- สมุดบัญชีดาว: ยอดคงเหลือ = ผลรวม amount ที่ยังไม่ถูกยกเลิก (voided_at IS NULL)
      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY,
        kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('earn','penalty','redeem')),
        amount INTEGER NOT NULL,
        title TEXT NOT NULL,
        emoji TEXT NOT NULL,
        severity TEXT,
        note TEXT,
        activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
        request_id INTEGER REFERENCES requests(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT ${NOW},
        voided_at TEXT
      );
      CREATE INDEX transactions_kid ON transactions(kid_id, id);
      CREATE INDEX requests_status ON requests(status, id);

      -- เครื่องที่ใส่รหัสครอบครัวแล้ว (เก็บแค่ hash ของ token ในคุกกี้)
      CREATE TABLE devices (
        token_hash TEXT PRIMARY KEY,
        family_version INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT ${NOW},
        last_seen TEXT NOT NULL DEFAULT ${NOW}
      );

      -- การสมัครรับแจ้งเตือน: role parent ใช้ kid_id = 0
      CREATE TABLE push_subs (
        endpoint TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('parent','kid')),
        kid_id INTEGER NOT NULL DEFAULT 0,
        keys TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT ${NOW},
        PRIMARY KEY (endpoint, role, kid_id)
      );
    `);

    const addActivity = db.prepare('INSERT INTO activities (kind, name, emoji, stars, severity, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
    SEED_ACTIVITIES.forEach((a, i) => addActivity.run(a.kind, a.name, a.emoji, a.stars, a.severity ?? null, i));
    const addReward = db.prepare('INSERT INTO rewards (name, emoji, category, cost, sort_order) VALUES (?, ?, ?, ?, ?)');
    SEED_REWARDS.forEach((r, i) => addReward.run(r.name, r.emoji, r.category, r.cost, i));
  },
];

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  const current = db.pragma('user_version', { simple: true });
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      MIGRATIONS[v](db);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
  return db;
}

export function getSetting(db, key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null;
}

export function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}
