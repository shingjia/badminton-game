#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# build-qnap-bundle.sh
#   Build app image + 把 app/nginx/postgres 三顆 image 打成單一 tar，
#   供 QNAP Container Station 透過 SSH `docker load` 匯入。
#
# 使用方式（在專案根目錄執行）：
#   ./scripts/build-qnap-bundle.sh
#
# 產出：
#   dist/badminton-game-bundle.tar
#
# 部署到 QNAP：
#   1. scp dist/badminton-game-bundle.tar admin@<qnap>:/share/Container/
#   2. ssh admin@<qnap>
#   3. docker load -i /share/Container/badminton-game-bundle.tar
#   4. 在 Container Station 用 docker-compose.yml 建立 application
# ──────────────────────────────────────────────────────────────
set -euo pipefail

# ─── 設定 ─────────────────────────────────────────────────────
APP_IMAGE="badminton-game-app:latest"
NGINX_IMAGE="badminton-game-nginx:latest"
POSTGRES_IMAGE="postgres:16-alpine"
OUT_DIR="dist"
OUT_TAR="${OUT_DIR}/badminton-game-bundle.tar"

# ─── 切到腳本所在的 repo root ─────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# ─── Build app image ─────────────────────────────────────────
echo "==> [1/4] Building ${APP_IMAGE} ..."
docker build -t "${APP_IMAGE}" .

# ─── Build nginx image（把反向代理 conf 烘進去） ──────────────
echo "==> [2/4] Building ${NGINX_IMAGE} ..."
docker build -t "${NGINX_IMAGE}" -f nginx/Dockerfile nginx/

# ─── 確保 postgres image 在本機（QNAP 沒網路時也能跑） ────────
echo "==> [3/4] Pulling ${POSTGRES_IMAGE} ..."
docker pull "${POSTGRES_IMAGE}"

# ─── 打包三顆 image 成單一 tar ────────────────────────────────
echo "==> [4/4] Saving images to ${OUT_TAR} ..."
mkdir -p "${OUT_DIR}"
docker save -o "${OUT_TAR}" \
    "${APP_IMAGE}" \
    "${NGINX_IMAGE}" \
    "${POSTGRES_IMAGE}"

# ─── 完成 ────────────────────────────────────────────────────
echo "==> Done."
ls -lh "${OUT_TAR}"
cat <<EOF

下一步：
  scp ${OUT_TAR} admin@<qnap-ip>:/share/Container/
  ssh admin@<qnap-ip>
    docker load -i /share/Container/$(basename "${OUT_TAR}")
  在 Container Station 用 docker-compose.yml 建立 application
EOF
