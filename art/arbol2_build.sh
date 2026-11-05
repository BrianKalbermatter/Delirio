#!/usr/bin/env bash
# Rebuilds the tree of the square: recovers its pixels with arbol2.py, assembles
# Arboles/Arbol2.aseprite and exports its two layers.
# With --export it only exports, keeping what was retouched in Aseprite.
# Run from WSL: bash art/arbol2_build.sh [--export]
set -euo pipefail
cd "$(dirname "$0")/.."
SOURCE='C:\Users\brian\sprites\Arboles\Arbol2.aseprite'
TMP_WIN='C:\Users\brian\AppData\Local\Temp\claude_sprites\arbol2'
TMP=/mnt/c/Users/brian/AppData/Local/Temp/claude_sprites/arbol2
rm -rf "$TMP"
mkdir -p "$TMP"

# Aseprite is a Windows binary: it does not start from a folder inside WSL,
# so it runs from the temp folder (every path given to it is a Windows one).
aseprite() {
  (cd "$TMP" && "/mnt/c/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe" "$@") </dev/null >/dev/null
}

if [[ "${1:-}" != "--export" ]]; then
  python3 art/arbol2.py art/arbol2_original.png "$TMP"
  cp art/arbol2_aseprite.lua "$TMP/"
  aseprite -b --script-param "dir=$TMP_WIN" --script-param "out=$SOURCE" --script "$TMP_WIN\\arbol2_aseprite.lua"
fi

aseprite -b --layer Arbol "$SOURCE" --save-as "$TMP_WIN\\arbol_2.png"
aseprite -b --layer Sombra "$SOURCE" --save-as "$TMP_WIN\\arbol_2_sombra.png"
cp "$TMP/arbol_2.png" "$TMP/arbol_2_sombra.png" client/public/sprites/
echo "Exported arbol_2 and arbol_2_sombra -> client/public/sprites/"
rm -rf "$TMP"
