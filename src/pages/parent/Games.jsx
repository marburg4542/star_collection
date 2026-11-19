// ผู้ปกครอง: แท็บ "เกม" ในหน้าตั้งค่า — มินิเกมคิดเลขตั้งทีละเด็ก (ดาวสูงสุดต่อวันรวมทุกเกม + แต่ละเกม: เปิด/ปิด, ระดับ, ตอบถูกทุก N ข้อได้ M ดาว)
// ต่อด้วยชุดคำศัพท์
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api.js';
import { useStore } from '../../lib/store.jsx';
import { GAMES, GAME_KEYS, useGames } from '../../lib/games.js';
import { Avatar, Segmented, StarCount, Stepper } from '../../components/ui.jsx';
import { EditorSheet, Row } from '../../components/Editor.jsx';
import { Confirm } from '../../components/Feedback.jsx';
import { levelsText } from '../Games.jsx';
import { VocabTab } from './Vocab.jsx';

export function GamesTab() {
  return (
    <>
      <MathGames />
      <h3 className="mt-7 mb-2 px-1 font-bold">📚 ทายคำศัพท์</h3>
      <VocabTab />
    </>
  );
}

function MathGames() {
  const { data } = useStore();
  const games = useGames();
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const rk = resetting ? games.kids[resetting.id] : null;
  const rounds = rk ? roundsToday(rk) : 0;
  return (
    <section>
      <h3 className="mb-1 px-1 font-bold">🎮 มินิเกมคิดเลข</h3>
      <p className="mb-3 px-1 text-sm text-mute">🎈 ป๊อปลูกโป่ง · ⚖️ ตาชั่งตัวเลข · 🏪 ร้านค้า — แตะชื่อเด็กเพื่อเลือกระดับ และตั้งว่าตอบถูกกี่ข้อได้กี่ดาว</p>
      <ul className="card divide-y divide-hair rounded-2xl">
        {data.kids.map((k) => {
          const kg = games.kids[k.id];
          const on = kg ? GAME_KEYS.filter((key) => kg[key].enabled) : [];
          return (
            <Row
              key={k.id}
              onClick={() => kg && setEditing(k)}
              left={<Avatar kid={k} size={40} />}
              title={k.name}
              sub={!kg ? '…' : on.length ? `${on.map((key) => GAMES[key].emoji).join(' ')} · สูงสุด ${kg.dailyStars} ดาว/วัน` : 'ปิดทุกเกม'}
              right={
                kg && on.length && kg.dailyStars > 0 ? (
                  <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-mute">
                    วันนี้ <StarCount value={kg.todayStars} size={14} className="text-ink" />/{kg.dailyStars}
                  </span>
                ) : null
              }
            />
          );
        })}
      </ul>
      <KidGamesSheet
        kid={editing}
        kg={editing ? games.kids[editing.id] : null}
        onClose={() => setEditing(null)}
        onReset={() => {
          setResetting(editing);
          setEditing(null);
        }}
      />
      <Confirm
        open={!!resetting}
        title={`รีเซ็ตมินิเกมวันนี้ของ${resetting?.name ?? ''}?`}
        confirmLabel="รีเซ็ต"
        danger
        onClose={() => setResetting(null)}
        onConfirm={async () => {
          const r = await api.post(`/api/parent/games/${resetting.id}/reset-today`);
          toast.success(`รีเซ็ตแล้ว · ล้าง ${r.rounds} รอบ${r.stars ? ` ยกเลิก ${r.stars} ดาว` : ''}`);
        }}
      >
        <p>
          ล้างรอบที่เล่นวันนี้ของทั้ง 3 เกม ({rounds} รอบ)
          {rk?.todayStars ? ` และยกเลิกดาวที่ได้จากเกมวันนี้ ${rk.todayStars} ดวง — ยอดดาวลดลง ${rk.todayStars} ดวง (ยังเห็นในประวัติแบบขีดฆ่า)` : ''}
        </p>
        <p className="mt-2">โควตาดาววันนี้จะกลับมาเต็ม · วันก่อนๆ และเกมทายคำศัพท์ไม่ถูกแตะ</p>
      </Confirm>
    </section>
  );
}

const pickSettings = (g) => ({ enabled: g.enabled, levels: [...g.levels], every: g.every, stars: g.stars });
const roundsToday = (kg) => GAME_KEYS.reduce((sum, key) => sum + kg[key].today.rounds, 0);

function KidGamesSheet({ kid, kg, onClose, onReset }) {
  const [daily, setDaily] = useState(3);
  const [form, setForm] = useState(null);
  const [tab, setTab] = useState('math');
  useEffect(() => {
    if (!kid || !kg) return;
    setDaily(kg.dailyStars);
    setForm(Object.fromEntries(GAME_KEYS.map((key) => [key, pickSettings(kg[key])])));
    setTab('math');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kid]);

  const set = (key, patch) => setForm((f) => ({ ...f, [key]: { ...f[key], ...patch } }));

  return (
    <EditorSheet
      open={!!kid && !!form}
      title={`มินิเกมของ${kid?.name ?? ''}`}
      onClose={onClose}
      onSave={async () => {
        await api.put(`/api/parent/games/${kid.id}`, { dailyStars: daily, games: form });
        toast.success('บันทึกแล้ว');
      }}
    >
      <div>
        <span className="label">ดาวจากมินิเกมสูงสุดต่อวัน (รวมทุกเกม)</span>
        <Stepper value={daily} onChange={setDaily} min={0} max={30} />
        <p className="mt-1.5 text-sm text-mute">
          ครบแล้วยังเล่นต่อได้แต่ไม่ได้ดาวเพิ่ม · ตั้ง 0 = เล่นได้แต่ไม่ได้ดาว{kg?.todayStars ? ` · วันนี้ได้ไปแล้ว ${kg.todayStars} ดวง` : ''}
        </p>
      </div>

      <Segmented value={tab} onChange={setTab} options={GAME_KEYS.map((key) => ({ value: key, label: `${GAMES[key].emoji} ${GAMES[key].short}` }))} />

      {form && kg && <GameSettings key={tab} game={tab} value={form[tab]} stats={kg[tab]} onChange={(patch) => set(tab, patch)} />}

      {kg && roundsToday(kg) > 0 && (
        <div className="rounded-2xl border-2 border-dashed border-lilac px-3 pb-3 pt-2.5">
          <p className="text-sm text-mute">🧪 ใช้ตอนทดสอบระบบ: ล้างรอบที่เล่นวันนี้ทั้ง 3 เกม และยกเลิกดาวจากเกมวันนี้</p>
          <button type="button" className="btn btn-ghost mt-1 w-full text-bad" onClick={onReset}>
            🔄 รีเซ็ตมินิเกมวันนี้ ({roundsToday(kg)} รอบ{kg.todayStars ? ` · ${kg.todayStars} ดาว` : ''})
          </button>
        </div>
      )}
    </EditorSheet>
  );
}

function GameSettings({ game, value, stats, onChange }) {
  const info = GAMES[game];
  const off = !value.enabled;
  const toggleLevel = (l) => {
    const has = value.levels.includes(l);
    if (has && value.levels.length === 1) return; // ต้องเหลืออย่างน้อย 1 ระดับ
    onChange({ levels: has ? value.levels.filter((x) => x !== l) : [...value.levels, l].sort((a, b) => a - b) });
  };
  const sample = value.every * 2 + Math.max(1, Math.floor(value.every / 2));

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-lg font-bold">
          {info.emoji} {info.title}
        </p>
        <Segmented
          value={value.enabled ? 'on' : 'off'}
          onChange={(v) => onChange({ enabled: v === 'on' })}
          options={[
            { value: 'on', label: 'เปิดเกม' },
            { value: 'off', label: 'ปิดเกม' },
          ]}
        />
      </div>
      <fieldset disabled={off} className={`space-y-4 ${off ? 'opacity-50' : ''}`}>
        <div>
          <span className="label">ระดับ (เลือกได้หลายระดับ โจทย์จะคละกัน)</span>
          <div className="space-y-1.5">
            {Object.entries(info.levels).map(([key, lv]) => {
              const l = Number(key);
              const selected = value.levels.includes(l);
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => toggleLevel(l)}
                  aria-pressed={selected}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left ${selected ? 'bg-purple-300/40 ring-2 ring-purple-500' : 'bg-sunken'}`}
                >
                  <span className="w-8 text-center text-2xl">{lv.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{lv.label}</span>
                    <span className="block text-[13px] text-mute">เช่น {lv.example}</span>
                  </span>
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full border-2 text-sm font-bold ${selected ? 'border-purple-600 bg-purple-600 text-on-primary' : 'border-lilac bg-card'}`}
                    aria-hidden="true"
                  >
                    {selected ? '✓' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <span className="label">ตอบถูกทุกกี่ข้อ (นับในรอบเดียว)</span>
          <Stepper value={value.every} onChange={(every) => onChange({ every })} min={1} max={50} />
        </div>
        <div>
          <span className="label">ได้กี่ดาว</span>
          <Stepper value={value.stars} onChange={(stars) => onChange({ stars })} min={1} max={10} />
          <p className="mt-1.5 text-sm text-mute">
            เช่น รอบเดียวถูก {sample} ข้อ → ได้ {Math.floor(sample / value.every) * value.stars} ดาว · {info.hint}
          </p>
        </div>
      </fieldset>
      <p className="rounded-2xl bg-sunken px-3 py-2.5 text-sm text-mute">
        {stats.best ? `🏆 สถิติ ${stats.best.score} คะแนน (ถูก ${stats.best.correct} ข้อ)` : 'ยังไม่เคยเล่น'}
        {' · '}วันนี้เล่น {stats.today.rounds} รอบ{stats.today.rounds > 0 && ` ถูกมากสุด ${stats.today.bestCorrect} ข้อ`}
        {stats.today.stars > 0 && ` · ได้ ${stats.today.stars} ดาว`}
        {stats.enabled && <span className="mt-0.5 block">ตอนนี้: {levelsText(game, stats.levels)}</span>}
      </p>
    </div>
  );
}
