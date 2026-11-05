#!/usr/bin/env bash
# Rebuilds the saplings: shrinks the trees' sprites with retonos.py, assembles
# Arboles/Retonos.aseprite and exports it as an item sheet.
# With --export it only exports, keeping what was retouched in Aseprite.
# Run from WSL: bash art/retonos_build.sh [--export]
set -euo pipefail
cd "$(dirname "$0")/.."
SOURCE='C:\Users\brian\sprites\Arboles\Retonos.aseprite'
TMP_WIN='C:\Users\brian\AppData\Local\Temp\claude_sprites\retonos'
TMP=/mnt/c/Users/brian/AppData/Local/Temp/claude_sprites/retonos
rm -rf "$TMP"
mkdir -p "$TMP"

# Aseprite is a Windows binary: it does not start from a folder inside WSL,
# so it runs from the temp folder (every path given to it is a Windows one).
aseprite() {
  (cd "$TMP" && "/mnt/c/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe" "$@") </dev/null >/dev/null
}

if [[ "${1:-}" != "--export" ]]; then
  python3 art/retonos.py client/public/sprites "$TMP"
  cp art/retonos_aseprite.lua "$TMP/"
  aseprite -b --script-param "dir=$TMP_WIN" --script-param "out=$SOURCE" --script "$TMP_WIN\\retonos_aseprite.lua"
fi

aseprite -b "$SOURCE" --sheet "$TMP_WIN\\retonos.png" --data "$TMP_WIN\\retonos.json" \
  --format json-array --list-tags --sheet-type packed
cp "$TMP/retonos.png" "$TMP/retonos.json" client/public/assets/
echo "Exported retonos -> client/public/assets/retonos.{png,json}"
rm -rf "$TMP"
