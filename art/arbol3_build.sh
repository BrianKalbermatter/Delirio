#!/usr/bin/env bash
# Rebuilds the orange tree of the square: recovers its pixels with arbol3.py,
# assembles Arboles/Arbol3.aseprite and Arbol3_pie.aseprite (the stones and
# tufts) and exports them.
# With --export it only exports, keeping what was retouched in Aseprite.
# Run from WSL: bash art/arbol3_build.sh [--export]
set -euo pipefail
cd "$(dirname "$0")/.."
SOURCE='C:\Users\brian\sprites\Arboles\Arbol3.aseprite'
PIE='C:\Users\brian\sprites\Arboles\Arbol3_pie.aseprite'
TMP_WIN='C:\Users\brian\AppData\Local\Temp\claude_sprites\arbol3'
TMP=/mnt/c/Users/brian/AppData/Local/Temp/claude_sprites/arbol3
rm -rf "$TMP"
mkdir -p "$TMP"

# Aseprite is a Windows binary: it does not start from a folder inside WSL,
# so it runs from the temp folder (every path given to it is a Windows one).
aseprite() {
  (cd "$TMP" && "/mnt/c/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe" "$@") </dev/null >/dev/null
}

if [[ "${1:-}" != "--export" ]]; then
  python3 art/arbol3.py art/arbol3_original.png "$TMP"
  cp art/arbol3_aseprite.lua "$TMP/"
  aseprite -b --script-param "dir=$TMP_WIN" --script-param "out=$SOURCE" --script-param "pie=$PIE" \
    --script "$TMP_WIN\\arbol3_aseprite.lua"
fi

aseprite -b --layer Arbol "$SOURCE" --save-as "$TMP_WIN\\arbol_3.png"
aseprite -b --layer Sombra "$SOURCE" --save-as "$TMP_WIN\\arbol_3_sombra.png"
aseprite -b "$PIE" --sheet "$TMP_WIN\\arbol_3_pie.png" --sheet-type horizontal
cp "$TMP/arbol_3.png" "$TMP/arbol_3_sombra.png" "$TMP/arbol_3_pie.png" client/public/sprites/
echo "Exported arbol_3, arbol_3_sombra and arbol_3_pie -> client/public/sprites/"
rm -rf "$TMP"
