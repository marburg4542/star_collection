// มินิเกม (คณิต): 🎈 ป๊อปลูกโป่ง · ⚖️ ตาชั่งตัวเลข · 🏪 ร้านค้า
// ผู้ปกครองตั้งต่อเด็กต่อเกม: เปิด/ปิด, ระดับ (เลือกได้หลายระดับ โจทย์คละกัน), ตอบถูกทุก N ข้อในรอบเดียวได้ M ดาว
// + เพดานดาวจากมินิเกมต่อวัน (รวมทุกเกม) — ครบแล้วยังเล่นได้แต่ไม่ได้ดาวเพิ่ม · ผู้ปกครองยกเลิกดาว = คืนโควตาวันนั้น
// คะแนนคิดฝั่งเครื่องเด็ก — เซิร์ฟเวอร์ตรวจแค่ว่าเป็นไปได้จริง (เกมแบบเรียลไทม์ตรวจทีละข้อไม่ได้)
import express from 'express';
import { bad } from './validate.js';

const TZ = 'Asia/Bangkok';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const today = () => dayFmt.format(new Date());

const HEARTS = 3;
export const DAILY_STARS_DEFAULT = 3;

// maxCorrect: ป๊อปลูกโป่งรอบละ 60 วิ ตอบได้ไม่เกิน ~2 ข้อ/วิ · อีกสองเกมไม่จับเวลา (เล่นจนหัวใจหมด)
// maxPoints: คะแนนต่อข้อสูงสุด (10 × คอมโบ x5, ร้านค้ามีโบนัสจ่ายเงินพอดีเป๊ะอีกนิด)
export const GAMES = {
  math: { title: 'ป๊อปลูกโป่ง', emoji: '🎈', levels: [1, 2, 3, 4, 5], defaults: { enabled: true, levels: [2], every: 10, stars: 1 }, maxCorrect: 120, maxPoints: 50 },
  scale: { title: 'ตาชั่งตัวเลข', emoji: '⚖️', levels: [1, 2, 3, 4, 5, 6], defaults: { enabled: true, levels: [2], every: 5, stars: 1 }, maxCorrect: 500, maxPoints: 50 },
  shop: { title: 'ร้านค้า', emoji: '🏪', levels: [1, 2, 3, 4], defaults: { enabled: true, levels: [1], every: 5, stars: 1 }, maxCorrect: 500, maxPoints: 60 },
};

const int = (v) => (Number.isInteger(v) ? v : NaN);
function inRange(value, label, min, max) {
  const n = int(value);
  if (!(n >= min && n <= max)) throw bad(`${label}ต้องเป็นเลข ${min}–${max}`);
  return n;
}

/** ระดับที่ส่งมา → รายการเรียงไม่ซ้ำ หรือ null ถ้ามีระดับที่เกมนี้ไม่มี / ว่าง */
function cleanLevels(game, value) {
  if (!Array.isArray(value) || !value.length) return null;
  if (!value.every((l) => game.levels.includes(l))) return null;
  return [...new Set(value)].sort((a, b) => a - b);
}

function gameOf(key) {
  const game = Object.hasOwn(GAMES, key) ? GAMES[key] : null;
  if (!game) throw bad('ไม่มีเกมนี้');
  return game;
}

export function createGames({ db, push, changed, mustKid, device, awardStars }) {
  const s = {
    settings: db.prepare('SELECT * FROM game_settings WHERE kid_id = ?'),
    saveSettings: db.prepare(`
      INSERT INTO game_settings (kid_id, game, enabled, levels, every, stars) VALUES (@kidId, @game, @enabled, @levels, @every, @stars)
      ON CONFLICT(kid_id, game) DO UPDATE SET enabled = excluded.enabled, levels = excluded.levels, every = excluded.every, stars = excluded.stars`),
    limit: db.prepare('SELECT daily_stars FROM game_limits WHERE kid_id = ?'),
    saveLimit: db.prepare(`
      INSERT INTO game_limits (kid_id, daily_stars) VALUES (?, ?)
      ON CONFLICT(kid_id) DO UPDATE SET daily_stars = excluded.daily_stars`),
    kids: db.prepare('SELECT id FROM kids ORDER BY sort_order, id'),
    best: db.prepare('SELECT score, correct, created_at AS at FROM game_rounds WHERE kid_id = ? AND game = ? ORDER BY score DESC, id LIMIT 1'),
    todayRounds: db.prepare('SELECT game, COUNT(*) AS rounds, MAX(correct) AS bestCorrect FROM game_rounds WHERE kid_id = ? AND day = ? GROUP BY game'),
    todayStars: db.prepare(`
      SELECT r.game, SUM(t.amount) AS stars FROM game_rounds r JOIN transactions t ON t.id = r.tx_id
      WHERE r.kid_id = ? AND r.day = ? AND t.voided_at IS NULL GROUP BY r.game`),
    insertRound: db.prepare(`
      INSERT INTO game_rounds (kid_id, game, day, levels, score, correct, wrong, best_combo, tx_id)
      VALUES (@kidId, @game, @day, @levels, @score, @correct, @wrong, @bestCombo, @txId)`),
  };

  function settingsOf(kidId) {
    const rows = Object.fromEntries(s.settings.all(kidId).map((r) => [r.game, r]));
    return Object.fromEntries(
      Object.entries(GAMES).map(([key, game]) => {
        const row = rows[key];
        if (!row) return [key, { ...game.defaults, levels: [...game.defaults.levels] }];
        let levels = null;
        try {
          levels = cleanLevels(game, JSON.parse(row.levels));
        } catch {
          /* ใช้ค่าเริ่มต้น */
        }
        return [key, { enabled: !!row.enabled, levels: levels ?? [...game.defaults.levels], every: row.every, stars: row.stars }];
      }),
    );
  }

  const dailyStarsOf = (kidId) => s.limit.get(kidId)?.daily_stars ?? DAILY_STARS_DEFAULT;
  const starsToday = (kidId, day) => s.todayStars.all(kidId, day).reduce((sum, r) => sum + r.stars, 0);

  function gamesOf(kidId, day = today()) {
    const settings = settingsOf(kidId);
    const rounds = Object.fromEntries(s.todayRounds.all(kidId, day).map((r) => [r.game, r]));
    const stars = Object.fromEntries(s.todayStars.all(kidId, day).map((r) => [r.game, r.stars]));
    const out = { dailyStars: dailyStarsOf(kidId), todayStars: Object.values(stars).reduce((a, b) => a + b, 0) };
    for (const key of Object.keys(GAMES)) {
      out[key] = {
        ...settings[key],
        best: s.best.get(kidId, key) ?? null,
        today: { rounds: rounds[key]?.rounds ?? 0, bestCorrect: rounds[key]?.bestCorrect ?? 0, stars: stars[key] ?? 0 },
      };
    }
    return out;
  }

  const router = express.Router();
  router.use(device);

  router.get('/', (req, res) => {
    const day = today();
    res.json({ kids: Object.fromEntries(s.kids.all().map(({ id }) => [id, gamesOf(id, day)])) });
  });

  router.post('/:game/rounds', (req, res) => {
    const key = req.params.game;
    const game = gameOf(key);
    const b = req.body ?? {};
    const kid = mustKid(b.kidId);
    const settings = settingsOf(kid.id)[key];
    if (!settings.enabled) throw bad('ผู้ปกครองปิดเกมนี้ไว้');
    const correct = inRange(b.correct, 'จำนวนข้อที่ถูก', 0, game.maxCorrect);
    const wrong = inRange(b.wrong, 'จำนวนข้อที่พลาด', 0, HEARTS);
    const bestCombo = inRange(b.bestCombo, 'คอมโบ', 0, correct);
    const score = inRange(b.score, 'คะแนน', 0, correct * game.maxPoints);
    const levels = cleanLevels(game, b.levels) ?? settings.levels;

    const day = today();
    const prevBest = s.best.get(kid.id, key)?.score ?? 0;
    const result = db.transaction(() => {
      const dailyStars = dailyStarsOf(kid.id);
      const before = starsToday(kid.id, day);
      const earned = Math.floor(correct / settings.every) * settings.stars;
      const stars = Math.max(0, Math.min(earned, dailyStars - before));
      const txId = stars ? awardStars(kid.id, stars, `${game.title} · ตอบถูก ${correct} ข้อ`, game.emoji) : null;
      s.insertRound.run({ kidId: kid.id, game: key, day, levels: JSON.stringify(levels), score, correct, wrong, bestCombo, txId });
      return { stars, earned, todayStars: before + stars, dailyStars, newBest: score > prevBest && score > 0 };
    })();
    db.prepare('DELETE FROM game_rounds WHERE day < ? AND tx_id IS NULL').run(dayFmt.format(new Date(Date.now() - 90 * 86_400_000)));
    changed('games');
    if (result.stars) {
      changed('stars');
      push.notify(
        { role: 'parent' },
        {
          title: `${game.emoji} ${kid.avatar} ${kid.name} ได้ ${result.stars} ดาวจาก${game.title}`,
          body: `ตอบถูก ${correct} ข้อ · วันนี้ได้ดาวจากมินิเกม ${result.todayStars}/${result.dailyStars}`,
          url: '/parent/manage?tab=games',
          tag: `games-${kid.id}-${day}`,
        },
      );
    }
    res.json(result);
  });

  function mountParent(P) {
    // บันทึกทีละเด็ก: เพดานดาวต่อวัน + ตั้งค่าของเกมที่ส่งมา (ส่งเฉพาะบางเกมได้)
    P.put('/games/:kidId', (req, res) => {
      const kid = mustKid(req.params.kidId);
      const b = req.body ?? {};
      const dailyStars = b.dailyStars === undefined ? null : inRange(b.dailyStars, 'ดาวสูงสุดต่อวัน', 0, 100);
      const rows = Object.entries(b.games ?? {}).map(([key, g]) => {
        const game = gameOf(key);
        const levels = cleanLevels(game, g?.levels);
        if (!levels) throw bad(`เลือกระดับของ${game.title}อย่างน้อย 1 ระดับ`);
        return {
          kidId: kid.id,
          game: key,
          enabled: g.enabled === false ? 0 : 1,
          levels: JSON.stringify(levels),
          every: inRange(g.every, 'จำนวนข้อ', 1, 100),
          stars: inRange(g.stars, 'จำนวนดาว', 1, 20),
        };
      });
      db.transaction(() => {
        if (dailyStars !== null) s.saveLimit.run(kid.id, dailyStars);
        for (const row of rows) s.saveSettings.run(row);
      })();
      changed('games');
      res.json({ ok: true });
    });
  }

  return { router, mountParent };
}
