# 會內賽場地數彈性支援 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 會內賽的場地數驗證，除了原本支援的「同時對戰數 + 1」，也接受「= 同時對戰數」（沒有多的共用場地）；場地數剛好等於同時對戰數時，每個配對的所有比賽都固定用自己的場地，不做負載平衡。

**Architecture:** 只改 `matches/generate/route.ts` 的場地數驗證跟 courtId 指派邏輯這兩處。`lib/club-schedule.ts` 的排程演算法完全不動——它本來就會標記每場比賽是 `'primary'` 還是 `'shared'`，沒有共用場地可用時，兩種標記在 courtId 指派階段都導向配對自己的主場地。

**Tech Stack:** Next.js (App Router) API routes、TypeScript。

**Design doc:** `docs/superpowers/specs/2026-08-24-club-court-count-flexibility-design.md`

---

## Task 1: 場地數驗證 + courtId 指派邏輯

**Files:**
- Modify: `src/app/api/tournaments/[id]/matches/generate/route.ts`

- [ ] **Step 1: 場地數驗證改成接受兩種場地數**

Find：

```typescript
    // Groups play each other directly (round-robin), not internally —
    // needs exactly groupCount/2 dedicated courts + 1 shared court.
    if (groups.length % 2 !== 0) return conflict('odd_group_count');
    const primaryCourtsNeeded = groups.length / 2;
    if (courts.length !== primaryCourtsNeeded + 1) return conflict('court_count_mismatch');
```

Replace：

```typescript
    // Groups play each other directly (round-robin), not internally —
    // needs exactly groupCount/2 dedicated courts, optionally +1 shared
    // court for load-balancing overflow. Without the shared court, every
    // one of a pairing's matches just stays on its own dedicated court —
    // see the courtId resolution below.
    if (groups.length % 2 !== 0) return conflict('odd_group_count');
    const primaryCourtsNeeded = groups.length / 2;
    const hasSharedCourt = courts.length === primaryCourtsNeeded + 1;
    if (courts.length !== primaryCourtsNeeded && !hasSharedCourt) return conflict('court_count_mismatch');
```

- [ ] **Step 2: courtId 指派邏輯依有沒有共用場地分流**

Find：

```typescript
      const schedule = buildClubSchedule(rosters).filter((m) => m.roundNumber === wave);
      clubDrafts = schedule.map((m) => ({
        ...m,
        tournamentId: params.id,
        courtId:
          m.courtSlot === 'primary'
            ? courts[m.pairingIndexInWave].id
            : courts[primaryCourtsNeeded].id,
      }));
```

Replace：

```typescript
      const schedule = buildClubSchedule(rosters).filter((m) => m.roundNumber === wave);
      clubDrafts = schedule.map((m) => ({
        ...m,
        tournamentId: params.id,
        // No shared court (courts.length === primaryCourtsNeeded): every
        // match — 'primary' or 'shared' alike — stays on its own
        // pairing's dedicated court, since there's no extra court to
        // offload the 'shared'-tagged overflow onto.
        courtId:
          hasSharedCourt && m.courtSlot === 'shared'
            ? courts[primaryCourtsNeeded].id
            : courts[m.pairingIndexInWave].id,
      }));
```

- [ ] **Step 3: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Lint**

Run: `cd "C:\Private\badminton-game" && npx eslint "src/app/api/tournaments/[id]/matches/generate/route.ts"`
Expected: only the pre-existing `catch (e: any)` findings, no new categories (verify via `git stash` if unsure).

- [ ] **Step 5: Run the full unit suite**

Run: `cd "C:\Private\badminton-game" && npx vitest run tests/unit`
Expected: all 44 tests pass (this task doesn't touch any unit-tested pure-logic module — `lib/club-schedule.ts` is untouched).

- [ ] **Step 6: Commit**

```bash
cd "C:\Private\badminton-game"
git add "src/app/api/tournaments/[id]/matches/generate/route.ts"
git commit -m "feat(matches): support groupCount/2 courts (no shared court) as well as groupCount/2+1"
```

---

## Task 2: Full verification, push, manual walkthrough handoff

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

1. 建一場 4 組會內賽，場地設 **2 個**：確認「產生對戰＋分配場地」不再報 `court_count_mismatch`，每個循環的兩個配對（例如 A vs B、C vs D）各自固定用一個場地，整個循環都不會換場地。
2. 同一場賽事把場地改成 **3 個**：確認原本「同時對戰數 + 1」的行為完全不變（跟先前驗證過的一樣，主場地 + 共用場地平衡負載）。
3. 場地設成 **1 個**或 **4 個**：確認還是報 `court_count_mismatch`（範圍界定只接受 2 或 3，不是任意數字）。

- [ ] **Step 4: If the walkthrough passes, this feature is done**

No further step — this is the final task in the plan.
