'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { colorForIndex } from '@/lib/badge-colors';
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

function groupByPairing(matches: MatchFull[], format: 'friendly' | 'club') {
  const byPairing = new Map<string, { label: string; matches: MatchFull[] }>();
  for (const m of matches) {
    const { key, label } =
      format === 'club' ? pairingOf(m) : { key: m.group.name, label: `${m.group.name} 組` };
    const block = byPairing.get(key) ?? { label, matches: [] };
    block.matches.push(m);
    byPairing.set(key, block);
  }
  return [...byPairing.entries()];
}

function PairingBlocks({ matches, format }: { matches: MatchFull[]; format: 'friendly' | 'club' }) {
  return (
    <div className="space-y-4">
      {groupByPairing(matches, format).map(([key, block]) => (
        <Card key={key} className="p-3">
          <div className="mb-2">
            <PairingHeader matches={block.matches} format={format} />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {block.matches.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <div>
                  <span className="text-muted-foreground">#{m.matchOrder}</span>{' '}
                  {pairLabel(m.pairA)} <span className="mx-1">vs</span> {pairLabel(m.pairB)}
                </div>
                {m.court && <CourtBadge name={m.court.name} order={m.court.displayOrder ?? 1} />}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

const ERR: Record<string, string> = {
  no_matches_to_generate: '每組至少要有 2 對才能產生對戰',
  no_groups: '尚未分組',
  unequal_sides: '有一組依等級分出的兩隊人數不相等，請調整組數或球員人數',
  side_too_small: '有一組分出的兩隊人數少於 3 人，無法輪轉搭檔，請調整組數或球員人數',
  odd_group_count: '會內賽的組數必須是偶數（組跟組要兩兩對戰），請調整組數',
  court_count_mismatch: '會內賽的場地數必須等於「組數÷2 + 1」，請調整場地或組數',
  invalid_wave: '循環編號不正確',
};

export function SectionMatches({ tournament, revision }: { tournament: Tournament; revision: number }) {
  const { toast } = useToast();
  const [matches, setMatches] = useState<MatchFull[]>([]);
  const [groupCount, setGroupCount] = useState(0);
  const [pendingWave, setPendingWave] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<MatchFull[]>(`/api/tournaments/${tournament.id}/matches`).then((data) => {
      if (!cancelled) setMatches(data);
    });
    return () => {
      cancelled = true;
    };
  }, [tournament.id, revision]);

  useEffect(() => {
    if (tournament.format !== 'club') return;
    api<Group[]>(`/api/tournaments/${tournament.id}/groups`).then((gs) => setGroupCount(gs.length));
  }, [tournament.id, tournament.format]);

  async function generate(wave?: number) {
    setPendingWave(wave ?? null);
    try {
      await api(`/api/tournaments/${tournament.id}/matches/generate`, {
        method: 'POST',
        body: wave !== undefined ? { wave } : undefined,
      });
      toast({ title: '已產生賽程' });
    } catch (e: any) {
      const code = e.body?.error;
      toast({ title: '無法產生賽程', description: ERR[code] ?? code, variant: 'destructive' });
    } finally {
      setPendingWave(null);
    }
  }

  const waveNumbers =
    tournament.format === 'club' && groupCount > 0
      ? Array.from({ length: groupCount - 1 }, (_, i) => i + 1)
      : [];

  return (
    <section id="matches" className="scroll-mt-16">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-xl font-semibold">賽程</h2>
        {tournament.format === 'friendly' && (
          <Button
            onClick={() => generate()}
            size="sm"
            disabled={tournament.status !== 'in_progress' || matches.length > 0}
          >
            {matches.length > 0 ? '已產生' : '產生對戰 + 分配場地'}
          </Button>
        )}
        <span className="text-sm text-muted-foreground">{matches.length} 場</span>
      </div>

      {tournament.format === 'club' ? (
        <div className="space-y-6 border-l-4 border-l-emerald-500 pl-4">
          {waveNumbers.map((wave) => {
            const waveMatches = matches.filter((m) => m.roundNumber === wave);
            return (
              <div key={wave}>
                <div className="mb-2 flex items-center gap-3">
                  <div className="text-lg font-semibold">第 {wave} 循環</div>
                  <Button
                    onClick={() => generate(wave)}
                    size="sm"
                    disabled={tournament.status !== 'in_progress' || pendingWave === wave}
                  >
                    {waveMatches.length > 0 ? '重新產生' : '產生對戰 + 分配場地'}
                  </Button>
                </div>
                {waveMatches.length > 0 && <PairingBlocks matches={waveMatches} format={tournament.format} />}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4 border-l-4 border-l-emerald-500 pl-4">
          <PairingBlocks matches={matches} format={tournament.format} />
        </div>
      )}
    </section>
  );
}
