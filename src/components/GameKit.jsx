// ชิ้นส่วนที่มินิเกมใช้ร่วมกัน: หน้าโหลดเกม, หัวเกม (หัวใจ/เสียง), แถบดาวระหว่างเล่น, การ์ดเริ่มเกม, การ์ดสรุปผล
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { GAMES, HEARTS, isMuted, setMuted, sfx, starsFor, starsLeftToday, useGames } from '../lib/games.js';
import { Spinner, StarCount } from './ui.jsx';

/** โหลดเด็ก + ตั้งค่าเกม แล้วส่งให้ render — เกมถูกปิดอยู่ก็กลับหน้ามินิเกม · round เปลี่ยน = เริ่มรอบใหม่ */
export function GamePage({ game, children }) {
  const { id } = useParams();
  const { kidById } = useStore();
  const kid = kidById(id);
  const games = useGames();
  const [round, setRound] = useState(0);
  if (!kid) return <Navigate to="/" replace />;
  const back = `/kid/${kid.id}?tab=games`;
  if (!games.loaded) return <Spinner />;
  const kg = games.kids[kid.id];
  const g = kg?.[game];
  if (!g?.enabled) return <Navigate to={back} replace />;
  return children({ kid, g, kg, back, round, onAgain: () => setRound((r) => r + 1) });
}

export function Hearts({ hearts }) {
  return (
    <span className="flex shrink-0 text-lg" aria-label={`หัวใจ ${hearts} ดวง`}>
      {Array.from({ length: HEARTS }, (_, i) => (
        <span key={i} className={i < hearts ? '' : 'opacity-25 grayscale'}>
          ❤️
        </span>
      ))}
    </span>
  );
}

export function MuteButton() {
  const [muted, setMute] = useState(isMuted);
  return (
    <button
      className="btn btn-soft size-11 shrink-0 !p-0 text-lg"
      onClick={() => {
        setMuted(!muted);
        setMute(!muted);
      }}
      aria-label={muted ? 'เปิดเสียง' : 'ปิดเสียง'}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

/** หัวเกม: [ปุ่มออก] ❤️❤️❤️ ……… [ป้ายต่างๆ] 🔊 */
export function GameHeader({ exit, hearts, children }) {
  return (
    <header className="flex items-center gap-2 py-2">
      {exit}
      <Hearts hearts={hearts} />
      <span className="ml-auto flex items-center gap-2">{children}</span>
      <MuteButton />
    </header>
  );
}

/** ปุ่มออก: ระหว่างเล่นเกมที่ไม่จับเวลา = 🏁 จบ (ส่งผลรอบนี้ · ยังไม่ได้ตอบสักข้อก็แค่กลับ) · นอกนั้น = ✕ กลับ */
export function ExitButton({ playing, started, back, onEnd }) {
  const navigate = useNavigate();
  if (!playing) {
    return (
      <Link to={back} className="btn btn-soft size-11 shrink-0 !p-0 text-lg" aria-label="ออกจากเกม">
        ✕
      </Link>
    );
  }
  return (
    <button className="btn btn-soft min-h-11 shrink-0 whitespace-nowrap px-3 text-[15px]" onClick={() => (started ? onEnd() : navigate(back))}>
      🏁 จบ
    </button>
  );
}

export const Pill = ({ className = 'bg-sunken', children }) => (
  <span className={`whitespace-nowrap rounded-full px-2.5 py-1 font-bold tabular ${className}`}>{children}</span>
);

/** แถบดาวระหว่างเล่น: ได้แล้วกี่ดาว + อีกกี่ข้อได้ดาวถัดไป (left = ดาวที่ยังได้วันนี้ ตอนเริ่มรอบ) */
export function StarStrip({ correct, g, left }) {
  const pending = left > 0 ? starsFor(correct, g, left) : 0;
  const prev = useRef(pending);
  const [gain, setGain] = useState(null);
  useEffect(() => {
    if (pending > prev.current) {
      sfx.star();
      setGain({ id: Date.now(), n: pending - prev.current });
    }
    prev.current = pending;
  }, [pending]);

  if (left <= 0) {
    return <p className="mt-1 rounded-full bg-sunken px-3 py-1.5 text-center text-sm font-semibold text-mute">วันนี้ได้ดาวจากมินิเกมครบแล้ว · เล่นทำสถิติต่อได้ 🏆</p>;
  }
  const into = correct % g.every;
  const full = pending >= left;
  return (
    <div className="relative mt-1 flex items-center gap-2 rounded-full bg-sunken px-3 py-1.5 text-sm font-semibold">
      <span key={`count-${gain?.id ?? 0}`} className={gain ? 'animate-pop' : ''}>
        <StarCount value={pending} size={18} />
      </span>
      {full ? (
        <span className="text-good">ครบดาววันนี้แล้ว 🎉</span>
      ) : (
        <>
          <span className="relative h-2.5 min-w-8 flex-1 overflow-hidden rounded-full border border-line/15 bg-card" aria-hidden="true">
            <span className="absolute inset-y-0 left-0 rounded-full bg-gold-400 transition-[width] duration-300" style={{ width: `${(into / g.every) * 100}%` }} />
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap text-mute">
            อีก {g.every - into} ข้อ → <StarCount value={g.stars} size={14} className="text-ink" />
          </span>
        </>
      )}
      {gain && (
        <span
          key={`gain-${gain.id}`}
          className="balloon-floater pointer-events-none absolute left-8 top-0 text-xl font-bold text-gold-600"
          onAnimationEnd={() => setGain(null)}
        >
          +{gain.n} ⭐
        </span>
      )}
    </div>
  );
}

/** กติกาดาวของเกมนี้ + ดาวที่ยังได้วันนี้ */
export function StarRule({ g, kg }) {
  const left = starsLeftToday(kg);
  if (!kg.dailyStars) return <p className="text-mute">เล่นสนุกๆ ทำสถิติ 🏆</p>;
  if (!left) return <p className="font-semibold text-good">✅ วันนี้ได้ดาวจากมินิเกมครบ {kg.dailyStars} ดวงแล้ว — เล่นทำสถิติต่อได้</p>;
  return (
    <>
      <p className="flex flex-wrap items-center justify-center gap-1">
        🎯 ตอบถูกทุก <b>{g.every}</b> ข้อในรอบเดียว → <StarCount value={g.stars} size={16} />
      </p>
      <p className="mt-0.5 text-sm text-mute">วันนี้ยังได้ดาวจากมินิเกมอีก {left} ดวง</p>
    </>
  );
}

export function LevelChips({ game, levels, className = '' }) {
  const meta = GAMES[game].levels;
  return (
    <span className={`flex flex-wrap justify-center gap-1.5 ${className}`}>
      {levels.map((l) => (
        <span key={l} className="rounded-full bg-sunken px-3 py-1 text-sm font-semibold">
          {meta[l].emoji} {meta[l].label}
        </span>
      ))}
    </span>
  );
}

/** การ์ดก่อนเริ่มเกม (วางทับพื้นที่เล่น) */
export function ReadyCard({ game, g, kg, kid, children, onStart, startLabel }) {
  const info = GAMES[game];
  return (
    <div className="absolute inset-0 z-10 grid place-items-center overflow-y-auto p-4">
      <div className="card w-full animate-pop px-5 pb-5 pt-5 text-center">
        <div className="text-6xl animate-float">{info.emoji}</div>
        <p className="mt-2 text-2xl font-bold">{info.title}</p>
        <LevelChips game={game} levels={g.levels} className="mt-2" />
        <div className="mt-3 space-y-1 text-[15px] text-mute">{children}</div>
        <div className="mt-3 rounded-2xl bg-sunken px-3 py-2.5 text-[15px]">
          <StarRule g={g} kg={kg} />
          {g.best && (
            <p className="mt-1 text-mute">
              🏆 สถิติของ{kid.name}: {g.best.score} คะแนน
            </p>
          )}
        </div>
        <button className="btn btn-primary mt-4 w-full text-xl" onClick={onStart} autoFocus>
          {startLabel}
        </button>
      </div>
    </div>
  );
}

/** การ์ดสรุปผลหลังจบรอบ — result มาจากเซิร์ฟเวอร์ ({ stars, earned, todayStars, dailyStars, newBest } หรือ { error }) */
export function ResultCard({ emoji, heading, score, detail, result, g, correct, back, onAgain }) {
  const left = result && !result.error ? result.dailyStars - result.todayStars : 0;
  return (
    <div className="absolute inset-0 z-10 grid place-items-center overflow-y-auto bg-scrim/30 p-4">
      <div className="card w-full animate-pop px-5 pb-5 pt-5 text-center">
        <div className="text-6xl">{result?.stars ? '🎉' : emoji}</div>
        <p className="mt-1 text-xl font-bold">{heading}</p>
        <p className="my-1 text-6xl font-bold tabular">{score}</p>
        <p className="text-mute">{detail}</p>
        {result?.newBest && <p className="mt-2 text-lg font-bold text-purple-600">🏆 สถิติใหม่!</p>}
        <div className="mt-3 rounded-2xl bg-sunken px-3 py-2.5 text-[15px]">
          {!result ? (
            <p className="text-mute">กำลังส่งผล…</p>
          ) : result.error ? (
            <p className="text-bad">ส่งผลไม่สำเร็จ: {result.error}</p>
          ) : result.stars ? (
            <>
              <p className="flex items-center justify-center gap-1 text-lg font-bold text-good">
                ได้ <StarCount value={result.stars} size={20} /> เก่งมาก!
              </p>
              {result.stars < result.earned && <p className="text-sm text-mute">(ครบดาวมินิเกมของวันนี้แล้ว)</p>}
            </>
          ) : !result.dailyStars ? (
            <p className="text-mute">เล่นทำสถิติ 🏆</p>
          ) : left <= 0 ? (
            <p className="text-mute">✅ วันนี้ได้ดาวจากมินิเกมครบ {result.dailyStars} ดวงแล้ว</p>
          ) : (
            <p className="flex flex-wrap items-center justify-center gap-1 text-mute">
              🎯 ตอบถูกทุก {g.every} ข้อในรอบเดียว ได้ <StarCount value={g.stars} size={14} className="text-ink" /> (รอบนี้ {correct}) อีกนิดเดียว!
            </p>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link to={back} className="btn btn-soft">
            กลับ
          </Link>
          <button className="btn btn-primary whitespace-nowrap text-lg" onClick={onAgain} autoFocus>
            เล่นอีก
          </button>
        </div>
      </div>
    </div>
  );
}

/** ส่งผลรอบนี้ครั้งเดียวเมื่อ over = true
 *  onLeave: เกมที่ไม่จับเวลา — ออกจากหน้ากลางรอบ (เช่นกดย้อนกลับ) ก็ยังส่งผลที่เล่นไปแล้ว ไม่ให้ดาวหาย */
export function useSubmitRound(game, over, payload, { onLeave = false } = {}) {
  const [result, setResult] = useState(null);
  const sent = useRef(false);
  const latest = useRef(payload);
  const body = JSON.stringify(payload);
  useEffect(() => {
    latest.current = JSON.parse(body);
  }, [body]);
  useEffect(() => {
    if (!over || sent.current) return;
    sent.current = true;
    sfx.end();
    api
      .post(`/api/games/${game}/rounds`, JSON.parse(body))
      .then(setResult)
      .catch((err) => setResult({ error: err.message }));
  }, [over, game, body]);
  useEffect(() => {
    if (!onLeave) return;
    return () => {
      const p = latest.current;
      if (sent.current || (!p.correct && !p.wrong)) return;
      sent.current = true;
      api.post(`/api/games/${game}/rounds`, p).catch(() => {});
    };
  }, [onLeave, game]);
  return result;
}
