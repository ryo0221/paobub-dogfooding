#!/bin/bash
# Codex の画像生成を1回。手本：gulliver-manga part1/rough/src/gen-rough.sh。
# usage: gen.sh DIR   （DIR に brief.txt・layout.png・head.txt、任意で refs.txt（path<TAB>説明））
# DIR/raw.png・prompt.txt・codex.log を書く。
set -e
D=$(realpath "$1"); cd "$D"
[ -s brief.txt ] && [ -s layout.png ] && [ -s head.txt ] || { echo "no brief in $D" >&2; exit 1; }
args=(-i "$D/layout.png"); refs=""; n=2
ordinal=(FIRST SECOND THIRD FOURTH FIFTH SIXTH SEVENTH EIGHTH NINTH)
if [ -s refs.txt ]; then
  while IFS=$'\t' read -r path what || [ -n "$path" ]; do
    [ -n "$path" ] || continue
    args+=(-i "$path"); refs+="The ${ordinal[$((n-1))]} attached image is $what: keep that character design exactly (hair, face, uniform, silhouette)."$'\n'; n=$((n+1))
  done < refs.txt
fi
{ cat head.txt; echo; printf '%s' "$refs"; echo; cat brief.txt; echo; echo "After generating, copy the generated PNG to ./raw.png in the current directory. Do not generate more than one image."; } > prompt.txt
timeout 900 codex exec --skip-git-repo-check --sandbox workspace-write "$(cat prompt.txt)" "${args[@]}" < /dev/null > codex.log 2>&1
ls -la raw.png
