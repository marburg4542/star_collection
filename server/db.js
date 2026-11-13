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

  // มือถือของลูก (แอปล็อคจอ) + เวลาเล่น
  (db) => {
    db.exec(`
      -- รางวัลหมวดเล่นโทรศัพท์: อนุมัติแล้วเครื่องลูกได้เวลาเพิ่มกี่นาที (คำขอเก็บสำเนาไว้เหมือนชื่อ/ราคา)
      ALTER TABLE rewards ADD COLUMN minutes INTEGER;
      ALTER TABLE requests ADD COLUMN minutes INTEGER;

      -- เครื่องที่จับคู่แล้ว: token เก็บแค่ hash · locked = ผู้ปกครองสั่งล็อค · releasing = สั่งปลดการควบคุม รอเครื่องยืนยัน
      CREATE TABLE phones (
        id INTEGER PRIMARY KEY,
        kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        locked INTEGER NOT NULL DEFAULT 0,
        lock_changed_at TEXT,
        releasing INTEGER NOT NULL DEFAULT 0,
        report TEXT,
        apps TEXT,
        created_at TEXT NOT NULL DEFAULT ${NOW},
        last_seen_at TEXT
      );

      -- กติกาต่อเด็กหนึ่งคน (JSON) ใช้กับทุกเครื่องของเด็กคนนั้น · paused_until = ปิดกติกาชั่วคราว
      CREATE TABLE screen_rules (
        kid_id INTEGER PRIMARY KEY REFERENCES kids(id) ON DELETE CASCADE,
        rules TEXT NOT NULL,
        paused_until TEXT
      );

      -- เวลาที่ใช้ไปต่อเครื่องต่อวัน (วันตามเวลาไทย YYYY-MM-DD) — เครื่องรายงานยอดสะสมของวันมาเรื่อยๆ
      CREATE TABLE screen_usage (
        phone_id INTEGER NOT NULL REFERENCES phones(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        used_sec INTEGER NOT NULL,
        PRIMARY KEY (phone_id, day)
      );

      -- เวลาพิเศษของวันนั้น: จากแลกดาว / ผู้ปกครองให้ / ใส่ PIN บนเครื่อง / อนุมัติคำขอเวลา
      -- client_id กันเครื่องส่งรายการเดิมซ้ำตอนเน็ตกลับมา
      CREATE TABLE screen_grants (
        id INTEGER PRIMARY KEY,
        kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        minutes INTEGER NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('reward','parent','phone','request')),
        request_id INTEGER REFERENCES requests(id) ON DELETE SET NULL,
        client_id TEXT UNIQUE,
        created_at TEXT NOT NULL DEFAULT ${NOW}
      );
      CREATE INDEX screen_grants_kid_day ON screen_grants(kid_id, day);

      -- เด็กกดขอเวลาเพิ่มจากเครื่อง (ไม่ใช้ดาว) รอผู้ปกครองตอบ
      CREATE TABLE time_requests (
        id INTEGER PRIMARY KEY,
        kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
        phone_id INTEGER REFERENCES phones(id) ON DELETE SET NULL,
        minutes INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
        created_at TEXT NOT NULL DEFAULT ${NOW},
        decided_at TEXT
      );
    `);

    // ของรางวัลหมวดเล่นโทรศัพท์ที่มีอยู่แล้ว (รวมตัวอย่าง) — อ่านจำนวนนาทีจากชื่อ เช่น "30 นาที", "1 ชั่วโมง"
    const setMinutes = db.prepare('UPDATE rewards SET minutes = ? WHERE id = ?');
    for (const r of db.prepare("SELECT id, name FROM rewards WHERE category = 'screen'").all()) {
      const minutes = minutesFromName(r.name);
      if (minutes) setMinutes.run(minutes, r.id);
    }
  },

  // รายงานเวลาใช้งานรายแอป + ตำแหน่งล่าสุดของมือถือลูก
  (db) => {
    db.exec(`
      -- เวลาที่แต่ละแอปอยู่หน้าจอ ต่อเครื่องต่อวัน (เก็บย้อนหลัง 30 วัน)
      CREATE TABLE app_usage (
        phone_id INTEGER NOT NULL REFERENCES phones(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        pkg TEXT NOT NULL,
        label TEXT NOT NULL,
        used_sec INTEGER NOT NULL,
        PRIMARY KEY (phone_id, day, pkg)
      );

      -- ตำแหน่งล่าสุดเท่านั้น (JSON lat/lng/accuracy/at) ไม่เก็บประวัติ · locate_requested_at = ผู้ปกครองกดขอตำแหน่งตอนนี้
      ALTER TABLE phones ADD COLUMN location TEXT;
      ALTER TABLE phones ADD COLUMN locate_requested_at TEXT;
    `);
  },

  // แจ้งผู้ปกครองเมื่อมือถือเงียบไปนาน — จำว่าแจ้งไปแล้วเมื่อไหร่ (แจ้งครั้งเดียวต่อช่วงที่เงียบ)
  (db) => {
    db.exec('ALTER TABLE phones ADD COLUMN silent_alerted_at TEXT;');
  },

  // ผู้ปกครองกดรีเซ็ตเวลาวันนี้ — จำยอดที่เครื่องรายงานไว้ตอนกด แล้วนับเฉพาะส่วนที่ใช้ต่อจากนั้น
  (db) => {
    db.exec('ALTER TABLE screen_usage ADD COLUMN reset_sec INTEGER NOT NULL DEFAULT 0;');
  },

  // แอปล็อคจอ 2.5: ช่วงที่เปิดจอ, แอปที่ติดตั้ง/ลบ, เว็บที่ถูกบล็อค — เก็บย้อนหลัง 30 วัน
  (db) => {
    db.exec(`
      -- ช่วงที่จอเปิดอยู่ต่อเครื่องต่อวัน (JSON [[เริ่ม, จบ], ...] เป็น epoch ms) + จำนวนครั้งที่ปลดล็อคจอ
      CREATE TABLE screen_sessions (
        phone_id INTEGER NOT NULL REFERENCES phones(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        sessions TEXT NOT NULL,
        unlocks INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (phone_id, day)
      );

      -- แอปที่ติดตั้ง/ลบบนเครื่องลูก (เซิร์ฟเวอร์เทียบรายชื่อแอปที่เครื่องส่งมากับครั้งก่อน)
      CREATE TABLE app_changes (
        id INTEGER PRIMARY KEY,
        phone_id INTEGER NOT NULL REFERENCES phones(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('install','remove')),
        pkg TEXT NOT NULL,
        label TEXT NOT NULL,
        at TEXT NOT NULL DEFAULT ${NOW}
      );
      CREATE INDEX app_changes_phone_at ON app_changes(phone_id, at);

      -- เว็บ/คำค้นที่แอปปิดไป · client_id กันเครื่องส่งรายการเดิมซ้ำตอนเน็ตกลับมา
      CREATE TABLE web_blocks (
        id INTEGER PRIMARY KEY,
        phone_id INTEGER NOT NULL REFERENCES phones(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('site','search')),
        text TEXT NOT NULL,
        matched TEXT NOT NULL,
        app TEXT,
        client_id TEXT UNIQUE,
        at TEXT NOT NULL
      );
      CREATE INDEX web_blocks_phone_at ON web_blocks(phone_id, at);
    `);
  },

  // แอปล็อคจอ 2.7: เครื่องกลับมาหลังเงียบไป (รีสตาร์ท / แอปถูกปิด / ไม่มีเน็ต) + ผู้ปกครองสั่งอัปเดตแอปจากเว็บ
  (db) => {
    db.exec(`
      -- เริ่มเงียบเมื่อไหร่ (ติดต่อครั้งก่อน) — ตั้งตอนเครื่องกลับมาติดต่อหลังหายไปนาน ล้างตอนรายงานถัดไปบอกสาเหตุแล้ว
      ALTER TABLE phones ADD COLUMN gap_from TEXT;
      ALTER TABLE phones ADD COLUMN update_requested_at TEXT;

      -- ช่วงที่เครื่องเงียบไป + สาเหตุ (เก็บ 30 วัน)
      CREATE TABLE phone_events (
        id INTEGER PRIMARY KEY,
        phone_id INTEGER NOT NULL REFERENCES phones(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('restart','battery','app','offline')),
        silent_from TEXT NOT NULL,
        back_at TEXT NOT NULL,
        boot_at TEXT,
        app_start_at TEXT,
        battery INTEGER
      );
      CREATE INDEX phone_events_phone_back ON phone_events(phone_id, back_at);
    `);
  },
];

export function minutesFromName(name) {
  const hours = /(\d+(?:\.\d+)?)\s*ชั่วโมง|(\d+(?:\.\d+)?)\s*ชม/.exec(name);
  const mins = /(\d+)\s*นาที/.exec(name);
  const total = (hours ? Number(hours[1] ?? hours[2]) * 60 : 0) + (mins ? Number(mins[1]) : 0);
  return total > 0 && total <= 1440 ? Math.round(total) : null;
}

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
