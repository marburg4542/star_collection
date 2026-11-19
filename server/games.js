// มินิเกม "ป๊อปลูกโป่ง" (คณิต) — ผู้ปกครองตั้งระดับ/เป้าหมาย/ดาวต่อเด็ก · เด็กเล่นรอบละ 60 วิ
// ภารกิจวันนี้: ตอบถูกถึงเป้าในรอบเดียว → ได้ดาว วันละครั้ง (ผู้ปกครองยกเลิกดาวนั้น ทำใหม่ได้ดาวอีกครั้งในวันเดียวกัน)
// คะแนนคิดฝั่งเครื่องเด็ก — เซิร์ฟเวอร์ตรวจแค่ว่าเป็นไปได้จริง (เกมแบบเรียลไทม์ตรวจทีละข้อไม่ได้)
import express from 'express';
import { bad } from './validate.js';

const TZ = 'Asia/Bangkok';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const today = () => dayFmt.format(new Date());

export const MATH_LEVELS = [1, 2, 3, 4, 5];
export const MATH_DEFAULTS = { enabled: true, level: 2, goal: 15, stars: 1 };
const HEARTS = 3;
const ROUND_SEC = 60;
const MAX_COMBO_POINTS = 50; // 10 คะแนน × คอมโบสูงสุด x5

const int = (v) => (Number.isInteger(v) ? v : NaN);
function inRange(value, label, min, max) {
  const n = int(value);
  if (!(n >= min && n <= max)) throw bad(`${label}ต้องเป็นเลข ${min}–${max}`);
  return n;
}

export function createGames({ db, push, changed, mustKid, device, awardStars }) {
  const s = {
    settings: db.prepare('SELECT * FROM math_settings WHERE kid_id = ?'),
    saveSettings: db.prepare(`
      INSERT INTO math_settings (kid_id, enabled, level, goal, stars) VALUES (@kidId, @enabled, @level, @goal, @stars)
      ON CONFLICT(kid_id) DO UPDATE SET enabled = excluded.enabled, level = excluded.level, goal = excluded.goal, stars = excluded.stars`),
    kids: db.prepare('SELECT id FROM kids ORDER BY sort_order, id'),
    best: db.prepare('SELECT score, correct, created_at AS at FROM math_rounds WHERE kid_id = ? ORDER BY score DESC, id LIMIT 1'),
    todayStats: db.prepare('SELECT COUNT(*) AS rounds, COALESCE(MAX(correct), 0) AS bestCorrect FROM math_rounds WHERE kid_id = ? AND day = ?'),
    rewardedToday: db.prepare(`
      SELECT 1 FROM math_rounds r JOIN transactions t ON t.id = r.tx_id
      WHERE r.kid_id = ? AND r.day = ? AND t.voided_at IS NULL LIMIT 1`),
    insertRound: db.prepare(`
      INSERT INTO math_rounds (kid_id, day, level, score, correct, wrong, best_combo, tx_id)
      VALUES (@kidId, @day, @level, @score, @correct, @wrong, @bestCombo, @txId)`),
  };

  function settingsOf(kidId) {
    const row = s.settings.get(kidId);
    return row ? { enabled: !!row.enabled, level: row.level, goal: row.goal, stars: row.stars } : { ...MATH_DEFAULTS };
  }

  function mathOf(kidId, day = today()) {
    const t = s.todayStats.get(kidId, day);
    return {
      ...settingsOf(kidId),
      best: s.best.get(kidId) ?? null,
      today: { rounds: t.rounds, bestCorrect: t.bestCorrect, rewarded: !!s.rewardedToday.get(kidId, day) },
    };
  }

  const router = express.Router();
  router.use(device);

  router.get('/', (req, res) => {
    const day = today();
    res.json({ math: Object.fromEntries(s.kids.all().map(({ id }) => [id, mathOf(id, day)])) });
  });

  router.post('/math/rounds', (req, res) => {
    const kid = mustKid(req.body.kidId);
    const settings = settingsOf(kid.id);
    if (!settings.enabled) throw bad('ผู้ปกครองปิดเกมนี้ไว้');
    const b = req.body;
    const correct = inRange(b.correct, 'จำนวนข้อที่ถูก', 0, 300);
    const wrong = inRange(b.wrong, 'จำนวนข้อที่พลาด', 0, HEARTS);
    const bestCombo = inRange(b.bestCombo, 'คอมโบ', 0, correct);
    const score = inRange(b.score, 'คะแนน', 0, correct * MAX_COMBO_POINTS);
    const level = MATH_LEVELS.includes(b.level) ? b.level : settings.level;
    // ตอบได้ไม่เกิน ~2 ข้อต่อวินาทีในรอบ 60 วิ
    if (correct > ROUND_SEC * 2) throw bad('ผลการเล่นไม่ถูกต้อง');

    const day = today();
    const prevBest = s.best.get(kid.id)?.score ?? 0;
    const result = db.transaction(() => {
      const earn = correct >= settings.goal && !s.rewardedToday.get(kid.id, day);
      const txId = earn ? awardStars(kid.id, settings.stars, 'ภารกิจคณิตวันนี้ · ป๊อปลูกโป่ง', '🎈') : null;
      s.insertRound.run({ kidId: kid.id, day, level, score, correct, wrong, bestCombo, txId });
      return { stars: earn ? settings.stars : 0, goal: settings.goal, newBest: score > prevBest && score > 0 };
    })();
    db.prepare("DELETE FROM math_rounds WHERE day < ? AND tx_id IS NULL").run(dayFmt.format(new Date(Date.now() - 90 * 86_400_000)));
    changed('games');
    if (result.stars) {
      changed('stars');
      push.notify(
        { role: 'parent' },
        {
          title: `🎈 ${kid.avatar} ${kid.name} ทำภารกิจคณิตวันนี้สำเร็จ!`,
          body: `ป๊อปลูกโป่ง · ตอบถูก ${correct} ข้อ ได้ ${result.stars} ดาว`,
          url: '/parent/manage?tab=games',
          tag: `math-${kid.id}-${day}`,
        },
      );
    }
    res.json(result);
  });

  function mountParent(P) {
    P.put('/games/math/:kidId', (req, res) => {
      const kid = mustKid(req.params.kidId);
      const b = req.body ?? {};
      if (!MATH_LEVELS.includes(b.level)) throw bad('ระดับไม่ถูกต้อง');
      s.saveSettings.run({
        kidId: kid.id,
        enabled: b.enabled === false ? 0 : 1,
        level: b.level,
        goal: inRange(b.goal, 'เป้าหมาย', 1, 100),
        stars: inRange(b.stars, 'จำนวนดาว', 1, 20),
      });
      changed('games');
      res.json({ ok: true });
    });
  }

  return { router, mountParent };
}
