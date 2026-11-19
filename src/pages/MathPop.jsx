// มินิเกม "ป๊อปลูกโป่ง": โจทย์อยู่บน ลูกโป่งตัวเลขลอยขึ้น แตะลูกที่ถูกก่อนหลุดจอ · 60 วิ · หัวใจ 3 ดวง · ตอบถูกติดกันได้คอมโบ
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { BALLOON_COLORS, HEARTS, LEVELS, ROUND_MS, isMuted, makeQuestion, setMuted, sfx, unlockAudio, useGames, wrongAnswers } from '../lib/mathgame.js';
import { Spinner, StarCount } from '../components/ui.jsx';

const multiplier = (streak) => Math.min(5, 1 + Math.floor(streak / 3));
// ลูกโป่งลอยเร็วขึ้นเรื่อยๆ ตามจำนวนข้อที่ตอบถูก
const riseSeconds = (correct) => Math.max(3.4, 7 - correct * 0.14);

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newQuestion(level, correct, qid) {
  const q = makeQuestion(level, correct);
  const values = shuffle([q.answer, ...wrongAnswers(q)]);
  const lanes = shuffle([0, 1, 2, 3]);
  const colors = shuffle(BALLOON_COLORS);
  const dur = riseSeconds(correct);
  return {
    ...q,
    id: qid,
    balloons: values.map((value, i) => ({
      id: `${qid}-${i}`,
      value,
      lane: lanes[i],
      jitter: Math.random() * 6 - 3,
      color: colors[i],
      delay: i === 0 ? 0 : Math.random() * 0.9,
      dur: dur + Math.random() * 0.8,
    })),
  };
}

const START = { phase: 'ready', hearts: HEARTS, score: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0, q: null, qid: 0, popped: {}, last: null, endReason: null };

function reducer(s, a) {
  switch (a.type) {
    case 'countdown':
      return { ...START, phase: 'countdown' };
    case 'play':
      return { ...s, phase: 'play', q: newQuestion(a.level, 0, 1), qid: 1 };
    case 'next':
      if (s.phase !== 'play') return s;
      return { ...s, q: newQuestion(a.level, s.correct, s.qid + 1), qid: s.qid + 1, popped: {} };
    case 'tap': {
      if (s.phase !== 'play' || s.popped[a.balloon.id] || s.popped.done) return s;
      if (a.balloon.value === s.q.answer) {
        const streak = s.streak + 1;
        const points = 10 * multiplier(streak);
        return {
          ...s,
          popped: { ...s.popped, [a.balloon.id]: 'ok', done: true },
          score: s.score + points,
          correct: s.correct + 1,
          streak,
          bestStreak: Math.max(s.bestStreak, streak),
          last: { kind: 'ok', points, x: a.x, y: a.y, at: Date.now() },
        };
      }
      const hearts = s.hearts - 1;
      return {
        ...s,
        popped: { ...s.popped, [a.balloon.id]: 'bad' },
        hearts,
        wrong: s.wrong + 1,
        streak: 0,
        last: { kind: 'bad', x: a.x, y: a.y, at: Date.now() },
        ...(hearts <= 0 && { phase: 'over', endReason: 'hearts' }),
      };
    }
    case 'escape': {
      // ลูกที่ถูกลอยหลุดจอไป = พลาด 1 หัวใจ แล้วขึ้นข้อใหม่
      if (s.phase !== 'play' || s.popped.done || a.balloon.value !== s.q.answer || s.q.id !== a.qid) return s;
      const hearts = s.hearts - 1;
      if (hearts <= 0) return { ...s, hearts, wrong: s.wrong + 1, streak: 0, phase: 'over', endReason: 'hearts', last: { kind: 'miss', at: Date.now() } };
      return { ...s, hearts, wrong: s.wrong + 1, streak: 0, last: { kind: 'miss', at: Date.now() }, q: newQuestion(a.level, s.correct, s.qid + 1), qid: s.qid + 1, popped: {} };
    }
    case 'timeup':
      return s.phase === 'play' ? { ...s, phase: 'over', endReason: 'time' } : s;
    default:
      return s;
  }
}

export default function MathPop() {
  const { id } = useParams();
  const { kidById } = useStore();
  const kid = kidById(id);
  const games = useGames();
  const [round, setRound] = useState(0);
  if (!kid) return <Navigate to="/" replace />;
  const back = `/kid/${kid.id}?tab=games`;
  if (!games.loaded) return <Spinner />;
  const math = games.math[kid.id];
  if (!math?.enabled) return <Navigate to={back} replace />;
  return <Game key={round} kid={kid} math={math} back={back} onAgain={() => setRound((r) => r + 1)} />;
}

function Game({ kid, math, back, onAgain }) {
  const level = math.level;
  const [s, dispatch] = useReducer(reducer, START);
  const [count, setCount] = useState(3);
  const [left, setLeft] = useState(ROUND_MS);
  const [hidden, setHidden] = useState(false);
  const [muted, setMute] = useState(isMuted);
  const [floaters, setFloaters] = useState([]);
  const [result, setResult] = useState(null);
  const field = useRef(null);
  const sent = useRef(false);

  // นับถอยหลัง 3-2-1
  useEffect(() => {
    if (s.phase !== 'countdown') return;
    if (count === 0) {
      sfx.go();
      dispatch({ type: 'play', level });
      return;
    }
    sfx.tick();
    const t = setTimeout(() => setCount((c) => c - 1), 700);
    return () => clearTimeout(t);
  }, [s.phase, count, level]);

  // เวลา 60 วิ — หยุดเดินตอนสลับไปแอปอื่น
  useEffect(() => {
    if (s.phase !== 'play' || hidden) return;
    let last = performance.now();
    const t = setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      setLeft((l) => Math.max(0, l - dt));
    }, 200);
    return () => clearInterval(t);
  }, [s.phase, hidden]);
  useEffect(() => {
    if (left === 0) dispatch({ type: 'timeup' });
  }, [left]);

  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // ตอบถูก → ข้อต่อไปหลังเห็นลูกโป่งแตกแป๊บนึง · เสียงตามผล
  useEffect(() => {
    if (!s.last) return;
    if (s.last.kind === 'ok') {
      sfx.pop(multiplier(s.streak));
      const t = setTimeout(() => dispatch({ type: 'next', level }), 320);
      setFloaters((f) => [...f.slice(-4), { id: s.last.at, text: `+${s.last.points}`, x: s.last.x, y: s.last.y, kind: 'ok' }]);
      return () => clearTimeout(t);
    }
    if (s.last.kind === 'bad') {
      sfx.wrong();
      setFloaters((f) => [...f.slice(-4), { id: s.last.at, text: '−❤️', x: s.last.x, y: s.last.y, kind: 'bad' }]);
    } else sfx.miss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.last]);

  // จบรอบ → ส่งผล
  useEffect(() => {
    if (s.phase !== 'over' || sent.current) return;
    sent.current = true;
    sfx.end();
    api
      .post('/api/games/math/rounds', { kidId: kid.id, level, score: s.score, correct: s.correct, wrong: s.wrong, bestCombo: s.bestStreak })
      .then(setResult)
      .catch((err) => setResult({ error: err.message }));
  }, [s.phase, s.score, s.correct, s.wrong, s.bestStreak, kid.id, level]);

  const start = () => {
    unlockAudio();
    setCount(3);
    setLeft(ROUND_MS);
    dispatch({ type: 'countdown' });
  };

  const tap = useCallback(
    (balloon, e) => {
      const box = field.current?.getBoundingClientRect();
      const r = e.currentTarget.getBoundingClientRect();
      dispatch({ type: 'tap', balloon, x: box ? r.left - box.left + r.width / 2 : 0, y: box ? r.top - box.top + r.height * 0.35 : 0 });
    },
    [dispatch],
  );

  const mult = multiplier(s.streak);
  const seconds = Math.ceil(left / 1000);

  return (
    <main className="pad-top pad-bottom mx-auto flex h-dvh max-w-md flex-col overflow-hidden px-4 pb-3 select-none">
      <header className="flex items-center gap-2 py-2">
        <Link to={back} className="btn btn-soft size-11 shrink-0 !p-0 text-lg" aria-label="ออกจากเกม">
          ✕
        </Link>
        <span className="flex shrink-0 text-lg" aria-label={`หัวใจ ${s.hearts} ดวง`}>
          {Array.from({ length: HEARTS }, (_, i) => (
            <span key={i} className={i < s.hearts ? '' : 'opacity-25 grayscale'}>
              ❤️
            </span>
          ))}
        </span>
        <span className={`ml-auto whitespace-nowrap rounded-full px-2.5 py-1 font-bold tabular ${seconds <= 10 && s.phase === 'play' ? 'bg-bad-soft text-bad' : 'bg-sunken'}`}>
          ⏱ {seconds}
        </span>
        <span className="whitespace-nowrap rounded-full bg-sunken px-2.5 py-1 font-bold tabular">⭐ {s.score}</span>
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
      </header>

      <section className="card mt-1 flex min-h-24 flex-col items-center justify-center px-4 py-3 text-center">
        {s.phase === 'play' && s.q ? (
          <>
            <p key={s.q.id} className="animate-pop text-5xl font-bold tabular" aria-live="polite">
              {s.q.text} = ?
            </p>
            <p className={`mt-1 h-6 text-sm font-bold ${mult > 1 ? 'text-purple-600' : 'text-mute'}`}>
              {mult > 1 ? `คอมโบ x${mult} 🔥` : s.streak > 0 ? `ถูกติดกัน ${s.streak} ข้อ` : 'แตะลูกโป่งที่เป็นคำตอบ!'}
            </p>
          </>
        ) : (
          <p className="text-2xl font-bold">🎈 ป๊อปลูกโป่ง</p>
        )}
      </section>

      <div
        ref={field}
        className={`balloon-field relative mt-3 flex-1 overflow-hidden rounded-3xl border-2 border-line bg-sunken ${hidden ? 'paused' : ''}`}
      >
        <span className="pointer-events-none absolute left-[8%] top-[12%] text-4xl opacity-40" aria-hidden="true">
          ☁️
        </span>
        <span className="pointer-events-none absolute right-[10%] top-[38%] text-5xl opacity-30" aria-hidden="true">
          ☁️
        </span>

        {s.phase === 'play' &&
          s.q?.balloons.map((b) => (
            <Balloon
              key={b.id}
              b={b}
              state={s.popped[b.id]}
              onTap={tap}
              onEscape={() => dispatch({ type: 'escape', balloon: b, qid: s.q.id, level })}
            />
          ))}

        {floaters.map((f) => (
          <span
            key={f.id}
            className={`balloon-floater pointer-events-none absolute text-2xl font-bold ${f.kind === 'ok' ? 'text-good' : 'text-bad'}`}
            style={{ left: f.x, top: f.y }}
            onAnimationEnd={() => setFloaters((list) => list.filter((x) => x.id !== f.id))}
          >
            {f.text}
          </span>
        ))}

        {s.phase === 'ready' && <ReadyCard kid={kid} math={math} onStart={start} />}
        {s.phase === 'countdown' && (
          <div className="absolute inset-0 grid place-items-center">
            <span key={count} className="animate-pop text-8xl font-bold text-purple-600">
              {count || 'ไป!'}
            </span>
          </div>
        )}
        {s.phase === 'over' && <ResultCard s={s} math={math} result={result} back={back} onAgain={onAgain} />}
      </div>
    </main>
  );
}

function Balloon({ b, state, onTap, onEscape }) {
  return (
    <button
      className={`balloon ${state === 'ok' ? 'balloon-popped' : state === 'bad' ? 'balloon-wrong' : ''}`}
      style={{
        left: `clamp(2px, calc(${b.lane * 25 + 12.5 + b.jitter}% - 42px), calc(100% - 86px))`,
        '--rise-dur': `${b.dur}s`,
        animationDuration: `${b.dur}s`,
        animationDelay: `${b.delay}s`,
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        if (!state) onTap(b, e);
      }}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && e.animationName === 'balloon-rise') onEscape();
      }}
      aria-label={`ลูกโป่ง ${b.value}`}
      disabled={!!state}
    >
      <span className="balloon-sway">
        <svg viewBox="0 0 100 132" width="84" height="111" aria-hidden="true">
          <path d="M50 4C23 4 7 25 7 50c0 27 23 46 43 50 20-4 43-23 43-50C93 25 77 4 50 4z" fill={state === 'bad' ? '#c9c2d6' : b.color} />
          <ellipse cx="33" cy="30" rx="9" ry="15" fill="#fff" opacity=".45" transform="rotate(-25 33 30)" />
          <path d="M44 100h12l-6 8z" fill={state === 'bad' ? '#c9c2d6' : b.color} />
          <path d="M50 108c-6 8 6 14 0 22" stroke="#8a7fa0" strokeWidth="1.6" fill="none" />
        </svg>
        <span className="balloon-num tabular">{b.value}</span>
        {state === 'ok' && (
          <span className="balloon-burst" aria-hidden="true">
            💥
          </span>
        )}
      </span>
    </button>
  );
}

function Mission({ math }) {
  if (math.today.rewarded) return <p className="font-semibold text-good">✅ ภารกิจวันนี้สำเร็จแล้ว — เล่นทำสถิติต่อได้</p>;
  return (
    <p className="flex flex-wrap items-center justify-center gap-1">
      🎯 ภารกิจวันนี้: ตอบถูก <b>{math.goal}</b> ข้อในรอบเดียว → <StarCount value={math.stars} size={16} />
    </p>
  );
}

function ReadyCard({ kid, math, onStart }) {
  const lv = LEVELS[math.level];
  return (
    <div className="absolute inset-0 grid place-items-center overflow-y-auto p-4">
      <div className="card w-full animate-pop px-5 pb-5 pt-5 text-center">
        <div className="text-6xl animate-float">🎈</div>
        <p className="mt-2 text-2xl font-bold">ป๊อปลูกโป่ง</p>
        <p className="mt-1 inline-block rounded-full bg-sunken px-3 py-1 text-sm font-semibold">
          {lv.emoji} {lv.label}
        </p>
        <p className="mt-3 text-[15px] text-mute">แตะลูกโป่งที่เป็นคำตอบ ก่อนมันลอยหนีไป! ตอบถูกติดกันได้คอมโบ คะแนนคูณเพิ่ม</p>
        <p className="mt-2 text-[15px] text-mute">⏱ 60 วินาที · ❤️ 3 ดวง</p>
        <div className="mt-3 rounded-2xl bg-sunken px-3 py-2.5 text-[15px]">
          <Mission math={math} />
          {math.best && (
            <p className="mt-1 text-mute">
              🏆 สถิติของ{kid.name}: {math.best.score} คะแนน
            </p>
          )}
        </div>
        <button className="btn btn-primary mt-4 w-full text-xl" onClick={onStart} autoFocus>
          เริ่มเลย! 🎈
        </button>
      </div>
    </div>
  );
}

function ResultCard({ s, math, result, back, onAgain }) {
  const reached = s.correct >= math.goal;
  return (
    <div className="absolute inset-0 grid place-items-center overflow-y-auto bg-scrim/30 p-4">
      <div className="card w-full animate-pop px-5 pb-5 pt-5 text-center">
        <div className="text-6xl">{result?.stars ? '🎉' : s.endReason === 'time' ? '⏰' : '💔'}</div>
        <p className="mt-1 text-xl font-bold">{s.endReason === 'time' ? 'หมดเวลา!' : 'หัวใจหมดแล้ว!'}</p>
        <p className="my-1 text-6xl font-bold tabular">{s.score}</p>
        <p className="text-mute">
          ตอบถูก {s.correct} ข้อ · ถูกติดกันสูงสุด {s.bestStreak} ข้อ
        </p>
        {result?.newBest && <p className="mt-2 text-lg font-bold text-purple-600">🏆 สถิติใหม่!</p>}
        <div className="mt-3 rounded-2xl bg-sunken px-3 py-2.5 text-[15px]">
          {!result ? (
            <p className="text-mute">กำลังส่งผล…</p>
          ) : result.error ? (
            <p className="text-bad">ส่งผลไม่สำเร็จ: {result.error}</p>
          ) : result.stars ? (
            <p className="flex items-center justify-center gap-1 font-bold text-good">
              🎯 ภารกิจวันนี้สำเร็จ! ได้ <StarCount value={result.stars} size={18} />
            </p>
          ) : math.today.rewarded ? (
            <p className="text-mute">✅ ภารกิจวันนี้ทำสำเร็จไปแล้ว</p>
          ) : reached ? (
            <p className="text-mute">ภารกิจวันนี้ทำสำเร็จไปแล้ว</p>
          ) : (
            <p className="text-mute">
              🎯 ภารกิจวันนี้: ตอบถูก {math.goal} ข้อในรอบเดียว (รอบนี้ {s.correct}) อีกนิดเดียว!
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
