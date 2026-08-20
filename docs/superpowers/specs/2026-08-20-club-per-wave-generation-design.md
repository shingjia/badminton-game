# 會內賽「分循環產生賽程」— 設計文件

日期：2026-08-20
狀態：已核准，待寫實作計畫

## 背景

會內賽（`Tournament.format = 'club'`）目前的「產生對戰＋分配場地」是一次點擊，把所有循環（例如 4 組 → 3 個循環：A vs B/C vs D、A vs C/B vs D、A vs D/B vs C）的比賽全部產生。

新需求：工作人員希望能在循環之間調整球員棒次（影響循環內部的搭檔輪替），所以賽程要能**一次只產生一個循環**，讓工作人員在循環之間調整棒次、用同樣的規則重新產生下一個循環的對戰跟場地。

同時，賽程相關畫面（賽程頁、計分頁、觀眾頁）目前把所有配對（A vs B、C vs D...）平鋪列出，看不出「循環」這一層的順序性，也需要補上「第 N 循環」的分組標題（純顯示，不做賽程鎖定）。

## 範圍界定

- 只有會內賽受影響；友誼賽的「產生對戰」完全不變（還是一次全產生）。
- 棒次調整**不需要新功能**——分組頁 `canEditNames = tournament.status !== 'finished'`，本來就沒鎖，任何時候（包含 `in_progress`）都能改。
- 只改「顯示方式」跟「分循環產生」，不做賽程限制（不會因為第 1 循環沒比完就擋第 2 循環的產生按鈕）。
- 已產生過的循環再按一次「產生對戰」→ 直接重新產生，舊比分一併清除，不加確認彈窗（跟現有行為一致）。

## 核心設計：組跟組怎麼配對不受棒次影響

`roundRobinPairs(groupIds)`（決定哪組在第幾循環打哪組）只跟組的 id/數量有關，跟棒次完全無關；棒次只影響**循環內部**的搭檔輪替（`rotationSchedule`）。

因此 **`lib/club-schedule.ts` 完全不用改**——`buildClubSchedule` 本來就是照循環分開算好的（每個 draft 都有 `roundNumber` 標記屬於第幾循環），要「只產生第 N 循環」只需要在呼叫端把結果篩出來：

```typescript
const allDrafts = buildClubSchedule(rosters); // 用當下（可能剛調整過棒次）的名單算
const waveDrafts = allDrafts.filter((d) => d.roundNumber === wave);
```

`buildClubSchedule` 內部還是會算出所有循環的排程再篩選——多算的部分（沒被選中的循環）在這個規模下運算量可忽略，用重新呼叫、篩選取代改動已經測試過的模組，是最小改動。

## 後端：`matches/generate/route.ts`

- 會內賽分支：`POST` body 需要帶 `{ wave: number }`。
- 驗證：`wave` 必須是 `1 ~ groups.length - 1` 範圍內的整數，否則回 `conflict('invalid_wave')`。
- 組數為偶數、場地數等於 `groups.length/2 + 1` 的既有驗證不變（跟循環無關，只跟組數/場地數有關）。
- 用目前的分組名單（`g.players` 依 seed 排序，可能是剛調整過的棒次）呼叫 `buildClubSchedule`，篩出 `roundNumber === wave` 的 drafts。
- 場地指派規則不變：`courtId = m.courtSlot === 'primary' ? courts[m.pairingIndexInWave].id : courts[primaryCourtsNeeded].id`。
- 交易內的刪除範圍改成**只刪這個循環**的資料，不影響其他循環（包含已計分的）：
  1. 查出這個 tournament、`roundNumber === wave` 的既有 Match，取出它們的 `pairAId`/`pairBId`。
  2. 刪除這些 Pair（`onDelete: Cascade` 會一併刪除引用它們的 Match）。
  3. 用 `waveDrafts` 建立新的 Pair/Match（邏輯跟現有的 club 分支一樣，只是資料來源從「全部循環」改成「這個循環」）。
- 友誼賽分支完全不動。

新增錯誤碼：`invalid_wave`。

## 前端：賽程頁 `src/components/admin/section-matches.tsx`

- 額外抓 `/api/tournaments/${id}/groups`，算出會內賽的總循環數（`groups.length - 1`）。
- 會內賽改成每個循環一個區塊：
  - 標題「第 N 循環」
  - 這個循環自己的「產生對戰＋分配場地」按鈕（尚未產生時顯示這個文字；這個循環已經有比賽時顯示「重新產生」）
  - 按鈕下方是這個循環已產生的對戰清單，沿用既有的 `pairingOf` 配對分組（A vs B、C vs D 各自一塊）
- 友誼賽維持原樣（單一按鈕、單一清單）。
- `ERR` map 加上：`invalid_wave: '循環編號不正確'`。

## 前端：計分頁 `section-scoring.tsx`、觀眾頁 `matches-tab.tsx`

延續先前已核准的「顯示分組」設計（純顯示，不做限制）：

- 只有「依分組」/「分組列表」視圖套用，「依場地」/「場地列表」視圖不變。
- 外層依 `m.roundNumber` 分組，標題「第 N 循環」；內層維持既有的 `pairingOf` 配對分組。
- 循環照 `roundNumber` 由小到大排；循環內配對照現有順序；配對內部輪次排序不變。
- 友誼賽完全不受影響（沒有這層外層分組）。
- 因為賽程現在是分循環產生，這層分組會自然對應實際狀態——還沒產生的循環，本來就不會有任何比賽資料出現。

## 已知的簡化

- `buildClubSchedule` 每次呼叫都重算全部循環、只挑一個循環使用，多算的部分在這個規模（幾組、幾十場）下運算量可忽略，不特別優化。
- 沒有新增資料庫層級的測試（這個專案本來就沒有 API route 的整合測試），維持現有慣例。
