# 羽球友誼賽 — Plan 2：UI + Realtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Plan 1 後端基礎上加上 Socket.IO 即時通訊、公開觀眾頁與主辦工作台 UI，讓系統具備完整的網頁使用體驗。

**Architecture:** 用 Next.js custom server 把 Socket.IO 與 Next handler 跑在同一 HTTP server。Mutation API 在 Prisma transaction commit 後 broadcast 事件到 `tournament:{id}` room。前端用 React hook 訂閱、自動 reload 資料。UI 用 React Server Components（讀取）+ Client Components（互動）+ shadcn/ui 元件。

**Tech Stack:** Socket.IO 4.x、shadcn/ui、Radix UI primitives、lucide-react、react-hook-form + zod resolver、tailwindcss-animate

**前置條件：** Plan 1 已完成（至少到 Task 23）。

**Spec：** `docs/superpowers/specs/2026-05-21-badminton-tournament-design.md`

---

## 檔案結構

```
badminton-game/
├── server.js                                 (Task 2, 新)
├── package.json                              (Task 1, 2, 修改 scripts)
├── components.json                           (Task 6, shadcn config)
├── Dockerfile                                (Task 5, 修改 CMD)
├── src/
│   ├── app/
│   │   ├── layout.tsx                        (Task 8, 全域 layout)
│   │   ├── page.tsx                          (Task 10, 首頁)
│   │   ├── globals.css                       (Task 6, 加 shadcn vars)
│   │   ├── t/[id]/
│   │   │   ├── page.tsx                      (Task 11, viewer 入口)
│   │   │   └── viewer-client.tsx             (Task 11, client 元件)
│   │   └── admin/
│   │       ├── login/page.tsx                (Task 16)
│   │       ├── page.tsx                      (Task 17, admin 首頁)
│   │       └── t/[id]/
│   │           ├── page.tsx                  (Task 18, workspace 入口)
│   │           └── workspace-client.tsx      (Task 18, 五區整合)
│   ├── lib/
│   │   ├── socket-server.ts                  (Task 3, server-side Socket.IO)
│   │   ├── socket-events.ts                  (Task 4, event 型別 + emit helper)
│   │   ├── use-socket.ts                     (Task 7, client hook)
│   │   ├── api-client.ts                     (Task 9, fetch wrapper)
│   │   └── format.ts                         (Task 8, 顯示用 utils)
│   ├── components/
│   │   ├── ui/                               (Task 6, shadcn 元件)
│   │   ├── status-badge.tsx                  (Task 8)
│   │   ├── home/
│   │   │   └── tournament-list.tsx           (Task 10)
│   │   ├── viewer/
│   │   │   ├── tabs.tsx                      (Task 11)
│   │   │   ├── teams-tab.tsx                 (Task 12)
│   │   │   ├── groups-tab.tsx                (Task 13)
│   │   │   ├── matches-tab.tsx               (Task 14)
│   │   │   └── standings-tab.tsx             (Task 15)
│   │   └── admin/
│   │       ├── login-form.tsx                (Task 16)
│   │       ├── tournament-list-admin.tsx     (Task 17)
│   │       ├── create-tournament-dialog.tsx  (Task 17)
│   │       ├── workspace-nav.tsx             (Task 18)
│   │       ├── section-settings.tsx          (Task 19)
│   │       ├── section-teams.tsx             (Task 20)
│   │       ├── section-groups.tsx            (Task 21)
│   │       ├── section-matches.tsx           (Task 22)
│   │       └── section-scoring.tsx           (Task 23)
│   └── app/api/                              (Task 4, modify existing routes to emit)
└── tests/integration/
    └── socket.test.ts                        (Task 4, socket smoke test)
```

---

## Task 1: 安裝 Socket.IO 與前端依賴

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安裝後端 + 前端依賴**

```bash
npm install socket.io socket.io-client
npm install react-hook-form @hookform/resolvers
npm install lucide-react class-variance-authority clsx tailwind-merge tailwindcss-animate
npm install --save-dev @types/node
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add socket.io, react-hook-form, shadcn deps"
```

---

## Task 2: Custom server（Next.js + Socket.IO 共用 HTTP server）

**Files:**
- Create: `server.js`
- Modify: `package.json`

- [ ] **Step 1: 寫 server.js（CommonJS for Next.js standalone compatibility）**

`server.js`：

```js
const { createServer } = require('node:http');
const { parse } = require('node:url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    path: '/socket.io/',
    cors: { origin: false }, // same-origin only
    serveClient: false,
  });

  // expose io to Next.js route handlers via a global
  globalThis.__socketIo = io;

  io.on('connection', (socket) => {
    socket.on('subscribe', (payload) => {
      if (payload && typeof payload.tournamentId === 'string') {
        socket.join(`tournament:${payload.tournamentId}`);
      }
    });
    socket.on('unsubscribe', (payload) => {
      if (payload && typeof payload.tournamentId === 'string') {
        socket.leave(`tournament:${payload.tournamentId}`);
      }
    });
  });

  httpServer
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
```

- [ ] **Step 2: 改 package.json scripts 用 custom server**

修改 `package.json` 的 `scripts`：

```json
"dev": "node server.js",
"build": "next build",
"start": "NODE_ENV=production node server.js"
```

注意：原本 `next dev` / `next start` 換掉。Windows 沒有 inline env var，`start` script 在 Windows 上要 `cross-env`，但因生產用 Docker，這裡先不處理。

- [ ] **Step 3: 啟動 dev 確認 server 起得來**

```bash
npm run dev
```

預期：log 顯示 `> Ready on http://0.0.0.0:3000`。打開瀏覽器看 Next.js 預設頁仍正常。

- [ ] **Step 4: 在另一 terminal 確認 Socket.IO endpoint 回應**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/socket.io/?EIO=4
```

預期：200 或 400（不是 404 即可）。

停 dev server。

- [ ] **Step 5: Commit**

```bash
git add server.js package.json
git commit -m "feat(server): custom Next.js server hosting Socket.IO on same port"
```

---

## Task 3: Server-side Socket.IO emit helper

**Files:**
- Create: `src/lib/socket-server.ts`

- [ ] **Step 1: 寫 helper**

`src/lib/socket-server.ts`：

```ts
import type { Server as IOServer } from 'socket.io';

declare global {
  // server.js sets globalThis.__socketIo
  // eslint-disable-next-line no-var
  var __socketIo: IOServer | undefined;
}

/**
 * Get the Socket.IO server instance set up in server.js.
 * Returns undefined if running in a context where it isn't available
 * (e.g., scripts, unit tests).
 */
export function getIO(): IOServer | undefined {
  return globalThis.__socketIo;
}

export function emitToTournament(tournamentId: string, event: string, payload: unknown): void {
  const io = getIO();
  if (!io) return;
  io.to(`tournament:${tournamentId}`).emit(event, payload);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/socket-server.ts
git commit -m "feat(socket): server-side emit helper for tournament rooms"
```

---

## Task 4: Event types + 在每個 mutation API 加上 emit

**Files:**
- Create: `src/lib/socket-events.ts`
- Modify: `src/app/api/tournaments/route.ts`, `src/app/api/tournaments/[id]/route.ts`, `src/app/api/tournaments/[id]/teams/route.ts`, `src/app/api/teams/[id]/route.ts`, `src/app/api/teams/[id]/move-group/route.ts`, `src/app/api/tournaments/[id]/groups/generate/route.ts`, `src/app/api/tournaments/[id]/groups/lock/route.ts`, `src/app/api/tournaments/[id]/matches/generate/route.ts`, `src/app/api/matches/[id]/score/route.ts`

- [ ] **Step 1: 定義事件型別**

`src/lib/socket-events.ts`：

```ts
import type { Tournament, Team, Group, Match } from '@prisma/client';

export type ServerEvent =
  | { type: 'team.added'; tournamentId: string; team: Team }
  | { type: 'team.updated'; tournamentId: string; team: Team }
  | { type: 'team.deleted'; tournamentId: string; teamId: string }
  | { type: 'groups.generated'; tournamentId: string; groups: Group[] }
  | { type: 'groups.locked'; tournamentId: string }
  | { type: 'match.generated'; tournamentId: string; matches: Match[] }
  | { type: 'match.scored'; tournamentId: string; match: Match }
  | { type: 'tournament.updated'; tournamentId: string; tournament: Tournament }
  | { type: 'tournament.deleted'; tournamentId: string };
```

- [ ] **Step 2: 在 tournament POST/PATCH/DELETE 加 emit**

修改 `src/app/api/tournaments/route.ts` 的 `POST`，在 `return ok(t, 201);` 之前加：

```ts
import { emitToTournament } from '@/lib/socket-server';
// ... existing code
emitToTournament(t.id, 'tournament.updated', { tournamentId: t.id, tournament: t });
return ok(t, 201);
```

修改 `src/app/api/tournaments/[id]/route.ts`：
- `PATCH` 成功後加：
  ```ts
  emitToTournament(t.id, 'tournament.updated', { tournamentId: t.id, tournament: t });
  ```
- `DELETE` 成功後加：
  ```ts
  emitToTournament(params.id, 'tournament.deleted', { tournamentId: params.id });
  ```

修改 imports 在檔頂加 `import { emitToTournament } from '@/lib/socket-server';`。

- [ ] **Step 3: 在 team POST/PATCH/DELETE 加 emit**

修改 `src/app/api/tournaments/[id]/teams/route.ts` 的 `POST`，return 前加：

```ts
emitToTournament(params.id, 'team.added', { tournamentId: params.id, team });
```

修改 `src/app/api/teams/[id]/route.ts`：
- `PATCH` return 前加：
  ```ts
  emitToTournament(t.tournamentId, 'team.updated', { tournamentId: t.tournamentId, team: t });
  ```
- `DELETE` 成功取得 `t` 後（在 catch null 改寫成保留 id 邏輯）：
  ```ts
  const t = await prisma.team
    .delete({ where: { id: params.id } })
    .catch(() => null);
  if (!t) return notFound();
  emitToTournament(t.tournamentId, 'team.deleted', { tournamentId: t.tournamentId, teamId: t.id });
  return ok({ deleted: true });
  ```

修改 `src/app/api/teams/[id]/move-group/route.ts` 的 `PATCH`，return 前：

```ts
emitToTournament(updated.tournamentId, 'team.updated', { tournamentId: updated.tournamentId, team: updated });
```

- [ ] **Step 4: 在 groups generate/lock 加 emit**

修改 `src/app/api/tournaments/[id]/groups/generate/route.ts` return 前：

```ts
emitToTournament(params.id, 'groups.generated', { tournamentId: params.id, groups: result });
```

修改 `src/app/api/tournaments/[id]/groups/lock/route.ts` return 前：

```ts
emitToTournament(params.id, 'groups.locked', { tournamentId: params.id });
emitToTournament(params.id, 'tournament.updated', { tournamentId: params.id, tournament: updated });
```

- [ ] **Step 5: 在 matches generate + score 加 emit**

修改 `src/app/api/tournaments/[id]/matches/generate/route.ts` return 前：

```ts
emitToTournament(params.id, 'match.generated', { tournamentId: params.id, matches: result });
```

修改 `src/app/api/matches/[id]/score/route.ts`，return 前：

```ts
emitToTournament(updated.tournamentId, 'match.scored', { tournamentId: updated.tournamentId, match: updated });
if (pending === 0) {
  const final = await prisma.tournament.findUnique({ where: { id: match.tournamentId } });
  if (final) emitToTournament(final.id, 'tournament.updated', { tournamentId: final.id, tournament: final });
}
```

注意：把先前 `await prisma.tournament.update(...)` 的結果存進變數使用，或直接重新讀取，總之確保最後 emit 的 tournament 是最新 status。

- [ ] **Step 6: 寫 socket smoke test**

`tests/integration/socket.test.ts`：

```ts
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { io as ioClient, type Socket } from 'socket.io-client';
import request from 'supertest';

let server: ChildProcess | undefined;
const BASE = 'http://localhost:3101';

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
    env: { ...process.env, PORT: '3101' },
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

describe('socket events', () => {
  it('subscribed client receives team.added when admin adds team', async () => {
    // login as admin and create tournament
    const loginRes = await request(BASE)
      .post('/api/admin/login')
      .send({ password: process.env.ADMIN_PASSWORD || 'dev-password-please-change' });
    const cookie = (loginRes.headers['set-cookie'][0] as string).split(';')[0];

    const tRes = await request(BASE)
      .post('/api/tournaments')
      .set('Cookie', cookie)
      .send({ name: 'socket-test', teamsPerGroup: 4 });
    const tournamentId = tRes.body.id;

    // subscribe via socket
    const socket: Socket = ioClient(BASE, { path: '/socket.io/' });
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    const received: any[] = [];
    socket.on('team.added', (payload) => received.push(payload));
    socket.emit('subscribe', { tournamentId });
    await wait(100);

    // add a team via API
    await request(BASE)
      .post(`/api/tournaments/${tournamentId}/teams`)
      .set('Cookie', cookie)
      .send({ name: 'X', player1Name: 'p1', player2Name: 'p2', seedLevel: 3 });

    await wait(200);
    expect(received.length).toBe(1);
    expect(received[0].team.name).toBe('X');

    // cleanup
    socket.disconnect();
    await request(BASE).delete(`/api/tournaments/${tournamentId}`).set('Cookie', cookie);
  }, 20_000);
});
```

- [ ] **Step 7: 跑測試**

```bash
docker start badminton-pg 2>/dev/null || true
npm test
```

預期：所有 unit + integration（含 socket）通過。

- [ ] **Step 8: Commit**

```bash
git add src/lib/socket-events.ts src/app/api tests/integration/socket.test.ts
git commit -m "feat(socket): emit events from all mutation APIs + socket smoke test"
```

---

## Task 5: 更新 Dockerfile 用 custom server

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: 修改 Dockerfile**

`Dockerfile` 的 runner stage 加 `server.js` copy 並改 CMD：

把原本：
```dockerfile
COPY --from=builder --chown=app:app /app/.next/standalone ./
```

之後新增（在那行之後）：
```dockerfile
COPY --from=builder --chown=app:app /app/server.js ./server.js
COPY --from=builder --chown=app:app /app/node_modules/socket.io ./node_modules/socket.io
COPY --from=builder --chown=app:app /app/node_modules/socket.io-adapter ./node_modules/socket.io-adapter
COPY --from=builder --chown=app:app /app/node_modules/engine.io ./node_modules/engine.io
COPY --from=builder --chown=app:app /app/node_modules/engine.io-parser ./node_modules/engine.io-parser
COPY --from=builder --chown=app:app /app/node_modules/ws ./node_modules/ws
COPY --from=builder --chown=app:app /app/node_modules/cors ./node_modules/cors
COPY --from=builder --chown=app:app /app/node_modules/cookie ./node_modules/cookie
COPY --from=builder --chown=app:app /app/node_modules/accepts ./node_modules/accepts
COPY --from=builder --chown=app:app /app/node_modules/negotiator ./node_modules/negotiator
COPY --from=builder --chown=app:app /app/node_modules/mime-types ./node_modules/mime-types
COPY --from=builder --chown=app:app /app/node_modules/mime-db ./node_modules/mime-db
COPY --from=builder --chown=app:app /app/node_modules/base64id ./node_modules/base64id
COPY --from=builder --chown=app:app /app/node_modules/debug ./node_modules/debug
COPY --from=builder --chown=app:app /app/node_modules/ms ./node_modules/ms
```

CMD 已是 `["node", "server.js"]`，不需改。

注意：Next.js standalone build 不會自動 include 我們的 custom server 用的 deps，必須手動 copy。若有缺漏（build 後啟動 image 報模組找不到），照錯誤訊息再加 COPY 即可。

- [ ] **Step 2: 重新 build image 並起 compose 確認**

```bash
docker compose down
docker compose build app
docker compose up -d
docker compose exec app npx prisma migrate deploy
curl -s -o /dev/null -w "%{http_code}\n" http://localhost/api/tournaments
# 預期 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost/socket.io/?EIO=4
# 預期 200 或 400（非 404）
docker compose down
```

- [ ] **Step 3: Commit**

```bash
git add Dockerfile
git commit -m "feat(deploy): include socket.io modules + custom server in image"
```

---

## Task 6: shadcn/ui 設定 + 基本元件

**Files:**
- Create: `components.json`, `src/lib/utils.ts`
- Modify: `src/app/globals.css`, `tailwind.config.ts`
- Create: `src/components/ui/button.tsx`, `src/components/ui/input.tsx`, `src/components/ui/label.tsx`, `src/components/ui/card.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/select.tsx`, `src/components/ui/tabs.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/separator.tsx`, `src/components/ui/table.tsx`, `src/components/ui/toast.tsx`, `src/components/ui/toaster.tsx`, `src/components/ui/use-toast.ts`

- [ ] **Step 1: 初始化 shadcn**

```bash
npx --yes shadcn@latest init -d
```

回答提示：選 New York 風格、Slate base、是否 CSS variables YES。會自動建立 `components.json`、`src/lib/utils.ts`、更新 `globals.css` 與 `tailwind.config.ts`。

- [ ] **Step 2: 加入需要的元件**

```bash
npx shadcn@latest add button input label card dialog select tabs badge separator table toast
```

預期：所有元件檔案產出在 `src/components/ui/`。

- [ ] **Step 3: 在 layout 加 Toaster**

修改 `src/app/layout.tsx`，把 `<body>` 內容換成：

```tsx
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

export const metadata = { title: '羽球友誼賽', description: 'Badminton friendly tournament' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

- [ ] **Step 4: 確認 dev server 起得來且 UI 還在**

```bash
npm run dev
# 開 http://localhost:3000，預設首頁應該還在（雖然樣式變了）
```

停 dev。

- [ ] **Step 5: Commit**

```bash
git add components.json src/lib/utils.ts src/components/ui src/app/globals.css src/app/layout.tsx tailwind.config.ts
git commit -m "feat(ui): set up shadcn/ui with core components + Toaster"
```

---

## Task 7: 前端 useSocket hook

**Files:**
- Create: `src/lib/use-socket.ts`

- [ ] **Step 1: 寫 hook**

`src/lib/use-socket.ts`：

```ts
'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

let sharedSocket: Socket | null = null;

function getSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io({ path: '/socket.io/', transports: ['websocket', 'polling'] });
  }
  return sharedSocket;
}

type Handler = (payload: any) => void;

/**
 * Subscribe to a tournament room and register event handlers.
 * Handlers are deregistered on unmount.
 */
export function useTournamentSocket(tournamentId: string, handlers: Record<string, Handler>) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const socket = getSocket();

    const onAny = (eventName: string) => {
      return (payload: any) => {
        const h = handlersRef.current[eventName];
        if (h) h(payload);
      };
    };

    const events = Object.keys(handlersRef.current);
    const listeners: Record<string, Handler> = {};
    for (const e of events) {
      const fn = onAny(e);
      listeners[e] = fn;
      socket.on(e, fn);
    }

    if (socket.connected) {
      socket.emit('subscribe', { tournamentId });
    } else {
      socket.once('connect', () => socket.emit('subscribe', { tournamentId }));
    }

    return () => {
      socket.emit('unsubscribe', { tournamentId });
      for (const e of events) {
        socket.off(e, listeners[e]);
      }
    };
  }, [tournamentId]);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/use-socket.ts
git commit -m "feat(ui): useTournamentSocket hook with shared socket connection"
```

---

## Task 8: API client + 共用元件

**Files:**
- Create: `src/lib/api-client.ts`, `src/lib/format.ts`, `src/components/status-badge.tsx`

- [ ] **Step 1: 寫 API client wrapper**

`src/lib/api-client.ts`：

```ts
export class ApiError extends Error {
  constructor(public status: number, public body: any) {
    super(body?.error ?? `HTTP ${status}`);
  }
}

export async function api<T = any>(
  path: string,
  init?: RequestInit & { body?: any },
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init?.headers) Object.assign(headers, init.headers);
  const res = await fetch(path, {
    ...init,
    headers,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}
```

- [ ] **Step 2: 寫 format utils**

`src/lib/format.ts`：

```ts
import type { TournamentStatus } from '@prisma/client';

export const statusLabel: Record<TournamentStatus, string> = {
  draft: '草稿',
  grouping: '分組中',
  in_progress: '進行中',
  finished: '已完賽',
};

export const seedLabel = (n: number) => `★`.repeat(n) + `☆`.repeat(Math.max(0, 5 - n));
```

- [ ] **Step 3: 寫 StatusBadge 元件**

`src/components/status-badge.tsx`：

```tsx
import { Badge } from '@/components/ui/badge';
import { statusLabel } from '@/lib/format';
import type { TournamentStatus } from '@prisma/client';

const variantByStatus: Record<TournamentStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  grouping: 'secondary',
  in_progress: 'default',
  finished: 'secondary',
};

export function StatusBadge({ status }: { status: TournamentStatus }) {
  return <Badge variant={variantByStatus[status]}>{statusLabel[status]}</Badge>;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/api-client.ts src/lib/format.ts src/components/status-badge.tsx
git commit -m "feat(ui): api client wrapper, format utils, status badge"
```

---

## Task 9: 首頁 / —— 列出所有 tournament

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/components/home/tournament-list.tsx`

- [ ] **Step 1: 寫 server component 拉資料**

`src/app/page.tsx`（覆寫預設）：

```tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/prisma';
import { TournamentList } from '@/components/home/tournament-list';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const tournaments = await prisma.tournament.findMany({ orderBy: { createdAt: 'desc' } });
  return (
    <main className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-semibold">🏸 羽球友誼賽</h1>
        <Link href="/admin">
          <Button variant="outline">主辦登入</Button>
        </Link>
      </div>
      <TournamentList tournaments={tournaments} />
    </main>
  );
}
```

- [ ] **Step 2: 寫 list client component**

`src/components/home/tournament-list.tsx`：

```tsx
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import type { Tournament } from '@prisma/client';

export function TournamentList({ tournaments }: { tournaments: Tournament[] }) {
  if (tournaments.length === 0) {
    return <p className="text-muted-foreground">目前沒有賽事</p>;
  }
  return (
    <div className="grid gap-4">
      {tournaments.map((t) => (
        <Link key={t.id} href={`/t/${t.id}`}>
          <Card className="transition hover:bg-accent/40">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t.name}</CardTitle>
              <StatusBadge status={t.status} />
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              每組 {t.teamsPerGroup} 隊 · {new Date(t.createdAt).toLocaleDateString('zh-TW')}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: 確認首頁顯示**

```bash
npm run dev
# 開 http://localhost:3000，預期看到 tournaments 列表或「目前沒有賽事」
```

停 dev。

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/components/home/tournament-list.tsx
git commit -m "feat(ui): public home page listing tournaments"
```

---

## Task 10: 觀眾頁 /t/[id] 入口 + tab 框架

**Files:**
- Create: `src/app/t/[id]/page.tsx`, `src/app/t/[id]/viewer-client.tsx`, `src/components/viewer/tabs.tsx`

- [ ] **Step 1: 寫 server page 拉初始資料**

`src/app/t/[id]/page.tsx`：

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/prisma';
import { StatusBadge } from '@/components/status-badge';
import { ViewerClient } from './viewer-client';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export default async function ViewerPage({ params }: Params) {
  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) notFound();
  return (
    <main className="container mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
            ← 返回
          </Link>
          <h1 className="text-2xl font-semibold">{tournament.name}</h1>
          <StatusBadge status={tournament.status} />
        </div>
      </div>
      <ViewerClient tournamentId={tournament.id} initialTournament={tournament} />
    </main>
  );
}
```

- [ ] **Step 2: 寫 viewer client（管 tabs + 訂閱 socket）**

`src/app/t/[id]/viewer-client.tsx`：

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useTournamentSocket } from '@/lib/use-socket';
import { TeamsTab } from '@/components/viewer/teams-tab';
import { GroupsTab } from '@/components/viewer/groups-tab';
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
    'team.added': bump,
    'team.updated': bump,
    'team.deleted': bump,
    'groups.generated': bump,
    'groups.locked': bump,
    'match.generated': bump,
    'match.scored': bump,
    'tournament.updated': bump,
  });

  return (
    <Tabs defaultValue="standings">
      <TabsList>
        <TabsTrigger value="teams">報名隊伍</TabsTrigger>
        <TabsTrigger value="groups">分組</TabsTrigger>
        <TabsTrigger value="matches">賽程</TabsTrigger>
        <TabsTrigger value="standings">即時排名</TabsTrigger>
      </TabsList>
      <TabsContent value="teams">
        <TeamsTab tournamentId={tournamentId} revision={revision} />
      </TabsContent>
      <TabsContent value="groups">
        <GroupsTab tournamentId={tournamentId} revision={revision} />
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

- [ ] **Step 3: Commit**

```bash
git add src/app/t/[id]/
git commit -m "feat(ui): viewer page shell with tabs + socket subscription"
```

---

## Task 11: 觀眾頁 - 隊伍 Tab

**Files:**
- Create: `src/components/viewer/teams-tab.tsx`

- [ ] **Step 1: 寫 client tab，fetch + render**

`src/components/viewer/teams-tab.tsx`：

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { seedLabel } from '@/lib/format';
import type { Team } from '@prisma/client';

export function TeamsTab({ tournamentId, revision }: { tournamentId: string; revision: number }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<Team[]>(`/api/tournaments/${tournamentId}/teams`)
      .then(setTeams)
      .finally(() => setLoading(false));
  }, [tournamentId, revision]);

  if (loading && teams.length === 0) return <p className="py-6 text-muted-foreground">載入中…</p>;
  if (teams.length === 0) return <p className="py-6 text-muted-foreground">尚無隊伍報名</p>;

  return (
    <div className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-3">
      {teams.map((t) => (
        <Card key={t.id} className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-medium">{t.name}</div>
              <div className="text-sm text-muted-foreground">
                {t.player1Name} / {t.player2Name}
              </div>
            </div>
            <Badge variant="outline" title={`種子等級 ${t.seedLevel}`}>
              {seedLabel(t.seedLevel)}
            </Badge>
          </div>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/viewer/teams-tab.tsx
git commit -m "feat(ui): viewer teams tab"
```

---

## Task 12: 觀眾頁 - 分組 Tab

**Files:**
- Create: `src/components/viewer/groups-tab.tsx`

- [ ] **Step 1: 寫 tab**

`src/components/viewer/groups-tab.tsx`：

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import type { Group, Team } from '@prisma/client';

type GroupWithTeams = Group & { teams: Team[] };

export function GroupsTab({ tournamentId, revision }: { tournamentId: string; revision: number }) {
  const [groups, setGroups] = useState<GroupWithTeams[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<GroupWithTeams[]>(`/api/tournaments/${tournamentId}/groups`)
      .then(setGroups)
      .finally(() => setLoading(false));
  }, [tournamentId, revision]);

  if (loading && groups.length === 0) return <p className="py-6 text-muted-foreground">載入中…</p>;
  if (groups.length === 0) return <p className="py-6 text-muted-foreground">尚未分組</p>;

  return (
    <div className="grid gap-4 py-4 md:grid-cols-2 lg:grid-cols-3">
      {groups.map((g) => (
        <Card key={g.id} className="p-4">
          <div className="mb-2 text-lg font-semibold">{g.name} 組</div>
          <ul className="space-y-1 text-sm">
            {g.teams.map((t) => (
              <li key={t.id} className="flex justify-between">
                <span>{t.name}</span>
                <span className="text-muted-foreground">
                  {t.player1Name} / {t.player2Name}
                </span>
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
git commit -m "feat(ui): viewer groups tab"
```

---

## Task 13: 觀眾頁 - 賽程 Tab

**Files:**
- Create: `src/components/viewer/matches-tab.tsx`

- [ ] **Step 1: 寫 tab**

`src/components/viewer/matches-tab.tsx`：

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import type { Match, Team, Court, Group } from '@prisma/client';

type MatchFull = Match & { teamA: Team; teamB: Team; court: Court | null; group: Group };

export function MatchesTab({ tournamentId, revision }: { tournamentId: string; revision: number }) {
  const [matches, setMatches] = useState<MatchFull[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<MatchFull[]>(`/api/tournaments/${tournamentId}/matches`)
      .then(setMatches)
      .finally(() => setLoading(false));
  }, [tournamentId, revision]);

  if (loading && matches.length === 0) return <p className="py-6 text-muted-foreground">載入中…</p>;
  if (matches.length === 0) return <p className="py-6 text-muted-foreground">尚無賽程</p>;

  // group by group name
  const byGroup = new Map<string, MatchFull[]>();
  for (const m of matches) {
    const k = m.group.name;
    const arr = byGroup.get(k) ?? [];
    arr.push(m);
    byGroup.set(k, arr);
  }

  return (
    <div className="space-y-6 py-4">
      {[...byGroup.entries()].map(([gname, ms]) => (
        <div key={gname}>
          <div className="mb-2 text-lg font-semibold">{gname} 組</div>
          <div className="grid gap-2 md:grid-cols-2">
            {ms.map((m) => (
              <Card key={m.id} className="flex items-center justify-between p-3">
                <div className="text-sm">
                  <span className="text-muted-foreground">#{m.matchOrder}</span>{' '}
                  <span className="font-medium">{m.teamA.name}</span>
                  <span className="mx-2">vs</span>
                  <span className="font-medium">{m.teamB.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {m.court && (
                    <Badge variant="outline" className="text-xs">
                      {m.court.name}
                    </Badge>
                  )}
                  {m.status === 'completed' ? (
                    <span className="text-sm font-mono">
                      {m.scoreA} - {m.scoreB}
                    </span>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      未開賽
                    </Badge>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/viewer/matches-tab.tsx
git commit -m "feat(ui): viewer matches tab"
```

---

## Task 14: 觀眾頁 - 排名 Tab

**Files:**
- Create: `src/components/viewer/standings-tab.tsx`

- [ ] **Step 1: 寫 tab**

`src/components/viewer/standings-tab.tsx`：

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api-client';
import type { Group, Team } from '@prisma/client';

type Row = {
  team_id: string;
  group_id: string;
  wins: number;
  played: number;
  point_diff: number;
  points_for: number;
  rank: number;
};
type GroupBlock = { groupId: string; standings: Row[] };

export function StandingsTab({ tournamentId, revision }: { tournamentId: string; revision: number }) {
  const [blocks, setBlocks] = useState<GroupBlock[]>([]);
  const [groups, setGroups] = useState<(Group & { teams: Team[] })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api<GroupBlock[]>(`/api/tournaments/${tournamentId}/standings`),
      api<(Group & { teams: Team[] })[]>(`/api/tournaments/${tournamentId}/groups`),
    ])
      .then(([s, g]) => {
        setBlocks(s);
        setGroups(g);
      })
      .finally(() => setLoading(false));
  }, [tournamentId, revision]);

  if (loading && blocks.length === 0) return <p className="py-6 text-muted-foreground">載入中…</p>;
  if (blocks.length === 0) return <p className="py-6 text-muted-foreground">尚無排名資料</p>;

  const teamName = (id: string) => {
    for (const g of groups) {
      const t = g.teams.find((x) => x.id === id);
      if (t) return t.name;
    }
    return id.slice(0, 6);
  };
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? '';

  return (
    <div className="space-y-6 py-4">
      {blocks.map((b) => (
        <Card key={b.groupId} className="p-4">
          <div className="mb-3 text-lg font-semibold">{groupName(b.groupId)} 組</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>隊伍</TableHead>
                <TableHead className="text-right">勝</TableHead>
                <TableHead className="text-right">場次</TableHead>
                <TableHead className="text-right">得分差</TableHead>
                <TableHead className="text-right">總得分</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {b.standings.map((r) => (
                <TableRow key={r.team_id}>
                  <TableCell className="font-medium">{r.rank}</TableCell>
                  <TableCell>{teamName(r.team_id)}</TableCell>
                  <TableCell className="text-right">{r.wins}</TableCell>
                  <TableCell className="text-right">{r.played}</TableCell>
                  <TableCell className="text-right">{r.point_diff}</TableCell>
                  <TableCell className="text-right">{r.points_for}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 確認觀眾頁完整跑得起來**

```bash
npm run dev
# 開 http://localhost:3000/t/<某個 tournament id>
# 點四個 tab，看資料正確
# 在另一個視窗用 curl POST 新增 team，觀察畫面自動更新（透過 socket）
```

停 dev。

- [ ] **Step 3: Commit**

```bash
git add src/components/viewer/standings-tab.tsx
git commit -m "feat(ui): viewer standings tab with rank table"
```

---

## Task 15: 主辦登入頁 /admin/login

**Files:**
- Create: `src/app/admin/login/page.tsx`, `src/components/admin/login-form.tsx`

- [ ] **Step 1: 寫頁面**

`src/app/admin/login/page.tsx`：

```tsx
import { LoginForm } from '@/components/admin/login-form';

export default function AdminLoginPage({ searchParams }: { searchParams: { redirect?: string } }) {
  return (
    <main className="container mx-auto flex max-w-md flex-col items-center px-4 py-16">
      <h1 className="mb-6 text-2xl font-semibold">主辦登入</h1>
      <LoginForm redirect={searchParams.redirect ?? '/admin'} />
    </main>
  );
}
```

- [ ] **Step 2: 寫 form**

`src/components/admin/login-form.tsx`：

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/use-toast';

export function LoginForm({ redirect }: { redirect: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api('/api/admin/login', { method: 'POST', body: { password } });
      router.push(redirect);
      router.refresh();
    } catch (err) {
      const msg = err instanceof ApiError && err.status === 401 ? '密碼錯誤' : '登入失敗';
      toast({ title: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full p-6">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">密碼</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? '驗證中…' : '登入'}
        </Button>
      </form>
    </Card>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/login src/components/admin/login-form.tsx
git commit -m "feat(ui): admin login page"
```

---

## Task 16: 管理首頁 /admin（列出 + 新增）

**Files:**
- Create: `src/app/admin/page.tsx`, `src/components/admin/tournament-list-admin.tsx`, `src/components/admin/create-tournament-dialog.tsx`

- [ ] **Step 1: 寫 page（server component，會被 middleware 守住未登入跳轉）**

`src/app/admin/page.tsx`：

```tsx
import { prisma } from '@/lib/prisma';
import { TournamentListAdmin } from '@/components/admin/tournament-list-admin';
import { CreateTournamentDialog } from '@/components/admin/create-tournament-dialog';

export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const tournaments = await prisma.tournament.findMany({ orderBy: { createdAt: 'desc' } });
  return (
    <main className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">管理 — 賽事列表</h1>
        <CreateTournamentDialog />
      </div>
      <TournamentListAdmin tournaments={tournaments} />
    </main>
  );
}
```

- [ ] **Step 2: 寫 list**

`src/components/admin/tournament-list-admin.tsx`：

```tsx
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import type { Tournament } from '@prisma/client';

export function TournamentListAdmin({ tournaments }: { tournaments: Tournament[] }) {
  if (tournaments.length === 0) {
    return <p className="text-muted-foreground">尚無賽事，請按右上「新增賽事」</p>;
  }
  return (
    <div className="grid gap-3">
      {tournaments.map((t) => (
        <Link key={t.id} href={`/admin/t/${t.id}`}>
          <Card className="transition hover:bg-accent/40">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
              <CardTitle className="text-base">{t.name}</CardTitle>
              <StatusBadge status={t.status} />
            </CardHeader>
            <CardContent className="py-2 text-sm text-muted-foreground">
              每組 {t.teamsPerGroup} 隊 · {new Date(t.createdAt).toLocaleString('zh-TW')}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: 寫 create dialog**

`src/components/admin/create-tournament-dialog.tsx`：

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/ui/use-toast';

export function CreateTournamentDialog() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [teamsPerGroup, setTeamsPerGroup] = useState(4);

  async function submit() {
    try {
      const t = await api<{ id: string }>('/api/tournaments', {
        method: 'POST',
        body: { name, teamsPerGroup },
      });
      setOpen(false);
      router.push(`/admin/t/${t.id}`);
    } catch {
      toast({ title: '建立失敗', variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>新增賽事</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增賽事</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">名稱</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpg">每組隊伍數</Label>
            <Input
              id="tpg"
              type="number"
              min={2}
              max={16}
              value={teamsPerGroup}
              onChange={(e) => setTeamsPerGroup(Number(e.target.value))}
            />
          </div>
          <Button onClick={submit} disabled={!name.trim()} className="w-full">
            建立
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx src/components/admin/tournament-list-admin.tsx src/components/admin/create-tournament-dialog.tsx
git commit -m "feat(ui): admin home page with tournament list + create dialog"
```

---

## Task 17: 主辦工作台 /admin/t/[id] 入口與導覽

**Files:**
- Create: `src/app/admin/t/[id]/page.tsx`, `src/app/admin/t/[id]/workspace-client.tsx`, `src/components/admin/workspace-nav.tsx`

- [ ] **Step 1: 寫 server page**

`src/app/admin/t/[id]/page.tsx`：

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/prisma';
import { StatusBadge } from '@/components/status-badge';
import { WorkspaceClient } from './workspace-client';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export default async function WorkspacePage({ params }: Params) {
  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) notFound();
  return (
    <main className="container mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
            ← 賽事列表
          </Link>
          <h1 className="text-2xl font-semibold">{tournament.name}</h1>
          <StatusBadge status={tournament.status} />
        </div>
        <form action="/api/admin/logout" method="POST">
          <Button type="submit" variant="outline" size="sm">
            登出
          </Button>
        </form>
      </div>
      <WorkspaceClient tournamentId={tournament.id} initialTournament={tournament} />
    </main>
  );
}
```

- [ ] **Step 2: 寫 workspace client**

`src/app/admin/t/[id]/workspace-client.tsx`：

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTournamentSocket } from '@/lib/use-socket';
import { WorkspaceNav } from '@/components/admin/workspace-nav';
import { SectionSettings } from '@/components/admin/section-settings';
import { SectionTeams } from '@/components/admin/section-teams';
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
    'team.added': bump,
    'team.updated': bump,
    'team.deleted': bump,
    'groups.generated': bump,
    'groups.locked': () => {
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
      <SectionTeams tournament={tournament} revision={revision} />
      <SectionGroups tournament={tournament} revision={revision} />
      <SectionMatches tournament={tournament} revision={revision} />
      <SectionScoring tournament={tournament} revision={revision} />
    </div>
  );
}
```

- [ ] **Step 3: 寫 nav（anchor links）**

`src/components/admin/workspace-nav.tsx`：

```tsx
const items = [
  { id: 'settings', label: '1. 賽事設定' },
  { id: 'teams', label: '2. 隊伍報名' },
  { id: 'groups', label: '3. 分組' },
  { id: 'matches', label: '4. 賽程' },
  { id: 'scoring', label: '5. 計分' },
];

export function WorkspaceNav() {
  return (
    <nav className="sticky top-0 z-10 -mx-4 flex gap-2 overflow-x-auto bg-background/80 px-4 py-2 backdrop-blur">
      {items.map((i) => (
        <a
          key={i.id}
          href={`#${i.id}`}
          className="whitespace-nowrap rounded-md px-3 py-1 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          {i.label}
        </a>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/t/[id]/ src/components/admin/workspace-nav.tsx
git commit -m "feat(ui): admin workspace page shell with anchor nav"
```

---

## Task 18: Section 1 — 賽事設定 + 場地清單

**Files:**
- Create: `src/components/admin/section-settings.tsx`

- [ ] **Step 1: 寫 section**

`src/components/admin/section-settings.tsx`：

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/ui/use-toast';
import type { Court, Tournament } from '@prisma/client';

export function SectionSettings({ tournament }: { tournament: Tournament }) {
  const { toast } = useToast();
  const [name, setName] = useState(tournament.name);
  const [teamsPerGroup, setTeamsPerGroup] = useState(tournament.teamsPerGroup);
  const [pointsPerGame, setPointsPerGame] = useState(tournament.pointsPerGame);
  const [courts, setCourts] = useState<Court[]>([]);
  const [newCourt, setNewCourt] = useState('');

  const lockedSettings = tournament.status !== 'draft';

  useEffect(() => {
    api<Court[]>(`/api/tournaments/${tournament.id}/courts`).then(setCourts);
  }, [tournament.id]);

  async function saveSettings() {
    try {
      await api(`/api/tournaments/${tournament.id}`, {
        method: 'PATCH',
        body: { name, teamsPerGroup, pointsPerGame },
      });
      toast({ title: '已儲存' });
    } catch {
      toast({ title: '儲存失敗', variant: 'destructive' });
    }
  }

  async function addCourt() {
    if (!newCourt.trim()) return;
    const c = await api<Court>(`/api/tournaments/${tournament.id}/courts`, {
      method: 'POST',
      body: { name: newCourt.trim() },
    });
    setCourts((cs) => [...cs, c]);
    setNewCourt('');
  }

  async function removeCourt(id: string) {
    await api(`/api/courts/${id}`, { method: 'DELETE' });
    setCourts((cs) => cs.filter((c) => c.id !== id));
  }

  return (
    <section id="settings" className="scroll-mt-16">
      <h2 className="mb-3 text-xl font-semibold">1. 賽事設定</h2>
      <Card className="space-y-4 p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="s-name">名稱</Label>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-ppg">每局分數</Label>
            <Input
              id="s-ppg"
              type="number"
              min={11}
              max={31}
              value={pointsPerGame}
              onChange={(e) => setPointsPerGame(Number(e.target.value))}
              disabled={lockedSettings}
            />
          </div>
        </div>
        <Button onClick={saveSettings} size="sm">
          儲存設定
        </Button>

        <div className="border-t pt-4">
          <Label>場地</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {courts.map((c) => (
              <div key={c.id} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
                {c.name}
                <button
                  onClick={() => removeCourt(c.id)}
                  className="ml-1 text-muted-foreground hover:text-destructive"
                  aria-label="刪除"
                  disabled={lockedSettings}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input
              placeholder="場地名稱（例：場地 1）"
              value={newCourt}
              onChange={(e) => setNewCourt(e.target.value)}
              className="max-w-xs"
              disabled={lockedSettings}
            />
            <Button onClick={addCourt} size="sm" disabled={lockedSettings || !newCourt.trim()}>
              新增場地
            </Button>
          </div>
        </div>
      </Card>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/section-settings.tsx
git commit -m "feat(ui): admin section 1 — tournament settings + courts"
```

---

## Task 19: Section 2 — 隊伍報名

**Files:**
- Create: `src/components/admin/section-teams.tsx`

- [ ] **Step 1: 寫 section**

`src/components/admin/section-teams.tsx`：

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/ui/use-toast';
import { seedLabel } from '@/lib/format';
import type { Team, Tournament } from '@prisma/client';

export function SectionTeams({ tournament, revision }: { tournament: Tournament; revision: number }) {
  const { toast } = useToast();
  const locked = tournament.status === 'in_progress' || tournament.status === 'finished';
  const [teams, setTeams] = useState<Team[]>([]);
  const [name, setName] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [seed, setSeed] = useState(3);

  useEffect(() => {
    api<Team[]>(`/api/tournaments/${tournament.id}/teams`).then(setTeams);
  }, [tournament.id, revision]);

  async function add() {
    try {
      await api(`/api/tournaments/${tournament.id}/teams`, {
        method: 'POST',
        body: { name, player1Name: p1, player2Name: p2, seedLevel: seed },
      });
      setName('');
      setP1('');
      setP2('');
      setSeed(3);
    } catch {
      toast({ title: '新增失敗', variant: 'destructive' });
    }
  }

  async function remove(id: string) {
    await api(`/api/teams/${id}`, { method: 'DELETE' });
  }

  return (
    <section id="teams" className="scroll-mt-16">
      <h2 className="mb-3 text-xl font-semibold">2. 隊伍報名 ({teams.length})</h2>
      <Card className="p-4">
        {!locked && (
          <div className="mb-4 grid gap-3 md:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor="t-name">隊名</Label>
              <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="t-p1">選手 1</Label>
              <Input id="t-p1" value={p1} onChange={(e) => setP1(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="t-p2">選手 2</Label>
              <Input id="t-p2" value={p2} onChange={(e) => setP2(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>種子</Label>
              <Select value={String(seed)} onValueChange={(v) => setSeed(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {seedLabel(n)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={add}
                disabled={!name.trim() || !p1.trim() || !p2.trim()}
                className="w-full"
              >
                新增
              </Button>
            </div>
          </div>
        )}
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-md border p-2">
              <div className="flex-1">
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-muted-foreground">
                  {t.player1Name} / {t.player2Name} · {seedLabel(t.seedLevel)}
                </div>
              </div>
              {!locked && (
                <Button variant="ghost" size="sm" onClick={() => remove(t.id)}>
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
git add src/components/admin/section-teams.tsx
git commit -m "feat(ui): admin section 2 — team registration CRUD"
```

---

## Task 20: Section 3 — 分組

**Files:**
- Create: `src/components/admin/section-groups.tsx`

- [ ] **Step 1: 寫 section**

`src/components/admin/section-groups.tsx`：

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/ui/use-toast';
import type { Group, Team, Tournament } from '@prisma/client';

type GroupWithTeams = Group & { teams: Team[] };

export function SectionGroups({ tournament, revision }: { tournament: Tournament; revision: number }) {
  const { toast } = useToast();
  const [groups, setGroups] = useState<GroupWithTeams[]>([]);
  const canGenerate = tournament.status === 'draft' || tournament.status === 'grouping';
  const canEdit = tournament.status === 'grouping';
  const canLock = tournament.status === 'grouping' && groups.length > 0;

  useEffect(() => {
    api<GroupWithTeams[]>(`/api/tournaments/${tournament.id}/groups`).then(setGroups);
  }, [tournament.id, revision]);

  async function generate() {
    try {
      await api(`/api/tournaments/${tournament.id}/groups/generate`, { method: 'POST' });
      toast({ title: '已產生分組' });
    } catch (e: any) {
      toast({ title: '無法產生分組', description: e.body?.error, variant: 'destructive' });
    }
  }

  async function lock() {
    try {
      await api(`/api/tournaments/${tournament.id}/groups/lock`, { method: 'POST' });
      toast({ title: '已鎖定分組' });
    } catch (e: any) {
      toast({ title: '無法鎖定', description: e.body?.error, variant: 'destructive' });
    }
  }

  async function moveTeam(teamId: string, groupId: string) {
    try {
      await api(`/api/teams/${teamId}/move-group`, { method: 'PATCH', body: { groupId } });
    } catch {
      toast({ title: '移動失敗', variant: 'destructive' });
    }
  }

  return (
    <section id="groups" className="scroll-mt-16">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-xl font-semibold">3. 分組</h2>
        <Button onClick={generate} disabled={!canGenerate} size="sm">
          產生分組（蛇形）
        </Button>
        <Button onClick={lock} disabled={!canLock} size="sm" variant="default">
          鎖定分組
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <Card key={g.id} className="p-3">
            <div className="mb-2 font-semibold">{g.name} 組</div>
            <ul className="space-y-1">
              {g.teams.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{t.name}</span>
                  {canEdit && (
                    <Select value={g.id} onValueChange={(v) => moveTeam(t.id, v)}>
                      <SelectTrigger className="h-7 w-20 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map((gg) => (
                          <SelectItem key={gg.id} value={gg.id}>
                            {gg.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/section-groups.tsx
git commit -m "feat(ui): admin section 3 — group generation + manual move + lock"
```

---

## Task 21: Section 4 — 賽程

**Files:**
- Create: `src/components/admin/section-matches.tsx`

- [ ] **Step 1: 寫 section**

`src/components/admin/section-matches.tsx`：

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/ui/use-toast';
import type { Court, Group, Match, Team, Tournament } from '@prisma/client';

type MatchFull = Match & { teamA: Team; teamB: Team; court: Court | null; group: Group };

export function SectionMatches({ tournament, revision }: { tournament: Tournament; revision: number }) {
  const { toast } = useToast();
  const [matches, setMatches] = useState<MatchFull[]>([]);
  const canGenerate =
    tournament.status === 'in_progress' &&
    matches.every((m) => m.status === 'pending');

  useEffect(() => {
    api<MatchFull[]>(`/api/tournaments/${tournament.id}/matches`).then(setMatches);
  }, [tournament.id, revision]);

  async function generate() {
    try {
      await api(`/api/tournaments/${tournament.id}/matches/generate`, { method: 'POST' });
      toast({ title: '已產生賽程' });
    } catch (e: any) {
      toast({ title: '無法產生賽程', description: e.body?.error, variant: 'destructive' });
    }
  }

  const byGroup = new Map<string, MatchFull[]>();
  for (const m of matches) {
    const k = m.group.name;
    (byGroup.get(k) ?? byGroup.set(k, []).get(k)!).push(m);
  }

  return (
    <section id="matches" className="scroll-mt-16">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-xl font-semibold">4. 賽程</h2>
        <Button onClick={generate} size="sm" disabled={tournament.status !== 'in_progress' || matches.length > 0}>
          {matches.length > 0 ? '已產生' : '產生對戰 + 分配場地'}
        </Button>
        <span className="text-sm text-muted-foreground">{matches.length} 場</span>
      </div>
      <div className="space-y-4">
        {[...byGroup.entries()].map(([gname, ms]) => (
          <Card key={gname} className="p-3">
            <div className="mb-2 font-semibold">{gname} 組</div>
            <div className="grid gap-2 md:grid-cols-2">
              {ms.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">#{m.matchOrder}</span>{' '}
                    {m.teamA.name} <span className="mx-1">vs</span> {m.teamB.name}
                  </div>
                  {m.court && <Badge variant="outline" className="text-xs">{m.court.name}</Badge>}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/section-matches.tsx
git commit -m "feat(ui): admin section 4 — match generation"
```

---

## Task 22: Section 5 — 計分

**Files:**
- Create: `src/components/admin/section-scoring.tsx`

- [ ] **Step 1: 寫 section**

`src/components/admin/section-scoring.tsx`：

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/use-toast';
import type { Court, Group, Match, Team, Tournament } from '@prisma/client';

type MatchFull = Match & { teamA: Team; teamB: Team; court: Court | null; group: Group };

export function SectionScoring({ tournament, revision }: { tournament: Tournament; revision: number }) {
  const { toast } = useToast();
  const [matches, setMatches] = useState<MatchFull[]>([]);
  const editable = tournament.status === 'in_progress' || tournament.status === 'finished';

  useEffect(() => {
    api<MatchFull[]>(`/api/tournaments/${tournament.id}/matches`).then(setMatches);
  }, [tournament.id, revision]);

  return (
    <section id="scoring" className="scroll-mt-16">
      <h2 className="mb-3 text-xl font-semibold">5. 計分</h2>
      {!editable && <p className="text-muted-foreground">尚未進入計分階段</p>}
      <div className="grid gap-2">
        {matches.map((m) => (
          <ScoreRow key={m.id} match={m} revision={revision} />
        ))}
      </div>
    </section>
  );
}

function ScoreRow({ match, revision }: { match: MatchFull; revision: number }) {
  const { toast } = useToast();
  const [a, setA] = useState(String(match.scoreA));
  const [b, setB] = useState(String(match.scoreB));

  useEffect(() => {
    setA(String(match.scoreA));
    setB(String(match.scoreB));
  }, [match.scoreA, match.scoreB, revision]);

  async function save() {
    try {
      await api(`/api/matches/${match.id}/score`, {
        method: 'PATCH',
        body: { scoreA: Number(a), scoreB: Number(b) },
      });
      toast({ title: '已記分' });
    } catch (e) {
      const reason = e instanceof ApiError ? e.body?.error : 'unknown';
      toast({ title: '計分失敗', description: reason, variant: 'destructive' });
    }
  }

  return (
    <Card className="flex flex-wrap items-center gap-3 p-3 text-sm">
      <Badge variant="outline" className="text-xs">{match.group.name}#{match.matchOrder}</Badge>
      {match.court && <Badge variant="outline" className="text-xs">{match.court.name}</Badge>}
      <span className="min-w-[8rem]">{match.teamA.name}</span>
      <Input
        className="h-8 w-16 text-center"
        type="number"
        min={0}
        max={30}
        value={a}
        onChange={(e) => setA(e.target.value)}
      />
      <span>-</span>
      <Input
        className="h-8 w-16 text-center"
        type="number"
        min={0}
        max={30}
        value={b}
        onChange={(e) => setB(e.target.value)}
      />
      <span className="min-w-[8rem]">{match.teamB.name}</span>
      <Button size="sm" onClick={save}>
        儲存
      </Button>
      {match.status === 'completed' && <Badge variant="secondary" className="ml-auto text-xs">已完成</Badge>}
    </Card>
  );
}
```

- [ ] **Step 2: 啟動 dev + 跑完整流程確認 UI 可用**

```bash
docker start badminton-pg 2>/dev/null || true
npm run dev
```

打開 `http://localhost:3000/admin/login`，登入後：
1. 新增賽事
2. 設定場地（場地 1、場地 2）
3. 報名 8 支隊伍
4. 按「產生分組（蛇形）」
5. 按「鎖定分組」
6. 按「產生對戰 + 分配場地」
7. 填幾場比分（試 21-15 / 21-19 / 15-10 看驗證）
8. 開新分頁 `http://localhost:3000/t/<id>`，看四個 tab 都有資料，且 admin 改分數時 viewer 自動更新

停 dev。

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/section-scoring.tsx
git commit -m "feat(ui): admin section 5 — score input with validation feedback"
```

---

## Task 23: 最終 E2E smoke walkthrough（用 playwright 或手動）

**Files:**
- 沒有新檔案；本 task 是執行確認

- [ ] **Step 1: 起 docker compose stack**

```bash
docker compose down -v   # 清掉舊資料
docker compose up -d --build
sleep 5
docker compose exec app npx prisma migrate deploy
```

- [ ] **Step 2: 手動完整流程**

打開 `http://localhost/admin/login`，跑一遍：
- 登入
- 新增「測試友誼賽」
- 加 4 個場地、12 支隊伍（種子 1-5 平均分布）
- 產生分組 → 看到 3 組 × 4 隊
- 微調至少 1 隊到不同組，再移回
- 鎖定分組
- 產生賽程 → 看到 18 場（3 組 × 6 場）+ 場地分配
- 開新分頁觀眾頁 `/t/<id>`，確認四個 tab 都正常
- 在 admin 填一場比分（21-15）→ 切回 viewer 立刻看到（不需重整）
- 填完所有場次 → 確認 tournament 狀態變 finished、排名表完整

- [ ] **Step 3: 確認 logs 沒有錯誤**

```bash
docker compose logs app --tail 100
```

- [ ] **Step 4: 停 stack**

```bash
docker compose down
```

- [ ] **Step 5: Commit（無檔案變更，跳過）**

無變更，跳過。

---

## Self-Review（已執行）

**Spec coverage** ── 每個 spec 章節的 UI/Realtime 部分對應：

| Spec | Plan 2 |
|---|---|
| §4 架構（custom server + Socket.IO 共用） | Task 2, 5 |
| §7 頁面結構（公開路由） | Task 9, 10, 11, 12, 13, 14 |
| §7 頁面結構（管理路由 + 五區） | Task 15, 16, 17, 18, 19, 20, 21, 22 |
| §9 即時事件（Server → Client） | Task 4 |
| §9 即時事件（Client → Server subscribe/unsubscribe） | Task 2, 7 |
| §9 socket 只訂閱不變動 | Task 2（server.js 只接 subscribe/unsubscribe） |

**Placeholder scan** ── 無 TODO/TBD。

**Type consistency** ── `Tournament`/`Team`/`Group`/`Match`/`Court` 全部從 `@prisma/client` 匯入；`MatchFull` 在 admin section 4/5、viewer matches tab 一致；`GroupWithTeams` 在 viewer groups/admin section 3 一致；`Row` / `GroupBlock` 在 standings tab 內部一致。

**Section state-machine 一致** ── 每個 section 用 `tournament.status` 決定 enable/disable，跟 spec §5 狀態機（draft → grouping → in_progress → finished）對齊。

---

## Plan 2 完成定義

執行完 Task 23 即達 Plan 2 目標：

1. `docker compose up -d` 後可從 `http://<server-ip>` 完整跑友誼賽流程（建立 → 報名 → 分組 → 賽程 → 計分 → 排名）
2. Admin 改分數 → Viewer 不重整即看到（Socket.IO 即時推播）
3. 公開頁完全唯讀，未登入嘗試打 `/admin/*` 會被 middleware 導向登入頁
4. `npm test` 全綠（含 socket smoke test）
