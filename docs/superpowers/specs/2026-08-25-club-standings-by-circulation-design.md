# 會內賽排名表改用「循環比總分」計勝 — 設計文件

日期：2026-08-25
狀態：已核准，待寫實作計畫

## 背景

會內賽（club format）目前的排名表（`lib/player-standings.ts` 的 `computeGroupStandings`）把「每一場個人賽的勝負」直接加總成組的勝場——例如一個循環裡 A 組 vs B 組打 3 場個人賽，A 組贏 2 場，現在的算法會讓 A 組的「勝」欄位 +2。

但實際賽制不是這樣算的：一個循環裡，A 組 vs B 組是「隊跟隊比總分」，把雙方在這個循環裡所有個人賽的分數加總比較，總分高的那一隊只算 **1 勝**（不是贏的場數）。例如 1 組 6 人（3 對雙打），每局 11 分，若某隊在這個循環的所有比賽總分先達到 66 分（= 6 人 × 11 分）即可提早確定拿下這個循環的勝——但無論如何提早確定，實際判定仍是「這個循環全部比賽打完後，總分較高的一方得 1 勝」。

## 設計

### 資料結構：循環 = `roundNumber`

`lib/club-schedule.ts` 產生賽程時，每個循環（wave）用 `roundNumber` 標示，同一循環裡每組固定跟另一組配對打好幾場個人賽（`rotationSchedule` 產生的多場比賽）。已確認：同一個 `(roundNumber, groupAId, groupBId)` 組合下的所有 `Match`，`pairA` 永遠屬於 `groupAId`、`pairB` 永遠屬於 `groupBId`（`matches/generate/route.ts` 建立 `Pair` 時固定寫死），所以可以直接用 `(roundNumber, pairA.groupId, pairB.groupId)` 當分桶的 key，不用另外正規化順序。

### 新的組排名演算法（取代 `computeGroupStandings` 現有邏輯）

1. 把該賽事所有 `Match` 依 `(roundNumber, groupAId, groupBId)` 分桶——一桶代表「某循環、某兩組的對戰」。
2. 一桶裡的比賽**全部 `status === 'completed'`** 時才判定這個循環的勝負：把桶內所有比賽的 `scoreA` 加總（= groupA 這個循環的總分）、`scoreB` 加總（= groupB 這個循環的總分），總分較高的那組這個循環 +1 勝、另一組 +1 負。桶內只要有任何一場還沒打完，這個循環暫不計入勝負（不做「進行中即時領先」顯示——使用者已確認）。
   - 已確認賽制不會出現總分平手的情況，不用處理平手分支。
3. 「場次」（`played`）改成「已分出勝負的循環數」＝ 該組的 `wins + losses`（不再是個人賽場次）。
4. 「總得分」/「總失分」（`points_for` / `points_against`）：直接加總每一場**已完成**個人賽的實際比分，一場比賽只算一次（不像現在的算法透過「每個球員各自加一次」再加總、導致一場比賽的分數被重複計入兩次）。這個累計不等待循環分出勝負——已完成的個人賽分數就直接累加，讓總得失分能即時反映目前進度，只有「勝/負/場次」欄位需要等循環全部打完才更新。
5. 排名排序：勝場數 desc → 總得分 desc → 總失分 asc（沿用現有排名表已經在用的失分方向：越少越好）。用跟現有程式碼一致的 SQL `RANK()`語意（同名次的下一名要跳號）。

### 移除 `computePlayerStandings`

檢查過現有程式碼：`computePlayerStandings`（球員個人戰績）目前只是內部用來組出 `computeGroupStandings` 的中間步驟，畫面上（`standings-tab.tsx`）從來沒有單獨顯示過「個人戰績」表，會內賽排名頁只顯示組別排名一張表。這次重寫組排名邏輯後，`computePlayerStandings` 會變成沒有任何呼叫端的死程式碼，直接移除（`lib/player-standings.ts` 只保留新的組排名函式與其型別）。

### API 路由與型別

`src/app/api/tournaments/[id]/standings/route.ts` 目前呼叫 `computeGroupStandings(results)` 並把回傳欄位映射成 `{ group_id, wins, losses, played, point_diff, points_for, points_against, rank }` 回給前端——這個對外的 API 形狀（欄位名稱、型別）維持不變，只有內部演算法替換，`standings-tab.tsx`（viewer 端顯示的表格）完全不用改。

`MatchResult` 型別（目前用 `pairAGroupId`/`pairBGroupId`/`status`/`scoreA`/`scoreB`/`pairAPlayerIds`/`pairBPlayerIds`）需要多帶一個 `roundNumber` 欄位，讓新演算法能依循環分桶；`pairAPlayerIds`/`pairBPlayerIds` 這兩個欄位在新演算法裡不再需要（新演算法不看個別球員），但為了不動到呼叫端組資料的既有程式碼結構、降低變動範圍，先保留在型別裡（未使用的欄位，之後如果要精簡型別可以再拔掉）。

## 範圍

- 只改會內賽（club format）的組排名計算，友誼賽（friendly format）走完全不同的 SQL 路徑（`getStandings`/`pair_standings`），不受影響。
- 只改排名表的計算邏輯，不改任何比賽產生、計分、賽程顯示的程式碼。
- 不新增「循環進行中即時領先」之類的顯示（使用者已確認不需要）。

## 測試

`tests/unit/player-standings.test.ts` 現有測試是針對舊的「個人賽勝負直接加總」邏輯寫的，會被新邏輯取代——改寫測試涵蓋：
- 一個循環全部完成、總分較高的一組拿到該循環的 1 勝、較低的一組 1 負。
- 一個循環還有比賽未完成時，不計入任何一組的勝負，但已完成的個人賽分數仍計入總得分/總失分。
- 多循環累計後的排序（勝場 desc → 總得分 desc → 總失分 asc），含同勝場數需要比總得分/總失分的情境。
- 一場比賽的分數只計入總得分/總失分一次（不因為雙打兩位球員而重複計算）——驗證修正了原本的重複計分問題。
