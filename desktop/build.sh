#!/usr/bin/env bash
# 构建 macOS 桌面版：前端 → 后端二进制 → 种子数据 → 打包 .app
# 用法：desktop/build.sh（可用 ELECTRON_DIST=/path/to/electron-dist 指定本地 Electron 目录，跳过下载）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> 构建前端"
(cd app && npm run build)

echo "==> 打包后端"
server/.venv/bin/pip install -q pyinstaller
server/.venv/bin/pyinstaller --noconfirm --onefile --clean \
  --name soccerboard-server --paths "$ROOT" \
  --distpath desktop/build --workpath /tmp/pyi-build --specpath /tmp/pyi-build \
  desktop/backend_entry.py

echo "==> 准备种子数据"
rm -rf desktop/seed
mkdir -p desktop/seed
rsync -a --exclude '*-shm' --exclude '*-wal' --exclude '*.bak.db' server/data/ desktop/seed/

echo "==> 打包 .app"
cd desktop
[ -d node_modules ] || npm install
ARGS=(--mac --dir)
if [ -n "${ELECTRON_DIST:-}" ]; then
  ARGS+=("-c.electronDist=$ELECTRON_DIST")
fi
CSC_IDENTITY_AUTO_DISCOVERY=false node_modules/.bin/electron-builder "${ARGS[@]}"

echo "完成：desktop/out/mac-arm64/SOCCERBOARD.app"
