#!/usr/bin/env bash
# Rebuilds the level up effect: draws its frames with nivel_aura.py, assembles
# Efectos/NivelAura.aseprite and exports its two layers as sprite sheets.
# With --export it only exports, keeping what was retouched in Aseprite.
# Run from WSL: bash art/nivel_aura_build.sh [--export]
set -euo pipefail
cd "$(dirname "$0")/.."
SOURCE_DIR=/mnt/c/Users/brian/sprites/Efectos
SOURCE='C:\Users\brian\sprites\Efectos\NivelAura.aseprite'
TMP_WIN='C:\Users\brian\AppData\Local\Temp\claude_sprites\nivel_aura'
TMP=/mnt/c/Users/brian/AppData/Local/Temp/claude_sprites/nivel_aura
rm -rf "$TMP"
mkdir -p "$TMP" "$SOURCE_DIR"

# Aseprite is a Windows binary: it does not start from a folder inside WSL,
# so it runs from the temp folder (every path given to it is a Windows one).
aseprite() {
  (cd "$TMP" && "/mnt/c/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe" "$@") </dev/null >/dev/null
}

if [[ "${1:-}" != "--export" ]]; then
  python3 art/nivel_aura.py "$TMP"
  cp art/nivel_aura_aseprite.lua "$TMP/"
  aseprite -b --script-param "dir=$TMP_WIN" --script-param "out=$SOURCE" --script "$TMP_WIN\\nivel_aura_aseprite.lua"
fi

for layer in Atras Frente; do
  name="nivel_aura_${layer,,}"
  other=$([[ "$layer" == Atras ]] && echo Frente || echo Atras)
  aseprite -b --ignore-layer "$other" "$SOURCE" \
    --sheet "$TMP_WIN\\$name.png" --data "$TMP_WIN\\$name.json" \
    --format json-array --list-tags --sheet-type packed
  cp "$TMP/$name.png" "$TMP/$name.json" client/public/sprites/
  echo "Exported $name -> client/public/sprites/$name.{png,json}"
done
rm -rf "$TMP"
