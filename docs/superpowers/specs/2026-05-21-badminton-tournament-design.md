# 羽球友誼賽網頁系統設計規格

- **日期**：2026-05-21
- **作者**：vincent.shih
- **狀態**：草稿，待 writing-plans 階段轉為實作計劃

---

## 1. 目標與範圍

打造一個多人即時協作的羽球友誼賽管理網頁，由主辦操作報名、分組、賽程分配與計分，觀眾透過公開唯讀頁即時查看分組、賽程、排名。本系統不處理時間排程、不處理現場裁判即時計分，只記錄終局比數。

### 功能範圍

- 動態新增 / 刪除報名隊伍（雙打，兩人一隊）
- 主辦指定每組隊伍數，依種子等級蛇形分組，可手動微調並鎖定
- 自動產生循環賽對戰表，依「同 matchOrder 跨組輪替」分配場地
- 終局比數輸入，自動計算組內排名
- 公開觀眾頁即時更新

### 非目標（明確排除）

- 時間排程（哪場幾點打）
- 現場裁判即時計分介面（每球 +1/-1）
- 三局兩勝制（一律 21 分制一局決勝）
- 淘汰賽 / 瑞士制
- 帳號註冊系統（只有「主辦密碼」一種驗證）
- 列印 / CSV 匯出（觀眾頁顯示即可）
- TLS（初版直接 HTTP + IP，憑證之後再加）
- QR code 邀請

---

## 2. 賽事規則摘要

| 項目 | 規則 |
|---|---|
| 賽制 | 純雙打、組內單循環 Round Robin |
| 報名單位 | 兩人一隊（含種子等級 1-5） |
| 計分制 | 21 分制一局決勝（需淨勝 2 分，最高 30 分） |
| 計分輸入 | 主辦填終局兩隊比數，不記錄逐分過程 |
| 組內排名規則 | 1. 勝場數 → 2. 總得分差 → 3. 總得分 |
| 分組依據 | 種子等級蛇形分配 |
| 分組生命週期 | 一次性產生 → 鎖定 → 之後僅能手動微調個別隊伍 |
| 場地分配 | 同 matchOrder 跨組輪替（不排時間） |

---

## 3. 技術 Stack

- **前端**：Next.js 14+（App Router）+ TypeScript + Tailwind CSS + shadcn/ui
- **後端**：Next.js Route Handlers（API Routes）+ Prisma ORM
- **資料庫**：PostgreSQL 16
- **即時通訊**：Socket.IO 4.x（與 Next.js 共用 custom server）
- **表單驗證**：zod
- **驗證機制**：自寫 signed cookie session（不使用 NextAuth.js）
- **反向代理**：Nginx（負責 / 與 /socket.io/ 轉發、之後可掛 TLS）
- **部署**：docker compose，三個服務 nginx / app / db

---

## 4. 系統架構

```
                  ┌────────── Browser ──────────┐
                  │  HTTP + WebSocket (port 80) │
                  └──────────────┬──────────────┘
                                 ↓
                  ┌─────────────────────────────┐
                  │  nginx  (port 80)           │
                  │  - 靜態檔轉發               │
                  │  - WebSocket Upgrade        │
                  │  - / → app, /socket.io → app│
                  └──────────────┬──────────────┘
                                 ↓
                  ┌─────────────────────────────┐
                  │  app  (Next.js + Socket.IO) │
                  │  - SSR / API Routes         │
                  │  - 同一 server 跑 ws        │
                  │  Port 3000  (內網 only)     │
                  └──────────────┬──────────────┘
                                 ↓
                  ┌─────────────────────────────┐
                  │  db  (postgres:16-alpine)   │
                  │  Port 5432  (內網 only)     │
                  │  Volume: pgdata             │
                  └─────────────────────────────┘
```

### 環境變數

```
DATABASE_URL=postgresql://app:app@db:5432/badminton
ADMIN_PASSWORD=<主辦密碼，建議 >=16 字元>
SESSION_SECRET=<cookie 簽章 secret，>=32 字元隨機>
PORT=3000
```

### Nginx 關鍵設定（節錄）

```nginx
location / {
    proxy_pass http://app:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
location /socket.io/ {
    proxy_pass http://app:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400s;
}
```

---

## 5. 資料模型

### Tournament

```ts
{
  id: cuid,
  name: string,
  status: 'draft' | 'grouping' | 'in_progress' | 'finished',
  teamsPerGroup: int,         // 主辦指定，例 4
  pointsPerGame: int,         // 預設 21
  createdAt: datetime,
  finishedAt: datetime | null
}
```

### Team

```ts
{
  id: cuid,
  tournamentId: fk,
  name: string,
  player1Name: string,
  player2Name: string,
  seedLevel: 1 | 2 | 3 | 4 | 5,
  groupId: fk | null          // 未分組時 null
}
```

選手姓名直接欄位、不另開 Player 表，因為友誼賽不需要選手歷史。

### Group

```ts
{
  id: cuid,
  tournamentId: fk,
  name: string,               // 'A', 'B', 'C'
  displayOrder: int
}
```

### Court

```ts
{
  id: cuid,
  tournamentId: fk,
  name: string,               // '場地 1'
  displayOrder: int
}
```

### Match

```ts
{
  id: cuid,
  tournamentId: fk,
  groupId: fk,
  courtId: fk | null,         // 分配場地是獨立步驟
  teamAId: fk,
  teamBId: fk,
  scoreA: int,                // 預設 0
  scoreB: int,                // 預設 0
  status: 'pending' | 'completed',
  roundNumber: int,           // circle method 的輪次 1..K-1（同一輪內多場可並行）
  matchOrder: int,            // 組內顯示順序，唯一連號 1..C(K,2)
  finishedAt: datetime | null
}
```

### 排名 View

```sql
CREATE VIEW team_standings AS
SELECT
  t.id                        AS team_id,
  t.group_id,
  t.tournament_id,
  COUNT(*) FILTER (
    WHERE (m.team_a_id = t.id AND m.score_a > m.score_b)
       OR (m.team_b_id = t.id AND m.score_b > m.score_a)
  )                           AS wins,
  COUNT(*) FILTER (WHERE m.status = 'completed') AS played,
  COALESCE(SUM(
    CASE WHEN m.team_a_id = t.id THEN m.score_a - m.score_b
         WHEN m.team_b_id = t.id THEN m.score_b - m.score_a
         ELSE 0 END
  ), 0)                       AS point_diff,
  COALESCE(SUM(
    CASE WHEN m.team_a_id = t.id THEN m.score_a
         WHEN m.team_b_id = t.id THEN m.score_b
         ELSE 0 END
  ), 0)                       AS points_for
FROM teams t
LEFT JOIN matches m
  ON (m.team_a_id = t.id OR m.team_b_id = t.id)
 AND m.status = 'completed'
GROUP BY t.id, t.group_id, t.tournament_id;
```

排名 query：

```sql
SELECT *, RANK() OVER (
  PARTITION BY group_id
  ORDER BY wins DESC, point_diff DESC, points_for DESC
) AS rank
FROM team_standings
WHERE tournament_id = $1
ORDER BY group_id, rank;
```

排名永遠由 view derive，不存 cache、不維護 denormalized 欄位，避免不同步。

---

## 6. 核心演算法

### 6.1 蛇形分組

輸入：N 支隊伍、每組 K 隊、種子等級。

```
1. 依 seedLevel 由高到低排序，同等級內隨機洗牌
2. 計算組數 G = ceil(N / K)
3. 依排序索引 i 蛇形分配：
     row = floor(i / G)
     col = (row 為偶數) ? (i % G) : (G - 1 - (i % G))
     分到第 col 組
```

範例：12 隊、每組 4 隊 → G=3。第 1 輪 A,B,C；第 2 輪 C,B,A；第 3 輪 A,B,C；第 4 輪 C,B,A。確保強隊均勻分布到各組。

### 6.2 對戰表產生

組內每兩隊一場，K 隊就是 `C(K,2)` 場。用 **circle method** 產生：

- K 為偶數：固定一隊，其他繞圈，共 K-1 輪、每輪 K/2 場
- K 為奇數：補一個 dummy bye，輸出時略過 bye 場

每場填入 `roundNumber`（circle method 的輪次，1..K-1）與 `matchOrder`（組內唯一顯示連號）。`roundNumber` 用於場地分配（同輪次跨組會搶場地），`matchOrder` 用於前端列表顯示。

### 6.3 場地分配

輸入：所有「待打」場次（跨組） + M 個場地。

策略：以「roundNumber 相同的場次」為一個並行批次。每批次內把所有場次（跨組）依序丟給場地 1, 2, ... M。若該批次場次數 > M，超出部分推到下一個 slot 接續。

效果：同組隊伍不會連著上場、場地利用率均衡。

### 6.4 排名（已於 5. 資料模型描述）

---

## 7. 頁面結構

### 公開路由（觀眾，不需 auth）

| 路徑 | 內容 |
|---|---|
| `/` | 首頁，列出所有 tournament 與狀態 |
| `/t/[id]` | 觀眾頁，tab 分頁：報名隊伍 / 分組 / 賽程 / 即時排名 |
| `/admin/login` | 主辦登入頁（密碼） |

### 管理路由（需密碼 cookie）

| 路徑 | 內容 |
|---|---|
| `/admin` | 管理首頁，列出 tournament + 新增 |
| `/admin/t/[id]` | 主辦工作台，單頁五區 |

### 主辦工作台五區

1. **賽事設定** ── 名稱、每組幾隊、場地清單
2. **隊伍報名** ── 新增 / 刪除 / 編輯、設種子等級
3. **分組** ── 按按鈕產生（蛇形）、拖曳微調、鎖定
4. **賽程** ── 產生對戰、分配場地
5. **計分** ── 列出所有場次填終局比數、即時排名預覽

裝置策略：桌機優先，RWD 相容；不為手機優化任何特殊互動。

---

## 8. REST API

### 公開讀取（無需 auth）

```
GET  /api/tournaments                      列出所有 tournament
GET  /api/tournaments/[id]                 單一 tournament 摘要
GET  /api/tournaments/[id]/teams           該賽事所有隊伍
GET  /api/tournaments/[id]/groups          該賽事所有組
GET  /api/tournaments/[id]/matches         該賽事所有場次
GET  /api/tournaments/[id]/standings       排名（由 view 算）
```

### 主辦操作（需 admin cookie，401 if missing）

```
POST   /api/tournaments                            建立新 tournament
PATCH  /api/tournaments/[id]                       改名 / 設定 / 狀態
DELETE /api/tournaments/[id]                       刪除整個賽事

POST   /api/tournaments/[id]/teams                 新增隊伍
PATCH  /api/teams/[id]                             編輯隊伍（含 seedLevel）
DELETE /api/teams/[id]                             刪除隊伍

POST   /api/tournaments/[id]/courts                新增場地
DELETE /api/courts/[id]                            刪除場地

POST   /api/tournaments/[id]/groups/generate       產生分組（蛇形）
PATCH  /api/teams/[id]/move-group                  手動微調
POST   /api/tournaments/[id]/groups/lock           鎖定分組 → in_progress

POST   /api/tournaments/[id]/matches/generate      產生對戰 + 分配場地
PATCH  /api/matches/[id]/score                     填終局比數
```

### 驗證

```
POST   /api/admin/login                  body: { password }, set cookie
POST   /api/admin/logout                 clear cookie
```

所有 mutation 用 zod 在 route handler 入口驗 body / params。

---

## 9. 即時事件（Socket.IO）

頻道：`tournament:{id}`。

### Server → Client

| 事件 | Payload |
|---|---|
| `team.added` | `{ team }` |
| `team.updated` | `{ team }` |
| `team.deleted` | `{ teamId }` |
| `groups.generated` | `{ groups, teams }` |
| `groups.locked` | `{ tournamentId }` |
| `match.generated` | `{ matches }` |
| `match.scored` | `{ match, standings }` |
| `tournament.updated` | `{ tournament }` |

`match.scored` 同時帶該組最新 standings，避免客戶端再 query。

### Client → Server

| 事件 | Payload |
|---|---|
| `subscribe` | `{ tournamentId }` |
| `unsubscribe` | `{ tournamentId }` |

Socket 層**僅負責訂閱與廣播**，不接受任何資料變動指令。所有變動都走 HTTP API（攜帶 admin cookie）。事件由 mutation API 在 Prisma transaction commit 後 emit。

---

## 10. 驗證與安全

### 主辦驗證流程

```
1. 環境變數 ADMIN_PASSWORD（部署時設定）
2. /admin/login POST { password }
   - timingSafeEqual 比對（防 timing attack）
   - 對 → set signed cookie：admin=<signed token>, HttpOnly, SameSite=Lax, Max-Age=8h
   - 錯 → 401 + 1 秒 delay（簡單防爆破）
3. /admin/* 路由 + 所有 mutation API → middleware 驗 cookie
   - 簽章用 SESSION_SECRET
   - cookie 內容僅 issuedAt，server 不存 session
4. /admin/logout → clear cookie
```

初版無 `Secure` flag（HTTP only），未來加 TLS 時補上。

### 其他

| 項目 | 處理 |
|---|---|
| CSRF | SameSite=Lax cookie + same-origin fetch → 不另加 CSRF token |
| SQL Injection | Prisma 全參數化 |
| XSS | React 預設 escape，不用 `dangerouslySetInnerHTML` |
| 環境變數 | `.env` 不進 git，提供 `.env.example` |
| 密碼強度 | 文件建議主辦密碼 >= 16 字元 |
| Rate limiting | 初版不加（友誼賽情境用不到） |

---

## 11. 部署

### docker-compose.yml 結構（概念）

```yaml
services:
  nginx:
    image: nginx:1.27-alpine
    ports: ["80:80"]
    depends_on: [app]
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro

  app:
    build: .
    environment:
      - DATABASE_URL=postgresql://app:app@db:5432/badminton
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
      - SESSION_SECRET=${SESSION_SECRET}
    depends_on: [db]
    expose: ["3000"]

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=app
      - POSTGRES_PASSWORD=app
      - POSTGRES_DB=badminton
    volumes:
      - pgdata:/var/lib/postgresql/data
    expose: ["5432"]

volumes:
  pgdata:
```

`app` 使用 Next.js standalone build，Dockerfile 多階段建置（builder → runner）以縮小 image。`db` 與 `app` 只在 docker network 內可達，不暴露對外 port。

### 初始化流程

1. 設定 `.env`（ADMIN_PASSWORD / SESSION_SECRET）
2. `docker compose up -d`
3. `docker compose exec app npx prisma migrate deploy`
4. 開瀏覽器 `http://<server-ip>`，到 `/admin/login` 用密碼進入後台

---

## 12. 待辦與未來擴充

以下明確不在初版範圍，列出方便日後規劃：

- TLS（Let's Encrypt + nginx-certbot）
- 多裁判帳號 + 場次指派權限
- 即時計分介面（逐球記分）
- CSV / PDF 匯出
- QR code 觀眾邀請
- 賽事 `archived` 狀態
- 三局兩勝制 / 其他計分制
- 淘汰賽 / 瑞士制

---

## 13. 開放問題

設計完成、無未決議題。
