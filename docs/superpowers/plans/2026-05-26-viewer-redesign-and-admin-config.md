# Viewer Redesign + Admin Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 五件事打包：等級必填、CSV 接受空格分隔、觀眾頁深色 banner + 黃色 ribbon 卡片重設計、per-tournament banner icon + 配色設定、管理者密碼 DB 化可重設。

**Architecture:** 一份 schema migration（兩個 Tournament 欄位 + AdminConfig 表）。Banner 是新 client component 讀 `tournament.bannerIcon/bannerColor`。SiteHeader 加 pathname gate 在 /t/* 隱身。密碼用 node `scrypt` hash，env `ADMIN_PASSWORD` 變成「首次部署的種子」，DB 有 row 之後就由 DB 為準。

**Tech Stack:** Next.js (App Router) + TypeScript + Prisma + scrypt（內建）+ shadcn (pinned 2.10.0) + Tailwind v3。

**Per project decision:** 不寫 vitest 測試。所有功能驗證在測試機部署後手動確認。

**Spec reference:** `docs/superpowers/specs/2026-05-26-viewer-redesign-and-admin-config.md`

---

## File Structure

```
prisma/
  schema.prisma                                     (修改：+bannerIcon/bannerColor on Tournament, +AdminConfig)
  migrations/<ts>_viewer_redesign_admin_config/migration.sql  (新增：offline-generated)
src/
  lib/
    schemas.ts                                      (修改：level required, BannerColor enum, UpdateTournament +banner*, +ChangePassword)
    auth.ts                                         (修改：+hashPassword/verifyPassword scrypt)
  app/
    api/
      admin/
        login/route.ts                              (修改：DB check + env bootstrap)
        password/route.ts                           (新增)
    admin/
      page.tsx                                      (修改：掛 PasswordChangeCard)
    t/[id]/
      page.tsx                                      (修改：傳 tournament + cream bg)
      viewer-client.tsx                             (重寫：4 tabs + TournamentBanner)
  components/
    site-header.tsx                                 (改寫：client gate)
    site-header-inner.tsx                           (新增：原本 server 內容搬來)
    admin/
      bulk-import-dialog.tsx                        (修改：parser, level required)
      section-players.tsx                           (修改：level required UI)
      section-settings.tsx                          (修改：+icon/color UI)
      password-change-card.tsx                      (新增)
    viewer/
      tournament-banner.tsx                         (新增)
      groups-tab.tsx                                (重寫：ribbon + inline pairs)
      pairs-tab.tsx                                 (刪除)
```

---

## Task 1: Schema 加 bannerIcon, bannerColor, AdminConfig + offline migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260526150000_viewer_redesign_admin_config/migration.sql`

- [ ] **Step 1: 修改 `prisma/schema.prisma`**

在 `model Tournament { ... }` 區塊內，找到：
```prisma
  pointsPerGame Int              @default(21)
```
緊接在它之後（與其他 scalar 欄位放一起）插入：
```prisma
  bannerIcon    String           @default("🏸")
  bannerColor   String           @default("red")
```

在檔案最後（最後一個 `}` 之後）新增整個 `AdminConfig` model：
```prisma
model AdminConfig {
  id           Int      @id @default(0)
  passwordHash String
  updatedAt    DateTime @updatedAt
}
```

- [ ] **Step 2: 用 git 把舊 schema 暫存到 /tmp，跑 prisma migrate diff offline**

```bash
git show HEAD:prisma/schema.prisma > /tmp/old-schema-2.prisma
npx prisma migrate diff --from-schema-datamodel /tmp/old-schema-2.prisma --to-schema-datamodel prisma/schema.prisma --script
```

預期 output 含：
- `ALTER TABLE "Tournament" ADD COLUMN "bannerIcon" TEXT NOT NULL DEFAULT '🏸';`
- `ALTER TABLE "Tournament" ADD COLUMN "bannerColor" TEXT NOT NULL DEFAULT 'red';`
- `CREATE TABLE "AdminConfig" (...)`

- [ ] **Step 3: 把 step 2 的 output 完整寫入 migration.sql**

建立 `prisma/migrations/20260526150000_viewer_redesign_admin_config/migration.sql`，內容是 step 2 output 的所有 SQL 行（排除 update notice 等噪音）。預期內容類似：

```sql
-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "bannerIcon" TEXT NOT NULL DEFAULT '🏸',
ADD COLUMN     "bannerColor" TEXT NOT NULL DEFAULT 'red';

-- CreateTable
CREATE TABLE "AdminConfig" (
    "id" INTEGER NOT NULL DEFAULT 0,
    "passwordHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminConfig_pkey" PRIMARY KEY ("id")
);
```

如果 prisma 產出的具體欄位順序或語法略有不同，**以 prisma 實際 output 為準**。

- [ ] **Step 4: 跑 prisma generate**

```powershell
npx prisma generate
```

預期：`Generated Prisma Client`。

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add Tournament.bannerIcon/Color and AdminConfig model"
```

---

## Task 2: zod schemas 更新

**Files:**
- Modify: `src/lib/schemas.ts`

- [ ] **Step 1: 整檔以下列內容取代 `src/lib/schemas.ts`**

```typescript
import { z } from 'zod';

export const TournamentStatusEnum = z.enum(['draft', 'grouping', 'in_progress', 'finished']);

export const BannerColor = z.enum(['red', 'blue', 'green', 'purple', 'orange', 'slate']);

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
  bannerIcon: z.string().trim().min(1).max(4).optional(),
  bannerColor: BannerColor.optional(),
});

export const CreatePlayer = z.object({
  name: z.string().trim().min(1).max(50),
  level: z.string().trim().min(1).max(10),
});

export const UpdatePlayer = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  level: z.string().trim().min(1).max(10).optional(),
  groupId: z.string().nullable().optional(),
});

// Used in POST /api/tournaments/:id/groups/generate
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

export const BulkCreatePlayers = z.object({
  players: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(50),
        level: z.string().trim().min(1).max(10),
      }),
    )
    .min(1)
    .max(500),
});

export const ChangePassword = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6).max(100),
});
```

說明：
- `CreatePlayer.level` 不再 optional
- `BulkCreatePlayers.players[].level` 不再 optional + 不再 nullable
- 加 `BannerColor`、`UpdateTournament` 加 banner 欄位
- 加 `ChangePassword` 給密碼變更 API

- [ ] **Step 2: Commit**

```bash
git add src/lib/schemas.ts
git commit -m "feat(schemas): level required; add BannerColor, UpdateTournament banner fields, ChangePassword"
```

---

## Task 3: auth.ts 加 scrypt hash/verify

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: 整檔以下列內容取代 `src/lib/auth.ts`**

```typescript
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

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

/**
 * scrypt-based password hashing. Format: "scrypt$N$r$p$saltHex$hashHex"
 */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, 64);
  return `scrypt$16384$8$1$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const saltHex = parts[4];
  const hashHex = parts[5];
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  let actual: Buffer;
  try {
    actual = scryptSync(plain, salt, expected.length);
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat(auth): add scrypt hashPassword + verifyPassword helpers"
```

---

## Task 4: Login route 改 DB 驗 + env bootstrap

**Files:**
- Modify: `src/app/api/admin/login/route.ts`

- [ ] **Step 1: 整檔以下列內容取代**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  COOKIE_NAME,
  DEFAULT_MAX_AGE,
  hashPassword,
  passwordMatches,
  signSession,
  verifyPassword,
} from '@/lib/auth';

const Body = z.object({ password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });
  }

  const config = await prisma.adminConfig.findUnique({ where: { id: 0 } });

  let ok = false;
  if (config) {
    // DB has hash — verify against hash
    ok = verifyPassword(parsed.data.password, config.passwordHash);
  } else {
    // First boot — accept env password and seed the DB row
    const envPw = process.env.ADMIN_PASSWORD;
    if (!envPw) {
      return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });
    }
    ok = passwordMatches(parsed.data.password, envPw);
    if (ok) {
      await prisma.adminConfig.create({
        data: { id: 0, passwordHash: hashPassword(parsed.data.password) },
      });
    }
  }

  if (!ok) {
    await new Promise((r) => setTimeout(r, 1000));
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

- [ ] **Step 2: Commit**

```bash
git add src/app/api/admin/login/route.ts
git commit -m "feat(auth): login reads AdminConfig hash; env ADMIN_PASSWORD seeds first boot"
```

---

## Task 5: Change-password API

**Files:**
- Create: `src/app/api/admin/password/route.ts`

- [ ] **Step 1: 建立檔案**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { ChangePassword } from '@/lib/schemas';
import { hashPassword, verifyPassword } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const parsed = await parseJson(req, ChangePassword);
  if (!parsed.ok) return parsed.res;

  const config = await prisma.adminConfig.findUnique({ where: { id: 0 } });
  if (!config) {
    return NextResponse.json({ error: 'not_bootstrapped' }, { status: 500 });
  }

  if (!verifyPassword(parsed.data.oldPassword, config.passwordHash)) {
    await new Promise((r) => setTimeout(r, 1000));
    return conflict('invalid_old_password');
  }

  await prisma.adminConfig.update({
    where: { id: 0 },
    data: { passwordHash: hashPassword(parsed.data.newPassword) },
  });

  return ok({ updated: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/api/admin/password/route.ts"
git commit -m "feat(api): add POST /api/admin/password (requires session + old password)"
```

---

## Task 6: PasswordChangeCard 元件

**Files:**
- Create: `src/components/admin/password-change-card.tsx`

- [ ] **Step 1: 建立檔案**

```tsx
'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

export function PasswordChangeCard() {
  const { toast } = useToast();
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    oldPw.length > 0 &&
    newPw.length >= 6 &&
    newPw === confirmPw &&
    !submitting;

  async function submit() {
    setSubmitting(true);
    try {
      await api('/api/admin/password', {
        method: 'POST',
        body: { oldPassword: oldPw, newPassword: newPw },
      });
      toast({ title: '密碼已更新' });
      setOldPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (e) {
      const reason = e instanceof ApiError ? e.body?.error ?? e.message : '未知錯誤';
      toast({ title: '更新失敗', description: reason, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-base font-semibold">管理者密碼</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="pw-old">舊密碼</Label>
          <Input
            id="pw-old"
            type="password"
            value={oldPw}
            onChange={(e) => setOldPw(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pw-new">新密碼（至少 6 字）</Label>
          <Input
            id="pw-new"
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pw-confirm">確認新密碼</Label>
          <Input
            id="pw-confirm"
            type="password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            autoComplete="new-password"
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button onClick={submit} disabled={!canSubmit} size="sm">
          {submitting ? '更新中…' : '更新密碼'}
        </Button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/password-change-card.tsx
git commit -m "feat(ui): add PasswordChangeCard with old/new/confirm inputs"
```

---

## Task 7: Admin 首頁掛 PasswordChangeCard

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: 先讀檔確認結構**

```powershell
Get-Content src\app\admin\page.tsx
```

- [ ] **Step 2: 在現有的 page component 內，於 `TournamentListAdmin` 上方插入 `<PasswordChangeCard />`，並加 import**

頂端 import 區（在 `'use client'` 之後或其他 import 旁邊）加：
```typescript
import { PasswordChangeCard } from '@/components/admin/password-change-card';
```

return 內，找到包含 `<TournamentListAdmin ... />` 的那個 wrapper（通常是個 `<main>` 或 `<div>`），在它**之前**插入：
```tsx
<div className="mb-6">
  <PasswordChangeCard />
</div>
```

如果 admin/page.tsx 是 server component 而 PasswordChangeCard 是 client，Next.js 允許 server 直接 import client component，OK 不用改 `'use client'`。

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat(ui): mount PasswordChangeCard above tournament list on /admin"
```

---

## Task 8: SectionSettings 加 bannerIcon / bannerColor UI

**Files:**
- Modify: `src/components/admin/section-settings.tsx`

- [ ] **Step 1: 先讀檔確認結構（要在現有 grid 內插入）**

```powershell
Get-Content src\components\admin\section-settings.tsx
```

- [ ] **Step 2: 整檔以下列內容取代**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { Court, Tournament } from '@prisma/client';

const BANNER_COLORS = [
  { key: 'red', cls: 'bg-red-700' },
  { key: 'blue', cls: 'bg-blue-700' },
  { key: 'green', cls: 'bg-emerald-700' },
  { key: 'purple', cls: 'bg-purple-700' },
  { key: 'orange', cls: 'bg-orange-600' },
  { key: 'slate', cls: 'bg-slate-700' },
] as const;

export function SectionSettings({ tournament }: { tournament: Tournament }) {
  const { toast } = useToast();
  const [name, setName] = useState(tournament.name);
  const [groupCount, setGroupCount] = useState(tournament.groupCount);
  const [pointsPerGame, setPointsPerGame] = useState(tournament.pointsPerGame);
  const [bannerIcon, setBannerIcon] = useState(tournament.bannerIcon);
  const [bannerColor, setBannerColor] = useState(tournament.bannerColor);
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
        body: { name, groupCount, pointsPerGame, bannerIcon, bannerColor },
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

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="s-icon">主視覺 icon（emoji）</Label>
            <Input
              id="s-icon"
              value={bannerIcon}
              onChange={(e) => setBannerIcon(e.target.value)}
              maxLength={4}
              placeholder="🏸"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>主視覺底色</Label>
            <div className="flex flex-wrap gap-2">
              {BANNER_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setBannerColor(c.key)}
                  className={`h-8 w-8 rounded-full ${c.cls} transition ${
                    bannerColor === c.key ? 'ring-2 ring-offset-2 ring-amber-500' : ''
                  }`}
                  aria-label={c.key}
                />
              ))}
            </div>
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

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/section-settings.tsx
git commit -m "feat(ui): SectionSettings adds bannerIcon input + 6-color swatch picker"
```

---

## Task 9: BulkImportDialog parser 改

**Files:**
- Modify: `src/components/admin/bulk-import-dialog.tsx`

- [ ] **Step 1: 整檔以下列內容取代**

```tsx
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

type ParseFailure = { line: number; raw: string; reason: string };
type ParsedRow = { name: string; level: string };

function parseCsvText(text: string): { rows: ParsedRow[]; failures: ParseFailure[] } {
  const rows: ParsedRow[] = [];
  const failures: ParseFailure[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const trimmed = rawLine.trim();
    if (trimmed === '') return;

    const sepIdx = trimmed.search(/[,，\s]/);
    if (sepIdx === -1) {
      failures.push({ line: lineNo, raw: rawLine, reason: '缺等級' });
      return;
    }
    const name = trimmed.slice(0, sepIdx).trim();
    const level = trimmed.slice(sepIdx + 1).trim();

    if (name === '') {
      failures.push({ line: lineNo, raw: rawLine, reason: 'name 空白' });
      return;
    }
    if (level === '') {
      failures.push({ line: lineNo, raw: rawLine, reason: '缺等級' });
      return;
    }
    if (name.length > 50) {
      failures.push({ line: lineNo, raw: rawLine, reason: 'name 超過 50 字' });
      return;
    }
    if (level.length > 10) {
      failures.push({ line: lineNo, raw: rawLine, reason: 'level 超過 10 字' });
      return;
    }

    rows.push({ name, level });
  });

  return { rows, failures };
}

export function BulkImportDialog({ tournamentId }: { tournamentId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [parseFailures, setParseFailures] = useState<ParseFailure[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleImport() {
    const { rows, failures } = parseCsvText(text);
    setParseFailures(failures);

    if (rows.length === 0) {
      toast({
        title: '沒有可匯入的資料',
        description: failures.length > 0 ? `${failures.length} 行格式錯誤` : '請先貼上球員名單',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await api<{ created: number; failed: ParseFailure[] }>(
        `/api/tournaments/${tournamentId}/players/bulk`,
        { method: 'POST', body: { players: rows } },
      );
      const total = res.created;
      const failedCount = failures.length;
      toast({
        title: `已匯入 ${total} 人`,
        description: failedCount > 0 ? `另有 ${failedCount} 行格式錯誤未匯入` : undefined,
      });
      if (failedCount === 0) {
        setText('');
        setOpen(false);
      }
    } catch (e) {
      const reason = e instanceof ApiError ? e.body?.error ?? e.message : '未知錯誤';
      toast({ title: '匯入失敗', description: reason, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">批次匯入</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>批次匯入球員</DialogTitle>
          <DialogDescription>
            一行一個球員，姓名 + 等級之間用逗號或空格分隔
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={10}
          className="font-mono text-sm"
          placeholder={'小熊 9\n山哥 9\n小傑,7'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {parseFailures.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
            <div className="mb-1 font-semibold">失敗的行 ({parseFailures.length})</div>
            <ul className="space-y-0.5">
              {parseFailures.map((f) => (
                <li key={f.line}>
                  第 {f.line} 行: <span className="text-muted-foreground">{f.raw || '(空)'}</span> — {f.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleImport} disabled={submitting || text.trim() === ''}>
            {submitting ? '匯入中…' : '匯入'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/bulk-import-dialog.tsx
git commit -m "feat(ui): BulkImportDialog parser accepts comma/fullwidth-comma/whitespace; level required"
```

---

## Task 10: SectionPlayers 等級必填

**Files:**
- Modify: `src/components/admin/section-players.tsx`

- [ ] **Step 1: 修改「等級」Label 與「新增」按鈕的 disabled 條件**

找到：
```tsx
<Label htmlFor="p-level">等級</Label>
```
改成：
```tsx
<Label htmlFor="p-level">等級 *</Label>
```

找到：
```tsx
<Button onClick={add} disabled={!name.trim()} className="w-full">
  新增
</Button>
```
改成：
```tsx
<Button onClick={add} disabled={!name.trim() || !level.trim()} className="w-full">
  新增
</Button>
```

找到 `async function add()` 內：
```tsx
body: { name: name.trim(), level: level.trim() || undefined },
```
改成：
```tsx
body: { name: name.trim(), level: level.trim() },
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/section-players.tsx
git commit -m "feat(ui): SectionPlayers level required (label *, button gated, no undefined level)"
```

---

## Task 11: SiteHeader 加 pathname gate

**Files:**
- Create: `src/components/site-header-inner.tsx`
- Modify: `src/components/site-header.tsx`

- [ ] **Step 1: 建立 `src/components/site-header-inner.tsx`，內容是原本 SiteHeader 的 server JSX**

```tsx
import Link from 'next/link';
import { HeaderAction } from '@/components/header-action';

export function SiteHeaderInner() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="container mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            🏸
          </span>
          <span className="text-lg font-semibold tracking-tight">羽球友誼賽</span>
        </Link>
        <HeaderAction />
      </div>
    </header>
  );
}
```

- [ ] **Step 2: 整檔以下列內容取代 `src/components/site-header.tsx`**

```tsx
'use client';

import { usePathname } from 'next/navigation';
import { SiteHeaderInner } from '@/components/site-header-inner';

export function SiteHeader() {
  const pathname = usePathname();
  if (pathname.startsWith('/t/')) return null;
  return <SiteHeaderInner />;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/site-header.tsx src/components/site-header-inner.tsx
git commit -m "feat(ui): SiteHeader gates on pathname — hidden on /t/* (viewer has its own banner)"
```

---

## Task 12: TournamentBanner 元件

**Files:**
- Create: `src/components/viewer/tournament-banner.tsx`

- [ ] **Step 1: 建立檔案**

```tsx
import type { Tournament } from '@prisma/client';

const COLOR_BG: Record<string, string> = {
  red: 'bg-red-700',
  blue: 'bg-blue-700',
  green: 'bg-emerald-700',
  purple: 'bg-purple-700',
  orange: 'bg-orange-600',
  slate: 'bg-slate-700',
};

const ICON_RING: Record<string, string> = {
  red: 'bg-amber-400 text-red-900',
  blue: 'bg-amber-400 text-blue-900',
  green: 'bg-amber-400 text-emerald-900',
  purple: 'bg-amber-400 text-purple-900',
  orange: 'bg-amber-400 text-orange-900',
  slate: 'bg-amber-400 text-slate-900',
};

const SUBTITLE_COLOR: Record<string, string> = {
  red: 'text-amber-200',
  blue: 'text-amber-200',
  green: 'text-amber-200',
  purple: 'text-amber-200',
  orange: 'text-amber-100',
  slate: 'text-amber-200',
};

export function TournamentBanner({ tournament }: { tournament: Tournament }) {
  const bg = COLOR_BG[tournament.bannerColor] ?? COLOR_BG.red;
  const ring = ICON_RING[tournament.bannerColor] ?? ICON_RING.red;
  const sub = SUBTITLE_COLOR[tournament.bannerColor] ?? SUBTITLE_COLOR.red;
  return (
    <header className={`sticky top-0 z-40 ${bg} text-white shadow`}>
      <div className="container mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-3xl ${ring}`}>
          {tournament.bannerIcon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold tracking-wider text-amber-300">
            FRIENDLY MATCH ★ 友誼賽
          </div>
          <div className="truncate text-xl font-bold leading-tight">{tournament.name}</div>
          <div className={`text-xs ${sub}`}>雙打分組循環賽</div>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/viewer/tournament-banner.tsx
git commit -m "feat(ui): TournamentBanner with per-tournament icon + color"
```

---

## Task 13: GroupsTab 重寫（ribbon + inline pairs）

**Files:**
- Modify: `src/components/viewer/groups-tab.tsx`

- [ ] **Step 1: 整檔以下列內容取代**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import type { Group, Player, Pair } from '@prisma/client';

type GroupWithData = Group & { players: Player[]; pairs: Pair[] };

export function GroupsTab({ tournamentId, revision }: { tournamentId: string; revision: number }) {
  const [groups, setGroups] = useState<GroupWithData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<GroupWithData[]>(`/api/tournaments/${tournamentId}/groups`)
      .then(setGroups)
      .finally(() => setLoading(false));
  }, [tournamentId, revision]);

  if (loading && groups.length === 0) return <p className="py-6 text-muted-foreground">載入中…</p>;
  if (groups.length === 0) return <p className="py-6 text-muted-foreground">尚未分組</p>;

  return (
    <div className="grid gap-4 py-4 md:grid-cols-2 lg:grid-cols-3">
      {groups
        .slice()
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((g) => {
          const sortedPairs = g.pairs
            .slice()
            .sort((a, b) => a.displayOrder - b.displayOrder);
          return (
            <Card key={g.id} className="overflow-hidden">
              <div className="bg-amber-400 px-3 py-1.5 text-sm font-bold text-amber-950">
                分組 {g.displayOrder}
              </div>
              <div className="space-y-3 p-3">
                <div className="text-sm">
                  <span className="font-medium text-muted-foreground">成員：</span>
                  {g.players.map((p, i) => (
                    <span key={p.id}>
                      {i > 0 && '、'}
                      {p.name}
                      {p.level && (
                        <span className="text-muted-foreground">({p.level})</span>
                      )}
                    </span>
                  ))}
                </div>
                {sortedPairs.length > 0 && (
                  <div className="space-y-1 border-t pt-2">
                    {sortedPairs.map((pair, i) => {
                      const p1 = g.players.find((x) => x.id === pair.player1Id);
                      const p2 = g.players.find((x) => x.id === pair.player2Id);
                      return (
                        <div
                          key={pair.id}
                          className="rounded bg-amber-50 px-2 py-1 text-sm"
                        >
                          <span className="font-medium text-amber-900">配對 {i + 1}：</span>
                          {p1?.name ?? '?'} & {p2?.name ?? '?'}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/viewer/groups-tab.tsx
git commit -m "feat(ui): GroupsTab — yellow ribbon header, members with level, inline pairs"
```

---

## Task 14: 刪除 pairs-tab.tsx

**Files:**
- Delete: `src/components/viewer/pairs-tab.tsx`

- [ ] **Step 1: 刪除檔案**

```bash
rm "src/components/viewer/pairs-tab.tsx"
```

- [ ] **Step 2: Commit（會在下一個 task 一起 commit，因為 viewer-client.tsx 還引用著）**

跳過獨立 commit，併入 Task 15。

---

## Task 15: ViewerClient 重寫（4 tabs + banner）

**Files:**
- Modify: `src/app/t/[id]/viewer-client.tsx`

- [ ] **Step 1: 整檔以下列內容取代**

```tsx
'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useTournamentSocket } from '@/lib/use-socket';
import { TournamentBanner } from '@/components/viewer/tournament-banner';
import { PlayersTab } from '@/components/viewer/players-tab';
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
  const [tournament, setTournament] = useState(initialTournament);
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
    'tournament.updated': (payload: { tournament: Tournament }) => {
      setTournament(payload.tournament);
      bump();
    },
    'match.scored': bump,
  });

  return (
    <>
      <TournamentBanner tournament={tournament} />
      <div className="container mx-auto max-w-5xl px-4 py-6">
        <Tabs defaultValue="players">
          <TabsList>
            <TabsTrigger value="players">報名</TabsTrigger>
            <TabsTrigger value="groups">分組</TabsTrigger>
            <TabsTrigger value="matches">賽程計分</TabsTrigger>
            <TabsTrigger value="standings">排名</TabsTrigger>
          </TabsList>
          <TabsContent value="players">
            <PlayersTab tournamentId={tournamentId} revision={revision} />
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
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit（含 Task 14 的 pairs-tab.tsx 刪除）**

```bash
git add -A "src/app/t/[id]/viewer-client.tsx" "src/components/viewer/pairs-tab.tsx"
git commit -m "feat(ui): viewer uses TournamentBanner + 4 tabs; remove standalone PairsTab"
```

---

## Task 16: Viewer page 加米黃底色

**Files:**
- Modify: `src/app/t/[id]/page.tsx`

- [ ] **Step 1: 先讀檔確認當前結構**

```powershell
Get-Content "src\app\t\[id]\page.tsx"
```

- [ ] **Step 2: 把 page component return 的最外層 wrapper className 加上 `bg-amber-50/40 min-h-screen`**

如果現有最外層是 `<main>` 或 `<div>`，找它的 `className` 屬性，加上 `bg-amber-50/40` 與 `min-h-screen`（如果還沒有的話）。

例如，若現有是：
```tsx
<main className="container mx-auto ...">
```
改成：
```tsx
<main className="min-h-screen bg-amber-50/40">
```
然後把原本 `container mx-auto` 那層 padding 邏輯移到 ViewerClient 內部（Task 15 已經做了 `container mx-auto max-w-5xl px-4 py-6` 包覆）。

如果 page.tsx 把 tournament 透過 `<ViewerClient initialTournament={...} tournamentId={...} />` 傳入，確認 `initialTournament` 是完整的 Tournament（含 bannerIcon/bannerColor 兩個新欄位）。Prisma 回傳的 Tournament 預設包含所有 scalar 欄位，所以這應該已經 OK。

- [ ] **Step 3: Commit**

```bash
git add "src/app/t/[id]/page.tsx"
git commit -m "feat(ui): viewer page background cream (bg-amber-50/40); banner already sticky"
```

---

## Task 17: TypeScript smoke check

**Files:** none

- [ ] **Step 1: 跑 tsc**

```powershell
npx tsc --noEmit
```

預期：無錯誤，exit 0。

如果有錯誤，常見類別：
- `tournament.bannerIcon` 不存在 → 確認 Task 1 的 `prisma generate` 跑過
- `'red' | 'blue' | ...` 型別不符 → 檢查 schemas.ts 的 BannerColor enum 與 component 內的 mapping
- pairs-tab import 還在 → 確認 Task 15 刪了所有引用

- [ ] **Step 2: 若 pass，無需 commit；若有錯，修對應 task 並重 commit**

---

## Self-Review

**1. Spec coverage**
- Level required: Task 2 (schema) + Task 10 (UI) + Task 9 (CSV) ✓
- CSV separator: Task 9 ✓
- Viewer redesign: Task 11 (header gate) + Task 12 (banner) + Task 13 (groups card) + Task 15 (client) + Task 16 (page bg) ✓
- Banner customization: Task 1 (schema) + Task 2 (zod) + Task 8 (UI) + Task 12 (banner reads it) ✓
- Password reset: Task 1 (schema) + Task 2 (zod) + Task 3 (auth helpers) + Task 4 (login) + Task 5 (API) + Task 6 (UI card) + Task 7 (mount) ✓

**2. Placeholder scan**
- 無 TBD / TODO / similar to N
- Task 7 step 2 用文字敘述插入位置而非完整貼整檔，理由是 admin/page.tsx 內容變動範圍小，且結構未知。實作者要先讀檔再插入。

**3. Type consistency**
- `BannerColor` enum keys (red/blue/green/purple/orange/slate) 在 schemas.ts (Task 2)、section-settings.tsx (Task 8)、tournament-banner.tsx (Task 12) 三處一致 ✓
- `hashPassword/verifyPassword` 在 Task 3 export，Task 4 + Task 5 使用 ✓
- `ChangePassword` zod 在 Task 2，Task 5 使用 ✓
- `BulkCreatePlayers.players[].level` 從 optional+nullable 改 required；對應 client `ParsedRow.level` 在 Task 9 改 `string`（非 nullable）✓

**4. Project memory adherence**
- shadcn CLI 2.10.0：本 plan 不裝新 shadcn 元件，已有的 dropdown-menu/alert-dialog/textarea 直接用 ✓
- DB 在 WSL 不是 docker exec：Task 1 用 prisma migrate diff offline，不操作 DB ✓
- Prisma camelCase + raw SQL 雙引號：本 plan 沒有 raw SQL ✓
- 不寫測試：所有 Task 沒有 test step ✓

**5. Deployment 影響**
- 新 migration 是 additive：兩個 column 有 default、新 table 是 empty——對既有資料安全。
- 首次部署：login route 在無 AdminConfig row 時自動拿 env `ADMIN_PASSWORD` 種子並寫入 hash，使用者無感。
- 後續部署：登入用 DB hash，env 不再被檢查（除非 DB row 被刪）。
