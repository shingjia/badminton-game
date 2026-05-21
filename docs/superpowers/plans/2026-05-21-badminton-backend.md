# 羽球友誼賽 — Plan 1：後端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成羽球友誼賽系統的後端基礎、所有演算法、驗證機制與 REST API。完成後可用 curl 跑完整賽事流程：建立賽事 → 報名 → 分組 → 產生賽程 → 計分 → 看排名。

**Architecture:** Next.js 14 App Router（純 API routes，UI 在 Plan 2）+ Prisma + PostgreSQL 16，docker compose 部署，nginx 反向代理。Auth 用自寫 signed cookie session。三個核心演算法（蛇形分組、circle method、場地分配）為純函式並以 TDD 撰寫。

**Tech Stack:** Next.js 14, TypeScript 5, Prisma 5, PostgreSQL 16, zod, vitest, supertest, docker, nginx

**Spec：** `docs/superpowers/specs/2026-05-21-badminton-tournament-design.md`

---

## 檔案結構

實作完成後的目錄結構（僅列本 plan 範圍內檔案）：

```
badminton-game/
├── package.json                          (Task 1)
├── tsconfig.json                         (Task 1)
├── next.config.mjs                       (Task 1)
├── tailwind.config.ts                    (Task 1)
├── postcss.config.mjs                    (Task 1)
├── vitest.config.ts                      (Task 5)
├── .env.example                          (Task 6)
├── .env                                  (Task 6, gitignored)
├── Dockerfile                            (Task 24)
├── docker-compose.yml                    (Task 25)
├── nginx/default.conf                    (Task 25)
├── prisma/
│   ├── schema.prisma                     (Task 2)
│   └── migrations/                       (Task 3, Task 17)
├── src/
│   ├── app/
│   │   ├── layout.tsx                    (Task 1, minimal placeholder)
│   │   ├── page.tsx                      (Task 1, minimal placeholder)
│   │   └── api/
│   │       ├── admin/
│   │       │   ├── login/route.ts        (Task 9)
│   │       │   └── logout/route.ts       (Task 9)
│   │       ├── tournaments/
│   │       │   ├── route.ts              (Task 12)
│   │       │   └── [id]/
│   │       │       ├── route.ts          (Task 13)
│   │       │       ├── teams/route.ts    (Task 14)
│   │       │       ├── courts/route.ts   (Task 15)
│   │       │       ├── groups/route.ts   (Task 16, GET)
│   │       │       ├── matches/route.ts  (Task 16, GET)
│   │       │       ├── standings/route.ts(Task 23)
│   │       │       ├── groups/
│   │       │       │   ├── generate/route.ts (Task 18)
│   │       │       │   └── lock/route.ts     (Task 19)
│   │       │       └── matches/
│   │       │           └── generate/route.ts (Task 20)
│   │       ├── teams/[id]/
│   │       │   ├── route.ts              (Task 14)
│   │       │   └── move-group/route.ts   (Task 19)
│   │       ├── courts/[id]/route.ts      (Task 15)
│   │       └── matches/[id]/score/route.ts (Task 21)
│   ├── lib/
│   │   ├── prisma.ts                     (Task 4)
│   │   ├── auth.ts                       (Task 8)
│   │   ├── api-helpers.ts                (Task 10)
│   │   ├── schemas.ts                    (Task 11)
│   │   ├── algorithms/
│   │   │   ├── snake-grouping.ts         (Task 6.5)
│   │   │   ├── circle-method.ts          (Task 7)
│   │   │   └── court-allocation.ts       (Task 7.5)
│   │   └── standings-sql.ts              (Task 22)
│   └── middleware.ts                     (Task 10)
└── tests/
    ├── unit/
    │   ├── snake-grouping.test.ts        (Task 6.5)
    │   ├── circle-method.test.ts         (Task 7)
    │   ├── court-allocation.test.ts      (Task 7.5)
    │   └── auth.test.ts                  (Task 8)
    └── integration/
        └── api.test.ts                   (Task 26, smoke test)
```

---

## Task 1: 初始化 Next.js + TypeScript + Tailwind 專案

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.eslintrc.json`, `.gitignore`（已存在，追加項目）

- [ ] **Step 1: 用官方 create-next-app 起一個專案到當前目錄**

執行（在專案根）：
```bash
npx --yes create-next-app@14 . \
  --typescript --tailwind --eslint --app \
  --src-dir --import-alias "@/*" --use-npm \
  --skip-install
```

預期：產出上述檔案。回答互動提示時若被問 `Would you like to use Turbopack?` 答 No。

- [ ] **Step 2: 安裝依賴**

```bash
npm install
```

預期：dependencies 安裝完成。

- [ ] **Step 3: 確認 dev server 起得來**

```bash
npm run dev
```

打開 `http://localhost:3000` 看到 Next.js 預設首頁。Ctrl+C 結束。

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "chore: scaffold Next.js 14 + TypeScript + Tailwind project"
```

---

## Task 2: 設定 Prisma + Postgres schema

**Files:**
- Create: `prisma/schema.prisma`
- Modify: `package.json`（加 prisma deps + scripts）

- [ ] **Step 1: 安裝 Prisma**

```bash
npm install prisma --save-dev
npm install @prisma/client
npx prisma init --datasource-provider postgresql
```

- [ ] **Step 2: 撰寫完整 schema**

寫到 `prisma/schema.prisma`：

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
  id             String           @id @default(cuid())
  name           String
  status         TournamentStatus @default(draft)
  teamsPerGroup  Int              @default(4)
  pointsPerGame  Int              @default(21)
  createdAt      DateTime         @default(now())
  finishedAt     DateTime?

  teams   Team[]
  groups  Group[]
  courts  Court[]
  matches Match[]
}

model Team {
  id           String  @id @default(cuid())
  tournamentId String
  name         String
  player1Name  String
  player2Name  String
  seedLevel    Int
  groupId      String?

  tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  group      Group?     @relation(fields: [groupId], references: [id], onDelete: SetNull)

  matchesAsA Match[] @relation("MatchTeamA")
  matchesAsB Match[] @relation("MatchTeamB")

  @@index([tournamentId])
  @@index([groupId])
}

model Group {
  id           String @id @default(cuid())
  tournamentId String
  name         String
  displayOrder Int

  tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  teams      Team[]
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
  teamAId      String
  teamBId      String
  scoreA       Int         @default(0)
  scoreB       Int         @default(0)
  status       MatchStatus @default(pending)
  roundNumber  Int
  matchOrder   Int
  finishedAt   DateTime?

  tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  group      Group      @relation(fields: [groupId], references: [id], onDelete: Cascade)
  court      Court?     @relation(fields: [courtId], references: [id], onDelete: SetNull)
  teamA      Team       @relation("MatchTeamA", fields: [teamAId], references: [id], onDelete: Cascade)
  teamB      Team       @relation("MatchTeamB", fields: [teamBId], references: [id], onDelete: Cascade)

  @@index([tournamentId])
  @@index([groupId])
  @@index([courtId])
}
```

- [ ] **Step 3: 在 package.json 加 Prisma scripts**

修改 `package.json` 的 `scripts`，加入：

```json
"prisma:generate": "prisma generate",
"prisma:migrate": "prisma migrate dev",
"prisma:deploy": "prisma migrate deploy"
```

- [ ] **Step 4: 設定本機 .env**

修改 `.env`（Prisma 已建立，覆寫內容）：

```
DATABASE_URL="postgresql://app:app@localhost:5432/badminton?schema=public"
ADMIN_PASSWORD="dev-password-please-change"
SESSION_SECRET="dev-secret-must-be-32-chars-or-more-xxxxxxxxxxxxx"
PORT=3000
```

- [ ] **Step 5: 起本機 Postgres 給 prisma migrate 用**

```bash
docker run -d --name badminton-pg \
  -e POSTGRES_USER=app -e POSTGRES_PASSWORD=app -e POSTGRES_DB=badminton \
  -p 5432:5432 postgres:16-alpine
```

等 3 秒讓 db 就緒。

- [ ] **Step 6: 跑首次 migration**

```bash
npx prisma migrate dev --name init
```

預期：產出 `prisma/migrations/<timestamp>_init/` 內含 `migration.sql`，Prisma client 自動 generate。

- [ ] **Step 7: Commit**

```bash
git add prisma/ package.json package-lock.json .env.example
git commit -m "feat: add Prisma schema with Tournament/Team/Group/Court/Match models"
```

注意：`.env` 已在 `.gitignore`，不會被 commit。

---

## Task 3: 加入 prisma migration 中的排名 view

**Files:**
- Create: `prisma/migrations/<timestamp>_add_standings_view/migration.sql`

- [ ] **Step 1: 新增 migration 檔（手動 SQL）**

```bash
npx prisma migrate dev --create-only --name add_standings_view
```

打開新建立的資料夾（例 `prisma/migrations/20260521120000_add_standings_view/migration.sql`），覆寫內容：

```sql
CREATE VIEW team_standings AS
SELECT
  t.id                            AS team_id,
  t."groupId"                     AS group_id,
  t."tournamentId"                AS tournament_id,
  COUNT(*) FILTER (
    WHERE (m."teamAId" = t.id AND m."scoreA" > m."scoreB")
       OR (m."teamBId" = t.id AND m."scoreB" > m."scoreA")
  )                               AS wins,
  COUNT(*) FILTER (WHERE m.status = 'completed') AS played,
  COALESCE(SUM(
    CASE WHEN m."teamAId" = t.id THEN m."scoreA" - m."scoreB"
         WHEN m."teamBId" = t.id THEN m."scoreB" - m."scoreA"
         ELSE 0 END
  ), 0)                           AS point_diff,
  COALESCE(SUM(
    CASE WHEN m."teamAId" = t.id THEN m."scoreA"
         WHEN m."teamBId" = t.id THEN m."scoreB"
         ELSE 0 END
  ), 0)                           AS points_for
FROM "Team" t
LEFT JOIN "Match" m
  ON (m."teamAId" = t.id OR m."teamBId" = t.id)
 AND m.status = 'completed'
GROUP BY t.id, t."groupId", t."tournamentId";
```

注意：Prisma 預設 table 與欄位名稱都會原樣保留（PascalCase / camelCase），不會自動 snake_case，因此 SQL 內參考欄位要加雙引號（如 `m."teamAId"`、`t."groupId"`）。view 對外的欄位 alias 才用 snake_case，給應用層查詢使用。

- [ ] **Step 2: Apply migration**

```bash
npx prisma migrate dev
```

預期：view 建立成功。

- [ ] **Step 3: 驗證 view 存在**

從專案根目錄跑（不需要 docker exec，直接打 DATABASE_URL）：

```bash
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{const r=await p.\$queryRawUnsafe('SELECT column_name FROM information_schema.columns WHERE table_name = \$1 ORDER BY ordinal_position','team_standings');console.log(JSON.stringify(r));await p.\$disconnect()})()"
```

預期輸出 7 個欄位：
```
[{"column_name":"team_id"},{"column_name":"group_id"},{"column_name":"tournament_id"},{"column_name":"wins"},{"column_name":"played"},{"column_name":"point_diff"},{"column_name":"points_for"}]
```

（若本機跑 container 也可以用 `docker exec -it badminton-pg psql -U app -d badminton -c "\dv"`，但跨 host / WSL 用上面的 node 指令較通用。）

- [ ] **Step 4: Commit**

```bash
git add prisma/migrations/
git commit -m "feat: add team_standings SQL view for ranking"
```

---

## Task 4: Prisma client singleton

**Files:**
- Create: `src/lib/prisma.ts`

- [ ] **Step 1: 寫 singleton（避免 Next.js hot reload 開太多連線）**

`src/lib/prisma.ts`：

```ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/prisma.ts
git commit -m "feat: add Prisma client singleton"
```

---

## Task 5: 安裝測試工具（vitest + supertest）

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: 安裝依賴**

```bash
npm install --save-dev vitest @vitest/coverage-v8 supertest @types/supertest tsx
```

- [ ] **Step 2: 寫 vitest.config.ts**

`vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 3: 加 test scripts 到 package.json**

修改 `package.json` 的 `scripts`，加入：

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: 寫一個 sanity test 確認 vitest 跑得起來**

`tests/unit/sanity.test.ts`：

```ts
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('vitest works', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: 跑測試**

```bash
npm test
```

預期：1 passed。

- [ ] **Step 6: 移除 sanity test（不留無意義測試）**

```bash
rm tests/unit/sanity.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest + supertest for testing"
```

---

## Task 6: zod 依賴 + .env.example

**Files:**
- Modify: `package.json`
- Create: `.env.example`

- [ ] **Step 1: 安裝 zod**

```bash
npm install zod
```

- [ ] **Step 2: 寫 .env.example**

`.env.example`：

```
DATABASE_URL=postgresql://app:app@localhost:5432/badminton?schema=public
ADMIN_PASSWORD=replace-with-strong-password-min-16-chars
SESSION_SECRET=replace-with-random-secret-min-32-chars-recommended-64
PORT=3000
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add zod and .env.example"
```

---

## Task 6.5: 蛇形分組演算法（TDD）

**Files:**
- Create: `src/lib/algorithms/snake-grouping.ts`
- Test: `tests/unit/snake-grouping.test.ts`

- [ ] **Step 1: 寫測試（失敗）**

`tests/unit/snake-grouping.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { snakeGroup, type TeamSeed } from '@/lib/algorithms/snake-grouping';

const team = (id: string, seed: number): TeamSeed => ({ id, seedLevel: seed });

describe('snakeGroup', () => {
  it('returns single group when N <= K', () => {
    const teams = [team('a', 3), team('b', 2), team('c', 1)];
    const groups = snakeGroup(teams, 4, () => 0);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((t) => t.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('distributes 12 teams across 3 groups in snake pattern by seed', () => {
    // seeds 5,5,5,4,4,4,3,3,3,2,2,2 → with stable random=0 (no shuffle)
    const teams: TeamSeed[] = [];
    [5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2].forEach((s, i) => teams.push(team(`t${i}`, s)));
    const groups = snakeGroup(teams, 4, () => 0); // 3 groups of 4
    expect(groups).toHaveLength(3);
    expect(groups[0]).toHaveLength(4);
    expect(groups[1]).toHaveLength(4);
    expect(groups[2]).toHaveLength(4);
    // First round: G0 gets idx 0 (seed=5), G1 gets idx 1 (seed=5), G2 gets idx 2 (seed=5)
    // Second round (reversed): G2 gets idx 3 (seed=4), G1 gets idx 4 (seed=4), G0 gets idx 5 (seed=4)
    // Third round: G0 gets idx 6 (seed=3), G1 gets idx 7 (seed=3), G2 gets idx 8 (seed=3)
    // Fourth round (reversed): G2 gets idx 9 (seed=2), G1 gets idx 10 (seed=2), G0 gets idx 11 (seed=2)
    expect(groups[0].map((t) => t.id)).toEqual(['t0', 't5', 't6', 't11']);
    expect(groups[1].map((t) => t.id)).toEqual(['t1', 't4', 't7', 't10']);
    expect(groups[2].map((t) => t.id)).toEqual(['t2', 't3', 't8', 't9']);
  });

  it('handles uneven last group when N not divisible by K', () => {
    // 10 teams, K=4 → ceil(10/4)=3 groups, sizes might be 4,4,2 or 4,3,3
    const teams: TeamSeed[] = Array.from({ length: 10 }, (_, i) => team(`t${i}`, 5 - Math.floor(i / 2)));
    const groups = snakeGroup(teams, 4, () => 0);
    expect(groups).toHaveLength(3);
    const total = groups.reduce((sum, g) => sum + g.length, 0);
    expect(total).toBe(10);
    // every team appears exactly once
    const ids = groups.flat().map((t) => t.id).sort();
    expect(ids).toEqual(Array.from({ length: 10 }, (_, i) => `t${i}`).sort());
  });

  it('shuffles within same seed level using provided random fn', () => {
    // 4 teams all same seed; without shuffle they'd appear in order t0,t1,t2,t3
    // with random=0.99 we expect a specific deterministic re-order
    const teams = [team('t0', 3), team('t1', 3), team('t2', 3), team('t3', 3)];
    const noShuffle = snakeGroup(teams, 2, () => 0);
    const shuffled = snakeGroup(teams, 2, () => 0.99);
    // Both produce 2 groups of 2 but ordering within groups may differ
    expect(noShuffle).toHaveLength(2);
    expect(shuffled).toHaveLength(2);
    // sanity: all teams placed
    expect(shuffled.flat()).toHaveLength(4);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npm test
```

預期：FAIL（module not found）。

- [ ] **Step 3: 寫實作**

`src/lib/algorithms/snake-grouping.ts`：

```ts
export type TeamSeed = { id: string; seedLevel: number };

/**
 * Distribute teams into G = ceil(N/K) groups using snake/serpentine pattern.
 * Higher seedLevel placed first. Within same seedLevel, deterministic shuffle
 * using rng() returning [0,1).
 */
export function snakeGroup<T extends TeamSeed>(
  teams: T[],
  teamsPerGroup: number,
  rng: () => number = Math.random,
): T[][] {
  if (teams.length === 0) return [];
  const groupCount = Math.ceil(teams.length / teamsPerGroup);
  if (groupCount === 1) return [[...teams]];

  // 1. sort by seedLevel DESC, stable; shuffle within same seed
  const byLevel = new Map<number, T[]>();
  for (const t of teams) {
    const arr = byLevel.get(t.seedLevel) ?? [];
    arr.push(t);
    byLevel.set(t.seedLevel, arr);
  }
  const sortedLevels = [...byLevel.keys()].sort((a, b) => b - a);
  const ordered: T[] = [];
  for (const lvl of sortedLevels) {
    const bucket = byLevel.get(lvl)!.slice();
    // Fisher-Yates with provided rng
    for (let i = bucket.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [bucket[i], bucket[j]] = [bucket[j], bucket[i]];
    }
    ordered.push(...bucket);
  }

  // 2. snake assign
  const groups: T[][] = Array.from({ length: groupCount }, () => []);
  ordered.forEach((team, i) => {
    const row = Math.floor(i / groupCount);
    const col = row % 2 === 0 ? i % groupCount : groupCount - 1 - (i % groupCount);
    groups[col].push(team);
  });

  return groups;
}
```

- [ ] **Step 4: 跑測試確認通過**

```bash
npm test
```

預期：4 passed。

- [ ] **Step 5: Commit**

```bash
git add src/lib/algorithms/snake-grouping.ts tests/unit/snake-grouping.test.ts
git commit -m "feat(algo): add snake grouping algorithm with seed-based distribution"
```

---

## Task 7: 循環賽對戰表演算法（circle method, TDD）

**Files:**
- Create: `src/lib/algorithms/circle-method.ts`
- Test: `tests/unit/circle-method.test.ts`

- [ ] **Step 1: 寫測試（失敗）**

`tests/unit/circle-method.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { roundRobinPairs, type Pair } from '@/lib/algorithms/circle-method';

describe('roundRobinPairs', () => {
  it('returns empty array for 0 or 1 teams', () => {
    expect(roundRobinPairs([])).toEqual([]);
    expect(roundRobinPairs(['a'])).toEqual([]);
  });

  it('produces C(K,2) pairs for even K', () => {
    // 4 teams → 6 pairs across 3 rounds (2 per round)
    const pairs = roundRobinPairs(['a', 'b', 'c', 'd']);
    expect(pairs).toHaveLength(6);
    // 3 rounds, each round has 2 simultaneous matches
    const rounds = new Set(pairs.map((p) => p.roundNumber));
    expect(rounds.size).toBe(3);
    for (let r = 1; r <= 3; r++) {
      const inRound = pairs.filter((p) => p.roundNumber === r);
      expect(inRound).toHaveLength(2);
    }
    // matchOrder is unique 1..6
    const orders = pairs.map((p) => p.matchOrder).sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6]);
    // every pair of teams appears exactly once (unordered)
    const seen = new Set<string>();
    for (const p of pairs) {
      const key = [p.teamA, p.teamB].sort().join('|');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(6);
    // no team plays twice in same round
    for (let r = 1; r <= 3; r++) {
      const teamsThisRound = pairs.filter((p) => p.roundNumber === r).flatMap((p) => [p.teamA, p.teamB]);
      expect(new Set(teamsThisRound).size).toBe(teamsThisRound.length);
    }
  });

  it('produces correct count for odd K (skips bye)', () => {
    // 5 teams → C(5,2)=10 pairs, 5 rounds, each round 2 matches (one bye dropped)
    const pairs = roundRobinPairs(['a', 'b', 'c', 'd', 'e']);
    expect(pairs).toHaveLength(10);
    const rounds = new Set(pairs.map((p) => p.roundNumber));
    expect(rounds.size).toBe(5);
    // every pair unique
    const seen = new Set<string>();
    for (const p of pairs) {
      const key = [p.teamA, p.teamB].sort().join('|');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(10);
    // matchOrder unique
    const orders = pairs.map((p) => p.matchOrder).sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('produces 1 pair for K=2', () => {
    const pairs = roundRobinPairs(['a', 'b']);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].teamA).toBe('a');
    expect(pairs[0].teamB).toBe('b');
    expect(pairs[0].roundNumber).toBe(1);
    expect(pairs[0].matchOrder).toBe(1);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npm test
```

預期：FAIL。

- [ ] **Step 3: 寫實作**

`src/lib/algorithms/circle-method.ts`：

```ts
export type Pair = {
  teamA: string;
  teamB: string;
  roundNumber: number; // 1..K-1
  matchOrder: number;  // 1..C(K,2) within this group
};

/**
 * Standard circle method for round-robin pairing.
 * Returns all C(K,2) pairs labeled with roundNumber and a unique matchOrder.
 * Pairs from earlier rounds get lower matchOrder values.
 */
export function roundRobinPairs(teamIds: string[]): Pair[] {
  const k = teamIds.length;
  if (k < 2) return [];

  // For odd k, add a bye sentinel; we'll drop matches involving the bye.
  const BYE = '__bye__';
  const teams = k % 2 === 0 ? [...teamIds] : [...teamIds, BYE];
  const n = teams.length;
  const totalRounds = n - 1;

  // Circle method: fix index 0, rotate the rest.
  const fixed = teams[0];
  const rotating = teams.slice(1);

  const result: Pair[] = [];
  let matchOrder = 1;

  for (let round = 1; round <= totalRounds; round++) {
    const left = [fixed, ...rotating.slice(0, n / 2 - 1)];
    const right = rotating.slice(n / 2 - 1).reverse();

    for (let i = 0; i < n / 2; i++) {
      const a = left[i];
      const b = right[i];
      if (a === BYE || b === BYE) continue;
      result.push({ teamA: a, teamB: b, roundNumber: round, matchOrder: matchOrder++ });
    }

    // rotate
    rotating.unshift(rotating.pop()!);
  }

  return result;
}
```

- [ ] **Step 4: 跑測試確認通過**

```bash
npm test
```

預期：4 passed（snake-grouping 仍 4 passed，circle-method 4 passed = 8 total）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/algorithms/circle-method.ts tests/unit/circle-method.test.ts
git commit -m "feat(algo): add round-robin circle method"
```

---

## Task 7.5: 場地分配演算法（TDD）

**Files:**
- Create: `src/lib/algorithms/court-allocation.ts`
- Test: `tests/unit/court-allocation.test.ts`

- [ ] **Step 1: 寫測試（失敗）**

`tests/unit/court-allocation.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { allocateCourts, type MatchInput } from '@/lib/algorithms/court-allocation';

const m = (id: string, groupId: string, roundNumber: number): MatchInput => ({
  id,
  groupId,
  roundNumber,
});

describe('allocateCourts', () => {
  it('returns empty array when no matches', () => {
    expect(allocateCourts([], ['c1'])).toEqual([]);
  });

  it('assigns matches in same round across courts', () => {
    // 1 group, 2 matches in round 1, 2 courts → both placed simultaneously
    const matches = [m('m1', 'g1', 1), m('m2', 'g1', 1)];
    const result = allocateCourts(matches, ['c1', 'c2']);
    expect(result).toHaveLength(2);
    const courts = result.map((r) => r.courtId).sort();
    expect(courts).toEqual(['c1', 'c2']);
  });

  it('spreads round across courts and overflows to next slot when courts < matches in round', () => {
    // 3 matches in round 1, 2 courts → 2 in slot 1, 1 in slot 2
    const matches = [m('m1', 'gA', 1), m('m2', 'gB', 1), m('m3', 'gC', 1)];
    const result = allocateCourts(matches, ['c1', 'c2']);
    expect(result).toHaveLength(3);
    // First two get c1, c2; third overflows to c1 again (queue order)
    expect(result.find((r) => r.id === 'm1')?.courtId).toBe('c1');
    expect(result.find((r) => r.id === 'm2')?.courtId).toBe('c2');
    expect(result.find((r) => r.id === 'm3')?.courtId).toBe('c1');
  });

  it('processes rounds in increasing order', () => {
    // Round 1 has 1 match, round 2 has 2 matches, 2 courts
    const matches = [
      m('m3', 'gA', 2),
      m('m1', 'gA', 1),
      m('m2', 'gB', 2),
    ];
    const result = allocateCourts(matches, ['c1', 'c2']);
    expect(result.find((r) => r.id === 'm1')?.courtId).toBe('c1');
    expect(result.find((r) => r.id === 'm2')?.courtId).toBe('c1');
    expect(result.find((r) => r.id === 'm3')?.courtId).toBe('c2');
  });

  it('returns courtId=null when no courts available', () => {
    const matches = [m('m1', 'gA', 1)];
    const result = allocateCourts(matches, []);
    expect(result[0].courtId).toBeNull();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npm test
```

預期：FAIL。

- [ ] **Step 3: 寫實作**

`src/lib/algorithms/court-allocation.ts`：

```ts
export type MatchInput = {
  id: string;
  groupId: string;
  roundNumber: number;
};

export type CourtAllocation = {
  id: string;       // match id
  courtId: string | null;
};

/**
 * Assign courts to matches by round.
 * - Matches with the same roundNumber form a parallel batch.
 * - Within a batch, distribute matches across courts in order.
 * - If batch size > court count, overflow rotates back to court 0.
 * - If no courts provided, all assignments are null.
 */
export function allocateCourts(matches: MatchInput[], courtIds: string[]): CourtAllocation[] {
  if (matches.length === 0) return [];
  if (courtIds.length === 0) return matches.map((m) => ({ id: m.id, courtId: null }));

  const byRound = new Map<number, MatchInput[]>();
  for (const m of matches) {
    const arr = byRound.get(m.roundNumber) ?? [];
    arr.push(m);
    byRound.set(m.roundNumber, arr);
  }
  const rounds = [...byRound.keys()].sort((a, b) => a - b);

  const result: CourtAllocation[] = [];
  for (const r of rounds) {
    const batch = byRound.get(r)!;
    batch.forEach((match, i) => {
      result.push({ id: match.id, courtId: courtIds[i % courtIds.length] });
    });
  }
  return result;
}
```

- [ ] **Step 4: 跑測試確認通過**

```bash
npm test
```

預期：5 passed for court-allocation（總 13 passed）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/algorithms/court-allocation.ts tests/unit/court-allocation.test.ts
git commit -m "feat(algo): add court allocation by round"
```

---

## Task 8: Signed cookie session helper（TDD）

**Files:**
- Create: `src/lib/auth.ts`
- Test: `tests/unit/auth.test.ts`

- [ ] **Step 1: 寫測試（失敗）**

`tests/unit/auth.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { signSession, verifySession, COOKIE_NAME } from '@/lib/auth';

const SECRET = 'a'.repeat(32);

describe('signSession / verifySession', () => {
  it('signs and verifies a fresh token', () => {
    const token = signSession(SECRET);
    const ok = verifySession(token, SECRET);
    expect(ok).toBe(true);
  });

  it('rejects token with wrong secret', () => {
    const token = signSession(SECRET);
    expect(verifySession(token, 'b'.repeat(32))).toBe(false);
  });

  it('rejects tampered payload', () => {
    const token = signSession(SECRET);
    const [payload, sig] = token.split('.');
    const tampered = payload.slice(0, -1) + 'X.' + sig;
    expect(verifySession(tampered, SECRET)).toBe(false);
  });

  it('rejects token older than maxAgeSeconds', () => {
    // sign with issuedAt 9 hours ago
    const oldIssuedAt = Math.floor(Date.now() / 1000) - 9 * 3600;
    const token = signSession(SECRET, oldIssuedAt);
    expect(verifySession(token, SECRET, 8 * 3600)).toBe(false);
  });

  it('exports cookie name constant', () => {
    expect(COOKIE_NAME).toBe('admin_session');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npm test
```

預期：FAIL。

- [ ] **Step 3: 寫實作**

`src/lib/auth.ts`：

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'admin_session';
export const DEFAULT_MAX_AGE = 8 * 3600; // 8 hours

/**
 * Token format: base64url(issuedAtSeconds).base64url(hmac)
 */
export function signSession(secret: string, issuedAtSeconds?: number): string {
  const issued = issuedAtSeconds ?? Math.floor(Date.now() / 1000);
  const payload = Buffer.from(String(issued)).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(
  token: string | undefined,
  secret: string,
  maxAgeSeconds: number = DEFAULT_MAX_AGE,
): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;

  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;

  const issued = Number(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!Number.isFinite(issued)) return false;
  const age = Math.floor(Date.now() / 1000) - issued;
  if (age < 0 || age > maxAgeSeconds) return false;

  return true;
}

export function passwordMatches(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: 跑測試確認通過**

```bash
npm test
```

預期：5 passed for auth（總 18 passed）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts tests/unit/auth.test.ts
git commit -m "feat(auth): add signed cookie session helpers with HMAC + timing-safe compare"
```

---

## Task 9: /api/admin/login + /api/admin/logout routes

**Files:**
- Create: `src/app/api/admin/login/route.ts`, `src/app/api/admin/logout/route.ts`

- [ ] **Step 1: 寫 login route**

`src/app/api/admin/login/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { COOKIE_NAME, DEFAULT_MAX_AGE, passwordMatches, signSession } from '@/lib/auth';

const Body = z.object({ password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const adminPw = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!adminPw || !secret || secret.length < 32) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });
  }

  if (!passwordMatches(parsed.data.password, adminPw)) {
    await new Promise((r) => setTimeout(r, 1000)); // throttle wrong attempts
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  const token = signSession(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: DEFAULT_MAX_AGE,
  });
  return res;
}
```

- [ ] **Step 2: 寫 logout route**

`src/app/api/admin/logout/route.ts`：

```ts
import { NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
```

- [ ] **Step 3: 手動測試 login（dev 啟動）**

```bash
npm run dev
```

另一個 terminal：

```bash
# 對的密碼
curl -i -X POST http://localhost:3000/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"dev-password-please-change"}'
# 預期 200，回應有 Set-Cookie: admin_session=...

# 錯的密碼
curl -i -X POST http://localhost:3000/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"wrong"}'
# 預期 401（會延遲 1 秒）
```

Ctrl+C 停 dev server。

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/login/route.ts src/app/api/admin/logout/route.ts
git commit -m "feat(api): add admin login/logout routes"
```

---

## Task 10: API helpers + Next.js middleware（保護 mutation API）

**Files:**
- Create: `src/lib/api-helpers.ts`, `src/middleware.ts`

- [ ] **Step 1: 寫 api-helpers**

`src/lib/api-helpers.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError, ZodSchema } from 'zod';
import { COOKIE_NAME, verifySession } from '@/lib/auth';

export function requireAdmin(req: NextRequest): NextResponse | null {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const secret = process.env.SESSION_SECRET ?? '';
  if (!verifySession(token, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

export async function parseJson<T>(req: NextRequest, schema: ZodSchema<T>): Promise<
  { ok: true; data: T } | { ok: false; res: NextResponse }
> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: NextResponse.json({ error: 'invalid_json' }, { status: 400 }) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, res: NextResponse.json({ error: 'invalid_body', details: flatten(parsed.error) }, { status: 400 }) };
  }
  return { ok: true, data: parsed.data };
}

function flatten(err: ZodError) {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

export function notFound(message = 'not_found'): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function conflict(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 409 });
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}
```

- [ ] **Step 2: 寫 middleware（純加 hint header，實際驗證仍在每個 route 用 requireAdmin）**

`src/middleware.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server';

// We intentionally do auth at route level (requireAdmin) rather than middleware,
// because Next.js middleware runs on edge runtime and node:crypto is unavailable there.
// This middleware only redirects unauthed /admin/* page visits to /admin/login.
// (Page redirect; not for API routes — APIs return 401 JSON.)
export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  if (url.pathname.startsWith('/admin') && url.pathname !== '/admin/login') {
    const cookie = req.cookies.get('admin_session')?.value;
    if (!cookie) {
      const login = url.clone();
      login.pathname = '/admin/login';
      login.searchParams.set('redirect', url.pathname);
      return NextResponse.redirect(login);
    }
    // Lightweight presence check only; cryptographic verification happens
    // on first protected request via requireAdmin.
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/api-helpers.ts src/middleware.ts
git commit -m "feat(api): add requireAdmin/parseJson helpers and admin page redirect middleware"
```

---

## Task 11: zod schemas 集中管理

**Files:**
- Create: `src/lib/schemas.ts`

- [ ] **Step 1: 寫 schemas**

`src/lib/schemas.ts`：

```ts
import { z } from 'zod';

export const TournamentStatusEnum = z.enum(['draft', 'grouping', 'in_progress', 'finished']);

export const CreateTournament = z.object({
  name: z.string().trim().min(1).max(100),
  teamsPerGroup: z.number().int().min(2).max(16).optional(),
  pointsPerGame: z.number().int().min(11).max(31).optional(),
});

export const UpdateTournament = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  status: TournamentStatusEnum.optional(),
  teamsPerGroup: z.number().int().min(2).max(16).optional(),
  pointsPerGame: z.number().int().min(11).max(31).optional(),
});

export const CreateTeam = z.object({
  name: z.string().trim().min(1).max(50),
  player1Name: z.string().trim().min(1).max(50),
  player2Name: z.string().trim().min(1).max(50),
  seedLevel: z.number().int().min(1).max(5),
});

export const UpdateTeam = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  player1Name: z.string().trim().min(1).max(50).optional(),
  player2Name: z.string().trim().min(1).max(50).optional(),
  seedLevel: z.number().int().min(1).max(5).optional(),
});

export const MoveTeamGroup = z.object({
  groupId: z.string().min(1),
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
git commit -m "feat(api): add zod schemas for all request bodies"
```

---

## Task 12: Tournament list/create API（GET + POST /api/tournaments）

**Files:**
- Create: `src/app/api/tournaments/route.ts`

- [ ] **Step 1: 寫 route**

`src/app/api/tournaments/route.ts`：

```ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { CreateTournament } from '@/lib/schemas';

export async function GET() {
  const tournaments = await prisma.tournament.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return ok(tournaments);
}

export async function POST(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  const parsed = await parseJson(req, CreateTournament);
  if (!parsed.ok) return parsed.res;

  const t = await prisma.tournament.create({
    data: {
      name: parsed.data.name,
      teamsPerGroup: parsed.data.teamsPerGroup ?? 4,
      pointsPerGame: parsed.data.pointsPerGame ?? 21,
    },
  });
  return ok(t, 201);
}
```

- [ ] **Step 2: 手動測試**

```bash
npm run dev
```

```bash
# 公開 GET 不需 auth
curl -s http://localhost:3000/api/tournaments
# 預期 []

# POST 不帶 cookie → 401
curl -i -X POST http://localhost:3000/api/tournaments \
  -H 'Content-Type: application/json' \
  -d '{"name":"友誼賽"}'
# 預期 401

# 帶 cookie 登入後 POST
curl -c /tmp/jar -X POST http://localhost:3000/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"dev-password-please-change"}'
curl -b /tmp/jar -X POST http://localhost:3000/api/tournaments \
  -H 'Content-Type: application/json' \
  -d '{"name":"友誼賽 A","teamsPerGroup":4}'
# 預期 201 + tournament JSON
```

停 dev server。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tournaments/route.ts
git commit -m "feat(api): tournaments list + create endpoints"
```

---

## Task 13: Tournament read/update/delete API

**Files:**
- Create: `src/app/api/tournaments/[id]/route.ts`

- [ ] **Step 1: 寫 route**

`src/app/api/tournaments/[id]/route.ts`：

```ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { UpdateTournament } from '@/lib/schemas';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const t = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!t) return notFound();
  return ok(t);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  const parsed = await parseJson(req, UpdateTournament);
  if (!parsed.ok) return parsed.res;

  const t = await prisma.tournament
    .update({ where: { id: params.id }, data: parsed.data })
    .catch(() => null);
  if (!t) return notFound();
  return ok(t);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  const t = await prisma.tournament
    .delete({ where: { id: params.id } })
    .catch(() => null);
  if (!t) return notFound();
  return ok({ deleted: true });
}
```

- [ ] **Step 2: 手動測試**

```bash
npm run dev
# 假設前一 Task 已 POST 出一個 tournament，id 為 $TID
curl -s http://localhost:3000/api/tournaments | jq '.'
# 取出 id 後：
curl -b /tmp/jar -X PATCH http://localhost:3000/api/tournaments/$TID \
  -H 'Content-Type: application/json' \
  -d '{"name":"友誼賽 A 改名"}'
```

停 dev。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tournaments/[id]/route.ts
git commit -m "feat(api): tournament get/patch/delete"
```

---

## Task 14: Team API（list/create/update/delete）

**Files:**
- Create: `src/app/api/tournaments/[id]/teams/route.ts`, `src/app/api/teams/[id]/route.ts`

- [ ] **Step 1: 寫 list + create**

`src/app/api/tournaments/[id]/teams/route.ts`：

```ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { CreateTeam } from '@/lib/schemas';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const teams = await prisma.team.findMany({
    where: { tournamentId: params.id },
    orderBy: { name: 'asc' },
  });
  return ok(teams);
}

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  const parsed = await parseJson(req, CreateTeam);
  if (!parsed.ok) return parsed.res;

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');

  const team = await prisma.team.create({
    data: { tournamentId: params.id, ...parsed.data },
  });
  return ok(team, 201);
}
```

- [ ] **Step 2: 寫 update + delete**

`src/app/api/teams/[id]/route.ts`：

```ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { UpdateTeam } from '@/lib/schemas';

type Params = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  const parsed = await parseJson(req, UpdateTeam);
  if (!parsed.ok) return parsed.res;

  const t = await prisma.team
    .update({ where: { id: params.id }, data: parsed.data })
    .catch(() => null);
  if (!t) return notFound();
  return ok(t);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  const t = await prisma.team
    .delete({ where: { id: params.id } })
    .catch(() => null);
  if (!t) return notFound();
  return ok({ deleted: true });
}
```

- [ ] **Step 3: 手動測試**

```bash
npm run dev
# 已登入：jar cookie 存好
# 用 $TID 是 tournament id
curl -b /tmp/jar -X POST http://localhost:3000/api/tournaments/$TID/teams \
  -H 'Content-Type: application/json' \
  -d '{"name":"閃電","player1Name":"王小明","player2Name":"李小華","seedLevel":3}'
# 預期 201 + team JSON
```

停 dev。

- [ ] **Step 4: Commit**

```bash
git add src/app/api/tournaments/[id]/teams/route.ts src/app/api/teams/[id]/route.ts
git commit -m "feat(api): team list/create/update/delete"
```

---

## Task 15: Court API（list/create/delete）

**Files:**
- Create: `src/app/api/tournaments/[id]/courts/route.ts`, `src/app/api/courts/[id]/route.ts`

- [ ] **Step 1: 寫 list + create**

`src/app/api/tournaments/[id]/courts/route.ts`：

```ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { CreateCourt } from '@/lib/schemas';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const courts = await prisma.court.findMany({
    where: { tournamentId: params.id },
    orderBy: { displayOrder: 'asc' },
  });
  return ok(courts);
}

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  const parsed = await parseJson(req, CreateCourt);
  if (!parsed.ok) return parsed.res;

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');

  const next = await prisma.court.aggregate({
    where: { tournamentId: params.id },
    _max: { displayOrder: true },
  });
  const order = (next._max.displayOrder ?? 0) + 1;

  const court = await prisma.court.create({
    data: { tournamentId: params.id, name: parsed.data.name, displayOrder: order },
  });
  return ok(court, 201);
}
```

- [ ] **Step 2: 寫 delete**

`src/app/api/courts/[id]/route.ts`：

```ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, ok, requireAdmin } from '@/lib/api-helpers';

type Params = { params: { id: string } };

export async function DELETE(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  const c = await prisma.court
    .delete({ where: { id: params.id } })
    .catch(() => null);
  if (!c) return notFound();
  return ok({ deleted: true });
}
```

- [ ] **Step 3: 手動測試**

```bash
npm run dev
curl -b /tmp/jar -X POST http://localhost:3000/api/tournaments/$TID/courts \
  -H 'Content-Type: application/json' -d '{"name":"場地 1"}'
curl -b /tmp/jar -X POST http://localhost:3000/api/tournaments/$TID/courts \
  -H 'Content-Type: application/json' -d '{"name":"場地 2"}'
curl -s http://localhost:3000/api/tournaments/$TID/courts | jq '.'
```

停 dev。

- [ ] **Step 4: Commit**

```bash
git add src/app/api/tournaments/[id]/courts/route.ts src/app/api/courts/[id]/route.ts
git commit -m "feat(api): court list/create/delete"
```

---

## Task 16: Group + Match GET endpoints（公開讀取）

**Files:**
- Create: `src/app/api/tournaments/[id]/groups/route.ts`, `src/app/api/tournaments/[id]/matches/route.ts`

- [ ] **Step 1: 寫 groups GET**

`src/app/api/tournaments/[id]/groups/route.ts`：

```ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok } from '@/lib/api-helpers';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const groups = await prisma.group.findMany({
    where: { tournamentId: params.id },
    orderBy: { displayOrder: 'asc' },
    include: { teams: { orderBy: { name: 'asc' } } },
  });
  return ok(groups);
}
```

- [ ] **Step 2: 寫 matches GET**

`src/app/api/tournaments/[id]/matches/route.ts`：

```ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok } from '@/lib/api-helpers';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const matches = await prisma.match.findMany({
    where: { tournamentId: params.id },
    orderBy: [{ groupId: 'asc' }, { matchOrder: 'asc' }],
    include: {
      teamA: true,
      teamB: true,
      court: true,
      group: true,
    },
  });
  return ok(matches);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tournaments/[id]/groups/route.ts src/app/api/tournaments/[id]/matches/route.ts
git commit -m "feat(api): groups + matches public GET endpoints"
```

---

## Task 17: 在 Tournament POST 路徑加上「狀態守衛」前置守衛函式

**Files:**
- Modify: `src/lib/api-helpers.ts`

- [ ] **Step 1: 加上 ensureStatus 工具**

修改 `src/lib/api-helpers.ts`，在檔尾加：

```ts
import type { TournamentStatus } from '@prisma/client';

export function ensureStatus(actual: TournamentStatus, allowed: TournamentStatus[]): NextResponse | null {
  if (!allowed.includes(actual)) {
    return NextResponse.json(
      { error: 'invalid_status', message: `current status is ${actual}, expected one of ${allowed.join(',')}` },
      { status: 409 },
    );
  }
  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/api-helpers.ts
git commit -m "feat(api): add ensureStatus state-machine guard helper"
```

---

## Task 18: POST /api/tournaments/[id]/groups/generate（蛇形分組）

**Files:**
- Create: `src/app/api/tournaments/[id]/groups/generate/route.ts`

- [ ] **Step 1: 寫 route**

`src/app/api/tournaments/[id]/groups/generate/route.ts`：

```ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, requireAdmin, ensureStatus } from '@/lib/api-helpers';
import { snakeGroup } from '@/lib/algorithms/snake-grouping';

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');

  const statusErr = ensureStatus(tournament.status, ['draft', 'grouping']);
  if (statusErr) return statusErr;

  const teams = await prisma.team.findMany({ where: { tournamentId: params.id } });
  if (teams.length < tournament.teamsPerGroup) {
    return conflict('not_enough_teams');
  }

  const grouped = snakeGroup(teams, tournament.teamsPerGroup);

  // letters A, B, C, ... (assumes <= 26 groups; if N > 26*K we'd need rethinking but YAGNI here)
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // Replace any prior groups in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // detach teams from any existing groups
    await tx.team.updateMany({
      where: { tournamentId: params.id },
      data: { groupId: null },
    });
    // delete old groups
    await tx.group.deleteMany({ where: { tournamentId: params.id } });

    const groupRows = [];
    for (let i = 0; i < grouped.length; i++) {
      const g = await tx.group.create({
        data: {
          tournamentId: params.id,
          name: letters[i] ?? `組${i + 1}`,
          displayOrder: i + 1,
        },
      });
      // assign teams to this group
      await tx.team.updateMany({
        where: { id: { in: grouped[i].map((t) => t.id) } },
        data: { groupId: g.id },
      });
      groupRows.push(g);
    }

    await tx.tournament.update({
      where: { id: params.id },
      data: { status: 'grouping' },
    });

    return groupRows;
  });

  return ok({ groups: result });
}
```

- [ ] **Step 2: 手動測試**

```bash
npm run dev
# 假設先 POST 過 4-12 支隊伍
curl -b /tmp/jar -X POST http://localhost:3000/api/tournaments/$TID/groups/generate
# 預期回 {"groups":[{...A...},{...B...},...]}
curl -s http://localhost:3000/api/tournaments/$TID/groups | jq '.'
# 預期每組內含隊伍
```

停 dev。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tournaments/[id]/groups/generate/route.ts
git commit -m "feat(api): groups/generate using snake distribution + transition to 'grouping'"
```

---

## Task 19: PATCH /api/teams/[id]/move-group 與 POST /groups/lock

**Files:**
- Create: `src/app/api/teams/[id]/move-group/route.ts`, `src/app/api/tournaments/[id]/groups/lock/route.ts`

- [ ] **Step 1: 寫 move-group**

`src/app/api/teams/[id]/move-group/route.ts`：

```ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, ok, parseJson, requireAdmin, ensureStatus, conflict } from '@/lib/api-helpers';
import { MoveTeamGroup } from '@/lib/schemas';

type Params = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  const parsed = await parseJson(req, MoveTeamGroup);
  if (!parsed.ok) return parsed.res;

  const team = await prisma.team.findUnique({ where: { id: params.id } });
  if (!team) return notFound('team_not_found');

  const group = await prisma.group.findUnique({ where: { id: parsed.data.groupId } });
  if (!group || group.tournamentId !== team.tournamentId) {
    return conflict('group_belongs_to_different_tournament');
  }

  const tournament = await prisma.tournament.findUnique({ where: { id: team.tournamentId } });
  if (!tournament) return notFound();
  const statusErr = ensureStatus(tournament.status, ['grouping']);
  if (statusErr) return statusErr;

  const updated = await prisma.team.update({
    where: { id: params.id },
    data: { groupId: parsed.data.groupId },
  });
  return ok(updated);
}
```

- [ ] **Step 2: 寫 lock**

`src/app/api/tournaments/[id]/groups/lock/route.ts`：

```ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, requireAdmin, ensureStatus } from '@/lib/api-helpers';

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');
  const statusErr = ensureStatus(tournament.status, ['grouping']);
  if (statusErr) return statusErr;

  // every team must belong to a group
  const orphan = await prisma.team.count({
    where: { tournamentId: params.id, groupId: null },
  });
  if (orphan > 0) return conflict('teams_not_grouped');

  const groups = await prisma.group.findMany({
    where: { tournamentId: params.id },
    include: { teams: true },
  });
  for (const g of groups) {
    if (g.teams.length < 2) return conflict('group_too_small');
  }

  const updated = await prisma.tournament.update({
    where: { id: params.id },
    data: { status: 'in_progress' },
  });
  return ok(updated);
}
```

- [ ] **Step 3: 手動測試**

```bash
npm run dev
curl -b /tmp/jar -X POST http://localhost:3000/api/tournaments/$TID/groups/lock
# 預期 200，status 變成 in_progress
```

停 dev。

- [ ] **Step 4: Commit**

```bash
git add src/app/api/teams/[id]/move-group/route.ts src/app/api/tournaments/[id]/groups/lock/route.ts
git commit -m "feat(api): move-group and lock-groups (transition to in_progress)"
```

---

## Task 20: POST /matches/generate（產生對戰 + 場地分配）

**Files:**
- Create: `src/app/api/tournaments/[id]/matches/generate/route.ts`

- [ ] **Step 1: 寫 route**

`src/app/api/tournaments/[id]/matches/generate/route.ts`：

```ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, requireAdmin, ensureStatus } from '@/lib/api-helpers';
import { roundRobinPairs } from '@/lib/algorithms/circle-method';
import { allocateCourts, type MatchInput } from '@/lib/algorithms/court-allocation';

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
    include: { teams: true },
    orderBy: { displayOrder: 'asc' },
  });
  const courts = await prisma.court.findMany({
    where: { tournamentId: params.id },
    orderBy: { displayOrder: 'asc' },
  });

  if (groups.length === 0) return conflict('no_groups');

  // Build pairs per group with a global matchOrder offset for stable UI display
  type Draft = {
    tournamentId: string;
    groupId: string;
    teamAId: string;
    teamBId: string;
    roundNumber: number;
    matchOrder: number; // unique within group; we'll re-number globally below
  };

  const drafts: Draft[] = [];
  for (const g of groups) {
    const teamIds = g.teams.map((t) => t.id);
    const pairs = roundRobinPairs(teamIds);
    for (const p of pairs) {
      drafts.push({
        tournamentId: params.id,
        groupId: g.id,
        teamAId: p.teamA,
        teamBId: p.teamB,
        roundNumber: p.roundNumber,
        matchOrder: p.matchOrder,
      });
    }
  }

  if (drafts.length === 0) return conflict('no_matches_to_generate');

  // Allocate courts based on roundNumber (cross-group batches)
  const matchInputs: MatchInput[] = drafts.map((d, idx) => ({
    id: `tmp${idx}`,
    groupId: d.groupId,
    roundNumber: d.roundNumber,
  }));
  const allocations = allocateCourts(matchInputs, courts.map((c) => c.id));
  const courtById = new Map(allocations.map((a) => [a.id, a.courtId]));

  // Write in a transaction: clear old matches first
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
          teamAId: d.teamAId,
          teamBId: d.teamBId,
          roundNumber: d.roundNumber,
          matchOrder: d.matchOrder,
          courtId,
        },
      });
      created.push(m);
    }
    return created;
  });

  return ok({ matches: result, count: result.length });
}
```

- [ ] **Step 2: 手動測試**

```bash
npm run dev
curl -b /tmp/jar -X POST http://localhost:3000/api/tournaments/$TID/matches/generate
# 預期回 {"matches":[...],"count":N}
curl -s http://localhost:3000/api/tournaments/$TID/matches | jq '.[0]'
# 預期看到完整 match：teamA、teamB、court、group、roundNumber、matchOrder
```

停 dev。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tournaments/[id]/matches/generate/route.ts
git commit -m "feat(api): matches/generate via circle-method + court allocation"
```

---

## Task 21: PATCH /api/matches/[id]/score

**Files:**
- Create: `src/app/api/matches/[id]/score/route.ts`

- [ ] **Step 1: 寫 route**

`src/app/api/matches/[id]/score/route.ts`：

```ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { UpdateMatchScore } from '@/lib/schemas';

type Params = { params: { id: string } };

function validBadmintonScore(a: number, b: number, target: number): boolean {
  // 21 points game, win by 2, max 30
  const max = Math.max(a, b);
  const min = Math.min(a, b);
  if (max < target) return false;          // game not ended
  if (max === 30) return true;             // hard cap reached
  if (max > 30) return false;              // impossible
  return max - min >= 2;                   // need 2-point lead
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  const parsed = await parseJson(req, UpdateMatchScore);
  if (!parsed.ok) return parsed.res;

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    include: { tournament: true },
  });
  if (!match) return notFound();

  if (match.tournament.status !== 'in_progress' && match.tournament.status !== 'finished') {
    return conflict('tournament_not_in_progress');
  }

  const target = match.tournament.pointsPerGame;
  if (!validBadmintonScore(parsed.data.scoreA, parsed.data.scoreB, target)) {
    return conflict('invalid_score');
  }

  const updated = await prisma.match.update({
    where: { id: params.id },
    data: {
      scoreA: parsed.data.scoreA,
      scoreB: parsed.data.scoreB,
      status: 'completed',
      finishedAt: new Date(),
    },
  });

  // If all matches completed, transition tournament to finished
  const pending = await prisma.match.count({
    where: { tournamentId: match.tournamentId, status: 'pending' },
  });
  if (pending === 0) {
    await prisma.tournament.update({
      where: { id: match.tournamentId },
      data: { status: 'finished', finishedAt: new Date() },
    });
  }

  return ok(updated);
}
```

- [ ] **Step 2: 手動測試**

```bash
npm run dev
# 取一個 match id
MID=$(curl -s http://localhost:3000/api/tournaments/$TID/matches | jq -r '.[0].id')
curl -b /tmp/jar -X PATCH http://localhost:3000/api/matches/$MID/score \
  -H 'Content-Type: application/json' \
  -d '{"scoreA":21,"scoreB":15}'
# 預期 200 + status=completed
# 測試非法比分：
curl -i -b /tmp/jar -X PATCH http://localhost:3000/api/matches/$MID/score \
  -H 'Content-Type: application/json' \
  -d '{"scoreA":15,"scoreB":10}'
# 預期 409 invalid_score
```

停 dev。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/matches/[id]/score/route.ts
git commit -m "feat(api): match score update with 21-point validation + auto-finish"
```

---

## Task 22: Standings query helper

**Files:**
- Create: `src/lib/standings-sql.ts`

- [ ] **Step 1: 寫 helper**

`src/lib/standings-sql.ts`：

```ts
import { prisma } from '@/lib/prisma';

export type StandingRow = {
  team_id: string;
  group_id: string;
  tournament_id: string;
  wins: number;
  played: number;
  point_diff: number;
  points_for: number;
  rank: number;
};

export async function getStandings(tournamentId: string): Promise<StandingRow[]> {
  // bigint columns come back as bigint; cast in SQL
  const rows = await prisma.$queryRaw<StandingRow[]>`
    SELECT
      team_id,
      group_id,
      tournament_id,
      wins::int             AS wins,
      played::int           AS played,
      point_diff::int       AS point_diff,
      points_for::int       AS points_for,
      RANK() OVER (
        PARTITION BY group_id
        ORDER BY wins DESC, point_diff DESC, points_for DESC
      )::int                AS rank
    FROM team_standings
    WHERE tournament_id = ${tournamentId}
    ORDER BY group_id, rank
  `;
  return rows;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/standings-sql.ts
git commit -m "feat(api): standings query helper using team_standings view"
```

---

## Task 23: GET /api/tournaments/[id]/standings

**Files:**
- Create: `src/app/api/tournaments/[id]/standings/route.ts`

- [ ] **Step 1: 寫 route**

`src/app/api/tournaments/[id]/standings/route.ts`：

```ts
import { NextRequest } from 'next/server';
import { ok } from '@/lib/api-helpers';
import { getStandings } from '@/lib/standings-sql';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const rows = await getStandings(params.id);
  // group rows by group_id for client convenience
  const byGroup = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byGroup.get(r.group_id) ?? [];
    arr.push(r);
    byGroup.set(r.group_id, arr);
  }
  const result = [...byGroup.entries()].map(([groupId, standings]) => ({ groupId, standings }));
  return ok(result);
}
```

- [ ] **Step 2: 手動測試**

```bash
npm run dev
curl -s http://localhost:3000/api/tournaments/$TID/standings | jq '.'
# 預期回 [{groupId, standings: [{team_id, wins, rank, ...}]}]
```

停 dev。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tournaments/[id]/standings/route.ts
git commit -m "feat(api): standings GET endpoint"
```

---

## Task 24: Dockerfile（multi-stage standalone build）

**Files:**
- Create: `Dockerfile`, `.dockerignore`
- Modify: `next.config.mjs`

- [ ] **Step 1: 啟用 Next.js standalone output**

修改 `next.config.mjs`：

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
};
export default nextConfig;
```

- [ ] **Step 2: 寫 Dockerfile**

`Dockerfile`：

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder /app/public ./public
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/prisma ./prisma
COPY --from=builder --chown=app:app /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=app:app /app/node_modules/@prisma ./node_modules/@prisma
USER app
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 3: 寫 .dockerignore**

`.dockerignore`：

```
node_modules
.next
.git
.env
.env.local
docs
tests
.superpowers
README.md
```

- [ ] **Step 4: 在本機建立 image 確認可建**

```bash
docker build -t badminton-app:dev .
```

預期：build 成功，產出 image。

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore next.config.mjs
git commit -m "feat(deploy): multi-stage Dockerfile with Next.js standalone output"
```

---

## Task 25: docker-compose.yml + nginx config

**Files:**
- Create: `docker-compose.yml`, `nginx/default.conf`

- [ ] **Step 1: 寫 docker-compose.yml**

`docker-compose.yml`：

```yaml
services:
  nginx:
    image: nginx:1.27-alpine
    ports:
      - "80:80"
    depends_on:
      - app
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    restart: unless-stopped

  app:
    build: .
    environment:
      DATABASE_URL: postgresql://app:app@db:5432/badminton?schema=public
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      SESSION_SECRET: ${SESSION_SECRET}
      NODE_ENV: production
      PORT: 3000
    depends_on:
      db:
        condition: service_healthy
    expose:
      - "3000"
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: badminton
    volumes:
      - pgdata:/var/lib/postgresql/data
    expose:
      - "5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d badminton"]
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped

volumes:
  pgdata:
```

- [ ] **Step 2: 寫 nginx config**

`nginx/default.conf`：

```nginx
server {
    listen 80 default_server;
    server_name _;

    client_max_body_size 1m;

    location /socket.io/ {
        proxy_pass http://app:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400s;
    }

    location / {
        proxy_pass http://app:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

- [ ] **Step 3: 設定生產 .env**

把先前的 `.env` 改為：

```
ADMIN_PASSWORD=please-set-something-strong-min-16
SESSION_SECRET=please-generate-random-secret-min-32-or-more
```

（DATABASE_URL 由 compose 服務名稱自動處理，不在 .env 重複）

注意：先前 Task 2 設的本機 dev `.env` 還是要保留，但生產 compose 啟動會用 compose 自己的 env vars，這個檔案會被 compose 讀取以填充 `${...}`。

- [ ] **Step 4: 起 stack**

```bash
docker compose up -d --build
```

等所有 service healthy（`docker compose ps`）。

- [ ] **Step 5: 跑 migrate**

```bash
docker compose exec app npx prisma migrate deploy
```

- [ ] **Step 6: smoke test**

```bash
curl -i http://localhost/api/tournaments
# 預期 200 + []（透過 nginx 轉到 app）
```

- [ ] **Step 7: 停 stack**

```bash
docker compose down
```

（資料保留在 pgdata volume；下次 up 仍在。）

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml nginx/default.conf
git commit -m "feat(deploy): docker-compose with nginx reverse proxy + postgres"
```

---

## Task 26: End-to-end smoke test（透過 supertest 跑完整流程）

**Files:**
- Create: `tests/integration/api.test.ts`

- [ ] **Step 1: 寫 e2e smoke test**

`tests/integration/api.test.ts`：

```ts
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
    } catch {
      // ignore
    }
    await wait(500);
  }
  throw new Error('server did not become healthy');
}

beforeAll(async () => {
  // assume docker compose stack is up; otherwise skip
  server = spawn('npm', ['run', 'dev', '--', '-p', '3100'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3100' },
    shell: process.platform === 'win32',
  });
  await waitForHealthy(`${BASE}/api/tournaments`);
}, 60_000);

afterAll(async () => {
  if (server) {
    server.kill();
    await wait(500);
  }
});

describe('full tournament flow (smoke)', () => {
  let cookie = '';
  let tournamentId = '';

  it('logs in as admin', async () => {
    const res = await request(BASE)
      .post('/api/admin/login')
      .send({ password: process.env.ADMIN_PASSWORD || 'dev-password-please-change' });
    expect(res.status).toBe(200);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeTruthy();
    cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0];
  });

  it('creates a tournament', async () => {
    const res = await request(BASE)
      .post('/api/tournaments')
      .set('Cookie', cookie)
      .send({ name: 'smoke-test', teamsPerGroup: 4 });
    expect(res.status).toBe(201);
    tournamentId = res.body.id;
  });

  it('adds 8 teams and 2 courts', async () => {
    for (let i = 1; i <= 8; i++) {
      const r = await request(BASE)
        .post(`/api/tournaments/${tournamentId}/teams`)
        .set('Cookie', cookie)
        .send({
          name: `T${i}`,
          player1Name: `P${i}-1`,
          player2Name: `P${i}-2`,
          seedLevel: ((i - 1) % 5) + 1,
        });
      expect(r.status).toBe(201);
    }
    for (let i = 1; i <= 2; i++) {
      const r = await request(BASE)
        .post(`/api/tournaments/${tournamentId}/courts`)
        .set('Cookie', cookie)
        .send({ name: `場地 ${i}` });
      expect(r.status).toBe(201);
    }
  });

  it('generates groups, locks, generates matches', async () => {
    const g = await request(BASE).post(`/api/tournaments/${tournamentId}/groups/generate`).set('Cookie', cookie);
    expect(g.status).toBe(200);
    expect(g.body.groups.length).toBe(2); // 8 teams / 4

    const l = await request(BASE).post(`/api/tournaments/${tournamentId}/groups/lock`).set('Cookie', cookie);
    expect(l.status).toBe(200);
    expect(l.body.status).toBe('in_progress');

    const m = await request(BASE).post(`/api/tournaments/${tournamentId}/matches/generate`).set('Cookie', cookie);
    expect(m.status).toBe(200);
    // 2 groups × C(4,2)=6 matches = 12
    expect(m.body.count).toBe(12);
  });

  it('fills all scores and reaches finished', async () => {
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
    expect(s.body.length).toBe(2); // 2 groups
    for (const group of s.body) {
      expect(group.standings.length).toBe(4); // 4 teams per group
      // ranks should be 1..4 (no ties expected since one team won all)
      const ranks = group.standings.map((r: any) => r.rank).sort();
      expect(ranks[0]).toBe(1);
    }
  });

  it('cleanup', async () => {
    const d = await request(BASE).delete(`/api/tournaments/${tournamentId}`).set('Cookie', cookie);
    expect(d.status).toBe(200);
  });
});
```

- [ ] **Step 2: 確保本機 db 在跑（從 Task 2 的 badminton-pg）**

```bash
docker start badminton-pg 2>/dev/null || true
docker ps | grep badminton-pg
```

預期：CONTAINER 存在。

- [ ] **Step 3: 跑測試**

```bash
npm test
```

預期：所有 unit + integration test pass。Integration 會自動起 dev server 並關閉。

注意：若已有別的 dev server 佔用 port 3100，先停掉。

- [ ] **Step 4: Commit**

```bash
git add tests/integration/api.test.ts
git commit -m "test: end-to-end smoke test covering full tournament flow"
```

---

## Self-Review（已執行）

**Spec coverage** ── 每個 spec 章節對應到的 task：

| Spec | Plan |
|---|---|
| §3 Tech Stack | Task 1, 2, 5, 6 |
| §4 架構（nginx/app/db） | Task 24, 25 |
| §5 資料模型 | Task 2 (schema), Task 3 (view) |
| §6.1 蛇形分組 | Task 6.5 |
| §6.2 Circle method | Task 7 |
| §6.3 場地分配 | Task 7.5 |
| §6.4 排名 | Task 3 (view), Task 22, 23 |
| §7 頁面結構 | 留給 Plan 2 |
| §8 REST API（公開） | Task 12, 13, 14, 16, 23 |
| §8 REST API（管理） | Task 9, 12-21 |
| §9 即時事件 | 留給 Plan 2 |
| §10 驗證與安全 | Task 8, 9, 10 |
| §11 部署 | Task 24, 25 |

**Placeholder scan** ── 已掃過，無 TODO/TBD。

**Type consistency** ── 已核對：`TournamentStatus` 與 schema enum 一致；`Pair` / `MatchInput` / `CourtAllocation` 在各演算法檔案及呼叫方一致；`StandingRow` 在 SQL helper 與 route 一致。

---

## Plan 1 完成定義

執行完 Task 26 即達 Plan 1 目標：

1. `docker compose up -d` 三服務正常啟動
2. `npm test` 全綠（單元測試 + 整合測試）
3. 用 curl 能跑完「建賽 → 報名 → 分組 → 鎖定 → 產生賽程 → 計分 → 看排名 → 完賽」
4. 後續 Plan 2 可在此基礎上加 UI（公開頁、管理頁）與 Socket.IO 即時通訊
