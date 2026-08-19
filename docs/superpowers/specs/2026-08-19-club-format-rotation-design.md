# 會內賽輪轉搭檔賽制 — 設計文件

日期：2026-08-19
狀態：待使用者確認

## 背景 / 問題

現有賽事（本文稱「友誼賽」，`Tournament.format = 'friendly'`）流程是：分組 → 配對（固定搭檔）→ 產生循環賽賽程 → 計分。搭檔在整個循環賽期間固定不變。

會內賽（`format = 'club'`）要的是另一種賽制：組內球員兩兩循環換搭檔，而不是固定搭檔打完整個循環賽。

## 目標

- 新增 `club` 賽制，跟 `friendly` 並存，`friendly` 現有行為完全不變。
- 賽制在建立賽事時選一次，之後不可更改。
- 盡量重用現有的 Group / Pair / Match / 計分 / 場地分配基礎設施，不重建平行系統。

## 非目標

- 不做「留人賽制」（動態依輸贏排下一場）——賽程事先一次產生完整表，跟現有循環賽用法一致。
- 不支援 2 隊以外的分隊方式（3 隊以上互打規則未定義，不在本次範圍）。
- 不改變分組（Group）階段的介面或演算法——`club` 賽事跟 `friendly` 賽事共用同一套「依等級自動分組／各組等級均分」跟 `groupCount` 設定。

## 資料模型變更

`Tournament` 新增欄位：

```prisma
enum TournamentFormat {
  friendly
  club
}

model Tournament {
  ...
  format TournamentFormat @default(friendly)
}
```

- `CreateTournament` schema 新增 `format` 可選欄位（預設 `friendly`），建立賽事的對話框新增選項。
- `UpdateTournament` **不**開放修改 `format`——賽制定了就不能改，避免中途切換賽制留下不一致的 Pair/Match 資料。
- Group / Pair / Match 資料表**不需要 schema 變更**。每一場比賽的搭檔照樣存成一筆 Pair、掛在真正的 Group 底下（不需要隱形分組）；同一位球員在同一組會出現在好幾筆不同的 Pair 裡（各場搭檔不同），這是被允許的，Pair 本來就只代表「這一場的搭檔」。

## 流程差異

| 階段 | friendly | club |
|---|---|---|
| 分組 | 依等級自動分組／各組等級均分，`groupCount` 設定 | 完全相同，不分軸 |
| 配對（組卡片上的按鈕） | 隨機重抽／依棒次配對／依等級配對／鎖定配對 | 這些按鈕**隱藏**，沒有「先配好固定搭檔」這一步 |
| 產生賽程（賽程頁的「產生對戰＋分配場地」） | 抓每組已配好的固定 Pair 跑 `roundRobinPairs` | 新邏輯（見下） |
| 計分 | 不變 | 不變 |
| 排名 | 依 Pair 統計勝負（`pair_standings` view） | 新增依「個人」統計勝負（見下） |

## 演算法：組內切 A/B 兩隊

沿用「各組等級均分」的 round-robin-by-level 演算法（`generateMixed` 那套 cursor 分桶邏輯），但桶子數固定為 2，只作用在單一組內部（不是整場賽事）：

```
byLevel = 依 level 分桶（跟現有 byLevelBuckets 一樣）
buckets = [[], []]  // A隊、B隊
cursor = 0
for level in sorted(byLevel.keys()):
  for playerId in byLevel[level]:
    buckets[cursor % 2].push(playerId)
    cursor++
```

驗證：兩隊人數必須相等，且每隊至少 3 人（少於 3 人循環搭檔會退化成重複配對，見下）。不符合就丟出清楚的錯誤（例如 `unequal_sides` / `side_too_small`），不自動搬人湊數——跟之前「不自動修奇偶」的決定一致，讓管理員自己決定調組數還是調人數。

## 演算法：循環搭檔 + 賽程

每隊各自依棒次（`Player.seed`，null 排最後，跟現有 `seedPairs` 排序邏輯一致）排序，形成 n 個循環相鄰搭檔（n = 該隊人數）：

```
side = 依棒次排序後的 playerId 陣列，長度 n
partnership[i] = (side[i], side[(i + 1) % n])   // i = 0..n-1
```

A 隊、B 隊人數相等（都是 n），第 k 個搭檔對打：

```
match[k] = { pairA: partnershipA[k], pairB: partnershipB[k] }   // k = 0..n-1
```

共產生 n 場比賽。

**回合分配（給場地分配用）**：match k 用到 sideA[k]、sideA[k+1]、sideB[k]、sideB[k+1]，因此 match k 與 match k-1、k+1 有共用球員（不能同一回合），match k 與距離 ≥2 的其他 match 沒有共用球員（可以同一回合、不同場地同時打）。這是一個環狀衝突圖的著色問題：

- n 為偶數：`roundNumber = (k % 2) + 1`，兩個回合就夠（偶環可 2 著色）。
- n 為奇數：最後一場單獨分到第 3 回合，其餘照偶數規則交錯（奇環需要 3 著色）：
  ```
  roundNumber = k < n - 1 ? (k % 2) + 1 : 3
  ```

算完 roundNumber 直接丟給現有 `allocateCourts()`，不用改那支函式。

`matchOrder` 沿用現有慣例，依 k 遞增即可。

## 排名：個人統計（新邏輯）

`club` 賽事的比賽沒有固定隊伍身分，只能統計**個人**的勝負場次，跟現有 `pair_standings`（依 `pair_id` 分組）不是同一件事，需要新寫一份查詢：對每場已完賽的 Match，找出獲勝方跟落敗方各自的兩位球員（`pairA.player1Id`/`player2Id` 或 `pairB` 那組），依 `player_id` 累加 wins / losses / played / points_for / points_against，組內依同樣規則排名（wins DESC, losses ASC, points_for DESC, points_against ASC）。

顯示位置：viewer 端排名頁（`standings-tab.tsx`）依賽事 `format` 決定要顯示 Pair 排名還是個人排名。

## UI 改動範圍

1. `create-tournament-dialog.tsx`：新增賽制選擇（友誼賽／會內賽），預設友誼賽。
2. `section-groups.tsx`（admin）：`format === 'club'` 時隱藏配對三按鈕（隨機重抽／依棒次配對／依等級配對／鎖定配對），組卡片只顯示球員名單 + 棒次編輯。
3. `section-matches.tsx`（admin）：「產生對戰＋分配場地」按鈕文案不變，後端依 `tournament.format` 走不同的賽程產生邏輯。
4. `standings-tab.tsx`（viewer）／排名 API：依 `format` 切換 Pair 排名 / 個人排名。
5. `section-players.tsx`（admin）：棒次（seed）輸入已經在分組頁面有了（上一輪加的），會內賽一樣可以用，不用新增介面。
6. `groups-tab.tsx`（viewer）：`format === 'club'` 時不顯示組卡片裡的「配對」清單——那是把該組所有 Pair（每場比賽都會產生新的一次性 Pair）攤平列出來，會內賽會列出一長串、同一人重複出現在好幾個「配對」，看不出意義。友誼賽不受影響。
7. `matches-tab.tsx`（viewer）：`format === 'club'` 時檢視切換只留「分組列表」「場地列表」，隱藏「循環圖」。`MatchGraph` 元件假設少數幾支固定隊伍兩兩對戰一輪（把所有出現過的 Pair 當頂點、任兩頂點間都畫線），會內賽每場都是全新一次性搭檔、也不是兩兩對戰過一輪，套用這個元件頂點暴增、線幾乎都是沒排過的假 pending 線，圖會又亂又錯。不另外設計新圖表，先隱藏就好。

## 已知的簡化 / 之後可以再加

- 兩隊以外的分隊方式（3 隊以上）不支援，需要的話再設計「誰打誰」的規則。
- 會內賽沒有「循環圖」視覺化，之後真的需要再另外設計一個適合輪轉賽制的圖（例如以人為頂點、畫出每個人打過的場次連線）。
- 回合著色只保證「同回合不衝突」，沒有額外優化最少回合數以外的排場地策略（例如優先讓同一人的兩場比賽間隔久一點休息）——先求正確，體感不好再調。
- 個人排名的 SQL／查詢寫法：實作時再決定是走 Prisma 聚合還是 raw SQL view，這份文件只定義計算規則，不綁定實作手法。

## 測試

- `lib/pairing.ts` 或新檔案：單元測試涵蓋切兩隊（人數相等/不相等/太少人）、循環搭檔產生（偶數人／奇數人）、roundNumber 分配（偶環 2 色／奇環 3 色，驗證任兩場同回合不共用球員）。
- 個人排名計算：至少一個涵蓋「兩人各打兩場、一勝一負」這種基本案例的單元測試。
