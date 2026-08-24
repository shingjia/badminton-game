# 觀眾頁「顯示球員程度」開關 — 設計文件

日期：2026-08-24
狀態：已核准，待寫實作計畫

## 背景

觀眾頁的「報名」跟「分組」分頁目前都會顯示每位球員的程度（`Player.level`）。管理者希望能把這個資訊設成可選——加一個開關，關閉時觀眾頁看不到程度。

## 範圍

- 新增 `Tournament.showPlayerLevel`（布林，預設 `true`，維持現有行為不變——舊賽事、新建立的賽事預設都顯示程度）。
- 只影響**觀眾頁**（`players-tab.tsx` 報名、`groups-tab.tsx` 分組）。**後台管理畫面完全不受影響**——球員管理、分組與配對頁永遠顯示程度，因為分組作業本來就需要看程度。

## 後台

`section-settings.tsx`「賽事設定」頁新增一個開關（用原生 `<input type="checkbox">` + `<Label>`，這個專案目前沒有 Switch 元件，不特地加新的 UI 套件依賴），跟現有的「儲存設定」流程走同一條路——不用額外接線：`PATCH /api/tournaments/[id]` 已經會在成功後透過 socket 廣播 `tournament.updated`，觀眾頁（`viewer-client.tsx`）本來就在監聽這個事件並更新 `tournament` 狀態，開關存檔後觀眾頁會自動即時反映。

## 資料流

1. Prisma schema 加欄位 `showPlayerLevel Boolean @default(true)`，跑 migration。
2. `lib/schemas.ts` 的 `UpdateTournament` zod schema 加 `showPlayerLevel: z.boolean().optional()`。
3. `section-settings.tsx` 加 checkbox 狀態、存檔時一起送出。
4. `viewer-client.tsx` 把 `tournament.showPlayerLevel` 往下傳給 `PlayersTab`、`GroupsTab`。
5. 兩個 tab 元件依這個 prop 決定要不要 render 程度的 Badge/文字，其他都不變。

## 已知的簡化

- 不做「依組別/依球員個別」細粒度控制，就是整場賽事一個開關。
- `CreateTournament`（建立賽事）不用加這個欄位——Prisma `@default(true)` 已經處理新賽事的預設值，不用在建立流程另外處理。

## 測試

純顯示邏輯 + 一個新的 boolean 欄位，沒有需要覆蓋的演算法邏輯，跟這個專案其他 UI 開關一樣不新增自動化測試，靠人工驗證。
