// เด็ก: ท่องบัตรคำ (?mode=cards) และทำภารกิจ (?mode=test) ของชุดคำศัพท์หนึ่งชุด
import { useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { canSpeak, passCount, shuffle, speak, speakLetters, useVocab } from '../lib/vocab.js';
import { Spinner, StarCount } from '../components/ui.jsx';
import { WordPicture } from '../components/Vocab.jsx';

export default function VocabPlay() {
  const { id, setId } = useParams();
  const [params] = useSearchParams();
  const mode = params.get('mode') === 'test' ? 'test' : 'cards';
  const { kidById } = useStore();
  const kid = kidById(id);
  const { sets, loaded } = useVocab();
  const set = sets.find((s) => s.id === Number(setId));
  const [round, setRound] = useState(0);

  if (!kid) return <Navigate to="/" replace />;
  const back = `/kid/${kid.id}/games/vocab`;
  if (!loaded) return <Spinner />;
  if (!set || !set.words.length || !set.kidIds.includes(kid.id)) return <Navigate to={back} replace />;

  return (
    <main className="pad-top pad-bottom mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-6">
      <header className="flex items-center gap-3 py-2">
        <Link to={back} className="btn btn-soft min-h-11 shrink-0 px-4 text-[15px]">
          ← กลับ
        </Link>
        <p className="min-w-0 flex-1 truncate text-right font-bold">
          {mode === 'test' ? '🎯 ภารกิจ' : '🃏 บัตรคำ'} · {set.title}
        </p>
      </header>
      {mode === 'cards' ? (
        <Flashcards key={set.id} set={set} />
      ) : (
        <Test key={`${set.id}-${round}`} set={set} sets={sets} kid={kid} back={back} onRetry={() => setRound((r) => r + 1)} />
      )}
    </main>
  );
}

function Progress({ value, total, label }) {
  return (
    <div className="mt-1">
      <div className="flex justify-between text-sm text-mute">
        <span>{label}</span>
        <span className="tabular">
          {value} / {total}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full bg-purple-500 transition-[width] duration-300" style={{ width: `${(value / total) * 100}%` }} />
      </div>
    </div>
  );
}

function SpeakButtons({ word, example }) {
  if (!canSpeak) return null;
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-2">
      <button className="btn btn-soft min-h-11 px-4" onClick={() => speak(word)}>
        🔊 ฟังเสียง
      </button>
      <button className="btn btn-soft min-h-11 px-4" onClick={() => speakLetters(word)}>
        🔤 ฟังสะกด
      </button>
      {example && (
        <button className="btn btn-soft min-h-11 px-4" onClick={() => speak(example, 0.85)}>
          💬 ฟังประโยค
        </button>
      )}
    </div>
  );
}

// ---------- บัตรคำ ----------

function Flashcards({ set }) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const navigate = useNavigate();
  const words = set.words;
  const at = Math.min(i, words.length - 1);
  const w = words[at];
  const last = at === words.length - 1;
  const go = (n) => {
    setI(n);
    setFlipped(false);
  };

  return (
    <>
      <Progress value={at + 1} total={words.length} label="บัตรคำ" />
      <button
        onClick={() => setFlipped((f) => !f)}
        className="card mt-4 flex min-h-[400px] w-full flex-col items-center justify-center px-5 py-6 text-center active:scale-[0.99]"
        aria-label={flipped ? 'แตะเพื่อกลับไปดูคำศัพท์' : 'แตะเพื่อดูคำแปล'}
      >
        {!flipped ? (
          <span key={`f${w.id}`} className="flex animate-pop flex-col items-center gap-4">
            <WordPicture word={w} size={180} />
            <span className="text-5xl font-bold break-all" lang="en">
              {w.word}
            </span>
            <span className="text-sm text-mute">แตะเพื่อดูคำแปล 👆</span>
          </span>
        ) : (
          <span key={`b${w.id}`} className="flex w-full animate-pop flex-col items-center gap-3">
            <WordPicture word={w} size={84} />
            <span className="text-4xl font-bold">{w.meaning}</span>
            <span className="text-2xl font-semibold text-mute" lang="en">
              {w.word}
            </span>
            {w.example && (
              <span className="mt-2 w-full rounded-2xl bg-sunken px-4 py-3 text-left text-[17px]" lang="en">
                {w.example}
              </span>
            )}
            <span className="text-sm text-mute">แตะเพื่อกลับไปดูคำศัพท์</span>
          </span>
        )}
      </button>
      <SpeakButtons word={w.word} example={flipped ? w.example : null} />
      <div className="mt-auto flex gap-3 pt-5">
        <button className="btn btn-soft flex-1" onClick={() => go(at - 1)} disabled={at === 0}>
          ← ก่อนหน้า
        </button>
        {last ? (
          <button className="btn btn-primary flex-[1.4] text-lg" onClick={() => navigate('?mode=test', { replace: true })}>
            ทำภารกิจ 🎯
          </button>
        ) : (
          <button className="btn btn-primary flex-[1.4] text-lg" onClick={() => go(at + 1)}>
            ถัดไป →
          </button>
        )}
      </div>
    </>
  );
}

// ---------- ภารกิจ ----------

/** สลับข้อ ครึ่งหนึ่งเลือกคำแปล (4 ตัวเลือก) อีกครึ่งพิมพ์สะกด — ตัวเลือกหลอกเอาจากชุดเดียวกันก่อน ไม่พอค่อยเอาจากชุดอื่น */
function buildQuestions(set, sets) {
  const others = (w) => {
    const same = shuffle([...new Set(set.words.map((x) => x.meaning))].filter((m) => m !== w.meaning)).slice(0, 3);
    const pool = [...new Set(sets.flatMap((s) => s.words.map((x) => x.meaning)))].filter((m) => m !== w.meaning && !same.includes(m));
    return [...same, ...shuffle(pool).slice(0, 3 - same.length)];
  };
  const offset = Math.random() < 0.5 ? 0 : 1;
  return shuffle(set.words).map((w, i) => {
    const wrong = others(w);
    const mode = wrong.length && (i + offset) % 2 === 0 ? 'choice' : 'spell';
    return { word: w, mode, options: mode === 'choice' ? shuffle([w.meaning, ...wrong]) : null };
  });
}

const normalize = (s) =>
  s
    .normalize('NFKC')
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

function Test({ set, sets, kid, back, onRetry }) {
  const questions = useMemo(() => buildQuestions(set, sets), []); // eslint-disable-line react-hooks/exhaustive-deps -- สุ่มครั้งเดียวต่อรอบ
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState([]); // { wordId, mode, answer, ok }
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState('ask'); // ask | feedback | sending | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const input = useRef(null);

  const q = questions[i];
  const current = answers[i];
  const last = i === questions.length - 1;

  function answer(value) {
    if (phase !== 'ask') return;
    const ok = q.mode === 'choice' ? value === q.word.meaning : normalize(value) === normalize(q.word.word);
    setAnswers((a) => [...a, { wordId: q.word.id, mode: q.mode, answer: value, ok }]);
    setPhase('feedback');
    if (ok && canSpeak) speak(q.word.word);
  }

  async function next() {
    if (!last) {
      setI(i + 1);
      setTyped('');
      setPhase('ask');
      return;
    }
    setPhase('sending');
    try {
      const r = await api.post(`/api/vocab/${set.id}/attempts`, {
        kidId: kid.id,
        answers: answers.map(({ wordId, mode, answer: a }) => ({ wordId, mode, answer: a })),
      });
      setResult(r);
      setPhase('done');
    } catch (err) {
      setError(err.message);
      setPhase('error');
    }
  }

  if (phase === 'error') {
    return (
      <div className="mt-10 text-center">
        <div className="text-6xl">😵</div>
        <p className="mt-3 text-lg font-bold">ส่งผลไม่สำเร็จ</p>
        <p className="mt-1 text-mute">{error}</p>
        <button className="btn btn-primary mt-6 w-full" onClick={onRetry}>
          ลองใหม่
        </button>
      </div>
    );
  }

  if (phase === 'done') {
    const wrong = answers.filter((a) => !a.ok).map((a) => set.words.find((w) => w.id === a.wordId)).filter(Boolean);
    return (
      <div className="mt-4 flex flex-1 flex-col">
        <section className="card animate-pop px-5 pb-5 pt-6 text-center">
          <div className="text-7xl">{result.passed ? '🏆' : '💪'}</div>
          <p className="mt-2 text-2xl font-bold">{result.passed ? `ภารกิจสำเร็จ! เก่งมาก ${kid.name}` : 'เกือบแล้ว! สู้ๆ'}</p>
          <p className="my-2 text-6xl font-bold tabular">
            {result.correct}
            <span className="text-3xl text-mute">/{result.total}</span>
          </p>
          {result.stars > 0 && (
            <p className="flex items-center justify-center gap-2 text-xl font-bold">
              ได้ <StarCount value={result.stars} size={26} /> ดาว 🎉
            </p>
          )}
          {result.passed && !result.stars && <p className="text-mute">ชุดนี้ได้ดาวไปแล้ว ทำซ้ำเพื่อฝึกได้เรื่อยๆ</p>}
          {!result.passed && (
            <p className="text-mute">
              ต้องถูกอย่างน้อย {passCount(set)} ข้อ ({set.passPct}%) ท่องบัตรคำอีกนิดแล้วลองใหม่นะ
            </p>
          )}
        </section>

        {wrong.length > 0 && (
          <>
            <h2 className="mt-5 mb-2 px-1 font-bold">คำที่ยังตอบผิด</h2>
            <ul className="card divide-y divide-hair rounded-2xl">
              {wrong.map((w) => (
                <li key={w.id} className="flex items-center gap-3 px-3 py-2.5">
                  <WordPicture word={w} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-bold" lang="en">
                      {w.word}
                    </span>
                    <span className="block text-[15px] text-mute">{w.meaning}</span>
                  </span>
                  {canSpeak && (
                    <button className="btn btn-soft size-11 shrink-0 !p-0" onClick={() => speak(w.word)} aria-label={`ฟังเสียง ${w.word}`}>
                      🔊
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-auto grid grid-cols-2 gap-3 pt-5">
          <button className="btn btn-soft" onClick={() => navigate('?mode=cards', { replace: true })}>
            🃏 ท่องบัตรคำ
          </button>
          <button className="btn btn-soft" onClick={onRetry}>
            🎯 ทำอีกครั้ง
          </button>
          <Link to={back} className="btn btn-primary col-span-2 text-lg">
            เสร็จแล้ว
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Progress value={i + 1} total={questions.length} label="ข้อ" />
      <section key={i} className="card mt-4 flex animate-rise flex-col items-center px-5 pb-5 pt-6 text-center">
        <WordPicture word={q.word} size={150} hideName={q.mode === 'spell'} />
        {q.mode === 'choice' ? (
          <>
            <p className="mt-4 text-5xl font-bold break-all" lang="en">
              {q.word.word}
            </p>
            {canSpeak && (
              <button className="btn btn-soft mt-3 min-h-10 px-4" onClick={() => speak(q.word.word)}>
                🔊 ฟังเสียง
              </button>
            )}
            <p className="mt-4 text-lg font-semibold">แปลว่าอะไร?</p>
            <div className="mt-3 grid w-full grid-cols-2 gap-2.5">
              {q.options.map((opt) => {
                const picked = current?.answer === opt;
                const right = phase !== 'ask' && opt === q.word.meaning;
                const wrongPick = phase !== 'ask' && picked && !right;
                return (
                  <button
                    key={opt}
                    onClick={() => answer(opt)}
                    disabled={phase !== 'ask'}
                    className={`min-h-16 rounded-2xl border-2 px-3 py-2 text-lg font-semibold transition-colors ${
                      right ? 'border-good bg-good-soft text-good' : wrongPick ? 'border-bad bg-bad-soft text-bad animate-shake' : 'border-line bg-sunken'
                    } ${phase !== 'ask' && !right && !wrongPick ? 'opacity-50' : ''}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 text-4xl font-bold">{q.word.meaning}</p>
            {canSpeak && (
              <button className="btn btn-soft mt-3 min-h-10 px-4" onClick={() => speak(q.word.word)}>
                🔊 ฟังเสียง
              </button>
            )}
            <p className="mt-4 text-lg font-semibold">ภาษาอังกฤษสะกดว่าอะไร?</p>
            <form
              className="mt-3 flex w-full gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (typed.trim()) answer(typed);
              }}
            >
              <input
                ref={input}
                className={`field min-w-0 flex-1 text-center text-2xl font-bold ${current ? (current.ok ? 'text-good' : 'text-bad') : ''}`}
                lang="en"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                readOnly={phase !== 'ask'}
                maxLength={60}
                placeholder="พิมพ์ที่นี่"
                aria-label="พิมพ์คำศัพท์ภาษาอังกฤษ"
                autoFocus
              />
              {phase === 'ask' && (
                <button className="btn btn-primary shrink-0 px-5" disabled={!typed.trim()}>
                  ตรวจ
                </button>
              )}
            </form>
          </>
        )}

        {phase !== 'ask' && current && (
          <div className="mt-4 w-full animate-pop" role="status">
            {current.ok ? (
              <p className="text-xl font-bold text-good">✅ ถูกต้อง!</p>
            ) : (
              <>
                <p className="text-xl font-bold text-bad">❌ ยังไม่ถูก</p>
                <p className="mt-2 text-sm text-mute">{q.mode === 'choice' ? `${q.word.word} แปลว่า “${q.word.meaning}”` : 'คำที่ถูกคือ'}</p>
                {q.mode === 'spell' && (
                  <p className="text-3xl font-bold text-good" lang="en">
                    {q.word.word}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </section>

      {phase !== 'ask' && (
        <button className="btn btn-primary mt-auto w-full text-lg" onClick={next} disabled={phase === 'sending'} autoFocus>
          {phase === 'sending' ? 'กำลังส่งผล…' : last ? 'ดูผล 🏁' : 'ข้อต่อไป →'}
        </button>
      )}
    </>
  );
}
