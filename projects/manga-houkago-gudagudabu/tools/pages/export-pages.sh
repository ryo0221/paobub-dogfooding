#!/bin/bash
# Design の原稿からページの画像を書き出す（export-pages.ts を Editor Platform の上で束ねて動かす）。
# usage: EP_DIR=<open-editor-platform のチェックアウト> bash tools/pages/export-pages.sh DESIGN_JSON OUT_DIR [WIDTH]
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
: "${EP_DIR:?EP_DIR に Editor Platform のチェックアウトを渡す}"
B=$(mktemp -d)/export-pages.mjs
(cd "$EP_DIR" && NODE_PATH="$EP_DIR/node_modules" npx esbuild "$HERE/export-pages.ts" --bundle --platform=node --format=esm --external:playwright --outfile="$B" --log-level=warning)
LETTER_FONT_FILE="${LETTER_FONT_FILE:-$HERE/../../assets/fonts/GenEiAntiqueNv6-M.ttf}" NODE_PATH=$(npm root -g) node "$B" "$(realpath "$1")" "$2" "${3:-}"
