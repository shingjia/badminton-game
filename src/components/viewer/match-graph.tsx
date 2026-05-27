'use client';

import type { Court, Group, Match, Pair, Player } from '@prisma/client';

type PairWithPlayers = Pair & { player1: Player; player2: Player };
type MatchFull = Match & {
  pairA: PairWithPlayers;
  pairB: PairWithPlayers;
  court: Court | null;
  group: Group;
};

function pairLabel(p: PairWithPlayers) {
  return `${p.player1.name} / ${p.player2.name}`;
}

function pairNames(p: PairWithPlayers): [string, string] {
  return [p.player1.name, p.player2.name];
}

type Status = 'pending' | 'playing' | 'completed';

function matchStatus(m: MatchFull | undefined): Status {
  if (!m) return 'pending';
  if (m.status === 'completed') return 'completed';
  if (m.scoreA > 0 || m.scoreB > 0) return 'playing';
  return 'pending';
}

const COLORS: Record<Status, string> = {
  pending: '#9ca3af', // gray-400
  playing: '#f59e0b', // amber-500
  completed: '#059669', // emerald-600
};

export function MatchGraph({ matches }: { matches: MatchFull[] }) {
  // Unique pairs sorted by displayOrder
  const pairMap = new Map<string, PairWithPlayers>();
  for (const m of matches) {
    pairMap.set(m.pairA.id, m.pairA);
    pairMap.set(m.pairB.id, m.pairB);
  }
  const pairs = Array.from(pairMap.values()).sort((a, b) => a.displayOrder - b.displayOrder);
  const N = pairs.length;
  if (N < 2) {
    return <p className="py-6 text-center text-sm text-muted-foreground">尚無賽程</p>;
  }

  const cx = 250;
  const cy = 250;
  const r = 150;

  const vertices = pairs.map((p, i) => {
    const angle = (2 * Math.PI * i) / N - Math.PI / 2;
    return {
      pair: p,
      angle,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  });

  function findMatch(idA: string, idB: string): MatchFull | undefined {
    return matches.find(
      (m) =>
        (m.pairA.id === idA && m.pairB.id === idB) ||
        (m.pairA.id === idB && m.pairB.id === idA),
    );
  }

  type Edge = {
    a: (typeof vertices)[number];
    b: (typeof vertices)[number];
    match: MatchFull | undefined;
    status: Status;
  };
  const edges: Edge[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const match = findMatch(vertices[i].pair.id, vertices[j].pair.id);
      edges.push({
        a: vertices[i],
        b: vertices[j],
        match,
        status: matchStatus(match),
      });
    }
  }

  // Render order: pending first (so playing/completed lines + labels stay on top)
  const sortedEdges = [...edges].sort((a, b) => {
    const order = { pending: 0, playing: 1, completed: 2 };
    return order[a.status] - order[b.status];
  });

  return (
    <svg
      viewBox="0 0 500 500"
      className="mx-auto w-full max-w-md"
      role="img"
      aria-label="循環賽對戰圖"
    >
      {sortedEdges.map((e, idx) => {
        const color = COLORS[e.status];
        const m = e.match;
        // Shorten edges a bit so they don't run into the vertex dots
        const dx = e.b.x - e.a.x;
        const dy = e.b.y - e.a.y;
        const len = Math.hypot(dx, dy);
        const ux = dx / len;
        const uy = dy / len;
        const gap = 12;
        const x1 = e.a.x + ux * gap;
        const y1 = e.a.y + uy * gap;
        const x2 = e.b.x - ux * gap;
        const y2 = e.b.y - uy * gap;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;

        const showLabel = e.status !== 'pending';
        let leftScore = 0;
        let rightScore = 0;
        let bold: 'left' | 'right' | null = null;
        if (showLabel && m) {
          const aIsLeft = m.pairA.id === e.a.pair.id;
          leftScore = aIsLeft ? m.scoreA : m.scoreB;
          rightScore = aIsLeft ? m.scoreB : m.scoreA;
          if (leftScore > rightScore) bold = 'left';
          else if (rightScore > leftScore) bold = 'right';
        }

        return (
          <g key={idx}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color}
              strokeWidth={e.status === 'pending' ? 1 : 2}
              strokeDasharray={e.status === 'pending' ? '4 3' : undefined}
            />
            {showLabel && (
              <g>
                <title>
                  {`#${m!.matchOrder}  ${pairLabel(e.a.pair)} vs ${pairLabel(e.b.pair)}  ${leftScore}-${rightScore}${m!.court ? ` @ ${m!.court.name}` : ''}`}
                </title>
                <rect
                  x={mx - 28}
                  y={my - 13}
                  width={56}
                  height={26}
                  rx={6}
                  fill={color}
                />
                <text
                  x={mx}
                  y={my + 6}
                  textAnchor="middle"
                  fontSize="16"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  fill="white"
                  letterSpacing="-0.5"
                >
                  <tspan fontWeight={bold === 'left' ? 900 : 600}>
                    {leftScore}
                  </tspan>
                  <tspan fontWeight={500}>-</tspan>
                  <tspan fontWeight={bold === 'right' ? 900 : 600}>
                    {rightScore}
                  </tspan>
                </text>
              </g>
            )}
          </g>
        );
      })}

      {vertices.map((v, i) => {
        const labelR = r + 35;
        const lx = cx + labelR * Math.cos(v.angle);
        const ly = cy + labelR * Math.sin(v.angle);
        const [name1, name2] = pairNames(v.pair);
        const pillW = 110;
        const pillH = 44;
        return (
          <g key={i}>
            <circle
              cx={v.x}
              cy={v.y}
              r={7}
              fill="white"
              stroke="#1f2937"
              strokeWidth={2}
            />
            <rect
              x={lx - pillW / 2}
              y={ly - pillH / 2}
              width={pillW}
              height={pillH}
              rx={8}
              fill="#1f2937"
            />
            <text
              textAnchor="middle"
              fontSize="14"
              fontWeight={700}
              fill="white"
            >
              <tspan x={lx} y={ly - 1}>
                {name1}
              </tspan>
              <tspan x={lx} dy={17}>
                {name2}
              </tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}
