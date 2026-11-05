#!/usr/bin/env bash
# Rebuilds the bushes: turns the painted ones into pixel art with arbustos.py,
# assembles Plaza/Arbustos.aseprite (one frame each) and exports it.
# With --export it only exports, keeping what was retouched in Aseprite.
# Run from WSL: bash art/arbustos_build.sh [--export]
set -euo pipefail
cd "$(dirname "$0")/.."
ORIGINAL=/mnt/c/Users/brian/sprites/Plaza/Arbustos_original.png
SOURCE='C:\Users\brian\sprites\Plaza\Arbustos.aseprite'
TMP_WIN='C:\Users\brian\AppData\Local\Temp\claude_sprites\arbustos'
TMP=/mnt/c/Users/brian/AppData/Local/Temp/claude_sprites/arbustos
rm -rf "$TMP"
mkdir -p "$TMP"

# Aseprite is a Windows binary: it does not start from a folder inside WSL,
# so it runs from the temp folder (every path given to it is a Windows one).
aseprite() {
  (cd "$TMP" && "/mnt/c/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe" "$@") </dev/null >/dev/null
}

if [[ "${1:-}" != "--export" ]]; then
  python3 art/arbustos.py "$ORIGINAL" "$TMP"
  cp art/retonos_aseprite.lua "$TMP/frames.lua"
  aseprite -b --script-param "dir=$TMP_WIN" --script-param "out=$SOURCE" --script-param layer=Arbustos --script "$TMP_WIN\\frames.lua"
fi

aseprite -b "$SOURCE" --sheet "$TMP_WIN\\arbusto.png" --data "$TMP_WIN\\arbusto.json" \
  --format json-array --list-tags --sheet-type packed
cp "$TMP/arbusto.png" "$TMP/arbusto.json" client/public/sprites/
echo "Exported arbusto -> client/public/sprites/arbusto.{png,json}"
rm -rf "$TMP"
