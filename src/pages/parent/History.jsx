import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useStore } from '../../lib/store.jsx';
import { useHistory } from '../../lib/useHistory.js';
import { signed } from '../../lib/format.js';
import { Avatar, Empty, Spinner } from '../../components/ui.jsx';
import { TxList } from '../../components/TxList.jsx';
import { Confirm } from '../../components/Feedback.jsx';

export default function History() {
  const { data } = useStore();
  const [kidId, setKidId] = useState(null);
  const [voiding, setVoiding] = useState(null);
  const history = useHistory(kidId);
  const kidsById = Object.fromEntries(data.kids.map((k) => [k.id, k]));

  return (
    <div>
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="เลือกเด็ก">
        <FilterChip on={kidId === null} onClick={() => setKidId(null)}>
          ทุกคน
        </FilterChip>
        {data.kids.map((k) => (
          <FilterChip key={k.id} on={kidId === k.id} onClick={() => setKidId(k.id)}>
            <Avatar kid={k} size={26} /> {k.name}
          </FilterChip>
        ))}
      </div>

      {!history.loaded ? (
        <Spinner />
      ) : history.items.length === 0 ? (
        <Empty emoji="📜" title="ยังไม่มีประวัติ" />
      ) : (
        <>
          <p className="mb-3 px-1 text-sm text-mute">กด ↩ เพื่อยกเลิกรายการที่กดผิด (ดาวจะคืน/หักกลับให้เอง)</p>
          <TxList items={history.items} kidsById={kidId ? null : kidsById} onVoid={setVoiding} />
          {history.more && (
            <button className="btn btn-soft w-full" onClick={history.loadMore} disabled={history.loadingMore}>
              ดูเก่ากว่านี้
            </button>
          )}
        </>
      )}

      <Confirm
        open={!!voiding}
        title="ยกเลิกรายการนี้?"
        confirmLabel="ยกเลิกรายการ"
        danger
        onClose={() => setVoiding(null)}
        onConfirm={() => api.post(`/api/parent/transactions/${voiding.id}/void`)}
      >
        {voiding && (
          <p>
            {voiding.emoji} {voiding.title} ({signed(voiding.amount)} ดาว) ของ{kidsById[voiding.kidId]?.name}
            <br />
            ยอดดาวจะคำนวณใหม่ให้อัตโนมัติ{voiding.type === 'redeem' ? ' และคำขอแลกนี้จะถือว่ายกเลิก' : ''}
          </p>
        )}
      </Confirm>
    </div>
  );
}

function FilterChip({ on, onClick, children }) {
  return (
    <button
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full py-1.5 pl-2 pr-4 text-[15px] font-semibold ${on ? 'bg-purple-600 text-white' : 'chip-off'}`}
    >
      {children}
    </button>
  );
}
