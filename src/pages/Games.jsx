// หน้ามินิเกมของเด็ก: เลือกเกม (แท็บในหน้าเด็ก) + หน้ารวมชุดคำศัพท์
import { Link, Navigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { KID_COLORS } from '../lib/constants.js';
import { GAMES, GAME_KEYS, starsLeftToday } from '../lib/games.js';
import { WEEK_STATUS, todayKey, useVocab, weekLabel, weekStatus } from '../lib/vocab.js';
import { Empty, Spinner, Star, StarCount } from '../components/ui.jsx';
import { WordPicture } from '../components/Vocab.jsx';

/** ชุดคำศัพท์ที่เด็กคนนี้เล่นได้ตอนนี้ (ถึงสัปดาห์แล้ว และมีคำอยู่) */
export const vocabSetsFor = (sets, kidId) => {
  const today = todayKey();
  return sets.filter((s) => s.kidIds.includes(kidId) && s.words.length && s.weekStart <= today);
};

function GameCard({ to, emoji, color, title, sub, children, cta }) {
  return (
    <Link
      to={to}
      className="card block overflow-hidden px-4 pb-4 pt-4 transition-transform active:scale-[0.98]"
      style={{ background: `radial-gradient(130% 120% at 0% 0%, ${color}55, transparent 62%), var(--color-card)` }}
    >
      <span className="flex items-center gap-3">
        <span className="grid size-16 shrink-0 place-items-center rounded-3xl text-4xl" style={{ background: `${color}66` }} aria-hidden="true">
          {emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xl font-bold">{title}</span>
          <span className="block text-sm text-mute">{sub}</span>
        </span>
      </span>
      {children && <span className="mt-3 block rounded-2xl bg-card/70 px-3 py-2 text-[15px]">{children}</span>}
      <span className="btn btn-primary mt-3 w-full text-lg">{cta}</span>
    </Link>
  );
}

/** ระดับที่เลือกไว้ แบบสั้น: 1–2 ระดับบอกชื่อ · มากกว่านั้นบอกแค่อีโมจิ */
export function levelsText(game, levels) {
  const meta = GAMES[game].levels;
  if (levels.length <= 2) return levels.map((l) => `${meta[l].emoji} ${meta[l].label}`).join(' · ');
  return `${levels.map((l) => meta[l].emoji).join(' ')} คละ ${levels.length} ระดับ`;
}

/** แท็บ "มินิเกม" ในหน้าเด็ก */
export function GamesHub({ kid, kg, sets }) {
  const newSets = sets.filter((s) => !s.results[kid.id]?.passed).length;
  const left = starsLeftToday(kg);
  const anyMath = GAME_KEYS.some((k) => kg?.[k]?.enabled);
  return (
    <div className="space-y-3">
      {anyMath && kg.dailyStars > 0 && (
        <p className="flex flex-wrap items-center justify-center gap-1.5 rounded-2xl bg-gold-200 px-3 py-2 text-[15px] font-semibold ring-1 ring-line/20">
          <Star size={18} /> ดาวจากมินิเกมวันนี้
          <b className="tabular">
            {kg.todayStars}/{kg.dailyStars}
          </b>
          {left === 0 && <span className="text-good">✅ ครบแล้ว เล่นทำสถิติต่อได้</span>}
        </p>
      )}
      {GAME_KEYS.map((key) => {
        const g = kg?.[key];
        if (!g?.enabled) return null;
        const info = GAMES[key];
        return (
          <GameCard key={key} to={`/kid/${kid.id}/games/${key}`} emoji={info.emoji} color={info.color} title={info.title} sub={info.sub} cta={`เล่นเลย ${info.emoji}`}>
            <span className="block font-semibold">{levelsText(key, g.levels)}</span>
            {kg.dailyStars > 0 && left > 0 && (
              <span className="mt-0.5 flex flex-wrap items-center gap-1">
                🎯 ตอบถูกทุก {g.every} ข้อในรอบเดียว → <StarCount value={g.stars} size={15} />
              </span>
            )}
            {(g.best || g.today.stars > 0) && (
              <span className="mt-0.5 flex flex-wrap items-center gap-1 text-sm text-mute">
                {g.best && `🏆 สถิติ ${g.best.score} คะแนน`}
                {g.today.stars > 0 && (
                  <>
                    {g.best && ' · '}วันนี้ได้ <StarCount value={g.today.stars} size={13} className="text-ink" />
                  </>
                )}
              </span>
            )}
          </GameCard>
        );
      })}
      {sets.length > 0 && (
        <GameCard
          to={`/kid/${kid.id}/games/vocab`}
          emoji="📚"
          color={KID_COLORS.lavender.hex}
          title="ทายคำศัพท์"
          sub="ท่องบัตรคำ แล้วทำภารกิจ"
          cta="เลือกชุดคำ 📚"
        >
          {sets.length} ชุด{newSets > 0 ? ` · 🆕 ภารกิจที่ยังไม่สำเร็จ ${newSets} ชุด` : ' · ✅ ทำสำเร็จครบแล้ว'}
        </GameCard>
      )}
    </div>
  );
}

/** หน้ารวมชุดคำศัพท์ (/kid/:id/games/vocab) */
export function VocabGame() {
  const { id } = useParams();
  const { kidById } = useStore();
  const kid = kidById(id);
  const vocab = useVocab();
  if (!kid) return <Navigate to="/" replace />;
  const sets = vocabSetsFor(vocab.sets, kid.id);

  return (
    <main className="pad-top mx-auto max-w-md px-4 pb-12">
      <header className="flex items-center gap-3 py-2">
        <Link to={`/kid/${kid.id}?tab=games`} className="btn btn-soft min-h-11 shrink-0 px-4 text-[15px]">
          ← มินิเกม
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-right text-xl font-bold">📚 ทายคำศัพท์</h1>
      </header>
      <div className="mt-3">
        {!vocab.loaded ? (
          <Spinner />
        ) : sets.length === 0 ? (
          <Empty emoji="📚" title="ยังไม่มีชุดคำศัพท์">
            ให้ผู้ปกครองเพิ่มคำศัพท์ในหน้าตั้งค่า
          </Empty>
        ) : (
          <VocabSets kid={kid} sets={sets} />
        )}
      </div>
    </main>
  );
}

function VocabSets({ kid, sets }) {
  return (
    <ul className="space-y-3">
      {sets.map((s) => {
        const status = WEEK_STATUS[weekStatus(s.weekStart)];
        const r = s.results[kid.id];
        return (
          <li key={s.id} className="card px-4 pb-4 pt-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-xs font-semibold ${status.cls}`}>
                  {status.label} · {weekLabel(s.weekStart)}
                </p>
                <p className="truncate text-xl font-bold">{s.title}</p>
                <p className="flex flex-wrap items-center gap-1 text-sm text-mute">
                  {s.words.length} คำ · ถูก {s.passPct}% ขึ้นไป ได้ <StarCount value={s.stars} size={14} className="text-ink" />
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${r?.passed ? 'bg-good-soft text-good' : r ? 'bg-sunken' : 'bg-pink-50 text-purple-600'}`}
              >
                {r?.passed ? '✅ สำเร็จแล้ว' : r ? `ดีที่สุด ${Math.round(r.best * 100)}%` : '🆕 ใหม่'}
              </span>
            </div>
            <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1" aria-hidden="true">
              {s.words.slice(0, 8).map((w) => (
                <WordPicture key={w.id} word={w} size={40} />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <Link to={`/kid/${kid.id}/vocab/${s.id}`} className="btn btn-soft">
                🃏 บัตรคำ
              </Link>
              <Link to={`/kid/${kid.id}/vocab/${s.id}?mode=test`} className="btn btn-primary">
                🎯 ภารกิจ
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
