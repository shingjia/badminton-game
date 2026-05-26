# Roster-based Grouping Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將報名單位從「兩人 Team」改成「個人 Player」，由系統依離散等級動態分組（等級數=組數），並提供主辦人手動微調與雙打配對重抽 / 鎖定流程。

**Architecture:** 拆除 `Team`、新增 `Player` 與 `Pair` 兩個 model；分組由主辦人在 UI 確認指派（後端僅驗證寫入），雙打由 Fisher-Yates 洗牌產生並 per-group 鎖定。Socket 事件從 `team.*` 改為 `player.*`，新增 `pairs.shuffled` / `pairing.locked`。

**Tech Stack:** Next.js (App Router) + TypeScript + Prisma + PostgreSQL (WSL 172.16.69.68:5432) + Socket.IO + shadcn/ui (pinned 2.10.0) + Tailwind v3 + Vitest + supertest。

**Supersedes:** 此 plan 取代 `docs/superpowers/plans/2026-05-21-badminton-ui-realtime.md` 中的 Task 9-23。Task 1-8（Socket infra、shadcn、useSocket hook、emitToTournament helper、socket smoke test 等基礎設施層）需先完成或沿用，但 Task 4 中的 socket 事件型別需依本 plan 重寫。

---

## 第 0 區塊：File Structure 概覽

```
prisma/
  schema.prisma                                        (修改：拆除 Team、新增 Player/Pair、Match 改 pairAId/pairBId)
src/
  lib/
    socket-events.ts                                   (修改：team.* 改 player.*，新增 pairs.shuffled/pairing.locked)
    schemas.ts                                         (修改：拆除 CreateTeam/UpdateTeam，新增 CreatePlayer/UpdatePlayer/AssignGroups)
    grouping.ts                                        (新增：validateGroupingInput + applyGrouping)
    pairing.ts                                         (新增：Fisher-Yates shufflePairs + writePairs)
  app/api/
    tournaments/[id]/players/route.ts                  (新增：GET + POST，取代 teams)
    players/[id]/route.ts                              (新增：PATCH + DELETE，取代 teams/[id])
    tournaments/[id]/groups/generate/route.ts          (重寫：接收 assignments，呼叫 validateGroupingInput+applyGrouping)
    groups/[id]/pairs/shuffle/route.ts                 (新增：POST → Fisher-Yates → emit pairs.shuffled)
    groups/[id]/pairs/lock/route.ts                    (新增：POST → pairingLockedAt → emit pairing.locked)
    tournaments/[id]/matches/generate/route.ts         (修改：teamAId/teamBId 改 pairAId/pairBId)
    tournaments/[id]/groups/route.ts                   (修改：include players + pairs)
    tournaments/[id]/route.ts                          (確認 groupCount 欄位)
    tournaments/route.ts                               (確認 groupCount 欄位)
    tournaments/[id]/groups/lock/route.ts              (修改：teams 改 players 驗證)
    tournaments/[id]/standings/route.ts                (修改：raw SQL 欄位 pairAId/pairBId)
  components/
    viewer/
      players-tab.tsx                                  (新增，取代 teams-tab.tsx)
      pairs-tab.tsx                                    (新增)
      groups-tab.tsx                                   (修改：顯示 players 而非 teams)
    admin/
      section-players.tsx                              (新增，取代 section-teams.tsx)
      section-groups.tsx                               (重寫：分組 assignments UI + 配對 shuffle/lock)
      section-settings.tsx                             (修改：teamsPerGroup 改 groupCount)
  app/
    t/[id]/viewer-client.tsx                           (修改：team.* 改 player.* socket 事件，新增 pairs tab)
    admin/t/[id]/workspace-client.tsx                  (修改：team.* 改 player.* socket 事件，SectionTeams 改 SectionPlayers)
tests/
  unit/
    grouping.test.ts                                   (新增)
    pairing.test.ts                                    (新增)
  integration/
    players.test.ts                                    (新增)
    groups-generate.test.ts                            (重寫)
    pairs.test.ts                                      (新增)
    socket.test.ts                                     (修改：team.added 改 player.added，新增 pairs.shuffled/pairing.locked)
    api.test.ts                                        (修改：全流程 smoke test，teams 改 players)
```

---

## Task 1: Prisma Schema 重寫

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 以下列內容完整取代 prisma/schema.prisma**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum TournamentStatus {
  draft
  grouping
  in_progress
  finished
}

enum MatchStatus {
  pending
  completed
}

model Tournament {
  id            String           @id @default(cuid())
  name          String
  status        TournamentStatus @default(draft)
  groupCount    Int              @default(4)
  pointsPerGame Int              @default(21)
  createdAt     DateTime         @default(now())
  finishedAt    DateTime?

  players Player[]
  groups  Group[]
  courts  Court[]
  matches Match[]
}

model Player {
  id           String  @id @default(cuid())
  tournamentId String
  name         String
  level        String?
  groupId      String?

  tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  group      Group?     @relation(fields: [groupId], references: [id], onDelete: SetNull)

  pairsAsP1 Pair[] @relation("PairPlayer1")
  pairsAsP2 Pair[] @relation("PairPlayer2")

  @@index([tournamentId])
  @@index([groupId])
}

model Pair {
  id           String @id @default(cuid())
  tournamentId String
  groupId      String
  player1Id    String
  player2Id    String
  displayOrder Int

  tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  group      Group      @relation(fields: [groupId], references: [id], onDelete: Cascade)
  player1    Player     @relation("PairPlayer1", fields: [player1Id], references: [id], onDelete: Cascade)
  player2    Player     @relation("PairPlayer2", fields: [player2Id], references: [id], onDelete: Cascade)

  matchesAsA Match[] @relation("MatchPairA")
  matchesAsB Match[] @relation("MatchPairB")

  @@index([tournamentId])
  @@index([groupId])
}

model Group {
  id              String    @id @default(cuid())
  tournamentId    String
  name            String
  displayOrder    Int
  levelCode       String
  pairingLockedAt DateTime?

  tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  players    Player[]
  pairs      Pair[]
  matches    Match[]

  @@index([tournamentId])
}

model Court {
  id           String @id @default(cuid())
  tournamentId String
  name         String
  displayOrder Int

  tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  matches    Match[]

  @@index([tournamentId])
}

model Match {
  id           String      @id @default(cuid())
  tournamentId String
  groupId      String
  courtId      String?
  pairAId      String
  pairBId      String
  scoreA       Int         @default(0)
  scoreB       Int         @default(0)
  status       MatchStatus @default(pending)
  roundNumber  Int
  matchOrder   Int
  finishedAt   DateTime?

  tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  group      Group      @relation(fields: [groupId], references: [id], onDelete: Cascade)
  court      Court?     @relation(fields: [courtId], references: [id], onDelete: SetNull)
  pairA      Pair       @relation("MatchPairA", fields: [pairAId], references: [id], onDelete: Cascade)
  pairB      Pair       @relation("MatchPairB", fields: [pairBId], references: [id], onDelete: Cascade)

  @@index([tournamentId])
  @@index([groupId])
  @@index([courtId])
}
```

- [ ] **Step 2: 執行 migrate（PowerShell。DB 在 WSL 172.16.69.68:5432；prisma 讀 .env 自動連線，不要用 docker exec）**

```powershell
npx prisma migrate dev --name roster_grouping_rewrite
```

Expected output 含 `Your database is now in sync with your schema.`

- [ ] **Step 3: 重新產生 Prisma client**

```powershell
npx prisma generate
```

Expected: `Generated Prisma Client`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): replace Team with Player+Pair; add groupCount, levelCode, pairingLockedAt"
```

---

## Task 2: Socket 事件型別重寫

**Files:**
- Modify: `src/lib/socket-events.ts`

- [ ] **Step 1: 完整取代 src/lib/socket-events.ts**

```typescript
import type { Tournament, Player, Group, Pair, Match } from '@prisma/client';

export type ServerEvent =
  | { type: 'player.added'; tournamentId: string; player: Player }
  | { type: 'player.updated'; tournamentId: string; player: Player }
  | { type: 'player.deleted'; tournamentId: string; playerId: string }
  | { type: 'groups.generated'; tournamentId: string; groups: Group[] }
  | { type: 'pairs.shuffled'; tournamentId: string; groupId: string; pairs: Pair[] }
  | { type: 'pairing.locked'; tournamentId: string; groupId: string }
  | { type: 'match.generated'; tournamentId: string; matches: Match[] }
  | { type: 'match.scored'; tournamentId: string; match: Match }
  | { type: 'tournament.updated'; tournamentId: string; tournament: Tournament }
  | { type: 'tournament.deleted'; tournamentId: string };
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/socket-events.ts
git commit -m "feat(socket): replace team.* events with player.*; add pairs.shuffled, pairing.locked"
```

---

## Task 3: Schema zod validators 更新

**Files:**
- Modify: `src/lib/schemas.ts`

- [ ] **Step 1: 完整取代 src/lib/schemas.ts**

```typescript
import { z } from 'zod';

export const TournamentStatusEnum = z.enum(['draft', 'grouping', 'in_progress', 'finished']);

export const CreateTournament = z.object({
  name: z.string().trim().min(1).max(100),
  groupCount: z.number().int().min(1).max(26).optional(),
  pointsPerGame: z.number().int().min(11).max(31).optional(),
});

export const UpdateTournament = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  status: TournamentStatusEnum.optional(),
  groupCount: z.number().int().min(1).max(26).optional(),
  pointsPerGame: z.number().int().min(11).max(31).optional(),
});

export const CreatePlayer = z.object({
  name: z.string().trim().min(1).max(50),
  level: z.string().trim().min(1).max(10).optional(),
});

export const UpdatePlayer = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  level: z.string().trim().min(1).max(10).optional(),
  groupId: z.string().nullable().optional(),
});

// Used in POST /api/tournaments/:id/groups/generate
// Each entry maps a levelCode label to an ordered list of playerIds
export const AssignGroups = z.object({
  groups: z
    .array(
      z.object({
        levelCode: z.string().trim().min(1).max(10),
        playerIds: z.array(z.string().min(1)).min(2),
      }),
    )
    .min(1),
});

export const CreateCourt = z.object({
  name: z.string().trim().min(1).max(30),
});

export const UpdateMatchScore = z.object({
  scoreA: z.number().int().min(0).max(30),
  scoreB: z.number().int().min(0).max(30),
});
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/schemas.ts
git commit -m "feat(schemas): replace Team validators with Player; add AssignGroups; groupCount replaces teamsPerGroup"
```

---

## Task 4: 分組演算法單元測試（先寫失敗的測試）

**Files:**
- Create: `tests/unit/grouping.test.ts`

- [ ] **Step 1: 建立 tests/unit/grouping.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { validateGroupingInput, type GroupAssignment } from '@/lib/grouping';

describe('validateGroupingInput', () => {
  const makeAssignment = (levelCode: string, count: number): GroupAssignment => ({
    levelCode,
    playerIds: Array.from({ length: count }, (_, i) => `player-${levelCode}-${i}`),
  });

  it('throws no_groups for empty array', () => {
    expect(() => validateGroupingInput([])).toThrow('no_groups');
  });

  it('throws group_too_small if any group has 0 players', () => {
    expect(() => validateGroupingInput([makeAssignment('A', 0)])).toThrow('group_too_small');
  });

  it('throws odd_players_in_group if any group has odd player count', () => {
    expect(() => validateGroupingInput([makeAssignment('A', 3)])).toThrow('odd_players_in_group');
  });

  it('throws duplicate_player if same playerId appears twice across groups', () => {
    expect(() =>
      validateGroupingInput([{ levelCode: 'A', playerIds: ['p1', 'p2', 'p1', 'p2'] }]),
    ).toThrow('duplicate_player');
  });

  it('does not throw for 2 groups of 4', () => {
    expect(() =>
      validateGroupingInput([makeAssignment('A', 4), makeAssignment('B', 4)]),
    ).not.toThrow();
  });

  it('does not throw for 5 groups of 10', () => {
    const groups = ['A', 'B', 'C', 'D', 'E'].map((code) => makeAssignment(code, 10));
    expect(() => validateGroupingInput(groups)).not.toThrow();
  });

  it('allows groups of different even sizes', () => {
    expect(() =>
      validateGroupingInput([makeAssignment('A', 4), makeAssignment('B', 6), makeAssignment('C', 8)]),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: 跑測試，確認全部 FAIL（模組不存在）**

```powershell
npx vitest run tests/unit/grouping.test.ts
```

Expected: fail with `Cannot find module '@/lib/grouping'`

- [ ] **Step 3: Commit 測試**

```bash
git add tests/unit/grouping.test.ts
git commit -m "test(grouping): add failing unit tests for validateGroupingInput"
```

---

## Task 5: 分組演算法實作

**Files:**
- Create: `src/lib/grouping.ts`

- [ ] **Step 1: 建立 src/lib/grouping.ts**

```typescript
import type { PrismaClient } from '@prisma/client';

export type GroupAssignment = {
  levelCode: string;
  playerIds: string[];
};

/**
 * Validates the proposed grouping.
 * Throws an Error with a machine-readable message on any violation:
 * - 'no_groups'              — groups array is empty
 * - 'group_too_small'        — a group has fewer than 2 players
 * - 'odd_players_in_group'   — a group has an odd player count (doubles require even)
 * - 'duplicate_player'       — same playerId appears in more than one group
 */
export function validateGroupingInput(groups: GroupAssignment[]): void {
  if (groups.length === 0) throw new Error('no_groups');

  const seen = new Set<string>();

  for (const g of groups) {
    if (g.playerIds.length < 2) throw new Error('group_too_small');
    if (g.playerIds.length % 2 !== 0) throw new Error('odd_players_in_group');
    for (const pid of g.playerIds) {
      if (seen.has(pid)) throw new Error('duplicate_player');
      seen.add(pid);
    }
  }
}

/**
 * Applies the grouping inside a Prisma interactive transaction.
 * 1. Detaches all players in the tournament from any existing group.
 * 2. Deletes old Group rows (cascades to Pair rows).
 * 3. Creates new Group rows and assigns players.
 *
 * The caller must call validateGroupingInput first.
 * Returns the array of created Group rows.
 */
export async function applyGrouping(
  tx: Omit<
    PrismaClient,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
  >,
  tournamentId: string,
  groups: GroupAssignment[],
): Promise<
  {
    id: string;
    name: string;
    displayOrder: number;
    levelCode: string;
    tournamentId: string;
    pairingLockedAt: Date | null;
  }[]
> {
  await tx.player.updateMany({
    where: { tournamentId },
    data: { groupId: null },
  });

  await tx.group.deleteMany({ where: { tournamentId } });

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const created = [];

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const groupRow = await tx.group.create({
      data: {
        tournamentId,
        name: letters[i] ?? `Group${i + 1}`,
        displayOrder: i + 1,
        levelCode: g.levelCode,
      },
    });

    await tx.player.updateMany({
      where: { id: { in: g.playerIds } },
      data: { groupId: groupRow.id },
    });

    created.push(groupRow);
  }

  return created;
}
```

- [ ] **Step 2: 跑測試，確認全部 PASS**

```powershell
npx vitest run tests/unit/grouping.test.ts
```

Expected: 7 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/lib/grouping.ts
git commit -m "feat(lib): add validateGroupingInput + applyGrouping"
```

---

## Task 6: 配對演算法單元測試（先寫失敗的測試）

**Files:**
- Create: `tests/unit/pairing.test.ts`

- [ ] **Step 1: 建立 tests/unit/pairing.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { shufflePairs, type PairDraft } from '@/lib/pairing';

describe('shufflePairs', () => {
  it('produces N/2 pairs for N even players', () => {
    const result = shufflePairs(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    expect(result).toHaveLength(3);
  });

  it('each player appears exactly once across all pairs', () => {
    const playerIds = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    const pairs = shufflePairs(playerIds);
    const all = pairs.flatMap((p) => [p.player1Id, p.player2Id]);
    expect(new Set(all).size).toBe(8);
    expect(all.sort()).toEqual([...playerIds].sort());
  });

  it('throws odd_player_count for odd number', () => {
    expect(() => shufflePairs(['p1', 'p2', 'p3'])).toThrow('odd_player_count');
  });

  it('throws odd_player_count for empty array', () => {
    expect(() => shufflePairs([])).toThrow('odd_player_count');
  });

  it('returns displayOrder starting at 1, incrementing by 1', () => {
    const pairs = shufflePairs(['p1', 'p2', 'p3', 'p4']);
    expect(pairs[0].displayOrder).toBe(1);
    expect(pairs[1].displayOrder).toBe(2);
  });

  it('accepts seeded rng for deterministic output', () => {
    const rng = () => 0;
    const a = shufflePairs(['p1', 'p2', 'p3', 'p4'], rng);
    const b = shufflePairs(['p1', 'p2', 'p3', 'p4'], rng);
    expect(a[0].player1Id).toBe(b[0].player1Id);
    expect(a[0].player2Id).toBe(b[0].player2Id);
  });
});
```

- [ ] **Step 2: 跑測試，確認全部 FAIL**

```powershell
npx vitest run tests/unit/pairing.test.ts
```

Expected: fail with `Cannot find module '@/lib/pairing'`

- [ ] **Step 3: Commit 測試**

```bash
git add tests/unit/pairing.test.ts
git commit -m "test(pairing): add failing unit tests for shufflePairs"
```

---

## Task 7: 配對演算法實作

**Files:**
- Create: `src/lib/pairing.ts`

- [ ] **Step 1: 建立 src/lib/pairing.ts**

```typescript
import type { PrismaClient } from '@prisma/client';

export type PairDraft = {
  player1Id: string;
  player2Id: string;
  displayOrder: number;
};

/**
 * Fisher-Yates shuffle then pair adjacent players.
 * Throws 'odd_player_count' if playerIds.length is odd or zero.
 * rng defaults to Math.random; pass a seeded function for deterministic tests.
 */
export function shufflePairs(playerIds: string[], rng: () => number = Math.random): PairDraft[] {
  if (playerIds.length === 0 || playerIds.length % 2 !== 0) {
    throw new Error('odd_player_count');
  }

  const arr = [...playerIds];

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  const pairs: PairDraft[] = [];
  for (let i = 0; i < arr.length; i += 2) {
    pairs.push({
      player1Id: arr[i],
      player2Id: arr[i + 1],
      displayOrder: pairs.length + 1,
    });
  }

  return pairs;
}

/**
 * Deletes existing Pair rows for this group, then writes new ones.
 * Returns the created Pair rows.
 * Must be called inside a Prisma transaction.
 */
export async function writePairs(
  tx: Omit<
    PrismaClient,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
  >,
  tournamentId: string,
  groupId: string,
  drafts: PairDraft[],
) {
  await tx.pair.deleteMany({ where: { groupId } });

  const created = [];
  for (const d of drafts) {
    const pair = await tx.pair.create({
      data: {
        tournamentId,
        groupId,
        player1Id: d.player1Id,
        player2Id: d.player2Id,
        displayOrder: d.displayOrder,
      },
    });
    created.push(pair);
  }
  return created;
}
```

- [ ] **Step 2: 跑測試，確認全部 PASS**

```powershell
npx vitest run tests/unit/pairing.test.ts
```

Expected: 6 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/lib/pairing.ts
git commit -m "feat(lib): add shufflePairs (Fisher-Yates) + writePairs"
```

---

## Task 8: Player CRUD API 測試（先寫）

**Files:**
- Create: `tests/integration/players.test.ts`

- [ ] **Step 1: 建立 tests/integration/players.test.ts**

```typescript
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import request from 'supertest';

let server: ChildProcess | undefined;
const BASE = 'http://localhost:3102';

async function waitForHealthy(url: string, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await wait(500);
  }
  throw new Error('server did not become healthy');
}

beforeAll(async () => {
  server = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3102' },
    shell: process.platform === 'win32',
  });
  await waitForHealthy(`${BASE}/api/tournaments`);
}, 60_000);

afterAll(async () => {
  if (server) { server.kill(); await wait(500); }
});

describe('Player CRUD', () => {
  let cookie = '';
  let tournamentId = '';
  let playerId = '';

  it('logs in', async () => {
    const res = await request(BASE)
      .post('/api/admin/login')
      .send({ password: process.env.ADMIN_PASSWORD || 'dev-password-please-change' });
    expect(res.status).toBe(200);
    cookie = (Array.isArray(res.headers['set-cookie'])
      ? res.headers['set-cookie'][0]
      : res.headers['set-cookie']
    ).split(';')[0];
  });

  it('creates a tournament with groupCount', async () => {
    const res = await request(BASE)
      .post('/api/tournaments')
      .set('Cookie', cookie)
      .send({ name: 'player-test', groupCount: 2 });
    expect(res.status).toBe(201);
    tournamentId = res.body.id;
    expect(res.body.groupCount).toBe(2);
  });

  it('GET /api/tournaments/:id/players returns empty array', async () => {
    const res = await request(BASE).get(`/api/tournaments/${tournamentId}/players`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST /api/tournaments/:id/players creates a player', async () => {
    const res = await request(BASE)
      .post(`/api/tournaments/${tournamentId}/players`)
      .set('Cookie', cookie)
      .send({ name: 'Alice', level: 'A' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Alice');
    expect(res.body.level).toBe('A');
    expect(res.body.tournamentId).toBe(tournamentId);
    playerId = res.body.id;
  });

  it('POST requires admin cookie', async () => {
    const res = await request(BASE)
      .post(`/api/tournaments/${tournamentId}/players`)
      .send({ name: 'Bob' });
    expect(res.status).toBe(401);
  });

  it('POST validates required name field', async () => {
    const res = await request(BASE)
      .post(`/api/tournaments/${tournamentId}/players`)
      .set('Cookie', cookie)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_body');
  });

  it('PATCH /api/players/:id updates name and level', async () => {
    const res = await request(BASE)
      .patch(`/api/players/${playerId}`)
      .set('Cookie', cookie)
      .send({ name: 'Alice Updated', level: 'B' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Alice Updated');
    expect(res.body.level).toBe('B');
  });

  it('PATCH returns 404 for non-existent player', async () => {
    const res = await request(BASE)
      .patch('/api/players/nonexistent-id')
      .set('Cookie', cookie)
      .send({ name: 'X' });
    expect(res.status).toBe(404);
  });

  it('DELETE /api/players/:id removes the player', async () => {
    const res = await request(BASE)
      .delete(`/api/players/${playerId}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
  });

  it('DELETE returns 404 for already-deleted player', async () => {
    const res = await request(BASE)
      .delete(`/api/players/${playerId}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('cleanup tournament', async () => {
    const res = await request(BASE)
      .delete(`/api/tournaments/${tournamentId}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: 跑測試，確認 FAIL（routes 不存在）**

```powershell
npx vitest run tests/integration/players.test.ts
```

Expected: fail with 404 on player routes

- [ ] **Step 3: Commit 測試**

```bash
git add tests/integration/players.test.ts
git commit -m "test(players): add failing integration tests for Player CRUD API"
```

---

## Task 9: Player CRUD API 實作

**Files:**
- Create: `src/app/api/tournaments/[id]/players/route.ts`
- Create: `src/app/api/players/[id]/route.ts`

- [ ] **Step 1: 建立 src/app/api/tournaments/[id]/players/route.ts**

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { CreatePlayer } from '@/lib/schemas';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const players = await prisma.player.findMany({
    where: { tournamentId: params.id },
    orderBy: { name: 'asc' },
  });
  return ok(players);
}

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const parsed = await parseJson(req, CreatePlayer);
  if (!parsed.ok) return parsed.res;

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');

  const player = await prisma.player.create({
    data: { tournamentId: params.id, ...parsed.data },
  });

  emitToTournament(params.id, 'player.added', { tournamentId: params.id, player });
  return ok(player, 201);
}
```

- [ ] **Step 2: 建立 src/app/api/players/[id]/route.ts**

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { UpdatePlayer } from '@/lib/schemas';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const parsed = await parseJson(req, UpdatePlayer);
  if (!parsed.ok) return parsed.res;

  const player = await prisma.player
    .update({ where: { id: params.id }, data: parsed.data })
    .catch(() => null);
  if (!player) return notFound();

  emitToTournament(player.tournamentId, 'player.updated', {
    tournamentId: player.tournamentId,
    player,
  });
  return ok(player);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const player = await prisma.player
    .delete({ where: { id: params.id } })
    .catch(() => null);
  if (!player) return notFound();

  emitToTournament(player.tournamentId, 'player.deleted', {
    tournamentId: player.tournamentId,
    playerId: player.id,
  });
  return ok({ deleted: true });
}
```

- [ ] **Step 3: 跑測試，確認全部 PASS**

```powershell
npx vitest run tests/integration/players.test.ts
```

Expected: 10 tests pass

- [ ] **Step 4: Commit**

```bash
git add src/app/api/tournaments/[id]/players/route.ts src/app/api/players/[id]/route.ts
git commit -m "feat(api): add Player CRUD routes (GET/POST players, PATCH/DELETE players/[id])"
```

---

## Task 10: Tournament API — teamsPerGroup 改 groupCount

**Files:**
- Modify: `src/app/api/tournaments/route.ts`
- Modify: `src/app/api/tournaments/[id]/route.ts`

- [ ] **Step 1: 在 src/app/api/tournaments/route.ts 搜尋 teamsPerGroup，確認無 hardcode（schema 已改，parsed.data spread 自動用新欄位名）**

```powershell
Select-String -Path "src\app\api\tournaments\route.ts" -Pattern "teamsPerGroup"
```

Expected: 0 matches. 若有出現，把所有 `teamsPerGroup` 換成 `groupCount`。

- [ ] **Step 2: 在 src/app/api/tournaments/[id]/route.ts 執行同樣檢查**

```powershell
Select-String -Path "src\app\api\tournaments\[id]\route.ts" -Pattern "teamsPerGroup"
```

若有出現，把所有 `teamsPerGroup` 換成 `groupCount`。

- [ ] **Step 3: 全域搜尋確認 src/ 下沒有殘留 teamsPerGroup**

```powershell
Select-String -Path "src" -Pattern "teamsPerGroup" -Recurse
```

Expected: 0 matches

- [ ] **Step 4: Commit（即使檔案無需改動也 commit 搜尋結果確認）**

```bash
git add src/app/api/tournaments/route.ts src/app/api/tournaments/[id]/route.ts
git commit -m "feat(api): confirm groupCount (no teamsPerGroup hardcode in tournament routes)"
```

---

## Task 11: Groups Generate API 重寫 — 測試先行

**Files:**
- Create: `tests/integration/groups-generate.test.ts`

- [ ] **Step 1: 建立 tests/integration/groups-generate.test.ts**

```typescript
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import request from 'supertest';

let server: ChildProcess | undefined;
const BASE = 'http://localhost:3103';

async function waitForHealthy(url: string, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await wait(500);
  }
  throw new Error('server did not become healthy');
}

beforeAll(async () => {
  server = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3103' },
    shell: process.platform === 'win32',
  });
  await waitForHealthy(`${BASE}/api/tournaments`);
}, 60_000);

afterAll(async () => {
  if (server) { server.kill(); await wait(500); }
});

describe('Groups Generate API', () => {
  let cookie = '';
  let tournamentId = '';
  const playerIds: string[] = [];

  it('setup: login + tournament + 8 players', async () => {
    const loginRes = await request(BASE)
      .post('/api/admin/login')
      .send({ password: process.env.ADMIN_PASSWORD || 'dev-password-please-change' });
    cookie = (Array.isArray(loginRes.headers['set-cookie'])
      ? loginRes.headers['set-cookie'][0]
      : loginRes.headers['set-cookie']
    ).split(';')[0];

    const tRes = await request(BASE)
      .post('/api/tournaments')
      .set('Cookie', cookie)
      .send({ name: 'group-gen-test', groupCount: 2 });
    tournamentId = tRes.body.id;

    for (let i = 0; i < 8; i++) {
      const pRes = await request(BASE)
        .post(`/api/tournaments/${tournamentId}/players`)
        .set('Cookie', cookie)
        .send({ name: `Player${i + 1}`, level: i < 4 ? 'A' : 'B' });
      playerIds.push(pRes.body.id);
    }
  });

  it('rejects body with odd player count in a group', async () => {
    const res = await request(BASE)
      .post(`/api/tournaments/${tournamentId}/groups/generate`)
      .set('Cookie', cookie)
      .send({
        groups: [
          { levelCode: 'A', playerIds: playerIds.slice(0, 3) },
          { levelCode: 'B', playerIds: playerIds.slice(3, 8) },
        ],
      });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('odd_players_in_group');
  });

  it('rejects playerIds not found in this tournament', async () => {
    const res = await request(BASE)
      .post(`/api/tournaments/${tournamentId}/groups/generate`)
      .set('Cookie', cookie)
      .send({
        groups: [{ levelCode: 'A', playerIds: ['nonexistent-id', 'another-fake'] }],
      });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('player_not_in_tournament');
  });

  it('generates groups for 8 players in 2 groups of 4', async () => {
    const res = await request(BASE)
      .post(`/api/tournaments/${tournamentId}/groups/generate`)
      .set('Cookie', cookie)
      .send({
        groups: [
          { levelCode: 'A', playerIds: playerIds.slice(0, 4) },
          { levelCode: 'B', playerIds: playerIds.slice(4, 8) },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(2);
    expect(res.body.groups[0].levelCode).toBe('A');
    expect(res.body.groups[1].levelCode).toBe('B');
  });

  it('re-generating replaces old groups', async () => {
    const res = await request(BASE)
      .post(`/api/tournaments/${tournamentId}/groups/generate`)
      .set('Cookie', cookie)
      .send({
        groups: [
          { levelCode: 'X', playerIds: playerIds.slice(0, 4) },
          { levelCode: 'Y', playerIds: playerIds.slice(4, 8) },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.groups[0].levelCode).toBe('X');
  });

  it('cleanup', async () => {
    await request(BASE).delete(`/api/tournaments/${tournamentId}`).set('Cookie', cookie);
  });
});
```

- [ ] **Step 2: 跑測試，確認 FAIL（舊 generate route 邏輯不符）**

```powershell
npx vitest run tests/integration/groups-generate.test.ts
```

Expected: tests fail（舊 route 是 snakeGroup，不接受 assignments body）

- [ ] **Step 3: Commit 測試**

```bash
git add tests/integration/groups-generate.test.ts
git commit -m "test(groups-generate): add failing integration tests for assignment-based grouping"
```

---

## Task 12: Groups Generate API 重寫 — 實作

**Files:**
- Modify: `src/app/api/tournaments/[id]/groups/generate/route.ts`

- [ ] **Step 1: 完整取代 src/app/api/tournaments/[id]/groups/generate/route.ts**

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, parseJson, requireAdmin, ensureStatus } from '@/lib/api-helpers';
import { AssignGroups } from '@/lib/schemas';
import { validateGroupingInput, applyGrouping } from '@/lib/grouping';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');

  const statusErr = ensureStatus(tournament.status, ['draft', 'grouping']);
  if (statusErr) return statusErr;

  const parsed = await parseJson(req, AssignGroups);
  if (!parsed.ok) return parsed.res;

  try {
    validateGroupingInput(parsed.data.groups);
  } catch (e: any) {
    return conflict(e.message);
  }

  // Verify all playerIds belong to this tournament
  const allPlayerIds = parsed.data.groups.flatMap((g) => g.playerIds);
  const found = await prisma.player.findMany({
    where: { id: { in: allPlayerIds }, tournamentId: params.id },
    select: { id: true },
  });
  if (found.length !== allPlayerIds.length) {
    return conflict('player_not_in_tournament');
  }

  const groups = await prisma.$transaction(async (tx) => {
    const created = await applyGrouping(tx, params.id, parsed.data.groups);
    await tx.tournament.update({
      where: { id: params.id },
      data: { status: 'grouping' },
    });
    return created;
  });

  emitToTournament(params.id, 'groups.generated', { tournamentId: params.id, groups });
  return ok({ groups });
}
```

- [ ] **Step 2: 跑測試，確認全部 PASS**

```powershell
npx vitest run tests/integration/groups-generate.test.ts
```

Expected: 5 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tournaments/[id]/groups/generate/route.ts
git commit -m "feat(api): rewrite groups/generate for assignment-based grouping (validateGroupingInput + applyGrouping)"
```

---

## Task 13: Pairs Shuffle / Lock API — 測試先行

**Files:**
- Create: `tests/integration/pairs.test.ts`

- [ ] **Step 1: 建立 tests/integration/pairs.test.ts**

```typescript
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import request from 'supertest';

let server: ChildProcess | undefined;
const BASE = 'http://localhost:3104';

async function waitForHealthy(url: string, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await wait(500);
  }
  throw new Error('server did not become healthy');
}

beforeAll(async () => {
  server = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3104' },
    shell: process.platform === 'win32',
  });
  await waitForHealthy(`${BASE}/api/tournaments`);
}, 60_000);

afterAll(async () => {
  if (server) { server.kill(); await wait(500); }
});

describe('Pairs Shuffle and Lock', () => {
  let cookie = '';
  let tournamentId = '';
  let groupId = '';
  const playerIds: string[] = [];

  it('setup: login + tournament + 4 players + generate 1 group', async () => {
    const loginRes = await request(BASE)
      .post('/api/admin/login')
      .send({ password: process.env.ADMIN_PASSWORD || 'dev-password-please-change' });
    cookie = (Array.isArray(loginRes.headers['set-cookie'])
      ? loginRes.headers['set-cookie'][0]
      : loginRes.headers['set-cookie']
    ).split(';')[0];

    const tRes = await request(BASE)
      .post('/api/tournaments')
      .set('Cookie', cookie)
      .send({ name: 'pairs-test', groupCount: 1 });
    tournamentId = tRes.body.id;

    for (let i = 0; i < 4; i++) {
      const pRes = await request(BASE)
        .post(`/api/tournaments/${tournamentId}/players`)
        .set('Cookie', cookie)
        .send({ name: `P${i + 1}`, level: 'A' });
      playerIds.push(pRes.body.id);
    }

    const gRes = await request(BASE)
      .post(`/api/tournaments/${tournamentId}/groups/generate`)
      .set('Cookie', cookie)
      .send({ groups: [{ levelCode: 'A', playerIds }] });
    groupId = gRes.body.groups[0].id;
  });

  it('POST /api/groups/:id/pairs/shuffle creates 2 pairs for 4 players', async () => {
    const res = await request(BASE)
      .post(`/api/groups/${groupId}/pairs/shuffle`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.pairs).toHaveLength(2);
    for (const pair of res.body.pairs) {
      expect(pair.player1Id).toBeTruthy();
      expect(pair.player2Id).toBeTruthy();
      expect(pair.groupId).toBe(groupId);
    }
  });

  it('re-shuffling replaces old pairs (new ids)', async () => {
    const r1 = await request(BASE).post(`/api/groups/${groupId}/pairs/shuffle`).set('Cookie', cookie);
    const r2 = await request(BASE).post(`/api/groups/${groupId}/pairs/shuffle`).set('Cookie', cookie);
    expect(r1.body.pairs).toHaveLength(2);
    expect(r2.body.pairs).toHaveLength(2);
    const ids1 = r1.body.pairs.map((p: any) => p.id).sort();
    const ids2 = r2.body.pairs.map((p: any) => p.id).sort();
    expect(ids1).not.toEqual(ids2);
  });

  it('POST /api/groups/:id/pairs/lock sets pairingLockedAt', async () => {
    await request(BASE).post(`/api/groups/${groupId}/pairs/shuffle`).set('Cookie', cookie);
    const res = await request(BASE)
      .post(`/api/groups/${groupId}/pairs/lock`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.pairingLockedAt).toBeTruthy();
  });

  it('shuffling after lock returns 409 pairing_locked', async () => {
    const res = await request(BASE)
      .post(`/api/groups/${groupId}/pairs/shuffle`)
      .set('Cookie', cookie);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('pairing_locked');
  });

  it('locking again returns 409 pairing_already_locked', async () => {
    const res = await request(BASE)
      .post(`/api/groups/${groupId}/pairs/lock`)
      .set('Cookie', cookie);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('pairing_already_locked');
  });

  it('locking the final group sets tournament status to in_progress', async () => {
    const tRes = await request(BASE).get(`/api/tournaments/${tournamentId}`);
    expect(tRes.body.status).toBe('in_progress');
  });

  it('cleanup', async () => {
    await request(BASE).delete(`/api/tournaments/${tournamentId}`).set('Cookie', cookie);
  });
});
```

- [ ] **Step 2: 跑測試，確認 FAIL（routes 不存在）**

```powershell
npx vitest run tests/integration/pairs.test.ts
```

Expected: fail with 404

- [ ] **Step 3: Commit 測試**

```bash
git add tests/integration/pairs.test.ts
git commit -m "test(pairs): add failing integration tests for shuffle + lock"
```

---

## Task 14: Pairs Shuffle API 實作

**Files:**
- Create: `src/app/api/groups/[id]/pairs/shuffle/route.ts`

- [ ] **Step 1: 建立 src/app/api/groups/[id]/pairs/shuffle/route.ts**

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, requireAdmin } from '@/lib/api-helpers';
import { shufflePairs, writePairs } from '@/lib/pairing';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const group = await prisma.group.findUnique({
    where: { id: params.id },
    include: { players: true },
  });
  if (!group) return notFound('group_not_found');

  if (group.pairingLockedAt) {
    return conflict('pairing_locked');
  }

  const playerIds = group.players.map((p) => p.id);

  let drafts;
  try {
    drafts = shufflePairs(playerIds);
  } catch (e: any) {
    return conflict(e.message);
  }

  const pairs = await prisma.$transaction((tx) =>
    writePairs(tx, group.tournamentId, group.id, drafts),
  );

  emitToTournament(group.tournamentId, 'pairs.shuffled', {
    tournamentId: group.tournamentId,
    groupId: group.id,
    pairs,
  });

  return ok({ pairs });
}
```

- [ ] **Step 2: Commit（部分實作，lock 在下一 Task）**

```bash
git add src/app/api/groups/[id]/pairs/shuffle/route.ts
git commit -m "feat(api): add pairs/shuffle route"
```

---

## Task 15: Pairs Lock API 實作

**Files:**
- Create: `src/app/api/groups/[id]/pairs/lock/route.ts`

- [ ] **Step 1: 建立 src/app/api/groups/[id]/pairs/lock/route.ts**

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, requireAdmin } from '@/lib/api-helpers';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const group = await prisma.group.findUnique({
    where: { id: params.id },
    include: { pairs: true },
  });
  if (!group) return notFound('group_not_found');

  if (group.pairingLockedAt) {
    return conflict('pairing_already_locked');
  }

  if (group.pairs.length === 0) {
    return conflict('no_pairs_to_lock');
  }

  const updatedGroup = await prisma.group.update({
    where: { id: params.id },
    data: { pairingLockedAt: new Date() },
  });

  emitToTournament(group.tournamentId, 'pairing.locked', {
    tournamentId: group.tournamentId,
    groupId: group.id,
  });

  // If all groups in the tournament are now locked, advance tournament to in_progress
  const unlockedCount = await prisma.group.count({
    where: { tournamentId: group.tournamentId, pairingLockedAt: null },
  });

  if (unlockedCount === 0) {
    const updatedTournament = await prisma.tournament.update({
      where: { id: group.tournamentId },
      data: { status: 'in_progress' },
    });
    emitToTournament(group.tournamentId, 'tournament.updated', {
      tournamentId: group.tournamentId,
      tournament: updatedTournament,
    });
  }

  return ok(updatedGroup);
}
```

- [ ] **Step 2: 跑 pairs 整合測試，確認全部 PASS**

```powershell
npx vitest run tests/integration/pairs.test.ts
```

Expected: 8 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/app/api/groups/[id]/pairs/lock/route.ts
git commit -m "feat(api): add pairs/lock route; all groups locked advances tournament to in_progress"
```

---

## Task 16: Matches Generate API — pairAId/pairBId

**Files:**
- Modify: `src/app/api/tournaments/[id]/matches/generate/route.ts`

- [ ] **Step 1: 完整取代 src/app/api/tournaments/[id]/matches/generate/route.ts**

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, requireAdmin, ensureStatus } from '@/lib/api-helpers';
import { roundRobinPairs } from '@/lib/algorithms/circle-method';
import { allocateCourts, type MatchInput } from '@/lib/algorithms/court-allocation';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');

  const statusErr = ensureStatus(tournament.status, ['in_progress']);
  if (statusErr) return statusErr;

  const groups = await prisma.group.findMany({
    where: { tournamentId: params.id },
    include: { pairs: true },
    orderBy: { displayOrder: 'asc' },
  });
  const courts = await prisma.court.findMany({
    where: { tournamentId: params.id },
    orderBy: { displayOrder: 'asc' },
  });

  if (groups.length === 0) return conflict('no_groups');

  type Draft = {
    tournamentId: string;
    groupId: string;
    pairAId: string;
    pairBId: string;
    roundNumber: number;
    matchOrder: number;
  };

  const drafts: Draft[] = [];
  for (const g of groups) {
    const pairIds = g.pairs.map((p) => p.id);
    const matches = roundRobinPairs(pairIds);
    for (const m of matches) {
      drafts.push({
        tournamentId: params.id,
        groupId: g.id,
        pairAId: m.teamA,
        pairBId: m.teamB,
        roundNumber: m.roundNumber,
        matchOrder: m.matchOrder,
      });
    }
  }

  if (drafts.length === 0) return conflict('no_matches_to_generate');

  const matchInputs: MatchInput[] = drafts.map((d, idx) => ({
    id: `tmp${idx}`,
    groupId: d.groupId,
    roundNumber: d.roundNumber,
  }));
  const allocations = allocateCourts(matchInputs, courts.map((c) => c.id));
  const courtById = new Map(allocations.map((a) => [a.id, a.courtId]));

  const result = await prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { tournamentId: params.id } });
    const created = [];
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
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
    return created;
  });

  emitToTournament(params.id, 'match.generated', { tournamentId: params.id, matches: result });
  return ok({ matches: result, count: result.length });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/tournaments/[id]/matches/generate/route.ts
git commit -m "feat(api): matches/generate uses pairAId/pairBId (replaces teamAId/teamBId)"
```

---

## Task 17: Groups route — include players + pairs; lock route — teams 改 players

**Files:**
- Modify: `src/app/api/tournaments/[id]/groups/route.ts`
- Modify: `src/app/api/tournaments/[id]/groups/lock/route.ts`

- [ ] **Step 1: 在 src/app/api/tournaments/[id]/groups/route.ts 的 GET handler，把 include: { teams: true } 改成 include: { players: true, pairs: { orderBy: { displayOrder: 'asc' } } }**

找到：
```typescript
include: { teams: true }
```
改成：
```typescript
include: {
  players: { orderBy: { name: 'asc' } },
  pairs: { orderBy: { displayOrder: 'asc' } },
}
```

- [ ] **Step 2: 在 src/app/api/tournaments/[id]/groups/lock/route.ts，把 teams 驗證改成 players**

找到：
```typescript
include: { teams: true },
```
改成：
```typescript
include: { players: true },
```

並把所有 `g.teams` 改成 `g.players`：
```typescript
// 舊
if (g.teams.length < 2) return conflict('group_too_small');
// 新
if (g.players.length < 2) return conflict('group_too_small');
```

也把：
```typescript
const orphan = await prisma.team.count({
  where: { tournamentId: params.id, groupId: null },
});
if (orphan > 0) return conflict('teams_not_grouped');
```
改成：
```typescript
const orphan = await prisma.player.count({
  where: { tournamentId: params.id, groupId: null },
});
if (orphan > 0) return conflict('players_not_grouped');
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tournaments/[id]/groups/route.ts src/app/api/tournaments/[id]/groups/lock/route.ts
git commit -m "feat(api): groups route includes players+pairs; lock validates players not teams"
```

---

## Task 18: Standings SQL fix — pairAId/pairBId

**Files:**
- Modify: `src/lib/standings-sql.ts`

- [ ] **Step 1: 讀取 src/lib/standings-sql.ts，找出所有 teamAId、teamBId、Team 的 raw SQL 參照**

```powershell
Select-String -Path "src\lib\standings-sql.ts" -Pattern "teamAId|teamBId|\"Team\""
```

- [ ] **Step 2: 把 raw SQL 中的 "teamAId" 改成 "pairAId"，"teamBId" 改成 "pairBId"，JOIN "Team" 改成 JOIN "Pair"，所有 camelCase 欄位名稱保持雙引號包裹**

具體替換規則（raw SQL 中每個 camelCase 必須雙引號包裹，Prisma 不轉 snake_case）：

```sql
-- 舊：
WHERE m."teamAId" = t.id OR m."teamBId" = t.id
JOIN "Team" t ON ...

-- 新：
WHERE m."pairAId" = p.id OR m."pairBId" = p.id
JOIN "Pair" p ON ...
```

- [ ] **Step 3: 跑現有 standings 相關測試確認沒有 regression**

```powershell
npx vitest run tests/integration/api.test.ts --reporter=verbose 2>&1 | Select-String "standings"
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/standings-sql.ts
git commit -m "fix(standings): update raw SQL to use pairAId/pairBId and Pair table"
```

---

## Task 19: Socket smoke test 改寫

**Files:**
- Modify: `tests/integration/socket.test.ts`

- [ ] **Step 1: 完整取代 tests/integration/socket.test.ts**

```typescript
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { io as ioClient, type Socket } from 'socket.io-client';
import request from 'supertest';

let server: ChildProcess | undefined;
const BASE = 'http://localhost:3105';

async function waitForHealthy(url: string, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await wait(500);
  }
  throw new Error('server did not become healthy');
}

beforeAll(async () => {
  server = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3105' },
    shell: process.platform === 'win32',
  });
  await waitForHealthy(`${BASE}/api/tournaments`);
}, 60_000);

afterAll(async () => {
  if (server) { server.kill(); await wait(500); }
});

async function adminLogin(): Promise<string> {
  const res = await request(BASE)
    .post('/api/admin/login')
    .send({ password: process.env.ADMIN_PASSWORD || 'dev-password-please-change' });
  return (Array.isArray(res.headers['set-cookie'])
    ? res.headers['set-cookie'][0]
    : res.headers['set-cookie']
  ).split(';')[0];
}

describe('socket events', () => {
  it('subscribed client receives player.added when admin adds player', async () => {
    const cookie = await adminLogin();
    const tRes = await request(BASE)
      .post('/api/tournaments')
      .set('Cookie', cookie)
      .send({ name: 'socket-player-test', groupCount: 2 });
    const tournamentId = tRes.body.id;

    const socket: Socket = ioClient(BASE, { path: '/socket.io/' });
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    const received: any[] = [];
    socket.on('player.added', (payload) => received.push(payload));
    socket.emit('subscribe', { tournamentId });
    await wait(100);

    await request(BASE)
      .post(`/api/tournaments/${tournamentId}/players`)
      .set('Cookie', cookie)
      .send({ name: 'Alice', level: 'A' });

    await wait(200);
    expect(received.length).toBe(1);
    expect(received[0].player.name).toBe('Alice');

    socket.disconnect();
    await request(BASE).delete(`/api/tournaments/${tournamentId}`).set('Cookie', cookie);
  }, 20_000);

  it('subscribed client receives pairs.shuffled after shuffle', async () => {
    const cookie = await adminLogin();
    const tRes = await request(BASE)
      .post('/api/tournaments')
      .set('Cookie', cookie)
      .send({ name: 'socket-shuffle-test', groupCount: 1 });
    const tournamentId = tRes.body.id;

    const pids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const pRes = await request(BASE)
        .post(`/api/tournaments/${tournamentId}/players`)
        .set('Cookie', cookie)
        .send({ name: `SP${i + 1}`, level: 'A' });
      pids.push(pRes.body.id);
    }
    const gRes = await request(BASE)
      .post(`/api/tournaments/${tournamentId}/groups/generate`)
      .set('Cookie', cookie)
      .send({ groups: [{ levelCode: 'A', playerIds: pids }] });
    const groupId = gRes.body.groups[0].id;

    const socket: Socket = ioClient(BASE, { path: '/socket.io/' });
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    const events: any[] = [];
    socket.on('pairs.shuffled', (payload) => events.push(payload));
    socket.emit('subscribe', { tournamentId });
    await wait(100);

    await request(BASE).post(`/api/groups/${groupId}/pairs/shuffle`).set('Cookie', cookie);
    await wait(200);

    expect(events.length).toBe(1);
    expect(events[0].groupId).toBe(groupId);
    expect(events[0].pairs).toHaveLength(2);

    socket.disconnect();
    await request(BASE).delete(`/api/tournaments/${tournamentId}`).set('Cookie', cookie);
  }, 20_000);

  it('subscribed client receives pairing.locked after lock', async () => {
    const cookie = await adminLogin();
    const tRes = await request(BASE)
      .post('/api/tournaments')
      .set('Cookie', cookie)
      .send({ name: 'socket-lock-test', groupCount: 1 });
    const tournamentId = tRes.body.id;

    const pids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const pRes = await request(BASE)
        .post(`/api/tournaments/${tournamentId}/players`)
        .set('Cookie', cookie)
        .send({ name: `LP${i + 1}`, level: 'A' });
      pids.push(pRes.body.id);
    }
    const gRes = await request(BASE)
      .post(`/api/tournaments/${tournamentId}/groups/generate`)
      .set('Cookie', cookie)
      .send({ groups: [{ levelCode: 'A', playerIds: pids }] });
    const groupId = gRes.body.groups[0].id;

    await request(BASE).post(`/api/groups/${groupId}/pairs/shuffle`).set('Cookie', cookie);

    const socket: Socket = ioClient(BASE, { path: '/socket.io/' });
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    const lockEvents: any[] = [];
    socket.on('pairing.locked', (payload) => lockEvents.push(payload));
    socket.emit('subscribe', { tournamentId });
    await wait(100);

    await request(BASE).post(`/api/groups/${groupId}/pairs/lock`).set('Cookie', cookie);
    await wait(200);

    expect(lockEvents.length).toBe(1);
    expect(lockEvents[0].groupId).toBe(groupId);

    socket.disconnect();
    await request(BASE).delete(`/api/tournaments/${tournamentId}`).set('Cookie', cookie);
  }, 20_000);
});
```

- [ ] **Step 2: 跑測試**

```powershell
npx vitest run tests/integration/socket.test.ts
```

Expected: 3 tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/integration/socket.test.ts
git commit -m "test(socket): rewrite smoke test with player.added, pairs.shuffled, pairing.locked"
```

---

## Task 20: Full smoke test 更新

**Files:**
- Modify: `tests/integration/api.test.ts`

- [ ] **Step 1: 完整取代 tests/integration/api.test.ts**

```typescript
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import request from 'supertest';

let server: ChildProcess | undefined;
const BASE = 'http://localhost:3100';

async function waitForHealthy(url: string, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await wait(500);
  }
  throw new Error('server did not become healthy');
}

beforeAll(async () => {
  server = spawn('npm', ['run', 'dev', '--', '-p', '3100'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3100' },
    shell: process.platform === 'win32',
  });
  await waitForHealthy(`${BASE}/api/tournaments`);
}, 60_000);

afterAll(async () => {
  if (server) { server.kill(); await wait(500); }
});

describe('full tournament flow (smoke)', () => {
  let cookie = '';
  let tournamentId = '';
  const playerIds: string[] = [];
  let groupIds: string[] = [];

  it('logs in as admin', async () => {
    const res = await request(BASE)
      .post('/api/admin/login')
      .send({ password: process.env.ADMIN_PASSWORD || 'dev-password-please-change' });
    expect(res.status).toBe(200);
    const setCookie = res.headers['set-cookie'];
    cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0];
  });

  it('creates a tournament with groupCount=2', async () => {
    const res = await request(BASE)
      .post('/api/tournaments')
      .set('Cookie', cookie)
      .send({ name: 'smoke-test', groupCount: 2 });
    expect(res.status).toBe(201);
    tournamentId = res.body.id;
    expect(res.body.groupCount).toBe(2);
  });

  it('adds 8 players and 2 courts', async () => {
    for (let i = 1; i <= 8; i++) {
      const r = await request(BASE)
        .post(`/api/tournaments/${tournamentId}/players`)
        .set('Cookie', cookie)
        .send({ name: `Player${i}`, level: i <= 4 ? 'A' : 'B' });
      expect(r.status).toBe(201);
      playerIds.push(r.body.id);
    }
    for (let i = 1; i <= 2; i++) {
      const r = await request(BASE)
        .post(`/api/tournaments/${tournamentId}/courts`)
        .set('Cookie', cookie)
        .send({ name: `Court ${i}` });
      expect(r.status).toBe(201);
    }
  });

  it('generates 2 groups of 4 players each', async () => {
    const res = await request(BASE)
      .post(`/api/tournaments/${tournamentId}/groups/generate`)
      .set('Cookie', cookie)
      .send({
        groups: [
          { levelCode: 'A', playerIds: playerIds.slice(0, 4) },
          { levelCode: 'B', playerIds: playerIds.slice(4, 8) },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(2);
    groupIds = res.body.groups.map((g: any) => g.id);
  });

  it('shuffles pairs for each group', async () => {
    for (const gid of groupIds) {
      const r = await request(BASE)
        .post(`/api/groups/${gid}/pairs/shuffle`)
        .set('Cookie', cookie);
      expect(r.status).toBe(200);
      // 4 players → 2 pairs
      expect(r.body.pairs).toHaveLength(2);
    }
  });

  it('locks all groups → tournament becomes in_progress', async () => {
    for (const gid of groupIds) {
      const r = await request(BASE)
        .post(`/api/groups/${gid}/pairs/lock`)
        .set('Cookie', cookie);
      expect(r.status).toBe(200);
    }
    const t = await request(BASE).get(`/api/tournaments/${tournamentId}`);
    expect(t.body.status).toBe('in_progress');
  });

  it('generates matches (2 groups × C(2,2)=1 = 2 matches)', async () => {
    const res = await request(BASE)
      .post(`/api/tournaments/${tournamentId}/matches/generate`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });

  it('fills scores → tournament becomes finished', async () => {
    const matches = (await request(BASE).get(`/api/tournaments/${tournamentId}/matches`)).body;
    for (const mch of matches) {
      const r = await request(BASE)
        .patch(`/api/matches/${mch.id}/score`)
        .set('Cookie', cookie)
        .send({ scoreA: 21, scoreB: 15 });
      expect(r.status).toBe(200);
    }
    const t = (await request(BASE).get(`/api/tournaments/${tournamentId}`)).body;
    expect(t.status).toBe('finished');
  });

  it('returns standings', async () => {
    const s = await request(BASE).get(`/api/tournaments/${tournamentId}/standings`);
    expect(s.status).toBe(200);
    expect(Array.isArray(s.body)).toBe(true);
  });

  it('cleanup', async () => {
    const d = await request(BASE).delete(`/api/tournaments/${tournamentId}`).set('Cookie', cookie);
    expect(d.status).toBe(200);
  });
});
```

- [ ] **Step 2: 跑測試**

```powershell
npx vitest run tests/integration/api.test.ts
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/integration/api.test.ts
git commit -m "test(api): rewrite smoke test for Player+Pair flow (groupCount, shuffle, lock)"
```

---

## Task 21: Admin UI — SectionPlayers

**Files:**
- Create: `src/components/admin/section-players.tsx`

- [ ] **Step 1: 建立 src/components/admin/section-players.tsx**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { Player, Tournament } from '@prisma/client';

export function SectionPlayers({
  tournament,
  revision,
}: {
  tournament: Tournament;
  revision: number;
}) {
  const { toast } = useToast();
  const locked = tournament.status === 'in_progress' || tournament.status === 'finished';
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState('');
  const [level, setLevel] = useState('');

  useEffect(() => {
    api<Player[]>(`/api/tournaments/${tournament.id}/players`).then(setPlayers);
  }, [tournament.id, revision]);

  async function add() {
    if (!name.trim()) return;
    try {
      await api(`/api/tournaments/${tournament.id}/players`, {
        method: 'POST',
        body: { name: name.trim(), level: level.trim() || undefined },
      });
      setName('');
      setLevel('');
    } catch {
      toast({ title: '新增失敗', variant: 'destructive' });
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/players/${id}`, { method: 'DELETE' });
    } catch {
      toast({ title: '刪除失敗', variant: 'destructive' });
    }
  }

  return (
    <section id="players" className="scroll-mt-16">
      <h2 className="mb-3 text-xl font-semibold">2. 球員報名 ({players.length})</h2>
      <Card className="p-4">
        {!locked && (
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="p-name">姓名</Label>
              <Input
                id="p-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="球員姓名"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-level">等級</Label>
              <Input
                id="p-level"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="例：A、B、C"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={add} disabled={!name.trim()} className="w-full">
                新增
              </Button>
            </div>
          </div>
        )}
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {players.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-md border p-2">
              <div className="flex-1">
                <div className="font-medium">{p.name}</div>
                {p.level && (
                  <div className="text-xs text-muted-foreground">等級：{p.level}</div>
                )}
              </div>
              {!locked && (
                <Button variant="ghost" size="sm" onClick={() => remove(p.id)}>
                  刪除
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/section-players.tsx
git commit -m "feat(ui): add SectionPlayers admin component (replaces SectionTeams)"
```

---

## Task 22: Admin UI — SectionGroups 重寫

**Files:**
- Modify: `src/components/admin/section-groups.tsx`

- [ ] **Step 1: 完整取代 src/components/admin/section-groups.tsx**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { Group, Player, Pair, Tournament } from '@prisma/client';

type GroupWithData = Group & { players: Player[]; pairs: Pair[] };

export function SectionGroups({
  tournament,
  revision,
}: {
  tournament: Tournament;
  revision: number;
}) {
  const { toast } = useToast();
  const [groups, setGroups] = useState<GroupWithData[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  const canGenerate = tournament.status === 'draft' || tournament.status === 'grouping';
  const canEdit = tournament.status === 'grouping';

  useEffect(() => {
    api<GroupWithData[]>(`/api/tournaments/${tournament.id}/groups`).then(setGroups);
    api<Player[]>(`/api/tournaments/${tournament.id}/players`).then(setPlayers);
  }, [tournament.id, revision]);

  async function generate() {
    // Auto-assign: group players by their level field; each distinct level = one group
    const byLevel = new Map<string, string[]>();
    for (const p of players) {
      const lvl = p.level ?? 'unassigned';
      const arr = byLevel.get(lvl) ?? [];
      arr.push(p.id);
      byLevel.set(lvl, arr);
    }
    const groupsPayload = [...byLevel.entries()].map(([levelCode, playerIds]) => ({
      levelCode,
      playerIds,
    }));
    try {
      await api(`/api/tournaments/${tournament.id}/groups/generate`, {
        method: 'POST',
        body: { groups: groupsPayload },
      });
      toast({ title: '已產生分組' });
    } catch (e: any) {
      toast({ title: '無法產生分組', description: e.body?.error, variant: 'destructive' });
    }
  }

  async function movePlayer(playerId: string, toGroupId: string) {
    try {
      await api(`/api/players/${playerId}`, {
        method: 'PATCH',
        body: { groupId: toGroupId },
      });
    } catch {
      toast({ title: '移動失敗', variant: 'destructive' });
    }
  }

  async function shuffle(groupId: string) {
    try {
      await api(`/api/groups/${groupId}/pairs/shuffle`, { method: 'POST' });
      toast({ title: '配對已重抽' });
    } catch (e: any) {
      toast({ title: '重抽失敗', description: e.body?.error, variant: 'destructive' });
    }
  }

  async function lockPairing(groupId: string) {
    try {
      await api(`/api/groups/${groupId}/pairs/lock`, { method: 'POST' });
      toast({ title: '配對已鎖定' });
    } catch (e: any) {
      toast({ title: '鎖定失敗', description: e.body?.error, variant: 'destructive' });
    }
  }

  return (
    <section id="groups" className="scroll-mt-16">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-xl font-semibold">3. 分組與配對</h2>
        {canGenerate && (
          <Button onClick={generate} size="sm" disabled={players.length === 0}>
            依等級自動分組
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => {
          const isLocked = !!g.pairingLockedAt;
          return (
            <Card key={g.id} className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-semibold">
                  {g.name} 組{' '}
                  <span className="text-xs text-muted-foreground">({g.levelCode})</span>
                </div>
                {isLocked && (
                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                    已鎖定
                  </span>
                )}
              </div>

              <div className="mb-3">
                <div className="mb-1 text-xs font-medium text-muted-foreground">球員</div>
                <ul className="space-y-1">
                  {g.players.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>{p.name}</span>
                      {canEdit && !isLocked && (
                        <select
                          className="h-7 rounded border px-1 text-xs"
                          value={g.id}
                          onChange={(e) => movePlayer(p.id, e.target.value)}
                        >
                          {groups.map((gg) => (
                            <option key={gg.id} value={gg.id}>
                              {gg.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {g.pairs.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">配對</div>
                  <ul className="space-y-1">
                    {g.pairs.map((pair, idx) => {
                      const p1 = g.players.find((p) => p.id === pair.player1Id);
                      const p2 = g.players.find((p) => p.id === pair.player2Id);
                      return (
                        <li key={pair.id} className="text-sm">
                          {idx + 1}. {p1?.name ?? '?'} / {p2?.name ?? '?'}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {canEdit && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isLocked}
                    onClick={() => shuffle(g.id)}
                  >
                    重抽配對
                  </Button>
                  <Button
                    size="sm"
                    disabled={isLocked || g.pairs.length === 0}
                    onClick={() => lockPairing(g.id)}
                  >
                    鎖定配對
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/section-groups.tsx
git commit -m "feat(ui): rewrite SectionGroups with player list, shuffle, and lock pairing per group"
```

---

## Task 23: Admin UI — SectionSettings groupCount

**Files:**
- Modify: `src/components/admin/section-settings.tsx`

- [ ] **Step 1: 在 section-settings.tsx 裡，把 teamsPerGroup 相關的所有部分改成 groupCount**

找到：
```typescript
const [teamsPerGroup, setTeamsPerGroup] = useState(tournament.teamsPerGroup);
```
改成：
```typescript
const [groupCount, setGroupCount] = useState((tournament as any).groupCount as number);
```

找到：
```typescript
body: { name, teamsPerGroup, pointsPerGame },
```
改成：
```typescript
body: { name, groupCount, pointsPerGame },
```

找到（label + input block）：
```typescript
<Label htmlFor="s-tpg">每組隊伍數</Label>
<Input
  id="s-tpg"
  type="number"
  min={2}
  max={16}
  value={teamsPerGroup}
  onChange={(e) => setTeamsPerGroup(Number(e.target.value))}
  disabled={lockedSettings}
/>
```
改成：
```typescript
<Label htmlFor="s-gc">組數</Label>
<Input
  id="s-gc"
  type="number"
  min={1}
  max={26}
  value={groupCount}
  onChange={(e) => setGroupCount(Number(e.target.value))}
  disabled={lockedSettings}
/>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/section-settings.tsx
git commit -m "feat(ui): rename teamsPerGroup to groupCount in SectionSettings"
```

---

## Task 24: WorkspaceClient — SectionPlayers + socket 事件

**Files:**
- Modify: `src/app/admin/t/[id]/workspace-client.tsx`

- [ ] **Step 1: 完整取代 src/app/admin/t/[id]/workspace-client.tsx**

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTournamentSocket } from '@/lib/use-socket';
import { WorkspaceNav } from '@/components/admin/workspace-nav';
import { SectionSettings } from '@/components/admin/section-settings';
import { SectionPlayers } from '@/components/admin/section-players';
import { SectionGroups } from '@/components/admin/section-groups';
import { SectionMatches } from '@/components/admin/section-matches';
import { SectionScoring } from '@/components/admin/section-scoring';
import type { Tournament } from '@prisma/client';

export function WorkspaceClient({
  tournamentId,
  initialTournament,
}: {
  tournamentId: string;
  initialTournament: Tournament;
}) {
  const router = useRouter();
  const [tournament, setTournament] = useState(initialTournament);
  const [revision, setRevision] = useState(0);
  const bump = () => setRevision((r) => r + 1);

  useTournamentSocket(tournamentId, {
    'player.added': bump,
    'player.updated': bump,
    'player.deleted': bump,
    'groups.generated': bump,
    'pairs.shuffled': bump,
    'pairing.locked': () => {
      bump();
      router.refresh();
    },
    'match.generated': bump,
    'match.scored': bump,
    'tournament.updated': (payload: { tournament: Tournament }) => {
      setTournament(payload.tournament);
      bump();
    },
  });

  return (
    <div className="space-y-12">
      <WorkspaceNav />
      <SectionSettings tournament={tournament} />
      <SectionPlayers tournament={tournament} revision={revision} />
      <SectionGroups tournament={tournament} revision={revision} />
      <SectionMatches tournament={tournament} revision={revision} />
      <SectionScoring tournament={tournament} revision={revision} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/t/[id]/workspace-client.tsx
git commit -m "feat(ui): workspace uses SectionPlayers; socket events updated to player.* + pairs.*"
```

---

## Task 25: Viewer — PlayersTab

**Files:**
- Create: `src/components/viewer/players-tab.tsx`

- [ ] **Step 1: 建立 src/components/viewer/players-tab.tsx**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import type { Player } from '@prisma/client';

export function PlayersTab({
  tournamentId,
  revision,
}: {
  tournamentId: string;
  revision: number;
}) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<Player[]>(`/api/tournaments/${tournamentId}/players`)
      .then(setPlayers)
      .finally(() => setLoading(false));
  }, [tournamentId, revision]);

  if (loading && players.length === 0)
    return <p className="py-6 text-muted-foreground">載入中...</p>;
  if (players.length === 0)
    return <p className="py-6 text-muted-foreground">尚無球員報名</p>;

  return (
    <div className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-3">
      {players.map((p) => (
        <Card key={p.id} className="p-4">
          <div className="flex items-start justify-between">
            <div className="font-medium">{p.name}</div>
            {p.level && <Badge variant="outline">{p.level}</Badge>}
          </div>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/viewer/players-tab.tsx
git commit -m "feat(ui): add PlayersTab viewer component"
```

---

## Task 26: Viewer — PairsTab

**Files:**
- Create: `src/components/viewer/pairs-tab.tsx`

- [ ] **Step 1: 建立 src/components/viewer/pairs-tab.tsx**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import type { Group, Player, Pair } from '@prisma/client';

type GroupWithData = Group & { players: Player[]; pairs: Pair[] };

export function PairsTab({
  tournamentId,
  revision,
}: {
  tournamentId: string;
  revision: number;
}) {
  const [groups, setGroups] = useState<GroupWithData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<GroupWithData[]>(`/api/tournaments/${tournamentId}/groups`)
      .then(setGroups)
      .finally(() => setLoading(false));
  }, [tournamentId, revision]);

  if (loading && groups.length === 0)
    return <p className="py-6 text-muted-foreground">載入中...</p>;

  const groupsWithPairs = groups.filter((g) => g.pairs.length > 0);
  if (groupsWithPairs.length === 0)
    return <p className="py-6 text-muted-foreground">尚未配對</p>;

  return (
    <div className="grid gap-4 py-4 md:grid-cols-2 lg:grid-cols-3">
      {groupsWithPairs.map((g) => (
        <Card key={g.id} className="p-4">
          <div className="mb-2 text-lg font-semibold">
            {g.name} 組
            {g.pairingLockedAt && (
              <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                已鎖定
              </span>
            )}
          </div>
          <ul className="space-y-1 text-sm">
            {g.pairs
              .slice()
              .sort((a, b) => a.displayOrder - b.displayOrder)
              .map((pair, idx) => {
                const p1 = g.players.find((p) => p.id === pair.player1Id);
                const p2 = g.players.find((p) => p.id === pair.player2Id);
                return (
                  <li key={pair.id} className="flex gap-2">
                    <span className="text-muted-foreground">{idx + 1}.</span>
                    <span>
                      {p1?.name ?? '?'} / {p2?.name ?? '?'}
                    </span>
                  </li>
                );
              })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/viewer/pairs-tab.tsx
git commit -m "feat(ui): add PairsTab viewer component"
```

---

## Task 27: Viewer GroupsTab — teams 改 players

**Files:**
- Modify: `src/components/viewer/groups-tab.tsx`

- [ ] **Step 1: 完整取代 src/components/viewer/groups-tab.tsx**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import type { Group, Player } from '@prisma/client';

type GroupWithPlayers = Group & { players: Player[] };

export function GroupsTab({
  tournamentId,
  revision,
}: {
  tournamentId: string;
  revision: number;
}) {
  const [groups, setGroups] = useState<GroupWithPlayers[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<GroupWithPlayers[]>(`/api/tournaments/${tournamentId}/groups`)
      .then(setGroups)
      .finally(() => setLoading(false));
  }, [tournamentId, revision]);

  if (loading && groups.length === 0)
    return <p className="py-6 text-muted-foreground">載入中...</p>;
  if (groups.length === 0)
    return <p className="py-6 text-muted-foreground">尚未分組</p>;

  return (
    <div className="grid gap-4 py-4 md:grid-cols-2 lg:grid-cols-3">
      {groups.map((g) => (
        <Card key={g.id} className="p-4">
          <div className="mb-2 text-lg font-semibold">
            {g.name} 組
            <span className="ml-2 text-sm text-muted-foreground">({g.levelCode})</span>
          </div>
          <ul className="space-y-1 text-sm">
            {g.players.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>{p.name}</span>
                {p.level && <span className="text-muted-foreground">{p.level}</span>}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/viewer/groups-tab.tsx
git commit -m "feat(ui): GroupsTab shows players with levelCode instead of teams"
```

---

## Task 28: ViewerClient — socket 事件更新 + 新 Tabs

**Files:**
- Modify: `src/app/t/[id]/viewer-client.tsx`

- [ ] **Step 1: 完整取代 src/app/t/[id]/viewer-client.tsx**

```typescript
'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useTournamentSocket } from '@/lib/use-socket';
import { PlayersTab } from '@/components/viewer/players-tab';
import { GroupsTab } from '@/components/viewer/groups-tab';
import { PairsTab } from '@/components/viewer/pairs-tab';
import { MatchesTab } from '@/components/viewer/matches-tab';
import { StandingsTab } from '@/components/viewer/standings-tab';
import type { Tournament } from '@prisma/client';

export function ViewerClient({
  tournamentId,
  initialTournament,
}: {
  tournamentId: string;
  initialTournament: Tournament;
}) {
  const [revision, setRevision] = useState(0);
  const bump = () => setRevision((r) => r + 1);

  useTournamentSocket(tournamentId, {
    'player.added': bump,
    'player.updated': bump,
    'player.deleted': bump,
    'groups.generated': bump,
    'pairs.shuffled': bump,
    'pairing.locked': bump,
    'match.generated': bump,
    'tournament.updated': bump,
    'match.scored': bump,
  });

  return (
    <Tabs defaultValue="standings">
      <TabsList>
        <TabsTrigger value="players">球員名單</TabsTrigger>
        <TabsTrigger value="groups">分組</TabsTrigger>
        <TabsTrigger value="pairs">配對</TabsTrigger>
        <TabsTrigger value="matches">賽程</TabsTrigger>
        <TabsTrigger value="standings">即時排名</TabsTrigger>
      </TabsList>
      <TabsContent value="players">
        <PlayersTab tournamentId={tournamentId} revision={revision} />
      </TabsContent>
      <TabsContent value="groups">
        <GroupsTab tournamentId={tournamentId} revision={revision} />
      </TabsContent>
      <TabsContent value="pairs">
        <PairsTab tournamentId={tournamentId} revision={revision} />
      </TabsContent>
      <TabsContent value="matches">
        <MatchesTab tournamentId={tournamentId} revision={revision} />
      </TabsContent>
      <TabsContent value="standings">
        <StandingsTab tournamentId={tournamentId} revision={revision} />
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/t/[id]/viewer-client.tsx
git commit -m "feat(ui): viewer adds Players+Pairs tabs; socket events updated to player.*/pairs.*"
```

---

## Task 29: 清理舊計畫衝突標記

**Files:**
- Modify: `docs/superpowers/plans/2026-05-21-badminton-ui-realtime.md`

- [ ] **Step 1: 在 2026-05-21-badminton-ui-realtime.md 第一行前插入警告區塊**

在檔案開頭（`# 羽球友誼賽` 標題之前）插入：

```markdown
> WARNING: Task 9-23 已由 `docs/superpowers/plans/2026-05-26-roster-grouping-rewrite.md` 取代。本檔僅保留 Task 1-8（Socket infra、custom server、shadcn、useSocket hook、emitToTournament、socket smoke test 基礎設施）作為前置參考。

```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-05-21-badminton-ui-realtime.md
git commit -m "docs: mark ui-realtime plan Task 9-23 as superseded by roster-grouping-rewrite"
```

---

## Self-Review（已執行）

**Spec coverage — 全部 Task 已涵蓋：**
- Player model + Pair model (Task 1)
- groupCount 取代 teamsPerGroup (Tasks 1, 3, 10, 23)
- levelCode + pairingLockedAt on Group (Tasks 1, 15)
- socket 事件型別重寫 (Task 2)
- validateGroupingInput 單元測試 + 實作 (Tasks 4, 5)
- shufflePairs + writePairs 單元測試 + 實作 (Tasks 6, 7)
- Player CRUD API 整合測試 + 實作 (Tasks 8, 9)
- groups/generate 重寫測試 + 實作 (Tasks 11, 12)
- pairs/shuffle 測試 + 實作 (Tasks 13, 14)
- pairs/lock + tournament status advance 測試 + 實作 (Tasks 13, 15)
- matches/generate pairAId/pairBId (Task 16)
- groups route include players+pairs; lock route (Task 17)
- standings SQL raw query fix (Task 18)
- socket smoke test 3 cases (Task 19)
- full smoke test rewrite (Task 20)
- SectionPlayers (Task 21), SectionGroups rewrite (Task 22), SectionSettings groupCount (Task 23)
- WorkspaceClient (Task 24), PlayersTab (Task 25), PairsTab (Task 26), GroupsTab (Task 27), ViewerClient (Task 28)
- 舊計畫標記 (Task 29)

**Placeholder scan:** 無 TBD / similar to / 略 / add appropriate 等佔位字。

**Type consistency:**
- `GroupAssignment` 定義於 `src/lib/grouping.ts` (Task 5)，測試 import 同一路徑 (Task 4)。
- `PairDraft` 定義於 `src/lib/pairing.ts` (Task 7)，測試 import 同一路徑 (Task 6)。
- `applyGrouping` 與 `writePairs` 均接受 Prisma interactive tx type，簽名一致。
- `pairs.shuffled` — 型別 (Task 2) / emit (Task 14) / test (Task 19) 三處 payload `{ tournamentId, groupId, pairs }` 一致。
- `pairing.locked` — 型別 (Task 2) / emit (Task 15) / test (Task 19) 三處 payload `{ tournamentId, groupId }` 一致。
- `pairAId`/`pairBId` — schema (Task 1) / matches generate (Task 16) / standings fix (Task 18) 三處一致。
- `groupCount` — schema (Task 1) / schemas.ts (Task 3) / section-settings (Task 23) / smoke test (Task 20) 四處一致。
- `roundRobinPairs` 回傳 `{ teamA, teamB, roundNumber, matchOrder }`；Task 16 使用 `m.teamA` → `pairAId`、`m.teamB` → `pairBId`，符合現有 circle-method 介面。
