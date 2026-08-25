'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { useSafeEffect } from '@/lib/use-safe-effect';
import { useTournamentSocket } from '@/lib/use-socket';
import { colorForIndex } from '@/lib/badge-colors';
import { FullscreenScoreButton } from '@/components/admin/fullscreen-score';
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

function GroupBadge({ name, order }: { name: string; order: number }) {
  return <Badge variant="outline" className={colorForIndex(order - 1)}>{name}</Badge>;
}

function CourtBadge({ name, order }: { name: string; order: number }) {
  return <Badge variant="outline" className={colorForIndex(order - 1)}>{name}</Badge>;
}

// 整個配對當作一個單位，用兩組中順序較前面那組的顏色代表整個配對
// （例如 A vs D 用 A 的顏色），不是兩組各自上色。
function PairingHeader({ matches, format }: { matches: MatchFull[]; format: 'friendly' | 'club' }) {
  const m = matches[0];
  if (format === 'friendly') {
    return <GroupBadge name={`${m.group.name} 組`} order={m.group.displayOrder ?? 1} />;
  }
  const [first, second] = [m.pairA.group, m.pairB.group].sort((a, b) => a.name.localeCompare(b.name));
  return <GroupBadge name={`${first.name} 組 vs ${second.name} 組`} order={first.displayOrder ?? 1} />;
}

type Block = { key: string; title: string; order: number; matches: MatchFull[] };

function BlockSection({
  block,
  revision,
  format,
  mode,
}: {
  block: Block;
  revision: number;
  format: 'friendly' | 'club';
  mode: GroupingMode;
}) {
  const completed = block.matches.filter((m) => m.status === 'completed').length;
  const first = block.matches[0];
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-base font-semibold">
          {mode === 'court' ? (
            first.court ? (
              <CourtBadge name={first.court.name} order={first.court.displayOrder ?? 1} />
            ) : (
              block.title
            )
          ) : (
            <PairingHeader matches={block.matches} format={format} />
          )}
        </div>
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

  useSafeEffect((isCancelled) => {
    api<MatchFull[]>(`/api/tournaments/${tournament.id}/matches`).then((data) => {
      if (!isCancelled()) setMatches(data);
    });
  }, [tournament.id, revision]);

  // 分數變動不靠 revision 整包重新 GET 來同步（那個路徑會跟 ScoreRow
  // 自己送出的 PATCH 競爭，見 ScoreRow 內 pending 那段註解）。這裡直接
  // 訂閱 socket 廣播本身帶的最新 match 資料，只 merge 分數/狀態欄位，
  // 保留其餘關聯資料（pairA/pairB/court/group 這個事件不會變動）。
  useTournamentSocket(tournament.id, {
    'match.scored': (payload: { match: Match }) => {
      const { id, scoreA, scoreB, status, finishedAt } = payload.match;
      setMatches((prev) =>
        prev.map((m) => (m.id === id ? { ...m, scoreA, scoreB, status, finishedAt } : m)),
      );
    },
  });

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

  // Club format's "依場地" view nests the same way as "依分組" — a court
  // is reused across every circulation, so each circulation gets its own
  // court blocks (第1循環 → 場地1/2/3, 第2循環 → 場地1/2/3, ...), built the
  // same shape as byWave above but keyed by court within each wave
  // instead of by pairing.
  const byWaveCourt = new Map<number, WaveBlock>();
  if (tournament.format === 'club') {
    for (const m of matches) {
      const wave = m.roundNumber;
      const wb = byWaveCourt.get(wave) ?? { wave, title: `第 ${wave} 循環`, blocks: [] };
      const key = m.court?.id ?? '__none__';
      let courtBlock = wb.blocks.find((b) => b.key === key);
      if (!courtBlock) {
        courtBlock = {
          key,
          title: m.court?.name ?? '未排場地',
          order: m.court?.displayOrder ?? 9999,
          matches: [],
        };
        wb.blocks.push(courtBlock);
      }
      courtBlock.matches.push(m);
      byWaveCourt.set(wave, wb);
    }
  }
  const waveCourtBlocks = Array.from(byWaveCourt.values()).sort((a, b) => a.wave - b.wave);
  for (const wb of waveCourtBlocks) {
    wb.blocks.sort((a, b) => a.order - b.order);
    for (const b of wb.blocks) {
      b.matches.sort((a, b) => a.matchOrder - b.matchOrder);
    }
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
        {tournament.format === 'club'
          ? (mode === 'group' ? waveBlocks : waveCourtBlocks).map((wb) => (
              <div key={wb.wave}>
                <div className="mb-2 text-lg font-semibold">{wb.title}</div>
                <div className="space-y-4 pl-3">
                  {wb.blocks.map((b) => (
                    <BlockSection key={b.key} block={b} revision={revision} format={tournament.format} mode={mode} />
                  ))}
                </div>
              </div>
            ))
          : blocks.map((b) => (
              <BlockSection key={b.key} block={b} revision={revision} format={tournament.format} mode={mode} />
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
  // 忽略這時候的 props 更新，避免被別的來源（例如另一台裝置剛好同時
  // 對同一場計分）蓋掉還在送出中的樂觀值。分數本身的同步已經改成
  // SectionScoring 直接吃 match.scored 廣播的單場資料 merge，不再靠
  // revision 觸發整包重新 GET——那個路徑曾經因為 GET 回應剛好在連續
  // 兩次 PATCH 都送出後才 resolve，蓋回中間值，導致分數先升後降再升。
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
        // 只有伺服器明確拒絕（ApiError）才 revert——網路層失敗（例如
        // 手機訊號不穩）代表不確定請求到底有沒有成功送達、後端可能其
        // 實已經處理了，只是回應遺失。這種不確定的情況硬是 revert 回
        // 舊分數，反而會造成「跳回舊分數、又跳回新分數」的閃爍（下一
        // 次任何分數變動觸發的重新整理，或這一場自己的 socket 廣播，
        // 之後自然會校正回正確值，不用在這裡搶著 revert）。
        // ponytail: 如果這場比賽剛好是整個賽事目前唯一在計分、又剛好
        // 連 request 都沒送到（不只是回應遺失），畫面會暫時停在錯的樂
        // 觀值，要等下一次任何分數變動才會校正——多場地同時計分時這個
        // 視窗很短，先不特別處理，真的常發生再加逾時強制重抓單場資料。
        if (e instanceof ApiError) {
          setA(match.scoreA);
          setB(match.scoreB);
          toast({ title: '計分失敗', description: e.body?.error, variant: 'destructive' });
        } else {
          // 不確定分數到底有沒有送達，先不說「失敗」，避免工作人員誤以
          // 為畫面上的數字是錯的、手動再調整一次反而把正確分數改壞。
          toast({
            title: '連線不穩定',
            description: '分數可能已經送出，請確認畫面數字是否正確，不要重複調整',
            variant: 'destructive',
          });
        }
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
        <span className="inline-flex items-center gap-1">
          <PairingHeader matches={[match]} format={format} />
          <span className="text-muted-foreground">#{match.matchOrder}</span>
        </span>
        {match.court && <CourtBadge name={match.court.name} order={match.court.displayOrder ?? 1} />}
        <span className="ml-auto flex items-center gap-2">
          {isCompleted ? (
            <Badge className="bg-emerald-600 hover:bg-emerald-600">已完成</Badge>
          ) : isPlaying ? (
            <Badge className="bg-amber-500 hover:bg-amber-500">比賽進行中</Badge>
          ) : (
            <Badge variant="secondary">未開賽</Badge>
          )}
          <FullscreenScoreButton
            labelA={pairLabel(match.pairA)}
            labelB={pairLabel(match.pairB)}
            scoreA={a}
            scoreB={b}
            onBump={bump}
          />
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(['A', 'B'] as const).map((side) => {
          const score = side === 'A' ? a : b;
          const pair = side === 'A' ? match.pairA : match.pairB;
          return (
            <div key={side} className="flex flex-col items-center gap-2">
              <div className="text-center text-sm font-medium">{pairLabel(pair)}</div>
              <div className="flex items-center gap-1 sm:gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-10 w-10 text-xl sm:h-12 sm:w-12 sm:text-2xl"
                  onClick={() => bump(side, -1)}
                  aria-label="-1"
                >
                  −
                </Button>
                <div className="w-10 text-center text-3xl font-bold tabular-nums sm:w-14 sm:text-4xl">
                  {score}
                </div>
                <Button
                  size="icon"
                  className="h-10 w-10 text-xl sm:h-12 sm:w-12 sm:text-2xl"
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
