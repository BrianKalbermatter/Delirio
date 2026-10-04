#!/usr/bin/env bash
# Exports Aseprite sources into sprite sheets (PNG + JSON) served by Vite.
# Sources stay in the Windows sprites folder; outputs go to client/public/sprites.
set -euo pipefail

ASEPRITE="/mnt/c/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe"
SRC_DIR="/mnt/c/Users/brian/sprites"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/sprites"

# name -> source path relative to SRC_DIR
declare -A SPRITES=(
  [personaje_2]="Personaje_2/Personaje_2_Anim.aseprite"
)

mkdir -p "$OUT_DIR"
OUT_WIN="$(wslpath -w "$OUT_DIR")"

for name in "${!SPRITES[@]}"; do
  src="${SPRITES[$name]}"
  # Aseprite is a Windows binary: run it from the source folder with a
  # relative input path and Windows-style output paths.
  (
    cd "$SRC_DIR/$(dirname "$src")"
    "$ASEPRITE" -b "$(basename "$src")" \
      --sheet "$OUT_WIN\\$name.png" \
      --data "$OUT_WIN\\$name.json" \
      --format json-array \
      --list-tags \
      --sheet-type packed \
      </dev/null
  )
  echo "Exported $name -> public/sprites/$name.{png,json}"
done
