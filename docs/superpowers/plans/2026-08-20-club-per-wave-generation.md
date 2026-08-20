# 會內賽「分循環產生賽程」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change club-format match generation from "one click generates every circulation (wave)" to "each circulation is generated independently," so staff can adjust a group's 棒次 (player seed order) between circulations and have it reflected in the next one's rotation. Also add a "第 N 循環" grouping layer to the schedule/scoring/viewer screens' pairing-list views so the circulation structure is visible.

**Architecture:** `lib/club-schedule.ts` needs **no changes** — `buildClubSchedule` already tags every draft with which wave (circulation) it belongs to (`roundNumber`); generating "just circulation N" is simply calling it fresh (using whatever the group rosters currently look like) and filtering to `roundNumber === N`. The generate route gains a required `wave` param for club format and scopes its delete-then-recreate transaction to just that wave's matches, leaving other circulations (including already-scored ones) untouched. Three UI files get a "第 N 循環" grouping layer added to their pairing-list views (the schedule page additionally gets one generate button per circulation instead of one for everything); the court-list/依場地 views and the friendly-format code paths are untouched.

**Tech Stack:** Next.js (App Router) API routes, Prisma + PostgreSQL, React client components.

**Design doc:** `docs/superpowers/specs/2026-08-20-club-per-wave-generation-design.md`

---

## Task 1: Backend — generate one circulation at a time

**Files:**
- Modify: `src/app/api/tournaments/[id]/matches/generate/route.ts`

**Why:** Which groups play which groups in which wave (`roundRobinPairs`) never depends on 棒次 — only the rotation *within* a wave's pairings does (`rotationSchedule`, inside `buildClubSchedule`). So it's safe to always recompute the full schedule from the group rosters as they are *right now* and keep only the requested wave's matches — no change needed to `lib/club-schedule.ts` itself.

- [ ] **Step 1: Replace the whole file**

Replace `src/app/api/tournaments/[id]/matches/generate/route.ts` in full:

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, requireAdmin, ensureStatus } from '@/lib/api-helpers';
import { roundRobinPairs } from '@/lib/algorithms/circle-method';
import { allocateCourts, type MatchInput } from '@/lib/algorithms/court-allocation';
import { buildClubSchedule, type ClubMatchDraft } from '@/lib/club-schedule';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

type ExistingDraft = {
  tournamentId: string;
  groupId: string;
  pairAId: string;
  pairBId: string;
  roundNumber: number;
  matchOrder: number;
};

type ClubDraft = ClubMatchDraft & { tournamentId: string; courtId: string | null };

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');

  const statusErr = ensureStatus(tournament.status, ['in_progress']);
  if (statusErr) return statusErr;

  const groups = await prisma.group.findMany({
    where: { tournamentId: params.id },
    include: { pairs: true, players: true },
    orderBy: { displayOrder: 'asc' },
  });
  const courts = await prisma.court.findMany({
    where: { tournamentId: params.id },
    orderBy: { displayOrder: 'asc' },
  });

  if (groups.length === 0) return conflict('no_groups');

  const existingDrafts: ExistingDraft[] = [];
  let clubDrafts: ClubDraft[] = [];
  let wave = 0; // only meaningful for club format — captured for the transaction below

  if (tournament.format === 'club') {
    // Groups play each other directly (round-robin), not internally —
    // needs exactly groupCount/2 dedicated courts + 1 shared court.
    if (groups.length % 2 !== 0) return conflict('odd_group_count');
    const primaryCourtsNeeded = groups.length / 2;
    if (courts.length !== primaryCourtsNeeded + 1) return conflict('court_count_mismatch');

    // Each circulation (wave) is generated independently, so staff can
    // adjust a group's 棒次 (seed order) between circulations and have it
    // reflected in the next one — see docs/superpowers/specs/2026-08-20-
    // club-per-wave-generation-design.md. Which groups play which groups
    // in which wave never depends on 棒次 (roundRobinPairs only looks at
    // group ids), so it's safe to always recompute the full schedule from
    // the *current* rosters and just keep the requested wave's matches.
    const body = await req.json().catch(() => ({}));
    wave = Number(body?.wave);
    const maxWave = groups.length - 1;
    if (!Number.isInteger(wave) || wave < 1 || wave > maxWave) return conflict('invalid_wave');

    try {
      const rosters = groups.map((g) => ({
        groupId: g.id,
        players: g.players.map((p) => ({ id: p.id, seed: p.seed })),
      }));
      const schedule = buildClubSchedule(rosters).filter((m) => m.roundNumber === wave);
      clubDrafts = schedule.map((m) => ({
        ...m,
        tournamentId: params.id,
        courtId:
          m.courtSlot === 'primary'
            ? courts[m.pairingIndexInWave].id
            : courts[primaryCourtsNeeded].id,
      }));
    } catch (e: any) {
      return conflict(e.message);
    }
  } else {
    try {
      for (const g of groups) {
        const pairIds = g.pairs.map((p) => p.id);
        const matches = roundRobinPairs(pairIds);
        for (const m of matches) {
          existingDrafts.push({
            tournamentId: params.id,
            groupId: g.id,
            pairAId: m.teamA,
            pairBId: m.teamB,
            roundNumber: m.roundNumber,
            matchOrder: m.matchOrder,
          });
        }
      }
    } catch (e: any) {
      return conflict(e.message);
    }
  }

  if (existingDrafts.length + clubDrafts.length === 0) return conflict('no_matches_to_generate');

  // Friendly's existing pairs still go through the generic allocateCourts
  // (batches by roundNumber, round-robins across all courts) — club's
  // court assignment is already resolved above, bespoke to its primary/
  // shared-court balancing rule.
  const matchInputs: MatchInput[] = existingDrafts.map((d, idx) => ({
    id: `tmp${idx}`,
    groupId: d.groupId,
    roundNumber: d.roundNumber,
  }));
  const allocations = allocateCourts(matchInputs, courts.map((c) => c.id));
  const courtById = new Map(allocations.map((a) => [a.id, a.courtId]));

  const result = await prisma.$transaction(async (tx) => {
    if (tournament.format === 'club') {
      // Only this wave's matches get regenerated — other circulations
      // (including already-scored ones) are untouched. Pairs are one-off
      // per match, so find them via their match before deleting (deleting
      // a Pair cascades its Match, per the schema's onDelete: Cascade).
      const existingWaveMatches = await tx.match.findMany({
        where: { tournamentId: params.id, roundNumber: wave },
        select: { pairAId: true, pairBId: true },
      });
      const pairIds = existingWaveMatches.flatMap((m) => [m.pairAId, m.pairBId]);
      if (pairIds.length > 0) {
        await tx.pair.deleteMany({ where: { id: { in: pairIds } } });
      }
    } else {
      await tx.match.deleteMany({ where: { tournamentId: params.id } });
    }

    const created = [];

    for (let i = 0; i < existingDrafts.length; i++) {
      const d = existingDrafts[i];
      const courtId = courtById.get(`tmp${i}`) ?? null;
      const m = await tx.match.create({
        data: {
          tournamentId: d.tournamentId,
          groupId: d.groupId,
          pairAId: d.pairAId,
          pairBId: d.pairBId,
          roundNumber: d.roundNumber,
          matchOrder: d.matchOrder,
          courtId,
        },
      });
      created.push(m);
    }

    for (const d of clubDrafts) {
      // Each side's one-off Pair is tagged with *its own* group — not a
      // shared value — so standings can attribute stats correctly (see
      // lib/player-standings.ts).
      const pairA = await tx.pair.create({
        data: {
          tournamentId: d.tournamentId,
          groupId: d.groupAId,
          player1Id: d.sideAPlayers[0],
          player2Id: d.sideAPlayers[1],
          displayOrder: d.matchOrder,
        },
      });
      const pairB = await tx.pair.create({
        data: {
          tournamentId: d.tournamentId,
          groupId: d.groupBId,
          player1Id: d.sideBPlayers[0],
          player2Id: d.sideBPlayers[1],
          displayOrder: d.matchOrder,
        },
      });
      // Match.groupId is a required single FK but a club match spans two
      // groups — pairA's group is stored here as a technical placeholder
      // only; nothing should read it as "the" group for a club match
      // (use pairA.group / pairB.group instead, see matches-tab.tsx).
      const m = await tx.match.create({
        data: {
          tournamentId: d.tournamentId,
          groupId: d.groupAId,
          pairAId: pairA.id,
          pairBId: pairB.id,
          roundNumber: d.roundNumber,
          matchOrder: d.matchOrder,
          courtId: d.courtId,
        },
      });
      created.push(m);
    }

    return created;
  });

  emitToTournament(params.id, 'match.generated', { tournamentId: params.id, matches: result });
  return ok({ matches: result, count: result.length });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `cd "C:\Private\badminton-game" && npx eslint "src/app/api/tournaments/[id]/matches/generate/route.ts"`
Expected: only the pre-existing `catch (e: any)` pattern already used elsewhere in this codebase (2 `no-explicit-any` warnings), no new categories of error.

- [ ] **Step 4: Commit**

```bash
cd "C:\Private\badminton-game"
git add "src/app/api/tournaments/[id]/matches/generate/route.ts"
git commit -m "feat(matches): generate club-format circulations one at a time"
```

---

## Task 2: Admin schedule page — one generate button per circulation

**Files:**
- Modify: `src/components/admin/section-matches.tsx`

- [ ] **Step 1: Replace the whole file**

Replace `src/components/admin/section-matches.tsx` in full:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
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
          <div className="mb-2 font-semibold">{block.label}</div>
          <div className="grid gap-2 md:grid-cols-2">
            {block.matches.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <div>
                  <span className="text-muted-foreground">#{m.matchOrder}</span>{' '}
                  {pairLabel(m.pairA)} <span className="mx-1">vs</span> {pairLabel(m.pairB)}
                </div>
                {m.court && <Badge variant="outline" className="text-xs">{m.court.name}</Badge>}
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

  useEffect(() => {
    api<MatchFull[]>(`/api/tournaments/${tournament.id}/matches`).then(setMatches);
  }, [tournament.id, revision]);

  useEffect(() => {
    if (tournament.format !== 'club') return;
    api<Group[]>(`/api/tournaments/${tournament.id}/groups`).then((gs) => setGroupCount(gs.length));
  }, [tournament.id, tournament.format]);

  async function generate(wave?: number) {
    try {
      await api(`/api/tournaments/${tournament.id}/matches/generate`, {
        method: 'POST',
        body: wave !== undefined ? { wave } : undefined,
      });
      toast({ title: '已產生賽程' });
    } catch (e: any) {
      const code = e.body?.error;
      toast({ title: '無法產生賽程', description: ERR[code] ?? code, variant: 'destructive' });
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
                    disabled={tournament.status !== 'in_progress'}
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
```

- [ ] **Step 2: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `cd "C:\Private\badminton-game" && npx eslint src/components/admin/section-matches.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/components/admin/section-matches.tsx
git commit -m "feat(admin): one generate button per club circulation, on section-matches"
```

---

## Task 3: Admin scoring page — nest 依分組 view by circulation

**Files:**
- Modify: `src/components/admin/section-scoring.tsx`

**Why:** Only the "依分組" grouping mode changes (club format gets an extra 循環 layer above its existing pairing blocks); "依場地" is untouched — courts aren't organized by circulation.

- [ ] **Step 1: Read the current file**

Read `src/components/admin/section-scoring.tsx` in full before editing — match every edit below against the exact current text.

- [ ] **Step 2: Hoist `Block` to module scope and add a `BlockSection` component**

Find:

```typescript
function pairingOf(m: MatchFull) {
  const [first, second] = [m.pairA.group, m.pairB.group].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return { key: `${first.id}-${second.id}`, label: `${first.name} 組 vs ${second.name} 組` };
}

type GroupingMode = 'group' | 'court';
```

Replace:

```typescript
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
```

- [ ] **Step 3: Remove the now-duplicate local `Block` type, add the wave-nesting computation**

Find:

```typescript
  // Group by group (friendly) or by pairing (club — a match spans two
  // different groups, so grouping by Match.group alone would only show
  // one side and hide who the opponent is).
  type Block = { key: string; title: string; order: number; matches: MatchFull[] };

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
```

Replace:

```typescript
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
```

- [ ] **Step 4: Render `waveBlocks` for club's 依分組 mode, `blocks` unchanged otherwise**

Find:

```tsx
      <div className="space-y-4 border-l-4 border-l-red-500 pl-4">
        {blocks.map((b) => {
          const completed = b.matches.filter((m) => m.status === 'completed').length;
          return (
            <div key={b.key}>
              <div className="mb-2 flex items-baseline justify-between">
                <div className="text-base font-semibold">{b.title}</div>
                <div className="text-xs text-muted-foreground">
                  {completed} / {b.matches.length} 場已完成
                </div>
              </div>
              <div className="grid gap-2">
                {b.matches.map((m) => (
                  <ScoreRow key={m.id} match={m} revision={revision} format={tournament.format} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
```

Replace:

```tsx
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
```

- [ ] **Step 5: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Lint**

Run: `cd "C:\Private\badminton-game" && npx eslint src/components/admin/section-scoring.tsx`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/components/admin/section-scoring.tsx
git commit -m "feat(admin): nest 依分組 scoring view by circulation for club format"
```

---

## Task 4: Viewer — nest 分組列表 view by circulation

**Files:**
- Modify: `src/components/viewer/matches-tab.tsx`

**Why:** Only the "分組列表" (`view === 'group'`) rendering changes for club format; "循環圖" (friendly-only) and "場地列表" are untouched.

- [ ] **Step 1: Read the current file**

Read `src/components/viewer/matches-tab.tsx` in full before editing — match every edit below against the exact current text.

- [ ] **Step 2: Add a `PairingCard` component**

Find:

```typescript
function pairingOf(m: MatchFull) {
  const [first, second] = [m.pairA.group, m.pairB.group].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return { key: `${first.id}-${second.id}`, label: `${first.name} 組 vs ${second.name} 組` };
}

type ViewMode = 'graph' | 'group' | 'court';
```

Replace:

```typescript
function pairingOf(m: MatchFull) {
  const [first, second] = [m.pairA.group, m.pairB.group].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return { key: `${first.id}-${second.id}`, label: `${first.name} 組 vs ${second.name} 組` };
}

function PairingCard({
  block,
  format,
}: {
  block: { label: string; matches: MatchFull[] };
  format: 'friendly' | 'club';
}) {
  const completed = block.matches.filter((m) => m.status === 'completed').length;
  const total = block.matches.length;
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-lg font-semibold">{block.label}</div>
        <div className="text-xs text-muted-foreground">
          {completed} / {total} 場已完成
        </div>
      </div>
      <MatchList matches={block.matches} showGroup={false} format={format} />
    </Card>
  );
}

type ViewMode = 'graph' | 'group' | 'court';
```

- [ ] **Step 3: Compute `waveBlocks` for club format, right after `byGroup`**

Find:

```typescript
  // Group by group (friendly) or by pairing (club — a match spans two
  // different groups, so grouping by Match.group alone would only show
  // one side and hide who the opponent is).
  const byGroup = new Map<string, { label: string; matches: MatchFull[] }>();
  for (const m of matches) {
    const { key, label } = format === 'club' ? pairingOf(m) : { key: m.group.name, label: `${m.group.name} 組` };
    const block = byGroup.get(key) ?? { label, matches: [] };
    block.matches.push(m);
    byGroup.set(key, block);
  }
```

Replace:

```typescript
  // Group by group (friendly) or by pairing (club — a match spans two
  // different groups, so grouping by Match.group alone would only show
  // one side and hide who the opponent is).
  const byGroup = new Map<string, { label: string; matches: MatchFull[] }>();
  for (const m of matches) {
    const { key, label } = format === 'club' ? pairingOf(m) : { key: m.group.name, label: `${m.group.name} 組` };
    const block = byGroup.get(key) ?? { label, matches: [] };
    block.matches.push(m);
    byGroup.set(key, block);
  }

  // Club format's "分組列表" nests pairing blocks one level deeper, under
  // the circulation (wave) they belong to — a pairing only ever plays in
  // one wave, so grouping by its first match's roundNumber is exact, not
  // a heuristic.
  type WaveBlock = {
    wave: number;
    label: string;
    entries: [string, { label: string; matches: MatchFull[] }][];
  };
  const waveMap = new Map<number, WaveBlock>();
  if (format === 'club') {
    for (const entry of byGroup.entries()) {
      const wave = entry[1].matches[0]?.roundNumber ?? 0;
      const wb = waveMap.get(wave) ?? { wave, label: `第 ${wave} 循環`, entries: [] };
      wb.entries.push(entry);
      waveMap.set(wave, wb);
    }
  }
  const waveBlocks = Array.from(waveMap.values()).sort((a, b) => a.wave - b.wave);
```

- [ ] **Step 4: Render `waveBlocks` for club's 分組列表, `byGroup` unchanged otherwise**

Find:

```tsx
      {view === 'group' &&
        [...byGroup.entries()].map(([key, block]) => {
          const completed = block.matches.filter((m) => m.status === 'completed').length;
          const total = block.matches.length;
          return (
            <Card key={key} className="p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <div className="text-lg font-semibold">{block.label}</div>
                <div className="text-xs text-muted-foreground">
                  {completed} / {total} 場已完成
                </div>
              </div>
              <MatchList matches={block.matches} showGroup={false} format={format} />
            </Card>
          );
        })}
```

Replace:

```tsx
      {view === 'group' &&
        (format === 'club'
          ? waveBlocks.map((wb) => (
              <div key={wb.wave} className="space-y-4">
                <div className="text-xl font-bold">{wb.label}</div>
                {wb.entries.map(([key, block]) => (
                  <PairingCard key={key} block={block} format={format} />
                ))}
              </div>
            ))
          : [...byGroup.entries()].map(([key, block]) => (
              <PairingCard key={key} block={block} format={format} />
            )))}
```

- [ ] **Step 5: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors. (The `view === 'graph'` block still uses its own inline rendering — unchanged, and never reachable for club format since the graph button only renders when `format === 'friendly'`.)

- [ ] **Step 6: Lint**

Run: `cd "C:\Private\badminton-game" && npx eslint src/components/viewer/matches-tab.tsx`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/components/viewer/matches-tab.tsx
git commit -m "feat(viewer): nest 分組列表 view by circulation for club format"
```

---

## Task 5: Full verification, push, manual walkthrough handoff

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite + typecheck one more time**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p . && npx vitest run tests/unit`
Expected: no type errors; all 41 tests pass (this plan doesn't touch any unit-tested pure-logic module — `lib/club-schedule.ts` is untouched — so the count doesn't change).

- [ ] **Step 2: Push**

```bash
cd "C:\Private\badminton-game"
git push
```

- [ ] **Step 3: Manual walkthrough — 4 groups, 3 courts, generate one circulation at a time**

1. 用一場已經有 4 組（每組 6 人）、3 場地的會內賽（或沿用先前驗證用的那一場）。
2. 賽程頁：確認看到「第 1 循環」「第 2 循環」「第 3 循環」三個區塊，每個都各自有「產生對戰＋分配場地」按鈕。
3. 只點「第 1 循環」的按鈕，確認：只有第 1 循環的 12 場比賽出現（4 組→每循環 2 個配對 × 6 場 = 12 場），第 2、3 循環還是空的、按鈕文字仍是「產生對戰＋分配場地」。
4. 到分組頁，調整某一組的棒次（上下移動）。
5. 回賽程頁點「第 2 循環」的按鈕，確認第 2 循環的 12 場出現，且用的是剛剛調整後的棒次順序；第 1 循環的比賽（含任何已計分的）不受影響。
6. 再點一次「第 1 循環」的按鈕（重新產生），確認第 1 循環的比賽被換掉、其他循環不受影響。
7. 計分頁「依分組」模式：確認比賽是照「第 N 循環」分組顯示，「依場地」模式維持原樣（不分循環）。
8. 觀眾頁「分組列表」檢視：確認也是照「第 N 循環」分組顯示。

- [ ] **Step 4: Manual walkthrough — friendly format regression check**

1. 建一場友誼賽，走一次原本流程：分組 → 依等級自動分組（自動配對）→ 產生對戰 → 計分。
2. 確認賽程頁只有一個「產生對戰＋分配場地」按鈕（沒有循環分區），計分頁、觀眾頁的分組顯示都跟這次改動之前完全一樣。

- [ ] **Step 5: If both walkthroughs pass, this feature is done**

No further step — this is the final task in the plan.
