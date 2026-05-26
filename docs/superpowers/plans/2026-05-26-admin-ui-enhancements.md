# Admin UI Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加上三個 admin / UI 改善：在賽事列表卡片刪除賽事、批次 CSV 匯入球員、全域 sticky top bar 取代各頁重複的 header。

**Architecture:** 純前端改動 + 一個新 API endpoint。`DELETE /api/tournaments/[id]` 已存在 (`src/app/api/tournaments/[id]/route.ts:29-38`)，只需 UI 串接。Bulk import 新增 `POST /api/tournaments/[id]/players/bulk`，在一個 Prisma transaction 內全部寫入（all-or-nothing on server，client-side parse 失敗的行則顯示給使用者）。Top bar 是 server component，內含一個小 client 子元件 `<HeaderAction>` 用 `usePathname()` 切換右側按鈕。

**Tech Stack:** Next.js (App Router) + TypeScript + Prisma + Socket.IO + shadcn/ui (**pinned 2.10.0** — 絕對不要用 @latest) + Tailwind v3。

**Per project decision:** 不寫 vitest 測試。所有功能驗證在測試機部署後手動確認。

**Spec reference:** `docs/superpowers/specs/2026-05-26-admin-ui-enhancements.md`

---

## File Structure

```
src/
  lib/
    schemas.ts                                          (修改：加 BulkCreatePlayers)
  app/
    api/
      tournaments/[id]/players/bulk/route.ts            (新增)
    layout.tsx                                          (修改：掛 <SiteHeader>，調 body className)
    page.tsx                                            (修改：移除重複的 H1 + 主辦登入)
  components/
    ui/
      dropdown-menu.tsx                                 (新增：shadcn add)
      alert-dialog.tsx                                  (新增：shadcn add)
      textarea.tsx                                      (新增：shadcn add)
    site-header.tsx                                     (新增：server component, sticky)
    header-action.tsx                                   (新增：client，usePathname → 切換按鈕)
    admin/
      tournament-list-admin.tsx                         (修改：加 ⋯ menu + AlertDialog)
      bulk-import-dialog.tsx                            (新增：批次匯入 dialog)
      section-players.tsx                               (修改：加「批次匯入」按鈕)
```

---

## Task 1: 安裝缺少的 shadcn 元件

**Background:** 後續會用到 `dropdown-menu`、`alert-dialog`、`textarea`，但 `src/components/ui/` 目前都沒有。**CLI 必須鎖在 2.10.0**，`@latest` 會吐 Tailwind v4 + base-nova preset，跟現有 Tailwind v3 + Radix 衝。

**Files:**
- Create: `src/components/ui/dropdown-menu.tsx` (via CLI)
- Create: `src/components/ui/alert-dialog.tsx` (via CLI)
- Create: `src/components/ui/textarea.tsx` (via CLI)

- [ ] **Step 1: 安裝三個 shadcn 元件（PowerShell；CLI 鎖 2.10.0）**

```powershell
npx shadcn@2.10.0 add dropdown-menu alert-dialog textarea
```

如果 CLI 問要不要 overwrite 既有檔案，**全部選 No**（我們的 button/dialog 已存在且可能被改過）。新檔案會出現在 `src/components/ui/`。

預期 output 包含 `Created src/components/ui/dropdown-menu.tsx`、`Created src/components/ui/alert-dialog.tsx`、`Created src/components/ui/textarea.tsx`。

- [ ] **Step 2: 確認三個檔案存在 + Radix dependency 也跟著裝進 package.json**

```powershell
Get-ChildItem src\components\ui\dropdown-menu.tsx, src\components\ui\alert-dialog.tsx, src\components\ui\textarea.tsx
Select-String -Path package.json -Pattern "@radix-ui/react-(dropdown-menu|alert-dialog)"
```

預期：三個檔案都列出來，package.json 含 `@radix-ui/react-dropdown-menu` 與 `@radix-ui/react-alert-dialog`（`textarea` 不需要 Radix，因為它是純 input）。

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/dropdown-menu.tsx src/components/ui/alert-dialog.tsx src/components/ui/textarea.tsx package.json package-lock.json
git commit -m "feat(ui): add shadcn dropdown-menu, alert-dialog, textarea (pinned 2.10.0)"
```

---

## Task 2: 加 BulkCreatePlayers zod schema

**Files:**
- Modify: `src/lib/schemas.ts`

- [ ] **Step 1: 在 `src/lib/schemas.ts` 檔案最後（緊接在 `UpdateMatchScore` 之後）插入新 schema**

```typescript
export const BulkCreatePlayers = z.object({
  players: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(50),
        level: z.string().trim().min(1).max(10).optional().nullable(),
      }),
    )
    .min(1)
    .max(500),
});
```

放在檔案結尾即可（檔案最後一行是 `});` 結束 `UpdateMatchScore`，貼到那之後）。

- [ ] **Step 2: Commit**

```bash
git add src/lib/schemas.ts
git commit -m "feat(schemas): add BulkCreatePlayers zod schema (max 500 rows)"
```

---

## Task 3: 新增 Bulk Players API

**Files:**
- Create: `src/app/api/tournaments/[id]/players/bulk/route.ts`

- [ ] **Step 1: 建立 `src/app/api/tournaments/[id]/players/bulk/route.ts`**

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { BulkCreatePlayers } from '@/lib/schemas';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const parsed = await parseJson(req, BulkCreatePlayers);
  if (!parsed.ok) return parsed.res;

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');

  const rows = parsed.data.players.map((p) => ({
    tournamentId: params.id,
    name: p.name,
    level: p.level ?? null,
  }));

  // All-or-nothing transaction. We use createMany for speed, but createMany doesn't
  // return the rows. To emit per-row socket events we re-fetch the just-created rows
  // by tournamentId + name + level + a window on createdAt isn't available (no
  // createdAt column on Player) so we fall back to a loop of create() inside one
  // transaction. 500 rows max keeps this acceptable.
  const created = await prisma.$transaction(
    rows.map((r) =>
      prisma.player.create({ data: r }),
    ),
  );

  for (const player of created) {
    emitToTournament(params.id, 'player.added', { tournamentId: params.id, player });
  }

  return ok({ created: created.length, failed: [] }, 201);
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/api/tournaments/[id]/players/bulk/route.ts"
git commit -m "feat(api): add POST /tournaments/:id/players/bulk (transactional, emits player.added per row)"
```

---

## Task 4: 建立 BulkImportDialog 元件

**Files:**
- Create: `src/components/admin/bulk-import-dialog.tsx`

- [ ] **Step 1: 建立 `src/components/admin/bulk-import-dialog.tsx`**

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
type ParsedRow = { name: string; level: string | null };

function parseCsvText(text: string): { rows: ParsedRow[]; failures: ParseFailure[] } {
  const rows: ParsedRow[] = [];
  const failures: ParseFailure[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const trimmed = rawLine.trim();
    if (trimmed === '') return; // skip empty lines silently

    const firstComma = trimmed.indexOf(',');
    let name: string;
    let level: string | null;
    if (firstComma === -1) {
      name = trimmed;
      level = null;
    } else {
      name = trimmed.slice(0, firstComma).trim();
      const after = trimmed.slice(firstComma + 1).trim();
      level = after === '' ? null : after;
    }

    if (name === '') {
      failures.push({ line: lineNo, raw: rawLine, reason: 'name 空白' });
      return;
    }
    if (name.length > 50) {
      failures.push({ line: lineNo, raw: rawLine, reason: 'name 超過 50 字' });
      return;
    }
    if (level !== null && level.length > 10) {
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
            一行一個球員，格式：姓名,等級（等級可留空）
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={10}
          className="font-mono text-sm"
          placeholder={'張三,A\n李四,B\n王五,'}
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
git commit -m "feat(ui): BulkImportDialog with client-side CSV parsing + per-row error feedback"
```

---

## Task 5: 在 SectionPlayers 加「批次匯入」按鈕

**Files:**
- Modify: `src/components/admin/section-players.tsx`

- [ ] **Step 1: 在 import 區加 BulkImportDialog**

找到（檔案頭幾行）：
```typescript
import type { Player, Tournament } from '@prisma/client';
```

在它**之上**插入：
```typescript
import { BulkImportDialog } from '@/components/admin/bulk-import-dialog';
```

- [ ] **Step 2: 在 `<div className="flex items-end">` 那塊外側、`{!locked && (...)}` 區塊內加入批次匯入按鈕**

找到：
```tsx
{!locked && (
  <div className="mb-4 grid gap-3 md:grid-cols-4">
    <div className="space-y-1">
      <Label htmlFor="p-name">姓名</Label>
```

改成（在 grid 上方加一行 flex 容器放批次匯入按鈕）：
```tsx
{!locked && (
  <div className="mb-4 space-y-3">
    <div className="flex justify-end">
      <BulkImportDialog tournamentId={tournament.id} />
    </div>
    <div className="grid gap-3 md:grid-cols-4">
      <div className="space-y-1">
        <Label htmlFor="p-name">姓名</Label>
```

然後找到 `!locked` 區塊的對應結尾 `)}`，確保把新加的 `space-y-3` div 包好。原本是：
```tsx
            <Button onClick={add} disabled={!name.trim()} className="w-full">
              新增
            </Button>
          </div>
        </div>
      )}
```

改成：
```tsx
            <Button onClick={add} disabled={!name.trim()} className="w-full">
              新增
            </Button>
          </div>
        </div>
      </div>
    )}
```

注意：多包了一層 `</div>` 對應新加的 `space-y-3` 容器。

- [ ] **Step 3: 用 grep 確認沒有 JSX 結構壞掉（每個 `<div>` 都有 `</div>`）**

```powershell
Select-String -Path "src\components\admin\section-players.tsx" -Pattern "<div|</div>" | Measure-Object
```

預期 count 為偶數（開合配對）。

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/section-players.tsx
git commit -m "feat(ui): add bulk import button to SectionPlayers"
```

---

## Task 6: tournament-list-admin 加 ⋯ menu + AlertDialog

**Files:**
- Modify: `src/components/admin/tournament-list-admin.tsx`

- [ ] **Step 1: 整檔以下列內容取代**

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { Tournament } from '@prisma/client';

export function TournamentListAdmin({ tournaments }: { tournaments: Tournament[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pendingDelete, setPendingDelete] = useState<Tournament | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api(`/api/tournaments/${pendingDelete.id}`, { method: 'DELETE' });
      toast({ title: '已刪除', description: pendingDelete.name });
      setPendingDelete(null);
      router.refresh();
    } catch (e) {
      const reason = e instanceof ApiError ? e.body?.error ?? e.message : '未知錯誤';
      toast({ title: '刪除失敗', description: reason, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }

  if (tournaments.length === 0) {
    return <p className="text-muted-foreground">尚無賽事，請按右上「新增賽事」</p>;
  }

  return (
    <>
      <div className="grid gap-3">
        {tournaments.map((t) => (
          <Card key={t.id} className="relative transition hover:bg-accent/40">
            <Link href={`/admin/t/${t.id}`} className="block">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3 pr-12">
                <CardTitle className="text-base">{t.name}</CardTitle>
                <StatusBadge status={t.status} />
              </CardHeader>
              <CardContent className="py-2 text-sm text-muted-foreground">
                {t.groupCount} 組 · {new Date(t.createdAt).toLocaleString('zh-TW')}
              </CardContent>
            </Link>
            <div className="absolute right-3 top-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="更多操作"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                    }}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={(e) => {
                      e.preventDefault();
                      setPendingDelete(t);
                    }}
                  >
                    刪除賽事
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>
        ))}
      </div>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除「{pendingDelete?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作會同時刪除該賽事下所有球員、分組、配對、比賽紀錄，且無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? '刪除中…' : '刪除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: 確認 `lucide-react` 已在 package.json**

```powershell
Select-String -Path package.json -Pattern "lucide-react"
```

預期有匹配（shadcn 應該已經把它裝進去了）。如果沒有：

```powershell
npm install lucide-react
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/tournament-list-admin.tsx package.json package-lock.json
git commit -m "feat(ui): admin tournament list — ⋯ menu with delete action + confirm dialog"
```

---

## Task 7: 建立 SiteHeader + HeaderAction

**Files:**
- Create: `src/components/site-header.tsx`
- Create: `src/components/header-action.tsx`

- [ ] **Step 1: 建立 `src/components/header-action.tsx`（client component）**

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';

export function HeaderAction() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === '/admin/login') {
    return null;
  }

  if (pathname.startsWith('/admin')) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={async () => {
          await api('/api/admin/logout', { method: 'POST' });
          router.push('/');
          router.refresh();
        }}
      >
        登出
      </Button>
    );
  }

  // '/', '/t/:id', or anything else: show admin login link
  return (
    <Link href="/admin">
      <Button variant="outline" size="sm">
        主辦登入
      </Button>
    </Link>
  );
}
```

- [ ] **Step 2: 建立 `src/components/site-header.tsx`（server component）**

```tsx
import Link from 'next/link';
import { HeaderAction } from '@/components/header-action';

export function SiteHeader() {
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

- [ ] **Step 3: Commit**

```bash
git add src/components/site-header.tsx src/components/header-action.tsx
git commit -m "feat(ui): add SiteHeader (server) + HeaderAction (client, route-aware button)"
```

---

## Task 8: layout.tsx 掛上 SiteHeader

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: 整檔以下列內容取代**

```tsx
import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/toaster";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "羽球友誼賽",
  description: "Badminton friendly tournament",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col bg-background text-foreground antialiased`}
      >
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(ui): mount SiteHeader globally; switch body to flex column"
```

---

## Task 9: 移除首頁重複的 H1 + 主辦登入

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: 整檔以下列內容取代**

```tsx
import { prisma } from '@/lib/prisma';
import { TournamentList } from '@/components/home/tournament-list';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const tournaments = await prisma.tournament.findMany({ orderBy: { createdAt: 'desc' } });
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h2 className="mb-6 text-2xl font-semibold">賽事列表</h2>
      <TournamentList tournaments={tournaments} />
    </div>
  );
}
```

說明：拿掉了原本的 🏸 H1 + 主辦登入按鈕（移到 SiteHeader），保留一個比較小的「賽事列表」副標。最外層從 `<main>` 改成 `<div>`，因為 `<main>` 現在已經在 `layout.tsx` 裡。

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "refactor(home): drop duplicate header (now in SiteHeader); add section heading"
```

---

## Task 10: Build smoke 確認

**Files:** none

- [ ] **Step 1: 跑 next build 確認整份能 compile**

```powershell
npm run build
```

預期：build 成功，無 TypeScript / Next 錯誤。Build 完整可能要 1-2 分鐘。

如果 build 失敗，看錯誤訊息回頭修對應的 task；最常見的會是：
- shadcn 元件 import path 不對
- `lucide-react` 沒裝
- JSX 結構錯（多/少 `</div>`）

- [ ] **Step 2: 把 build artifact 不要 commit**

```powershell
git status --short
```

預期：working tree clean（沒有 src/ 或 docs/ 的改動）。`.next/` 在 `.gitignore` 內不應出現。

如果 step 1 build OK 就完成，不用 commit。

---

## Self-Review

**1. Spec coverage**
- Feature 1 (delete tournament)：Task 6 ✓
- Feature 2 (CSV bulk import)：Task 2 (schema) + Task 3 (API) + Task 4 (dialog) + Task 5 (button hookup) ✓
- Feature 3 (top bar)：Task 7 (SiteHeader + HeaderAction) + Task 8 (layout) + Task 9 (page cleanup) ✓
- shadcn 元件預備：Task 1 ✓
- Build smoke：Task 10 ✓

**2. Placeholder scan**
- 沒有 TBD / TODO / "similar to" 等佔位字
- 每個程式碼步驟都有完整可貼的程式碼

**3. Type consistency**
- `BulkCreatePlayers` 在 Task 2 定義，Task 3 import 使用 — 一致
- `BulkImportDialog` 在 Task 4 export，Task 5 import 使用 — 一致
- `SiteHeader` (Task 7) → 在 Task 8 import 使用 — 一致
- `HeaderAction` (Task 7) → SiteHeader 內 import 使用 — 一致
- Schema 用 `level: z.string().optional().nullable()`；前端 parser 用 `level: string | null`；API 寫入 `level: p.level ?? null` — 一致

**4. Project memory adherence**
- shadcn CLI 鎖 2.10.0 (Task 1) ✓
- 不用 docker exec 操作 DB（本 plan 不操作 DB）✓
- Prisma 欄位 camelCase + raw SQL 雙引號（本 plan 沒有 raw SQL）✓
- 不寫測試（per project decision）✓
