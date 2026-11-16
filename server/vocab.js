// เกมท่องคำศัพท์รายสัปดาห์ — ผู้ปกครองสร้างชุดคำ (เลือกเด็ก + เกณฑ์ผ่าน + ดาว) เด็กท่องบัตรคำแล้วสอบ
// สอบผ่านครั้งแรกได้ดาว · สอบซ้ำได้เรื่อยๆ แต่ไม่ได้ดาวเพิ่ม (ถ้าผู้ปกครองยกเลิกดาวรายการนั้น สอบผ่านใหม่ได้ดาวอีกครั้ง)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { HttpError, bad, emoji, optionalText, text, wholeNumber } from './validate.js';

const IMAGE_NAME = /^[a-f0-9]{24}\.(jpg|png|webp)$/;
const MAX_WORDS = 50;

// ตัวเทียบคำสะกด: ไม่สนตัวพิมพ์เล็ก/ใหญ่ ช่องว่างซ้ำ หรือเครื่องหมายอัญประกาศแบบโค้ง
export const normalizeSpelling = (s) =>
  String(s ?? '')
    .normalize('NFKC')
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

function imageExt(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function dateOnly(value) {
  const s = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) throw bad('วันเริ่มสัปดาห์ไม่ถูกต้อง');
  return s;
}

export function createVocab({ db, push, changed, mustKid, device, awardStars, mediaDir }) {
  const s = {
    sets: db.prepare('SELECT id, title, week_start AS weekStart, pass_pct AS passPct, stars FROM vocab_sets ORDER BY week_start DESC, id DESC'),
    set: db.prepare('SELECT * FROM vocab_sets WHERE id = ?'),
    setKids: db.prepare('SELECT set_id AS setId, kid_id AS kidId FROM vocab_set_kids'),
    words: db.prepare(
      'SELECT id, set_id AS setId, word, meaning, reading, example, emoji, image FROM vocab_words ORDER BY set_id, sort_order, id',
    ),
    wordsOf: db.prepare('SELECT * FROM vocab_words WHERE set_id = ? ORDER BY sort_order, id'),
    word: db.prepare('SELECT * FROM vocab_words WHERE id = ?'),
    // ผลสอบต่อเด็กต่อชุด: ครั้งที่ดีที่สุด, จำนวนครั้ง, ได้ดาวแล้วหรือยัง (ดาวที่ถูกยกเลิกไม่นับ)
    results: db.prepare(`
      SELECT a.set_id AS setId, a.kid_id AS kidId, COUNT(*) AS attempts, MAX(a.correct * 1.0 / a.total) AS best,
             MAX(a.passed) AS passed,
             MAX(CASE WHEN t.id IS NOT NULL AND t.voided_at IS NULL THEN 1 ELSE 0 END) AS rewarded,
             MAX(a.created_at) AS lastAt
      FROM vocab_attempts a LEFT JOIN transactions t ON t.id = a.tx_id
      GROUP BY a.set_id, a.kid_id`),
    rewarded: db.prepare(`
      SELECT 1 FROM vocab_attempts a JOIN transactions t ON t.id = a.tx_id
      WHERE a.set_id = ? AND a.kid_id = ? AND t.voided_at IS NULL LIMIT 1`),
    insertAttempt: db.prepare(
      'INSERT INTO vocab_attempts (set_id, kid_id, correct, total, passed, tx_id) VALUES (@setId, @kidId, @correct, @total, @passed, @txId)',
    ),
    nextWordOrder: db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM vocab_words WHERE set_id = ?'),
  };

  const mustSet = (id) => s.set.get(Number(id)) ?? (() => { throw new HttpError(404, 'ไม่พบชุดคำศัพท์นี้'); })();
  const mustWord = (id) => s.word.get(Number(id)) ?? (() => { throw new HttpError(404, 'ไม่พบคำศัพท์นี้'); })();

  function removeImage(name) {
    if (!mediaDir || !name || !IMAGE_NAME.test(name)) return;
    fs.rm(path.join(mediaDir, name), { force: true }, () => {});
  }

  // รูปที่อัปโหลดแล้วไม่ได้บันทึก (ปิดหน้าต่างไปก่อน) — ลบทิ้งเมื่อเก่ากว่า 1 วัน
  function sweepOrphans() {
    if (!mediaDir || !fs.existsSync(mediaDir)) return;
    const used = new Set(db.prepare('SELECT image FROM vocab_words WHERE image IS NOT NULL').all().map((r) => r.image));
    for (const name of fs.readdirSync(mediaDir)) {
      if (!IMAGE_NAME.test(name) || used.has(name)) continue;
      const file = path.join(mediaDir, name);
      if (Date.now() - fs.statSync(file).mtimeMs > 864e5) fs.rmSync(file, { force: true });
    }
  }
  sweepOrphans();
  setInterval(sweepOrphans, 6 * 3600e3).unref();

  function list() {
    const kidsBySet = new Map();
    for (const r of s.setKids.all()) kidsBySet.set(r.setId, [...(kidsBySet.get(r.setId) ?? []), r.kidId]);
    const wordsBySet = new Map();
    for (const w of s.words.all()) {
      const { setId, ...rest } = w;
      wordsBySet.set(setId, [...(wordsBySet.get(setId) ?? []), rest]);
    }
    const resultsBySet = new Map();
    for (const r of s.results.all()) {
      const { setId, kidId, ...rest } = r;
      const m = resultsBySet.get(setId) ?? {};
      m[kidId] = { ...rest, passed: !!rest.passed, rewarded: !!rest.rewarded };
      resultsBySet.set(setId, m);
    }
    return s.sets.all().map((set) => ({
      ...set,
      kidIds: kidsBySet.get(set.id) ?? [],
      words: wordsBySet.get(set.id) ?? [],
      results: resultsBySet.get(set.id) ?? {},
    }));
  }

  // ---------- เด็ก / ทุกเครื่องในครอบครัว ----------
  const router = express.Router();
  router.use(device);

  router.get('/', (req, res) => res.json({ sets: list() }));

  router.get('/images/:name', (req, res) => {
    const name = String(req.params.name);
    if (!mediaDir || !IMAGE_NAME.test(name)) throw new HttpError(404, 'ไม่พบรูปนี้');
    const file = path.join(mediaDir, name);
    if (!fs.existsSync(file)) throw new HttpError(404, 'ไม่พบรูปนี้');
    // ชื่อไฟล์สุ่มใหม่ทุกครั้งที่อัปโหลด เก็บในเครื่องได้นาน · private = Cloudflare ห้ามแคชแทน (ต้องผ่านรหัสครอบครัว)
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.sendFile(file);
  });

  // ส่งคำตอบทั้งชุด — เซิร์ฟเวอร์ตรวจเอง: เลือกคำแปล (choice) หรือพิมพ์สะกด (spell) ต้องตอบครบทุกคำ คำละครั้ง
  router.post('/:id/attempts', (req, res) => {
    const set = mustSet(req.params.id);
    const kid = mustKid(req.body.kidId);
    if (!db.prepare('SELECT 1 FROM vocab_set_kids WHERE set_id = ? AND kid_id = ?').get(set.id, kid.id)) {
      throw new HttpError(403, `ชุดนี้ไม่ได้ให้${kid.name}ท่อง`);
    }
    const words = s.wordsOf.all(set.id);
    if (!words.length) throw new HttpError(409, 'ชุดนี้ยังไม่มีคำศัพท์');
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const byId = new Map(words.map((w) => [w.id, w]));
    const seen = new Set();
    let correct = 0;
    for (const a of answers) {
      const w = byId.get(Number(a?.wordId));
      if (!w || seen.has(w.id)) throw new HttpError(409, 'คำศัพท์ชุดนี้เพิ่งถูกแก้ ลองสอบใหม่อีกครั้ง');
      seen.add(w.id);
      if (a.mode === 'choice') correct += String(a.answer ?? '').trim() === w.meaning ? 1 : 0;
      else if (a.mode === 'spell') correct += normalizeSpelling(a.answer) === normalizeSpelling(w.word) ? 1 : 0;
      else throw bad('รูปแบบคำตอบไม่ถูกต้อง');
    }
    if (seen.size !== words.length) throw new HttpError(409, 'คำศัพท์ชุดนี้เพิ่งถูกแก้ ลองสอบใหม่อีกครั้ง');

    const total = words.length;
    const passed = correct * 100 >= set.pass_pct * total;
    const result = db.transaction(() => {
      const earn = passed && !s.rewarded.get(set.id, kid.id);
      const txId = earn ? awardStars(kid.id, set.stars, `สอบคำศัพท์ผ่าน: ${set.title}`) : null;
      s.insertAttempt.run({ setId: set.id, kidId: kid.id, correct, total, passed: passed ? 1 : 0, txId });
      return { correct, total, passed, stars: earn ? set.stars : 0 };
    })();
    changed('vocab');
    if (result.stars) {
      changed('stars');
      push.notify(
        { role: 'parent' },
        {
          title: `📚 ${kid.avatar} ${kid.name} สอบคำศัพท์ผ่าน!`,
          body: `${set.title} · ถูก ${correct}/${total} ได้ ${set.stars} ดาว`,
          url: '/parent/manage?tab=vocab',
          tag: `vocab-${set.id}-${kid.id}`,
        },
      );
    }
    res.json(result);
  });

  // ---------- ผู้ปกครอง ----------
  function setBody(b) {
    const kidIds = [...new Set((Array.isArray(b.kidIds) ? b.kidIds : []).map(Number))];
    if (!kidIds.length) throw bad('เลือกเด็กอย่างน้อย 1 คน');
    kidIds.forEach((id) => mustKid(id));
    return {
      title: text(b.title, 'ชื่อชุดคำศัพท์'),
      weekStart: dateOnly(b.weekStart),
      passPct: wholeNumber(b.passPct, 'เกณฑ์ผ่าน (%)', 100),
      stars: wholeNumber(b.stars, 'จำนวนดาว', 100),
      kidIds,
    };
  }
  function saveKids(setId, kidIds) {
    db.prepare('DELETE FROM vocab_set_kids WHERE set_id = ?').run(setId);
    const add = db.prepare('INSERT INTO vocab_set_kids (set_id, kid_id) VALUES (?, ?)');
    kidIds.forEach((k) => add.run(setId, k));
  }
  function wordBody(b) {
    const image = b.image ? String(b.image) : null;
    if (image && !IMAGE_NAME.test(image)) throw bad('รูปไม่ถูกต้อง');
    const word = text(b.word, 'คำศัพท์ภาษาอังกฤษ', 60);
    if (!/[a-z]/i.test(word)) throw bad('คำศัพท์ต้องเป็นภาษาอังกฤษ');
    return {
      word,
      meaning: text(b.meaning, 'คำแปลภาษาไทย', 80),
      reading: optionalText(b.reading, 60),
      example: optionalText(b.example, 200),
      emoji: b.emoji ? emoji(b.emoji, null) : null,
      image,
    };
  }

  function mountParent(P) {
    P.post('/vocab', (req, res) => {
      const b = setBody(req.body);
      const id = db.transaction(() => {
        const { lastInsertRowid } = db
          .prepare('INSERT INTO vocab_sets (title, week_start, pass_pct, stars) VALUES (?, ?, ?, ?)')
          .run(b.title, b.weekStart, b.passPct, b.stars);
        saveKids(Number(lastInsertRowid), b.kidIds);
        return Number(lastInsertRowid);
      })();
      changed('vocab');
      res.json({ id });
    });

    P.put('/vocab/:id', (req, res) => {
      const set = mustSet(req.params.id);
      const b = setBody(req.body);
      db.transaction(() => {
        db.prepare('UPDATE vocab_sets SET title = ?, week_start = ?, pass_pct = ?, stars = ? WHERE id = ?').run(b.title, b.weekStart, b.passPct, b.stars, set.id);
        saveKids(set.id, b.kidIds);
      })();
      changed('vocab');
      res.json({ ok: true });
    });

    // ลบทั้งชุด — ดาวที่เด็กได้ไปแล้วยังอยู่ในประวัติ (ยกเลิกเองได้ในหน้าประวัติ)
    P.delete('/vocab/:id', (req, res) => {
      const set = mustSet(req.params.id);
      const images = s.wordsOf.all(set.id).map((w) => w.image);
      db.prepare('DELETE FROM vocab_sets WHERE id = ?').run(set.id);
      images.forEach(removeImage);
      changed('vocab');
      res.json({ ok: true });
    });

    P.post('/vocab/:id/words', (req, res) => {
      const set = mustSet(req.params.id);
      if (s.wordsOf.all(set.id).length >= MAX_WORDS) throw new HttpError(409, `ชุดหนึ่งใส่ได้ไม่เกิน ${MAX_WORDS} คำ`);
      const w = wordBody(req.body);
      const { lastInsertRowid } = db
        .prepare('INSERT INTO vocab_words (set_id, word, meaning, reading, example, emoji, image, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(set.id, w.word, w.meaning, w.reading, w.example, w.emoji, w.image, s.nextWordOrder.get(set.id).n);
      changed('vocab');
      res.json({ id: Number(lastInsertRowid) });
    });

    P.put('/vocab/words/:wordId', (req, res) => {
      const old = mustWord(req.params.wordId);
      const w = wordBody(req.body);
      db.prepare('UPDATE vocab_words SET word = ?, meaning = ?, reading = ?, example = ?, emoji = ?, image = ? WHERE id = ?').run(
        w.word,
        w.meaning,
        w.reading,
        w.example,
        w.emoji,
        w.image,
        old.id,
      );
      if (old.image && old.image !== w.image) removeImage(old.image);
      changed('vocab');
      res.json({ ok: true });
    });

    P.delete('/vocab/words/:wordId', (req, res) => {
      const old = mustWord(req.params.wordId);
      db.prepare('DELETE FROM vocab_words WHERE id = ?').run(old.id);
      removeImage(old.image);
      changed('vocab');
      res.json({ ok: true });
    });

    // รูปที่ย่อจากหน้าเว็บแล้ว (ไม่เกิน 2 MB) — ส่งเป็นไฟล์ตรงๆ ไม่ใช่ JSON
    P.post('/vocab/images', express.raw({ type: 'image/*', limit: '2mb' }), (req, res) => {
      if (!mediaDir) throw new HttpError(503, 'เซิร์ฟเวอร์นี้ยังเก็บรูปไม่ได้');
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const ext = imageExt(buf);
      if (!ext) throw bad('ไฟล์นี้ไม่ใช่รูป (ใช้ JPG, PNG หรือ WebP)');
      fs.mkdirSync(mediaDir, { recursive: true });
      const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
      fs.writeFileSync(path.join(mediaDir, name), buf);
      res.json({ image: name });
    });
  }

  return { router, mountParent };
}
