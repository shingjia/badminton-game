'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { Court, Group, Match, Pair, Player, Tournament } from '@prisma/client';

type PairWithPlayers = Pair & { player1: Player; player2: Player; group: Group };
type MatchFull = Match & {
  pairA: PairWithPlayers;
  pairB: PairWithPlayers;
  court: Court | null;
  group: Group;
};

function pairLabel(p: PairWithPlayers) {
  return `${p.player1.name} / ${p.player2.name}`;
}

function pairingOf(m: MatchFull) {
  const [first, second] = [m.pairA.group, m.pairB.group].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return { key: `${first.id}-${second.id}`, label: `${first.name} 組 vs ${second.name} 組` };
}

type Block = { key: string; title: string; order: number; matches: MatchFull[] };

function BlockSection({
  block,
  revision,
  format,
}: {
  block: Block;
  revision: number;
  format: 'friendly' | 'club';
}) {
  const completed = block.matches.filter((m) => m.status === 'completed').length;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-base font-semibold">{block.title}</div>
        <div className="text-xs text-muted-foreground">
          {completed} / {block.matches.length} 場已完成
        </div>
      </div>
      <div className="grid gap-2">
        {block.matches.map((m) => (
          <ScoreRow key={m.id} match={m} revision={revision} format={format} />
        ))}
      </div>
    </div>
  );
}

type GroupingMode = 'group' | 'court';

export function SectionScoring({ tournament, revision }: { tournament: Tournament; revision: number }) {
  const [matches, setMatches] = useState<MatchFull[]>([]);
  const [mode, setMode] = useState<GroupingMode>('group');
  const editable = tournament.status === 'in_progress' || tournament.status === 'finished';

  useEffect(() => {
    api<MatchFull[]>(`/api/tournaments/${tournament.id}/matches`).then(setMatches);
  }, [tournament.id, revision]);

  // Group by group (friendly) or by pairing (club — a match spans two
  // different groups, so grouping by Match.group alone would only show
  // one side and hide who the opponent is).
  const byGroup = new Map<string, Block>();
  for (const m of matches) {
    const p = tournament.format === 'club' ? pairingOf(m) : null;
    const key = p ? p.key : m.group.id;
    const title = p ? p.label : `${m.group.name} 組`;
    const block = byGroup.get(key) ?? {
      key,
      title,
      order: m.group.displayOrder ?? 0,
      matches: [],
    };
    block.matches.push(m);
    byGroup.set(key, block);
  }
  const groupBlocks = Array.from(byGroup.values()).sort((a, b) => a.order - b.order);
  for (const b of groupBlocks) {
    b.matches.sort((a, b) =>
      a.roundNumber !== b.roundNumber ? a.roundNumber - b.roundNumber : a.matchOrder - b.matchOrder,
    );
  }

  // Club format's "依分組" view nests pairing blocks one level deeper,
  // under the circulation (wave) they belong to — a pairing only ever
  // plays in one wave, so grouping by its first match's roundNumber is
  // exact, not a heuristic.
  type WaveBlock = { wave: number; title: string; blocks: Block[] };
  const byWave = new Map<number, WaveBlock>();
  if (tournament.format === 'club') {
    for (const b of groupBlocks) {
      const wave = b.matches[0]?.roundNumber ?? 0;
      const wb = byWave.get(wave) ?? { wave, title: `第 ${wave} 循環`, blocks: [] };
      wb.blocks.push(b);
      byWave.set(wave, wb);
    }
  }
  const waveBlocks = Array.from(byWave.values()).sort((a, b) => a.wave - b.wave);

  // Group by court
  const byCourt = new Map<string, Block>();
  for (const m of matches) {
    const key = m.court?.id ?? '__none__';
    const block = byCourt.get(key) ?? {
      key,
      title: m.court?.name ?? '未排場地',
      order: m.court?.displayOrder ?? 9999,
      matches: [],
    };
    block.matches.push(m);
    byCourt.set(key, block);
  }
  const courtBlocks = Array.from(byCourt.values()).sort((a, b) => a.order - b.order);
  for (const b of courtBlocks) {
    b.matches.sort((a, b) =>
      a.roundNumber !== b.roundNumber ? a.roundNumber - b.roundNumber : a.matchOrder - b.matchOrder,
    );
  }

  const blocks = mode === 'group' ? groupBlocks : courtBlocks;

  return (
    <section id="scoring" className="scroll-mt-16">
      <h2 className="mb-3 text-xl font-semibold">計分</h2>
      {!editable && <p className="text-muted-foreground">尚未進入計分階段</p>}
      {matches.length > 0 && (
        <div className="mb-3 grid max-w-xs grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-1">
          <Button
            size="sm"
            variant={mode === 'group' ? 'default' : 'ghost'}
            onClick={() => setMode('group')}
            className="h-8 w-full"
          >
            依分組
          </Button>
          <Button
            size="sm"
            variant={mode === 'court' ? 'default' : 'ghost'}
            onClick={() => setMode('court')}
            className="h-8 w-full"
          >
            依場地
          </Button>
        </div>
      )}
      <div className="space-y-4 border-l-4 border-l-red-500 pl-4">
        {mode === 'group' && tournament.format === 'club'
          ? waveBlocks.map((wb) => (
              <div key={wb.wave}>
                <div className="mb-2 text-lg font-semibold">{wb.title}</div>
                <div className="space-y-4 pl-3">
                  {wb.blocks.map((b) => (
                    <BlockSection key={b.key} block={b} revision={revision} format={tournament.format} />
                  ))}
                </div>
              </div>
            ))
          : blocks.map((b) => (
              <BlockSection key={b.key} block={b} revision={revision} format={tournament.format} />
            ))}
      </div>
    </section>
  );
}

function ScoreRow({
  match,
  revision,
  format,
}: {
  match: MatchFull;
  revision: number;
  format: 'friendly' | 'club';
}) {
  const { toast } = useToast();
  const [a, setA] = useState(match.scoreA);
  const [b, setB] = useState(match.scoreB);
  // 這一列自己還有幾個 PATCH 在飛。>0 時代表本地樂觀值比 props 新，
  // 忽略這時候從 revision 觸發的重新整理，不然會被回音 fetch 到的
  // 舊值蓋掉，導致分數閃一下又跳回來。
  // ponytail: 計數器擋掉常見的連點 race，但極端情況（前一次 PATCH 的
  // 回音剛好在兩次請求都送出後才 resolve）理論上還是可能蓋到舊值。
  // 真的還會發生的話，改成 SectionScoring 直接吃 socket payload
  // 更新單一 match，不要整包重新 GET，從根拔掉這個 race。
  const pending = useRef(0);

  useEffect(() => {
    if (pending.current > 0) return;
    setA(match.scoreA);
    setB(match.scoreB);
  }, [match.scoreA, match.scoreB, revision]);

  function bump(side: 'A' | 'B', delta: number) {
    const nextA = side === 'A' ? Math.max(0, a + delta) : a;
    const nextB = side === 'B' ? Math.max(0, b + delta) : b;
    if (nextA === a && nextB === b) return;
    setA(nextA);
    setB(nextB);
    pending.current++;
    api(`/api/matches/${match.id}/score`, {
      method: 'PATCH',
      body: { scoreA: nextA, scoreB: nextB },
    })
      .catch((e) => {
        setA(match.scoreA);
        setB(match.scoreB);
        const reason = e instanceof ApiError ? e.body?.error : 'unknown';
        toast({ title: '計分失敗', description: reason, variant: 'destructive' });
      })
      .finally(() => {
        pending.current--;
      });
  }

  const isCompleted = match.status === 'completed';
  const isPlaying = !isCompleted && (match.scoreA > 0 || match.scoreB > 0);

  return (
    <Card className={`space-y-3 p-3 ${isCompleted ? 'border-emerald-300 bg-emerald-50' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">{format === 'club' ? pairingOf(match).label : match.group.name}#{match.matchOrder}</Badge>
        {match.court && <Badge variant="outline">{match.court.name}</Badge>}
        {isCompleted ? (
          <Badge className="ml-auto bg-emerald-600 hover:bg-emerald-600">已完成</Badge>
        ) : isPlaying ? (
          <Badge className="ml-auto bg-amber-500 hover:bg-amber-500">比賽進行中</Badge>
        ) : (
          <Badge variant="secondary" className="ml-auto">未開賽</Badge>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(['A', 'B'] as const).map((side) => {
          const score = side === 'A' ? a : b;
          const pair = side === 'A' ? match.pairA : match.pairB;
          return (
            <div key={side} className="flex flex-col items-center gap-2">
              <div className="text-center text-sm font-medium">{pairLabel(pair)}</div>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-12 w-12 text-2xl"
                  onClick={() => bump(side, -1)}
                  aria-label="-1"
                >
                  −
                </Button>
                <div className="w-14 text-center text-4xl font-bold tabular-nums">{score}</div>
                <Button
                  size="icon"
                  className="h-12 w-12 text-2xl"
                  onClick={() => bump(side, +1)}
                  aria-label="+1"
                >
                  +
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
