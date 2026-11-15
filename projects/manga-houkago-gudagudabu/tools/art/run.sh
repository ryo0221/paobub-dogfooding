#!/bin/bash
# gen.sh を PAR 個ずつ。usage: run.sh ROOT [item ...]（既定：raw.png の無いもの全部）
R=$(realpath "$1"); shift
HERE=$(cd "$(dirname "$0")" && pwd)
if [ $# -gt 0 ]; then list=("$@"); else list=(); for d in "$R"/*/; do p=$(basename "$d"); [ -s "$d/brief.txt" ] && [ ! -s "$d/raw.png" ] && list+=("$p"); done; fi
fail=0; running=0
for p in "${list[@]}"; do
  ( bash "$HERE/gen.sh" "$R/$p" > "$R/$p/run.out" 2>&1; rc=$?; echo "$p exit $rc"; exit $rc ) &
  running=$((running+1))
  if [ $running -eq ${PAR:-4} ]; then wait -n || fail=$((fail+1)); running=$((running-1)); fi
done
while [ $running -gt 0 ]; do wait -n || fail=$((fail+1)); running=$((running-1)); done
echo "failed: $fail"; [ $fail -eq 0 ]
