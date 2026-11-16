// ผู้ปกครอง: ชุดคำศัพท์รายสัปดาห์ (แท็บในหน้าตั้งค่า) + หน้าแก้ไขชุด/คำศัพท์
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../../lib/api.js';
import { useStore } from '../../lib/store.jsx';
import { WEEK_STATUS, canSpeak, imageUrl, mondayOf, passCount, shrinkImage, speak, useVocab, weekLabel, weekStatus } from '../../lib/vocab.js';
import { Avatar, Empty, EmojiPicker, Spinner, StarCount, Stepper } from '../../components/ui.jsx';
import { Confirm } from '../../components/Feedback.jsx';
import { AddButton, EditorSheet, Row } from '../../components/Editor.jsx';
import { WordPicture } from '../../components/Vocab.jsx';

const VOCAB_EMOJIS = ['🍎', '🍌', '🍇', '🍉', '🥕', '🍚', '🥛', '🐱', '🐶', '🐘', '🐟', '🐦', '🚗', '🚌', '✈️', '🏠', '🏫', '📚', '✏️', '⚽', '☀️', '🌧️', '🌳', '👕'];

function resultText(r) {
  if (!r) return { text: 'ยังไม่สอบ', cls: 'text-mute' };
  if (r.passed) return { text: '✅ ผ่าน', cls: 'text-good' };
  return { text: `${Math.round(r.best * 100)}%`, cls: 'text-ink' };
}

// ---------- แท็บ "คำศัพท์" ในหน้าตั้งค่า ----------

export function VocabTab() {
  const { data } = useStore();
  const { sets, loaded } = useVocab();
  const navigate = useNavigate();
  if (!loaded) return <Spinner />;
  return (
    <section>
      <p className="mb-3 px-1 text-sm text-mute">สร้างชุดคำศัพท์ทีละสัปดาห์ เด็กท่องด้วยบัตรคำแล้วสอบ ถูกถึงเกณฑ์ได้ดาว (ครั้งแรกที่ผ่าน)</p>
      {sets.length === 0 ? (
        <Empty emoji="📚" title="ยังไม่มีชุดคำศัพท์">
          กดปุ่มด้านล่างเพื่อสร้างชุดแรก
        </Empty>
      ) : (
        <ul className="space-y-2.5">
          {sets.map((set) => {
            const status = WEEK_STATUS[weekStatus(set.weekStart)];
            const kids = data.kids.filter((k) => set.kidIds.includes(k.id));
            return (
              <li key={set.id}>
                <button onClick={() => navigate(`/parent/vocab/${set.id}`)} className="card w-full px-4 py-3 text-left active:bg-sunken">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className={`block text-xs font-semibold ${status.cls}`}>
                        {status.label} · {weekLabel(set.weekStart)}
                      </span>
                      <span className="block truncate text-lg font-bold">{set.title}</span>
                      <span className="block text-[13px] text-mute">
                        {set.words.length} คำ · ถูก {set.passPct}% ขึ้นไปได้ {set.stars} ดาว
                      </span>
                    </span>
                    <span className="text-mute" aria-hidden="true">
                      ›
                    </span>
                  </span>
                  <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {kids.map((k) => {
                      const r = resultText(set.results[k.id]);
                      return (
                        <span key={k.id} className="flex items-center gap-1.5 text-[13px]">
                          <Avatar kid={k} size={22} />
                          {k.name} <b className={r.cls}>{r.text}</b>
                        </span>
                      );
                    })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <AddButton onClick={() => navigate('/parent/vocab/new')}>สร้างชุดคำศัพท์</AddButton>
    </section>
  );
}

// ---------- หน้าแก้ไขชุดคำศัพท์ ----------

export function VocabSetPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const { data } = useStore();
  const { sets, loaded } = useVocab();
  const set = isNew ? null : sets.find((s) => s.id === Number(id));
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ตั้งค่าเริ่มต้นครั้งเดียว — ข้อมูลอัปเดตทีหลัง (เช่น เด็กสอบเสร็จ) ไม่ทับสิ่งที่กำลังพิมพ์
  useEffect(() => {
    if (form) return;
    if (isNew) setForm({ title: '', weekStart: mondayOf(), passPct: 80, stars: 5, kidIds: data.kids.map((k) => k.id) });
    else if (set) setForm({ title: set.title, weekStart: set.weekStart, passPct: set.passPct, stars: set.stars, kidIds: set.kidIds });
  }, [form, isNew, set, data.kids]);

  const back = (
    <Link to="/parent/manage?tab=vocab" className="btn btn-soft min-h-10 px-4 text-[15px]">
      ← คำศัพท์ทั้งหมด
    </Link>
  );
  if (!isNew && loaded && !set) {
    return (
      <div>
        {back}
        <Empty emoji="🔍" title="ไม่พบชุดคำศัพท์นี้">
          อาจถูกลบไปแล้ว
        </Empty>
      </div>
    );
  }
  if (!form) return <Spinner />;

  const update = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleKid = (kidId) => update({ kidIds: form.kidIds.includes(kidId) ? form.kidIds.filter((k) => k !== kidId) : [...form.kidIds, kidId] });
  const status = weekStatus(form.weekStart);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (isNew) {
        const { id: newId } = await api.post('/api/parent/vocab', form);
        toast.success('สร้างชุดแล้ว เพิ่มคำศัพท์ได้เลย');
        navigate(`/parent/vocab/${newId}`, { replace: true });
      } else {
        await api.put(`/api/parent/vocab/${set.id}`, form);
        toast.success('บันทึกแล้ว');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pb-4">
      {back}
      <h2 className="mt-4 mb-3 px-1 text-xl font-bold">{isNew ? 'สร้างชุดคำศัพท์' : set.title}</h2>

      <form onSubmit={save} className="card space-y-4 rounded-2xl p-4">
        <div>
          <label className="label" htmlFor="vocab-title">
            ชื่อชุด
          </label>
          <input
            id="vocab-title"
            className="field"
            value={form.title}
            onChange={(e) => update({ title: e.target.value })}
            maxLength={60}
            placeholder="เช่น ผลไม้ หรือ บทที่ 3"
          />
        </div>
        <div>
          <label className="label" htmlFor="vocab-week">
            สัปดาห์ที่เริ่ม
          </label>
          <input id="vocab-week" type="date" className="field" value={form.weekStart} onChange={(e) => e.target.value && update({ weekStart: e.target.value })} />
          <p className="mt-1.5 text-sm text-mute">
            สัปดาห์ {weekLabel(form.weekStart)}
            {status === 'upcoming' ? ' · เด็กจะเห็นชุดนี้เมื่อถึงวันเริ่ม' : ' · เด็กเห็นชุดนี้แล้ว'}
          </p>
        </div>
        <div>
          <span className="label">ให้ใครท่อง</span>
          <div className="flex flex-wrap gap-2">
            {data.kids.map((k) => {
              const on = form.kidIds.includes(k.id);
              return (
                <button
                  type="button"
                  key={k.id}
                  onClick={() => toggleKid(k.id)}
                  aria-pressed={on}
                  className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 ${on ? 'bg-purple-600 text-on-primary' : 'bg-sunken'}`}
                >
                  <Avatar kid={k} size={30} />
                  <span className="font-semibold">{k.name}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2">
          <div>
            <span className="label">เกณฑ์ผ่าน (%)</span>
            <Stepper value={form.passPct} onChange={(v) => update({ passPct: v })} min={10} max={100} step={10} />
          </div>
          <div>
            <span className="label">ผ่านแล้วได้กี่ดาว</span>
            <Stepper value={form.stars} onChange={(v) => update({ stars: v })} min={1} max={100} />
          </div>
        </div>
        {set?.words.length > 0 && (
          <p className="text-sm text-mute">
            ตอนนี้ {set.words.length} คำ ต้องถูกอย่างน้อย {passCount({ ...set, passPct: form.passPct })} คำ
          </p>
        )}
        <button className="btn btn-primary w-full text-lg" disabled={busy}>
          {isNew ? 'สร้างชุด แล้วเพิ่มคำศัพท์ →' : 'บันทึกการตั้งค่า'}
        </button>
      </form>

      {!isNew && (
        <>
          <h3 className="mt-6 mb-2 px-1 font-bold">คำศัพท์ ({set.words.length} คำ)</h3>
          {set.words.length > 0 && (
            <ul className="card divide-y divide-hair rounded-2xl">
              {set.words.map((w) => (
                <Row
                  key={w.id}
                  onClick={() => setEditing(w)}
                  left={<WordPicture word={w} size={44} />}
                  title={
                    <span lang="en" className="text-lg">
                      {w.word}
                    </span>
                  }
                  sub={w.meaning}
                />
              ))}
            </ul>
          )}
          <AddButton onClick={() => setEditing({})}>เพิ่มคำศัพท์</AddButton>

          <h3 className="mt-6 mb-2 px-1 font-bold">ผลสอบ</h3>
          <ul className="card divide-y divide-hair rounded-2xl">
            {data.kids
              .filter((k) => set.kidIds.includes(k.id))
              .map((k) => {
                const r = set.results[k.id];
                return (
                  <li key={k.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar kid={k} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{k.name}</span>
                      <span className="block text-[13px] text-mute">
                        {r ? `สอบ ${r.attempts} ครั้ง · ดีที่สุด ${Math.round(r.best * 100)}%` : 'ยังไม่สอบ'}
                      </span>
                    </span>
                    {r?.rewarded ? (
                      <span className="flex items-center gap-1 text-sm font-semibold text-good">
                        ✅ ได้ <StarCount value={set.stars} size={15} />
                      </span>
                    ) : r?.passed ? (
                      <span className="text-sm font-semibold text-good">✅ ผ่าน</span>
                    ) : null}
                  </li>
                );
              })}
          </ul>

          <button className="btn btn-ghost mt-6 w-full text-bad" onClick={() => setConfirmDelete(true)}>
            ลบชุดนี้
          </button>
          <Confirm
            open={confirmDelete}
            title="ลบชุดคำศัพท์นี้?"
            confirmLabel="ลบ"
            danger
            onClose={() => setConfirmDelete(false)}
            onConfirm={async () => {
              await api.del(`/api/parent/vocab/${set.id}`);
              toast.success(`ลบ "${set.title}" แล้ว`);
              navigate('/parent/manage?tab=vocab', { replace: true });
            }}
          >
            คำศัพท์ {set.words.length} คำ รูป และผลสอบของชุดนี้จะหายทั้งหมด · ดาวที่เด็กได้ไปแล้วยังอยู่ (ยกเลิกเองได้ในหน้าประวัติ)
          </Confirm>
          <WordSheet word={editing} setId={set.id} onClose={() => setEditing(null)} />
        </>
      )}
    </div>
  );
}

// ---------- เพิ่ม/แก้คำศัพท์ ----------

const EMPTY_WORD = { word: '', meaning: '', example: '', emoji: '', image: null };

function WordSheet({ word, setId, onClose }) {
  const isNew = !word?.id;
  const [f, setF] = useState(EMPTY_WORD);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    if (!word) return;
    setF({
      word: word.word ?? '',
      meaning: word.meaning ?? '',
      example: word.example ?? '',
      emoji: word.emoji ?? '',
      image: word.image ?? null,
    });
  }, [word]);

  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  async function pickImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const { image } = await api.upload('/api/parent/vocab/images', await shrinkImage(file));
      set({ image });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  }

  const trimmed = f.word.trim();
  return (
    <EditorSheet
      open={!!word}
      title={isNew ? 'เพิ่มคำศัพท์' : `แก้ไข "${word?.word}"`}
      onClose={onClose}
      onSave={async () => {
        if (uploading) throw new Error('รอรูปอัปโหลดเสร็จก่อนนะ');
        const body = { ...f, emoji: f.emoji.trim() || null };
        if (isNew) await api.post(`/api/parent/vocab/${setId}/words`, body);
        else await api.put(`/api/parent/vocab/words/${word.id}`, body);
        toast.success(isNew ? `เพิ่ม "${trimmed}" แล้ว` : 'บันทึกแล้ว');
      }}
      onDelete={isNew ? null : () => api.del(`/api/parent/vocab/words/${word.id}`)}
      deleteText={`ลบคำว่า "${word?.word}" ออกจากชุดนี้`}
    >
      <div>
        <label className="label" htmlFor="vocab-word">
          คำศัพท์ภาษาอังกฤษ
        </label>
        <div className="flex gap-2">
          <input
            id="vocab-word"
            className="field min-w-0 flex-1 text-lg"
            lang="en"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={f.word}
            onChange={(e) => set({ word: e.target.value })}
            maxLength={60}
            placeholder="เช่น apple"
          />
          {canSpeak && (
            <button type="button" className="btn btn-soft shrink-0 px-4" onClick={() => speak(trimmed)} disabled={!trimmed} aria-label="ฟังเสียงอ่าน">
              🔊
            </button>
          )}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="vocab-meaning">
          คำแปลภาษาไทย
        </label>
        <input id="vocab-meaning" className="field" value={f.meaning} onChange={(e) => set({ meaning: e.target.value })} maxLength={80} placeholder="เช่น แอปเปิ้ล" />
      </div>
      <div>
        <label className="label" htmlFor="vocab-example">
          ตัวอย่างประโยค <span className="font-normal text-mute">(ไม่บังคับ)</span>
        </label>
        <textarea
          id="vocab-example"
          className="field min-h-20 py-2.5"
          rows={2}
          value={f.example}
          onChange={(e) => set({ example: e.target.value })}
          maxLength={200}
          placeholder="เช่น I eat an apple every day. (ฉันกินแอปเปิ้ลทุกวัน)"
        />
      </div>
      <div>
        <span className="label">ภาพตัวอย่าง</span>
        <div className="flex items-center gap-3">
          {f.image ? (
            <img src={imageUrl(f.image)} alt="" className="size-24 shrink-0 rounded-2xl bg-sunken object-cover" />
          ) : (
            <WordPicture word={{ ...f, image: null }} size={96} />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <button type="button" className="btn btn-soft" onClick={() => fileInput.current?.click()} disabled={uploading}>
              {uploading ? 'กำลังอัปโหลด…' : f.image ? '📷 เปลี่ยนรูป' : '📷 ถ่ายรูป / เลือกรูป'}
            </button>
            {f.image && (
              <button type="button" className="btn btn-ghost text-bad" onClick={() => set({ image: null })}>
                เอารูปออก
              </button>
            )}
          </div>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={pickImage} />
        </div>
      </div>
      <div>
        <span className="label">
          อีโมจิ <span className="font-normal text-mute">(ใช้แทนรูป ถ้าไม่มีรูป)</span>
        </span>
        <EmojiPicker value={f.emoji} onChange={(emoji) => set({ emoji })} choices={VOCAB_EMOJIS} />
      </div>
    </EditorSheet>
  );
}
