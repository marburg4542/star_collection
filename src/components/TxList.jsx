import { SEVERITY } from '../lib/constants.js';
import { groupByDay, signed, timeOf } from '../lib/format.js';

/** รายการดาวเข้า-ออก จัดกลุ่มตามวัน · kidsById ส่งมาเมื่ออยากโชว์ชื่อเด็กในแต่ละแถว */
export function TxList({ items, kidsById, onVoid }) {
  return groupByDay(items).map((g) => (
    <section key={g.key} className="mb-4">
      <h3 className="mb-2 px-1 text-sm font-bold text-mute">{g.label}</h3>
      <ul className="card divide-y divide-night-600/40 rounded-2xl">
        {g.items.map((tx) => (
          <TxRow key={tx.id} tx={tx} kid={kidsById?.[tx.kidId]} onVoid={onVoid} />
        ))}
      </ul>
    </section>
  ));
}

function TxRow({ tx, kid, onVoid }) {
  const voided = !!tx.voidedAt;
  const color = tx.type === 'earn' ? 'text-good' : tx.type === 'penalty' ? 'text-bad' : 'text-gold-300';
  const sev = tx.type === 'penalty' && SEVERITY[tx.severity];
  return (
    <li className={`flex items-center gap-3 px-3 py-2.5 ${voided ? 'opacity-50' : ''}`}>
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-night-950/70 text-2xl">{tx.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold ${voided ? 'line-through' : ''}`}>{tx.title}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-mute">
          {kid && (
            <span>
              {kid.avatar} {kid.name}
            </span>
          )}
          <span>{timeOf(tx.createdAt)}</span>
          {tx.type === 'redeem' && <span className="text-gold-300">แลกรางวัล</span>}
          {sev && <span style={{ color: sev.hex }}>● {sev.label}</span>}
          {voided && <span>ยกเลิกแล้ว</span>}
        </p>
        {tx.note && <p className="text-sm text-mute">“{tx.note}”</p>}
      </div>
      <span className={`text-xl font-bold tabular ${color} ${voided ? 'line-through' : ''}`}>{signed(tx.amount)}</span>
      {onVoid && !voided && (
        <button onClick={() => onVoid(tx)} className="grid size-9 shrink-0 place-items-center rounded-full bg-night-700 text-mute" aria-label="ยกเลิกรายการนี้">
          ↩
        </button>
      )}
    </li>
  );
}
