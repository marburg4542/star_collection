// มินิเกม "ร้านค้า": ลูกค้ามาซื้อของ — แตะเหรียญ/แบงก์ใส่ถาดให้พอดี แล้วกดจ่าย/ทอน
// ระดับ 1–2 ช่วยลูกค้าหยิบเงินจ่ายพอดี · ระดับ 3–4 เด็กเป็นแม่ค้า ทอนเงินให้ลูกค้า
// ใช้เงินน้อยชิ้นที่สุดได้โบนัส · ผิดเสียหัวใจ (เงินในถาดยังอยู่ ปรับต่อได้) · ไม่จับเวลา เล่นจนหัวใจหมดหรือกดจบ
import { useEffect, useReducer, useState } from 'react';
import { HEARTS, multiplier, pick, sfx, starsLeftToday, unlockAudio } from '../lib/games.js';
import { makeOrder, minPieces } from '../lib/shopgame.js';
import { ExitButton, GameHeader, GamePage, Pill, ReadyCard, ResultCard, StarStrip, useSubmitRound } from '../components/GameKit.jsx';
import { num } from '../lib/format.js';

const MAX_TRAY = 40;
const BONUS = 5;

const START = { phase: 'ready', hearts: HEARTS, score: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0, order: null, n: 0, tray: [], feedback: null, endReason: null };
const sum = (list) => list.reduce((a, b) => a + b, 0);

function reducer(s, a) {
  const locked = s.phase !== 'play' || s.feedback?.kind === 'ok';
  switch (a.type) {
    case 'start':
      return { ...START, phase: 'play', order: makeOrder(pick(a.levels), 0, 1), n: 1 };
    case 'add':
      if (locked || s.tray.length >= MAX_TRAY) return s;
      return { ...s, tray: [...s.tray, a.value], feedback: null };
    case 'remove': {
      if (locked) return s;
      const i = s.tray.lastIndexOf(a.value);
      return i < 0 ? s : { ...s, tray: s.tray.filter((_, j) => j !== i), feedback: null };
    }
    case 'clear':
      return locked ? s : { ...s, tray: [], feedback: null };
    case 'submit': {
      if (locked || !s.tray.length || s.hearts <= 0) return s;
      const total = sum(s.tray);
      const { target, denoms } = s.order;
      if (total === target) {
        const streak = s.streak + 1;
        const points = 10 * multiplier(streak);
        const bonus = s.tray.length === minPieces(target, denoms) ? BONUS : 0;
        return {
          ...s,
          score: s.score + points + bonus,
          correct: s.correct + 1,
          streak,
          bestStreak: Math.max(s.bestStreak, streak),
          feedback: { kind: 'ok', points, bonus, at: Date.now() },
        };
      }
      return { ...s, hearts: s.hearts - 1, wrong: s.wrong + 1, streak: 0, feedback: { kind: 'bad', over: total > target, at: Date.now() } };
    }
    case 'next':
      if (s.phase !== 'play') return s;
      return { ...s, order: makeOrder(pick(a.levels), s.correct, s.n + 1), n: s.n + 1, tray: [], feedback: null };
    case 'out':
      return s.phase === 'play' && s.hearts <= 0 ? { ...s, phase: 'over', endReason: 'hearts' } : s;
    case 'end':
      return s.phase === 'play' ? { ...s, phase: 'over', endReason: 'quit' } : s;
    default:
      return s;
  }
}

export default function ShopGame() {
  return <GamePage game="shop">{(p) => <Game key={p.round} {...p} />}</GamePage>;
}

function Game({ kid, g, kg, back, onAgain }) {
  const [s, dispatch] = useReducer(reducer, START);
  const [starsLeft, setStarsLeft] = useState(0);
  const result = useSubmitRound('shop', s.phase === 'over', {
    kidId: kid.id,
    levels: g.levels,
    score: s.score,
    correct: s.correct,
    wrong: s.wrong,
    bestCombo: s.bestStreak,
  }, { onLeave: true });

  useEffect(() => {
    if (!s.feedback) return;
    if (s.feedback.kind === 'ok') {
      sfx.cash();
      const t = setTimeout(() => dispatch({ type: 'next', levels: g.levels }), 1300);
      return () => clearTimeout(t);
    }
    sfx.wrong();
    if (s.hearts <= 0) {
      const t = setTimeout(() => dispatch({ type: 'out' }), 1100);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.feedback]);

  const start = () => {
    unlockAudio();
    sfx.go();
    setStarsLeft(starsLeftToday(kg));
    dispatch({ type: 'start', levels: g.levels });
  };

  const o = s.order;
  const total = sum(s.tray);
  const playing = s.phase === 'play';
  const ok = s.feedback?.kind === 'ok';
  const mult = multiplier(s.streak);

  return (
    <main className="pad-top pad-bottom mx-auto flex h-dvh max-w-md flex-col overflow-hidden px-4 pb-3 select-none">
      <GameHeader
        hearts={s.hearts}
        exit={<ExitButton playing={playing} started={s.correct + s.wrong > 0} back={back} onEnd={() => dispatch({ type: 'end' })} />}
      >
        <Pill>🏅 {s.score}</Pill>
      </GameHeader>
      {s.phase !== 'ready' && <StarStrip correct={s.correct} g={g} left={starsLeft} />}

      <div className="relative mt-2 flex min-h-0 flex-1 flex-col gap-2.5">
        {o ? <Counter order={o} feedback={s.feedback} mult={mult} /> : <div className="card min-h-40 flex-1" />}

        {o && (
          <>
            <Tray order={o} tray={s.tray} total={total} locked={!playing || ok} onRemove={(v) => dispatch({ type: 'remove', value: v })} onClear={() => dispatch({ type: 'clear' })} />
            <div className="grid grid-cols-4 gap-2">
              {o.denoms.map((v) => (
                <button
                  key={v}
                  className="money-btn"
                  onClick={() => {
                    sfx.coin();
                    dispatch({ type: 'add', value: v });
                  }}
                  disabled={!playing || ok}
                  aria-label={`${v <= 10 ? 'เหรียญ' : 'แบงก์'} ${v} บาท`}
                >
                  <Money value={v} />
                </button>
              ))}
            </div>
            <button
              className="btn btn-primary w-full text-xl"
              onClick={() => dispatch({ type: 'submit' })}
              disabled={!playing || ok || !s.tray.length || s.hearts <= 0}
            >
              {o.mode === 'pay' ? `✓ จ่ายเงิน ${num(total)} บาท` : `✓ ทอนเงิน ${num(total)} บาท`}
            </button>
          </>
        )}

        {s.phase === 'ready' && (
          <ReadyCard game="shop" g={g} kg={kg} kid={kid} onStart={start} startLabel="เปิดร้าน! 🏪">
            <p>ลูกค้ามาซื้อของ แตะเหรียญหรือแบงก์ใส่ถาดให้พอดี แล้วกดจ่ายเงินหรือทอนเงิน ใช้เงินน้อยชิ้นที่สุดได้โบนัส!</p>
            <p>ไม่จับเวลา · ❤️ 3 ดวง · กด 🏁 จบ ได้ทุกเมื่อ</p>
          </ReadyCard>
        )}
        {s.phase === 'over' && (
          <ResultCard
            emoji={s.endReason === 'quit' ? '🏁' : '💔'}
            heading={s.endReason === 'quit' ? 'ปิดร้านแล้ว!' : 'หัวใจหมดแล้ว!'}
            score={s.score}
            detail={`ขายสำเร็จ ${s.correct} ครั้ง · ถูกติดกันสูงสุด ${s.bestStreak} ครั้ง`}
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

/** หน้าร้าน: ลูกค้า + คำพูด + ของบนเคาน์เตอร์ */
function Counter({ order: o, feedback, mult }) {
  const paid = sum(o.paid);
  const ok = feedback?.kind === 'ok';
  const bad = feedback?.kind === 'bad';
  const say = ok
    ? feedback.bonus
      ? 'ขอบคุณจ้า! เป๊ะมาก 💖'
      : 'ขอบคุณจ้า! 💖'
    : bad
      ? o.mode === 'pay'
        ? feedback.over
          ? 'เอ๊ะ! เงินเกินไปนะ'
          : 'เอ๊ะ! เงินยังไม่พอนะ'
        : feedback.over
          ? 'เอ๊ะ! ทอนเกินไปนะ'
          : 'เอ๊ะ! ทอนยังไม่ครบนะ'
      : o.mode === 'pay'
        ? `ช่วยหยิบเงินจ่ายค่า${o.items[0].name}ให้หน่อยจ้า`
        : o.items.length > 1
          ? 'ซื้อทั้งหมดนี้จ้า นี่เงินจ้า'
          : `ขอซื้อ${o.items[0].name}จ้า นี่เงินจ้า`;
  return (
    <section key={o.id} className={`card relative flex min-h-0 flex-1 animate-rise flex-col overflow-hidden px-3 pb-3 pt-3 ${bad ? 'animate-shake' : ''}`}>
      <div className="flex items-start gap-2">
        <span className={`shrink-0 text-6xl leading-none ${ok ? 'animate-pop' : ''}`} key={feedback?.at} aria-hidden="true">
          {o.customer}
        </span>
        <p
          className={`relative mt-1 min-w-0 flex-1 rounded-2xl border-2 border-line px-3 py-2 text-[15px] font-semibold ${ok ? 'bg-good-soft text-good' : bad ? 'bg-bad-soft text-bad' : 'bg-card'}`}
          aria-live="polite"
        >
          {say}
        </p>
      </div>

      {/* ของวางบนเคาน์เตอร์ */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-2">
        <div className="flex flex-wrap items-end justify-center gap-x-4 gap-y-1">
          {o.items.map((it, i) => (
            <span key={i} className="flex flex-col items-center gap-1">
              <span className={`${o.items.length > 1 ? 'text-5xl' : 'text-7xl'} leading-tight`} aria-hidden="true">
                {it.emoji}
              </span>
              <span className="rounded-lg bg-gold-200 px-2 py-0.5 text-sm font-bold tabular ring-1 ring-line/30">
                {it.name} {num(it.price)} ฿
              </span>
            </span>
          ))}
        </div>
        <span className="mt-2 h-3 w-11/12 rounded-full border-2 border-line bg-kid-peach" aria-hidden="true" />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 text-[15px] font-semibold">
        {o.mode === 'pay' ? (
          <span>
            หยิบเงินให้พอดี <b className="text-lg text-purple-600 tabular">{num(o.target)}</b> บาท
          </span>
        ) : (
          <>
            <span>ลูกค้าจ่ายมา</span>
            <span className="flex items-center gap-1">
              {groupPieces(o.paid).map(([v, n]) => (
                <span key={v} className="flex items-center">
                  <Money value={v} small />
                  {n > 1 && <span className="ml-0.5 text-sm font-bold">×{n}</span>}
                </span>
              ))}
            </span>
            <span className="tabular">({num(paid)} บาท) ทอนเท่าไหร่?</span>
          </>
        )}
      </div>

      {ok && (
        <span key={feedback.at} className="balloon-floater pointer-events-none absolute left-1/2 top-6 whitespace-nowrap text-2xl font-bold text-good">
          +{feedback.points}
          {feedback.bonus ? ` +${feedback.bonus} เป๊ะ!` : ''}
        </span>
      )}
      {!ok && !bad && mult > 1 && <span className="absolute right-3 top-2 text-sm font-bold text-purple-600">x{mult} 🔥</span>}
    </section>
  );
}

const groupPieces = (list) => {
  const counts = new Map();
  for (const v of list) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[0] - a[0]);
};

/** ถาดเงิน: แตะเงินในถาดเพื่อหยิบออกทีละชิ้น */
function Tray({ order, tray, total, locked, onRemove, onClear }) {
  const groups = groupPieces(tray);
  return (
    <section className="flex min-h-[76px] items-center gap-2 rounded-2xl border-2 border-dashed border-lilac bg-sunken px-2.5 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {groups.length === 0 ? (
          <span className="px-1 text-[15px] text-mute">{order.mode === 'pay' ? 'แตะเงินด้านล่างใส่ถาด' : 'แตะเงินด้านล่างเพื่อทอน'}</span>
        ) : (
          groups.map(([v, n]) => (
            <button key={v} className="relative" onClick={() => onRemove(v)} disabled={locked} aria-label={`เอา ${v} บาท ออก 1 ชิ้น (มี ${n})`}>
              <Money value={v} small />
              {n > 1 && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-ink px-1.5 text-xs font-bold text-white tabular">×{n}</span>}
            </button>
          ))
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs text-mute">{order.mode === 'pay' ? 'รวม' : 'ทอน'}</p>
        <p className="text-2xl font-bold leading-none tabular">{num(total)}</p>
        <button className="mt-1 text-sm font-semibold text-purple-600 underline-offset-2 hover:underline disabled:opacity-40" onClick={onClear} disabled={locked || !tray.length}>
          ล้าง
        </button>
      </div>
    </section>
  );
}

// ---------- หน้าตาเหรียญ/แบงก์ (วาดเอง ไม่ใช่รูปเงินจริง) ----------
const COINS = {
  1: { r: 15, face: '#eef0f3', rim: '#aab3bd' },
  2: { r: 16.5, face: '#f6d77a', rim: '#c99a2e' },
  5: { r: 18, face: '#eef0f3', rim: '#8e98a3', ring: true },
  10: { r: 19.5, face: '#f3cd5e', rim: '#c4ccd4', bimetal: true },
};
const NOTES = { 20: '#8fd19e', 50: '#8cc4f0', 100: '#f4a3a3', 500: '#c3a8ec', 1000: '#d9b98f' };

export function Money({ value, small = false }) {
  const coin = COINS[value];
  if (coin) {
    const size = (coin.r * 2 + 4) * (small ? 0.8 : 1.15);
    return (
      <svg viewBox="-22 -22 44 44" width={size} height={size} className="block" aria-hidden="true">
        <circle r={coin.r} fill={coin.bimetal ? '#d5dbe1' : coin.face} stroke="#2b2238" strokeWidth="1.6" />
        {coin.bimetal && <circle r={coin.r * 0.66} fill={coin.face} stroke={coin.rim} strokeWidth="1" />}
        {coin.ring && <circle r={coin.r - 3} fill="none" stroke={coin.rim} strokeWidth="1.2" />}
        <text y="5.5" textAnchor="middle" fontSize={value >= 10 ? 13 : 15} fontWeight="700" fill="#2b2238">
          {value}
        </text>
      </svg>
    );
  }
  const w = small ? 46 : 64;
  return (
    <svg viewBox="0 0 64 36" width={w} height={(w * 36) / 64} className="block" aria-hidden="true">
      <rect x="1" y="1" width="62" height="34" rx="5" fill={NOTES[value]} stroke="#2b2238" strokeWidth="1.6" />
      <rect x="5" y="5" width="54" height="26" rx="3" fill="none" stroke="#2b2238" strokeOpacity=".25" strokeWidth="1" />
      <circle cx="49" cy="18" r="7" fill="#fff" fillOpacity=".45" />
      <text x="26" y="24" textAnchor="middle" fontSize={value >= 1000 ? 15 : 17} fontWeight="700" fill="#2b2238">
        {value}
      </text>
    </svg>
  );
}
