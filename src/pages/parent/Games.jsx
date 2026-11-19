// ผู้ปกครอง: แท็บ "เกม" ในหน้าตั้งค่า — ป๊อปลูกโป่ง (ตั้งระดับ/เป้าหมาย/ดาวต่อเด็ก) + ชุดคำศัพท์
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api.js';
import { useStore } from '../../lib/store.jsx';
import { LEVELS, useGames } from '../../lib/mathgame.js';
import { Avatar, Segmented, StarCount, Stepper } from '../../components/ui.jsx';
import { EditorSheet, Row } from '../../components/Editor.jsx';
import { VocabTab } from './Vocab.jsx';

export function GamesTab() {
  return (
    <>
      <MathSection />
      <h3 className="mt-7 mb-2 px-1 font-bold">📚 ทายคำศัพท์</h3>
      <VocabTab />
    </>
  );
}

function MathSection() {
  const { data } = useStore();
  const games = useGames();
  const [editing, setEditing] = useState(null);
  return (
    <section>
      <h3 className="mb-1 px-1 font-bold">🎈 ป๊อปลูกโป่ง (เกมคิดเลข)</h3>
      <p className="mb-3 px-1 text-sm text-mute">รอบละ 60 วินาที แตะลูกโป่งที่เป็นคำตอบ · ภารกิจวันนี้: ตอบถูกถึงเป้าในรอบเดียว ได้ดาววันละครั้ง</p>
      <ul className="card divide-y divide-hair rounded-2xl">
        {data.kids.map((k) => {
          const m = games.math[k.id];
          const lv = m && LEVELS[m.level];
          return (
            <Row
              key={k.id}
              onClick={() => m && setEditing(k)}
              left={<Avatar kid={k} size={40} />}
              title={k.name}
              sub={!m ? '…' : m.enabled ? `${lv.emoji} ${lv.label} · ถูก ${m.goal} ข้อ ได้ ${m.stars} ดาว` : 'ปิดเกมนี้อยู่'}
              right={m?.enabled && m.today.rewarded ? <span className="shrink-0 text-sm font-semibold text-good">✅ วันนี้</span> : null}
            />
          );
        })}
      </ul>
      <MathSheet kid={editing} math={editing ? games.math[editing.id] : null} onClose={() => setEditing(null)} />
    </section>
  );
}

function MathSheet({ kid, math, onClose }) {
  const [on, setOn] = useState('on');
  const [level, setLevel] = useState(2);
  const [goal, setGoal] = useState(15);
  const [stars, setStars] = useState(1);
  useEffect(() => {
    if (!kid || !math) return;
    setOn(math.enabled ? 'on' : 'off');
    setLevel(math.level);
    setGoal(math.goal);
    setStars(math.stars);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kid]);

  return (
    <EditorSheet
      open={!!kid}
      title={`ป๊อปลูกโป่งของ${kid?.name ?? ''}`}
      onClose={onClose}
      onSave={async () => {
        await api.put(`/api/parent/games/math/${kid.id}`, { enabled: on === 'on', level, goal, stars });
        toast.success('บันทึกแล้ว');
      }}
    >
      <Segmented
        value={on}
        onChange={setOn}
        options={[
          { value: 'on', label: 'เปิดเกม' },
          { value: 'off', label: 'ปิดเกม' },
        ]}
      />
      <fieldset disabled={on === 'off'} className={`space-y-4 ${on === 'off' ? 'opacity-50' : ''}`}>
        <div>
          <span className="label">ระดับ</span>
          <div className="space-y-1.5">
            {Object.entries(LEVELS).map(([value, lv]) => {
              const selected = level === Number(value);
              return (
                <button
                  type="button"
                  key={value}
                  onClick={() => setLevel(Number(value))}
                  aria-pressed={selected}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left ${selected ? 'bg-purple-300/40 ring-2 ring-purple-500' : 'bg-sunken'}`}
                >
                  <span className="w-8 text-center text-2xl">{lv.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{lv.label}</span>
                    <span className="block text-[13px] text-mute">เช่น {lv.example}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <span className="label">ภารกิจวันนี้: ตอบถูกกี่ข้อในรอบเดียว</span>
          <Stepper value={goal} onChange={setGoal} min={5} max={60} step={5} />
          <p className="mt-1.5 text-sm text-mute">รอบละ 60 วินาที เล่นคล่องๆ ตอบได้ราว 15–25 ข้อ</p>
        </div>
        <div>
          <span className="label">ภารกิจสำเร็จได้กี่ดาว (วันละครั้ง)</span>
          <Stepper value={stars} onChange={setStars} min={1} max={10} />
        </div>
      </fieldset>
      {math && (
        <p className="flex flex-wrap items-center gap-1 rounded-2xl bg-sunken px-3 py-2.5 text-sm text-mute">
          {math.best ? `🏆 สถิติ ${math.best.score} คะแนน (ถูก ${math.best.correct} ข้อ)` : 'ยังไม่เคยเล่น'}
          {' · '}วันนี้เล่น {math.today.rounds} รอบ{math.today.rounds > 0 && ` ถูกมากสุด ${math.today.bestCorrect} ข้อ`}
          {math.today.rewarded && (
            <>
              {' · '}✅ ได้ <StarCount value={math.stars} size={13} /> แล้ว
            </>
          )}
        </p>
      )}
    </EditorSheet>
  );
}
