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
import { FullscreenScorePanel } from '@/components/admin/fullscreen-score';
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

function GroupBadge({ name, order, className = '' }: { name: string; order: number; className?: string }) {
  return <Badge variant="outline" className={`${colorForIndex(order - 1)} ${className}`}>{name}</Badge>;
}

function CourtBadge({ name, order, className = '' }: { name: string; order: number; className?: string }) {
  return <Badge variant="outline" className={`${colorForIndex(order - 1)} ${className}`}>{name}</Badge>;
}

// 讓區塊標頭的配對／場地徽章比列內的明顯：加大、粗體、深色外框，
// 滑動長列表時能快速定位。
const blockBadgeClass = 'border-2 border-foreground/70 px-3 py-1 text-base font-bold';

// 整個配對當作一個單位，用兩組中順序較前面那組的顏色代表整個配對
// （例如 A vs D 用 A 的顏色），不是兩組各自上色。
function PairingHeader({
  matches,
  format,
  className,
}: {
  matches: MatchFull[];
  format: 'friendly' | 'club';
  className?: string;
}) {
  const m = matches[0];
  if (format === 'friendly') {
    return <GroupBadge name={`${m.group.name} 組`} order={m.group.displayOrder ?? 1} className={className} />;
  }
  const [first, second] = [m.pairA.group, m.pairB.group].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <GroupBadge
      name={`${first.name} 組 vs ${second.name} 組`}
      order={first.displayOrder ?? 1}
      className={className}
    />
  );
}

type Block = { key: string; title: string; order: number; matches: MatchFull[] };

function BlockSection({
  block,
  revision,
  format,
  mode,
  pointsPerGame,
  activeIds,
}: {
  block: Block;
  revision: number;
  format: 'friendly' | 'club';
  mode: GroupingMode;
  pointsPerGame: number;
  activeIds: Set<string> | null;
}) {
  const { toast } = useToast();
  const completed = block.matches.filter((m) => m.status === 'completed').length;
  const first = block.matches[0];

  // 全螢幕計分提升到區塊層級：同一個覆蓋層內就能用左右箭頭切換
  // 上一場/下一場（跟觀眾頁的全螢幕一致），不用退出再進。
  // 面板有自己的一份樂觀分數（fs），跟 ScoreRow 的卡片各自維護——
  // 兩邊都靠 match.scored 廣播回寫的 props 校正。
  const [fsId, setFsId] = useState<string | null>(null);
  const fsOrdered = [...block.matches].sort(
    (x, y) => x.roundNumber - y.roundNumber || x.matchOrder - y.matchOrder,
  );
  const fsIdx = fsOrdered.findIndex((m) => m.id === fsId);
  const fsMatch = fsIdx >= 0 ? fsOrdered[fsIdx] : null;
  const fsPrev = fsIdx > 0 ? fsOrdered[fsIdx - 1] : null;
  const fsNext = fsIdx >= 0 && fsIdx < fsOrdered.length - 1 ? fsOrdered[fsIdx + 1] : null;
  const [fs, setFs] = useState({ a: 0, b: 0 });
  const fsPending = useRef(0);

  useEffect(() => {
    if (!fsMatch || fsPending.current > 0) return;
    setFs({ a: fsMatch.scoreA, b: fsMatch.scoreB });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fsMatch?.id, fsMatch?.scoreA, fsMatch?.scoreB]);

  const fsLocked = fsMatch != null && activeIds !== null && !activeIds.has(fsMatch.id);

  function fsBump(side: 'A' | 'B', delta: number) {
    if (!fsMatch || fsLocked) return;
    // 段已完賽（達到換人分）就不能再加分——避免想按「下一組」箭頭
    // 沒按準點到半面誤加分；減分保留，誤按達標才能 -1 退回。
    if (format === 'club' && delta > 0 && fsMatch.status === 'completed') return;
    const nextA = side === 'A' ? Math.max(0, fs.a + delta) : fs.a;
    const nextB = side === 'B' ? Math.max(0, fs.b + delta) : fs.b;
    if (nextA === fs.a && nextB === fs.b) return;
    setFs({ a: nextA, b: nextB });
    fsPending.current++;
    api(`/api/matches/${fsMatch.id}/score`, {
      method: 'PATCH',
      body: { scoreA: nextA, scoreB: nextB },
    })
      .catch((e) => {
        if (e instanceof ApiError) {
          setFs({ a: fsMatch.scoreA, b: fsMatch.scoreB });
          const code = e.body?.error;
          toast({
            title: '計分失敗',
            description: code === 'score_exceeds_target' ? '已達換人分數，不能再加分' : code,
            variant: 'destructive',
          });
        }
      })
      .finally(() => {
        fsPending.current--;
      });
  }

  function fsGo(m: MatchFull) {
    fsPending.current = 0;
    setFsId(m.id);
    setFs({ a: m.scoreA, b: m.scoreB });
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-base font-semibold">
          {mode === 'court' ? (
            first.court ? (
              <CourtBadge name={first.court.name} order={first.court.displayOrder ?? 1} className={blockBadgeClass} />
            ) : (
              block.title
            )
          ) : (
            <PairingHeader matches={block.matches} format={format} className={blockBadgeClass} />
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {completed} / {block.matches.length} 場已完成
        </div>
      </div>
      <div className="grid gap-2">
        {block.matches.map((m) => (
          <ScoreRow
            key={m.id}
            match={m}
            revision={revision}
            format={format}
            pointsPerGame={pointsPerGame}
            locked={activeIds !== null && !activeIds.has(m.id)}
            onFullscreen={() => fsGo(m)}
          />
        ))}
      </div>
      {fsMatch && (
        <FullscreenScorePanel
          open
          labelA={pairLabel(fsMatch.pairA)}
          labelB={pairLabel(fsMatch.pairB)}
          scoreA={fs.a}
          scoreB={fs.b}
          target={format === 'club' ? fsMatch.matchOrder * pointsPerGame : null}
          completed={fsMatch.status === 'completed'}
          isFinal={format === 'club' && fsIdx === fsOrdered.length - 1}
          nextLabelA={fsNext ? pairLabel(fsNext.pairA) : undefined}
          nextLabelB={fsNext ? pairLabel(fsNext.pairB) : undefined}
          onBump={fsBump}
          onClose={() => setFsId(null)}
          onPrev={fsPrev ? () => fsGo(fsPrev) : undefined}
          onNext={
            // 接力制：目前段還沒打到換人分之前，不開放跳到下一段
            //（下一組名單已顯示在下方，不需要提前進下一組）。
            fsNext && (format !== 'club' || fsMatch.status === 'completed')
              ? () => fsGo(fsNext)
              : undefined
          }
        />
      )}
    </div>
  );
}

type GroupingMode = 'group' | 'court';

export function SectionScoring({ tournament, revision }: { tournament: Tournament; revision: number }) {
  const [matches, setMatches] = useState<MatchFull[]>([]);
  const [mode, setMode] = useState<GroupingMode>('group');
  const editable = tournament.status === 'in_progress' || tournament.status === 'finished';

  // ponytail: 這個整包 GET 理論上還是可能在跟某一場正在連續快速計分的
  // PATCH 序列重疊時，回傳到那一場的分數暫時性的中間值（見 ScoreRow 的
  // pending 計數器註解）——比修這個之前的版本窄很多（現在要跟其他無關
  // 的 revision 事件剛好同時發生），但沒有完全消除。故意不讓這裡的
  // merge 永遠優先保留本地分數：那樣做等於賭 match.scored 廣播永遠不
  // 會漏（socket 斷線窗口內剛好有人計分就可能漏），一旦漏接，畫面會卡
  // 在舊分數、沒有任何後續整包 GET 能自我修正——用一個更罕見的閃爍換一
  // 個更嚴重的靜默錯誤不划算。真的常發生再考慮用 match 的 updatedAt 判
  // 斷新舊，而不是整批二選一。
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

  // 接力制：每個循環可計分的是「第一個未完賽的段」＋「它的前一段」。
  // 前一段（剛完賽的）保持可編輯，是為了讓誤按達標能直接 -1 改回——
  // 退回後該段變回進行中，下一段若還停在帶入的起始分會自動歸零收回
  // （見 lib/club-relay.ts 的 carryToNext）。等進行段再往後移一段
  // （例如第 3 段可計分時），第 1 段才真正鎖住。其餘段全部鎖定。
  let activeIds: Set<string> | null = null;
  if (tournament.format === 'club') {
    activeIds = new Set<string>();
    const byCirc = new Map<string, MatchFull[]>();
    for (const m of matches) {
      const key = `${m.roundNumber}|${pairingOf(m).key}`;
      const arr = byCirc.get(key) ?? [];
      arr.push(m);
      byCirc.set(key, arr);
    }
    for (const bucket of byCirc.values()) {
      const sorted = [...bucket].sort((x, y) => x.matchOrder - y.matchOrder);
      const idx = sorted.findIndex((m) => m.status !== 'completed');
      if (idx === -1) {
        // 循環全部完賽：留最後一段可修正誤按
        if (sorted.length > 0) activeIds.add(sorted[sorted.length - 1].id);
      } else {
        activeIds.add(sorted[idx].id);
        if (idx > 0) activeIds.add(sorted[idx - 1].id);
      }
    }
  }

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
                <div className="mb-3 border-b-2 border-foreground/20 pb-1 text-2xl font-bold">{wb.title}</div>
                <div className="space-y-4 pl-3">
                  {wb.blocks.map((b) => (
                    <BlockSection key={b.key} block={b} revision={revision} format={tournament.format} mode={mode} pointsPerGame={tournament.pointsPerGame} activeIds={activeIds} />
                  ))}
                </div>
              </div>
            ))
          : blocks.map((b) => (
              <BlockSection key={b.key} block={b} revision={revision} format={tournament.format} mode={mode} pointsPerGame={tournament.pointsPerGame} activeIds={activeIds} />
            ))}
      </div>
    </section>
  );
}

function ScoreRow({
  match,
  revision,
  format,
  pointsPerGame,
  locked,
  onFullscreen,
}: {
  match: MatchFull;
  revision: number;
  format: 'friendly' | 'club';
  pointsPerGame: number;
  locked: boolean;
  onFullscreen: () => void;
}) {
  const { toast } = useToast();
  const [a, setA] = useState(match.scoreA);
  const [b, setB] = useState(match.scoreB);
  // 這一列自己還有幾個 PATCH 在飛。>0 時代表本地樂觀值比 props 新，
  // 忽略這時候的 props 更新，避免被別的來源蓋掉還在送出中的樂觀值。
  // 分數變動本身已經改成 SectionScoring 直接吃 match.scored 廣播的單場
  // 資料 merge，不再因為「自己這場計分」而觸發整包重新 GET；但別的
  // revision 事件（例如別人同時新增球員、鎖定分組）仍然會讓 SectionScoring
  // 整包重新 GET，理論上如果那次 GET 剛好跟這一列的連續快速點擊重疊，
  // 一樣可能蓋回中間值——這裡的 pending 計數器就是擋這個殘留 race 的
  // 最後一道防線。
  const pending = useRef(0);

  useEffect(() => {
    if (pending.current > 0) return;
    setA(match.scoreA);
    setB(match.scoreB);
  }, [match.scoreA, match.scoreB, revision]);

  function bump(side: 'A' | 'B', delta: number) {
    // 鎖定的段（非該循環目前進行中的段）完全不動分。
    if (locked) return;
    // 完賽的段只能減分（誤按達標退回用），不能再加分。
    if (format === 'club' && delta > 0 && match.status === 'completed') return;
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
          const code = e.body?.error;
          toast({
            title: '計分失敗',
            description: code === 'score_exceeds_target' ? '已達換人分數，不能再加分' : code,
            variant: 'destructive',
          });
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
  // 會內賽累計接力：第 N 段換人分數 = N × pointsPerGame
  const target = format === 'club' ? match.matchOrder * pointsPerGame : null;

  return (
    <Card className={`space-y-3 p-3 ${isCompleted ? 'border-emerald-300 bg-emerald-50' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1">
          <PairingHeader matches={[match]} format={format} />
          <span className="text-muted-foreground">#{match.matchOrder}</span>
          {target !== null && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
              {target}分換人
            </span>
          )}
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
          <button
            type="button"
            onClick={onFullscreen}
            title="全螢幕計分"
            aria-label="全螢幕計分"
            className="flex h-8 w-8 items-center justify-center rounded border text-sm hover:bg-muted"
          >
            ⛶
          </button>
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
                  disabled={locked}
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
                  disabled={locked}
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
