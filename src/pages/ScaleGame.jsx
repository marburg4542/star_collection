// มินิเกม "ตาชั่งตัวเลข": เลือกลูกตุ้มตัวเลขใส่ช่องว่าง ให้ตาชั่งสองฝั่งเท่ากัน
// ใส่ผิด → ตาชั่งเอียงให้เห็นว่าหนักหรือเบาไป เสียหัวใจ 1 ดวง แล้วลองข้อเดิมต่อ · ไม่จับเวลา เล่นจนหัวใจหมดหรือกดจบ
import { useEffect, useReducer, useState } from 'react';
import { HEARTS, multiplier, sfx, starsLeftToday, unlockAudio } from '../lib/games.js';
import { hasBlank, makePuzzle, sideValue, tiltFor } from '../lib/scalegame.js';
import { ExitButton, GameHeader, GamePage, Pill, ReadyCard, ResultCard, StarStrip, useSubmitRound } from '../components/GameKit.jsx';

const WEIGHT_COLORS = ['#b9a7ff', '#5fe3b5', '#ffb57d', '#6cc8ff'];
const SHOW_MS = 750; // ให้เห็นตาชั่งเอียง/ตั้งตรงก่อนไปต่อ

const START = { phase: 'ready', hearts: HEARTS, score: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0, puzzle: null, n: 0, placed: null, tried: [], feedback: null, endReason: null };

function reducer(s, a) {
  switch (a.type) {
    case 'start':
      return { ...START, phase: 'play', puzzle: makePuzzle(a.levels, 0, 1), n: 1 };
    case 'place': {
      if (s.phase !== 'play' || s.placed !== null || s.tried.includes(a.value)) return s;
      const p = s.puzzle;
      if (a.value === p.answer) {
        const streak = s.streak + 1;
        const points = 10 * multiplier(streak);
        return {
          ...s,
          placed: a.value,
          score: s.score + points,
          correct: s.correct + 1,
          streak,
          bestStreak: Math.max(s.bestStreak, streak),
          feedback: { kind: 'ok', points, at: Date.now() },
        };
      }
      // ฝั่งที่มีช่องว่างหนักกว่าอีกฝั่งไหม (ใช้บอกเด็กว่าหนักไปหรือเบาไป)
      const blankLeft = hasBlank(p.left);
      const mine = sideValue(blankLeft ? p.left : p.right, a.value);
      const other = sideValue(blankLeft ? p.right : p.left, a.value);
      return {
        ...s,
        placed: a.value,
        hearts: s.hearts - 1,
        wrong: s.wrong + 1,
        streak: 0,
        tried: [...s.tried, a.value],
        feedback: { kind: 'bad', heavy: mine > other, at: Date.now() },
      };
    }
    case 'settle':
      if (s.phase !== 'play' || s.placed === null) return s;
      if (s.feedback?.kind === 'ok') return { ...s, puzzle: makePuzzle(a.levels, s.correct, s.n + 1), n: s.n + 1, placed: null, tried: [], feedback: null };
      if (s.hearts <= 0) return { ...s, phase: 'over', endReason: 'hearts' };
      return { ...s, placed: null };
    case 'end':
      return s.phase === 'play' ? { ...s, phase: 'over', endReason: 'quit' } : s;
    default:
      return s;
  }
}

export default function ScaleGame() {
  return <GamePage game="scale">{(p) => <Game key={p.round} {...p} />}</GamePage>;
}

function Game({ kid, g, kg, back, onAgain }) {
  const [s, dispatch] = useReducer(reducer, START);
  const [starsLeft, setStarsLeft] = useState(0);
  const result = useSubmitRound('scale', s.phase === 'over', {
    kidId: kid.id,
    levels: g.levels,
    score: s.score,
    correct: s.correct,
    wrong: s.wrong,
    bestCombo: s.bestStreak,
  }, { onLeave: true });

  // หลังวางลูกตุ้ม: เสียงตามผล แล้วรอให้เห็นตาชั่งก่อนไปข้อต่อไป / เอาลูกตุ้มออก
  useEffect(() => {
    if (!s.feedback) return;
    if (s.feedback.kind === 'ok') sfx.pop(multiplier(s.streak));
    else sfx.clunk();
    const t = setTimeout(() => dispatch({ type: 'settle', levels: g.levels }), s.feedback.kind === 'ok' ? SHOW_MS : SHOW_MS + 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.feedback]);

  const start = () => {
    unlockAudio();
    sfx.go();
    setStarsLeft(starsLeftToday(kg));
    dispatch({ type: 'start', levels: g.levels });
  };

  const p = s.puzzle;
  const tilt = p && s.placed !== null ? tiltFor(p, s.placed) : 0;
  const mult = multiplier(s.streak);
  const playing = s.phase === 'play';
  const message = !playing
    ? ''
    : s.feedback?.kind === 'ok' && s.placed !== null
      ? 'เท่ากันพอดี! ✨'
      : s.feedback?.kind === 'bad' && s.placed !== null
        ? s.feedback.heavy
          ? 'หนักไปนิด! ลองเลขอื่นนะ'
          : 'เบาไปนิด! ลองเลขอื่นนะ'
        : mult > 1
          ? `คอมโบ x${mult} 🔥`
          : 'เลือกลูกตุ้มใส่ช่อง ? ให้ตาชั่งเท่ากัน';

  return (
    <main className="pad-top pad-bottom mx-auto flex h-dvh max-w-md flex-col overflow-hidden px-4 pb-3 select-none">
      <GameHeader
        hearts={s.hearts}
        exit={<ExitButton playing={playing} started={s.correct + s.wrong > 0} back={back} onEnd={() => dispatch({ type: 'end' })} />}
      >
        <Pill>🏅 {s.score}</Pill>
      </GameHeader>
      {s.phase !== 'ready' && <StarStrip correct={s.correct} g={g} left={starsLeft} />}

      <div className="relative mt-2 flex min-h-0 flex-1 flex-col">
        <p
          className={`h-7 text-center text-lg font-bold ${s.feedback?.kind === 'ok' && s.placed !== null ? 'text-good' : s.feedback?.kind === 'bad' && s.placed !== null ? 'text-bad' : mult > 1 ? 'text-purple-600' : 'text-mute'}`}
          aria-live="polite"
        >
          {message}
        </p>
        <div className="grid min-h-0 flex-1 place-items-center">
          {p ? <Scale key={p.id} puzzle={p} placed={s.placed} tilt={tilt} /> : <Scale puzzle={null} placed={null} tilt={0} />}
        </div>

        {p && (
          <div className="grid grid-cols-4 gap-2.5 pt-2">
            {p.options.map((v, i) => {
              const tried = s.tried.includes(v);
              const used = s.placed === v;
              return (
                <button
                  key={`${p.id}-${v}`}
                  className={`weight-btn ${tried ? 'opacity-35' : ''} ${used ? 'invisible' : ''}`}
                  onClick={() => dispatch({ type: 'place', value: v })}
                  disabled={!playing || tried || s.placed !== null}
                  aria-label={`ลูกตุ้ม ${v}${tried ? ' (ลองแล้ว)' : ''}`}
                >
                  <Weight value={v} color={WEIGHT_COLORS[i % WEIGHT_COLORS.length]} crossed={tried} />
                </button>
              );
            })}
          </div>
        )}

        {s.feedback?.kind === 'ok' && s.placed !== null && (
          <span key={s.feedback.at} className="balloon-floater pointer-events-none absolute left-1/2 top-10 text-3xl font-bold text-good">
            +{s.feedback.points}
          </span>
        )}

        {s.phase === 'ready' && (
          <ReadyCard game="scale" g={g} kg={kg} kid={kid} onStart={start} startLabel="เริ่มเลย! ⚖️">
            <p>เลือกลูกตุ้มตัวเลขใส่ช่อง ? ให้ตาชั่งสองฝั่งเท่ากันพอดี ถ้าใส่ผิด ตาชั่งจะเอียงบอกว่าหนักหรือเบาไป</p>
            <p>ไม่จับเวลา · ❤️ 3 ดวง · กด 🏁 จบ ได้ทุกเมื่อ</p>
          </ReadyCard>
        )}
        {s.phase === 'over' && (
          <ResultCard
            emoji={s.endReason === 'quit' ? '🏁' : '💔'}
            heading={s.endReason === 'quit' ? 'จบรอบแล้ว!' : 'หัวใจหมดแล้ว!'}
            score={s.score}
            detail={`ตอบถูก ${s.correct} ข้อ · ถูกติดกันสูงสุด ${s.bestStreak} ข้อ`}
            result={result}
            g={g}
            correct={s.correct}
            back={back}
            onAgain={onAgain}
          />
        )}
      </div>
    </main>
  );
}

/** ลูกตุ้มทรงกาต้มน้ำ มีเลขอยู่ตรงกลาง */
function Weight({ value, color, crossed = false, small = false }) {
  const size = small ? 46 : 64;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className="mx-auto block" aria-hidden="true">
      <path d="M22 18a10 10 0 0 1 20 0" fill="none" stroke="#2b2238" strokeWidth="5" strokeLinecap="round" />
      <path d="M14 22h36l8 36H6z" fill={color} stroke="#2b2238" strokeWidth="3" strokeLinejoin="round" />
      <text x="32" y="48" textAnchor="middle" fontSize={String(value).length > 2 ? 17 : 21} fontWeight="700" fill="#2b2238" className="tabular">
        {value}
      </text>
      {crossed && <path d="M10 26l44 30" stroke="#d93d63" strokeWidth="4" strokeLinecap="round" />}
    </svg>
  );
}

// ---------- ตาชั่ง (SVG ทั้งชุด ย่อ/ขยายตามจอ) ----------
const PIVOT = { x: 160, y: 58 };
const ARM = 100; // จากจุดหมุนถึงตะขอจาน
const FONT = 22;
const charW = FONT * 0.62;

/** ตัวเลข/เครื่องหมายในการ์ดบนจาน: [{ kind: 'text' | 'blank', text, w }] */
function tokens(side, placed) {
  const num = (v) => ({ kind: 'text', text: String(v), w: String(v).length * charW });
  if ('n' in side) return [num(side.n)];
  const blank = { kind: 'blank', text: placed === null ? '?' : String(placed), w: Math.max(30, (placed === null ? 1 : String(placed).length) * charW + 14) };
  return [side.a === null ? blank : num(side.a), { kind: 'text', text: side.op, w: charW }, side.b === null ? blank : num(side.b)];
}

function PanCard({ side, placed, ok }) {
  const items = tokens(side, placed);
  const gap = 6;
  const inner = items.reduce((sum, t) => sum + t.w, 0) + gap * (items.length - 1);
  const w = Math.max(64, inner + 22);
  let x = -inner / 2;
  return (
    <g>
      <rect x={-w / 2} y={36} width={w} height={48} rx={14} fill="#fff" stroke="#2b2238" strokeWidth="2.5" />
      {items.map((t, i) => {
        const cx = x + t.w / 2;
        x += t.w + gap;
        if (t.kind === 'blank') {
          const filled = placed !== null;
          return (
            <g key={i}>
              <rect
                x={cx - t.w / 2}
                y={45}
                width={t.w}
                height={30}
                rx={9}
                fill={filled ? (ok ? '#e2f5ec' : '#fde7ed') : '#f4edfd'}
                stroke={filled ? (ok ? '#1e9466' : '#d93d63') : '#8b67c9'}
                strokeWidth="2"
                strokeDasharray={filled ? undefined : '5 4'}
              />
              <text x={cx} y={68} textAnchor="middle" fontSize={FONT} fontWeight="700" fill={filled ? '#2b2238' : '#6f4db0'}>
                {t.text}
              </text>
            </g>
          );
        }
        return (
          <text key={i} x={cx} y={68} textAnchor="middle" fontSize={FONT} fontWeight="700" fill="#2b2238">
            {t.text}
          </text>
        );
      })}
    </g>
  );
}

function Pan({ side, placed, ok, dx, dy, idle, which }) {
  return (
    <g className="scale-move" style={{ transform: `translate(${dx}px, ${dy}px)` }}>
      {/* ตอนรอคำตอบ จานขยับขึ้นลงตามคานที่โยกเบาๆ */}
      <g className={idle ? `scale-idle-${which}` : undefined}>
        <path d="M0 0L-52 94M0 0L52 94" stroke="#75698a" strokeWidth="2" fill="none" />
        <circle r="5" fill="#2b2238" />
        {side && <PanCard side={side} placed={placed} ok={ok} />}
        <path d="M-62 92Q0 118 62 92Z" fill="#ffd04d" stroke="#2b2238" strokeWidth="2.5" strokeLinejoin="round" />
      </g>
    </g>
  );
}

function Scale({ puzzle, placed, tilt }) {
  const idle = puzzle === null || placed === null;
  const rad = (tilt * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const leftX = PIVOT.x - ARM * cos;
  const leftY = PIVOT.y - ARM * sin;
  const rightX = PIVOT.x + ARM * cos;
  const rightY = PIVOT.y + ARM * sin;
  const ok = puzzle !== null && placed === puzzle.answer;
  const blankLeft = puzzle ? hasBlank(puzzle.left) : false;
  return (
    <svg viewBox="0 0 320 250" className="block h-full max-h-[340px] w-full" role="img" aria-label={puzzle ? 'ตาชั่ง' : undefined}>
      {/* ฐานและเสา */}
      <path d="M120 240h80l-12-14h-56z" fill="#cdb8f0" stroke="#2b2238" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="153" y={PIVOT.y} width="14" height="170" rx="6" fill="#ebe0fb" stroke="#2b2238" strokeWidth="2.5" />
      {/* คาน */}
      <g className={idle ? 'scale-idle-beam' : 'scale-move'} style={{ transform: `rotate(${tilt}deg)`, transformOrigin: `${PIVOT.x}px ${PIVOT.y}px` }}>
        <rect x={PIVOT.x - ARM - 10} y={PIVOT.y - 6} width={(ARM + 10) * 2} height="12" rx="6" fill="#8b67c9" stroke="#2b2238" strokeWidth="2.5" />
      </g>
      <circle cx={PIVOT.x} cy={PIVOT.y} r="10" fill="#ffd04d" stroke="#2b2238" strokeWidth="2.5" />
      {/* จาน (ตะขอห้อยที่ปลายคาน) */}
      <Pan which="left" side={puzzle?.left} placed={blankLeft ? placed : null} ok={ok} dx={leftX} dy={leftY} idle={idle} />
      <Pan which="right" side={puzzle?.right} placed={blankLeft ? null : placed} ok={ok} dx={rightX} dy={rightY} idle={idle} />
    </svg>
  );
}
