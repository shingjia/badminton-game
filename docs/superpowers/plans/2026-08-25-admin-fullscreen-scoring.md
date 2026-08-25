# 計分頁全螢幕計分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理者計分頁的每一列比賽加一顆「全螢幕計分」按鈕，全螢幕畫面左右分色顯示雙方隊名跟大比分，點半面螢幕任何地方 +1、透明按鈕可以精準 +1/−1。

**Architecture:** 新元件 `admin/fullscreen-score.tsx` 沿用觀眾頁 `viewer/fullscreen-match.tsx` 已經驗證過的 Fullscreen API 技術（iOS fallback、響應式版面、退出不閃爍），但加上互動能力——不重寫計分邏輯，`ScoreRow` 既有的 `bump(side, delta)` 直接當 `onBump` callback 傳進去。

**Tech Stack:** Next.js (App Router)、React client components、Tailwind CSS、瀏覽器原生 Fullscreen API。

**Design doc:** `docs/superpowers/specs/2026-08-25-admin-fullscreen-scoring-design.md`

---

## Task 1: 新增 `admin/fullscreen-score.tsx`

**Files:**
- Create: `src/components/admin/fullscreen-score.tsx`

- [ ] **Step 1: 建立元件**

Create `src/components/admin/fullscreen-score.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';

type Side = 'A' | 'B';

function ScoreSide({
  side,
  label,
  score,
  bg,
  onBump,
}: {
  side: Side;
  label: string;
  score: number;
  bg: string;
  onBump: (side: Side, delta: number) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onBump(side, 1)}
      className={`flex flex-1 cursor-pointer flex-col items-center justify-center gap-4 text-center ${bg}`}
    >
      <div className="text-2xl font-semibold sm:text-3xl">{label}</div>
      <div className="font-mono text-6xl font-bold tabular-nums sm:text-9xl">{score}</div>
      <div className="mt-4 flex items-center gap-6">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onBump(side, -1);
          }}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-white/40 bg-white/10 text-3xl hover:bg-white/20"
          aria-label={`${side} -1`}
        >
          −
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onBump(side, 1);
          }}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-white/40 bg-white/10 text-3xl hover:bg-white/20"
          aria-label={`${side} +1`}
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * 管理者計分頁的全螢幕計分——跟觀眾頁唯讀的 FullscreenMatchButton
 * （viewer/fullscreen-match.tsx）用同一套技術（原生 Fullscreen API、iOS
 * Safari/Chrome 不支援時的純 CSS 覆蓋層 fallback、窄螢幕響應式版面、
 * close() 依「是否真的進了瀏覽器全螢幕」分流避免退出時閃一下），但這個
 * 版本可以互動：點半面螢幕任何地方都會 +1，兩顆半透明按鈕可以精準
 * +1/−1（按鈕要 stopPropagation，不然會跟整面點擊疊加變成 +2）。
 * 計分邏輯不在這裡寫，呼叫端（ScoreRow）把自己的 bump 傳進來就好。
 */
export function FullscreenScoreButton({
  labelA,
  labelB,
  scoreA,
  scoreB,
  onBump,
}: {
  labelA: string;
  labelB: string;
  scoreA: number;
  scoreB: number;
  onBump: (side: Side, delta: number) => void;
}) {
  const [active, setActive] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const supportsFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;

  useEffect(() => {
    if (!supportsFullscreen) return;
    function onChange() {
      setActive(document.fullscreenElement === overlayRef.current);
    }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [supportsFullscreen]);

  function open() {
    if (!supportsFullscreen) {
      setActive(true);
      return;
    }
    overlayRef.current?.requestFullscreen().catch((e) => {
      console.warn('[fullscreen] requestFullscreen rejected, falling back to CSS overlay:', e);
      setActive(true);
    });
  }

  function close() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      setActive(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        title="全螢幕計分"
        aria-label="全螢幕計分"
        className="flex h-8 w-8 items-center justify-center rounded border text-sm hover:bg-muted"
      >
        ⛶
      </button>
      <div
        ref={overlayRef}
        className={`text-white ${active ? 'fixed inset-0 z-50 flex flex-col sm:flex-row' : 'hidden'}`}
      >
        <ScoreSide side="A" label={labelA} score={scoreA} bg="bg-blue-950" onBump={onBump} />
        <ScoreSide side="B" label={labelB} score={scoreB} bg="bg-rose-950" onBump={onBump} />
        <button
          type="button"
          onClick={close}
          style={{ bottom: 'max(2rem, env(safe-area-inset-bottom))' }}
          className="absolute left-1/2 -translate-x-1/2 rounded border border-white/30 bg-black/40 px-4 py-2 text-sm hover:bg-white/10"
        >
          離開全螢幕
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `cd "C:\Private\badminton-game" && npx eslint src/components/admin/fullscreen-score.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/components/admin/fullscreen-score.tsx
git commit -m "feat(admin): add interactive fullscreen scoring component"
```

---

## Task 2: 接進 `ScoreRow`

**Files:**
- Modify: `src/components/admin/section-scoring.tsx`

- [ ] **Step 1: import**

Find（檔案最上面的 import 區塊）：

```typescript
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { colorForIndex } from '@/lib/badge-colors';
```

Replace：

```typescript
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { colorForIndex } from '@/lib/badge-colors';
import { FullscreenScoreButton } from '@/components/admin/fullscreen-score';
```

- [ ] **Step 2: 徽章列加上全螢幕計分按鈕**

Find：

```tsx
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1">
          <PairingHeader matches={[match]} format={format} />
          <span className="text-muted-foreground">#{match.matchOrder}</span>
        </span>
        {match.court && <CourtBadge name={match.court.name} order={match.court.displayOrder ?? 1} />}
        {isCompleted ? (
          <Badge className="ml-auto bg-emerald-600 hover:bg-emerald-600">已完成</Badge>
        ) : isPlaying ? (
          <Badge className="ml-auto bg-amber-500 hover:bg-amber-500">比賽進行中</Badge>
        ) : (
          <Badge variant="secondary" className="ml-auto">未開賽</Badge>
        )}
      </div>
```

Replace：

```tsx
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
```

- [ ] **Step 3: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Lint**

Run: `cd "C:\Private\badminton-game" && npx eslint src/components/admin/section-scoring.tsx`
Expected: only the pre-existing findings unrelated to this change (verify via `git stash` if you see anything, don't assume).

- [ ] **Step 5: Run the full unit suite**

Run: `cd "C:\Private\badminton-game" && npx vitest run tests/unit`
Expected: all 44 tests pass.

- [ ] **Step 6: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/components/admin/section-scoring.tsx
git commit -m "feat(admin): wire fullscreen scoring into ScoreRow"
```

---

## Task 3: Full verification, push, manual walkthrough handoff

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite + typecheck one more time**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p . && npx vitest run tests/unit`
Expected: no type errors; all 44 tests pass.

- [ ] **Step 2: Push**

```bash
cd "C:\Private\badminton-game"
git push
```

- [ ] **Step 3: Manual walkthrough**

1. 計分頁任一場比賽點「⛶ 全螢幕計分」，確認進入左右分色的全螢幕畫面。
2. 點左半邊任何地方（不只是按鈕），確認左邊分數 +1。
3. 點透明的 + / − 按鈕，確認只有那個按鈕對應的動作發生（不會同時觸發整面 +1，變成 +2）。
4. 按「離開全螢幕」或 Esc，確認正常退出、回到列表；分數有正確存到後端（重新整理頁面分數還在）。
5. 手機瀏覽器（iPhone Safari/Chrome）測一次，確認退回純 CSS 覆蓋層也一樣能點按計分。

- [ ] **Step 4: If the walkthrough passes, this feature is done**

No further step — this is the final task in the plan.
