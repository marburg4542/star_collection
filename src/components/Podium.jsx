import { Link } from 'react-router-dom';
import { Avatar, StarCount } from './ui.jsx';

// อันดับแบบแข่งขัน: คะแนนเท่ากันได้อันดับเดียวกัน (1, 1, 3)
export function rankKids(kids, field) {
  const sorted = [...kids].sort((a, b) => b[field] - a[field] || a.id - b.id);
  let rank = 0;
  return sorted.map((kid, i) => {
    if (i === 0 || sorted[i - 1][field] !== kid[field]) rank = i + 1;
    return { kid, score: kid[field], rank, place: i + 1 };
  });
}

const MEDAL = {
  1: { block: 'from-gold-300 to-gold-500', height: 'h-28', avatar: 76 },
  2: { block: 'from-[#f1edfa] to-[#cbbfe6]', height: 'h-20', avatar: 62 },
  3: { block: 'from-[#ffd3ea] to-[#ff9ccb]', height: 'h-14', avatar: 56 },
};

export function Podium({ kids, field }) {
  const ranked = rankKids(kids, field);
  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  // จัดวาง: ที่ 2 ซ้าย · ที่ 1 กลาง · ที่ 3 ขวา
  const order = top.length === 1 ? [top[0]] : top.length === 2 ? [top[1], top[0]] : [top[1], top[0], top[2]];

  return (
    <div>
      <div className="flex items-end justify-center gap-2 px-2 pt-6">
        {order.map(({ kid, score, rank, place }) => {
          const m = MEDAL[rank]; // คะแนนเท่ากัน = แท่นสูงเท่ากัน สีเดียวกัน
          return (
            <Link key={kid.id} to={`/kid/${kid.id}`} className="flex w-[31%] max-w-36 flex-col items-center animate-rise" style={{ animationDelay: `${place * 90}ms` }}>
              <div className="relative mb-2">
                {rank === 1 && <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-3xl animate-float">👑</span>}
                <Avatar kid={kid} size={m.avatar} ring={rank === 1} />
              </div>
              <span className="mb-1 max-w-full truncate text-center text-[15px] font-bold">{kid.name}</span>
              <StarCount value={score} size={18} className="mb-2 text-lg" />
              <div className={`grid w-full place-items-center rounded-t-2xl border-2 border-b-0 border-line bg-gradient-to-b ${m.block} ${m.height}`}>
                <span className="text-3xl font-bold text-ink">{rank}</span>
              </div>
            </Link>
          );
        })}
      </div>
      {rest.length > 0 && (
        <ol className="card mt-3 divide-y divide-hair rounded-2xl">
          {rest.map(({ kid, score, rank }) => (
            <li key={kid.id}>
              <Link to={`/kid/${kid.id}`} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-6 text-center font-bold text-mute tabular">{rank}</span>
                <Avatar kid={kid} size={36} />
                <span className="flex-1 truncate font-bold">{kid.name}</span>
                <StarCount value={score} size={18} />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
