#!/usr/bin/env bash
# Rebuilds the player (Personaje_3) and every weapon's overlays.
# Exports each weapon's .aseprite with Aseprite, renders every animation with
# personaje_3_build.py, and assembles Personaje_3_Anim.aseprite for editing.
# Run from WSL: bash art/armas_build.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ASEPRITE="/mnt/c/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe"
SPRITES='C:\Users\brian\sprites\PersonajePrincipales'
TMP_WIN='C:\Users\brian\AppData\Local\Temp\claude_sprites\p3'
TMP=/mnt/c/Users/brian/AppData/Local/Temp/claude_sprites/p3
rm -rf "$TMP"
mkdir -p "$TMP/frames"
cp art/p3_aseprite.lua "$TMP/p3_aseprite.lua"

# Every weapon in armas.WEAPONS, exported as <id>.png
python3 -c 'import sys; sys.path.insert(0, "art"); import armas; [print(w["id"], w["aseprite"]) for w in armas.WEAPONS]' |
  while read -r id file; do
    "$ASEPRITE" -b "$SPRITES\\$file" --save-as "$TMP_WIN\\$id.png" </dev/null >/dev/null
  done

python3 art/personaje_3_build.py "$TMP" client/public "$TMP/frames"

"$ASEPRITE" -b \
  --script-param "dir=$TMP_WIN\\frames" \
  --script-param "out=$SPRITES\\Personaje_3_Anim.aseprite" \
  --script "$TMP_WIN\\p3_aseprite.lua" </dev/null >/dev/null
echo "Personaje_3_Anim.aseprite written"
