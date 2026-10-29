#!/usr/bin/env bash
# Exports Aseprite sources into sprite sheets (PNG + JSON) served by Vite.
# Sources stay in the Windows sprites folder; outputs go to client/public/sprites,
# and items the player can pick up to client/public/assets.
set -euo pipefail

ASEPRITE="/mnt/c/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe"
SRC_DIR="/mnt/c/Users/brian/sprites"
PUBLIC="$(cd "$(dirname "$0")/.." && pwd)/public"

# name -> source path relative to SRC_DIR. Not the players: art/armas.py and
# art/armas_build.sh build them with their weapon animations.
declare -A SPRITES=(
  [enemigo_1]="Enemigos/Enemigo1/Enemigo1_Anim.aseprite"
  [espartano_1]="Enemigos/Espartano1/Espartano1_Anim.aseprite"
  [arbol_1]="Arboles/Arbol1_pintado.aseprite"
  [flores]="Laberinto/Terreno/Flores_viento.aseprite"
  [flores_2]="Laberinto/Terreno/Flores2_viento.aseprite"
)
# Extra Aseprite arguments per sprite. Trees are trimmed to what their frames
# use, so the 540x540 drawing canvas does not ship empty space.
declare -A ARGS=(
  [arbol_1]="--trim-sprite"
)
# Items (pickups) load from public/assets, like the potions and the chest.
declare -A ASSET_SPRITES=(
  [ramas]="Plaza/Ramas.aseprite"
)

# Aseprite cannot write into WSL (\\wsl.localhost paths), so sheets go to a
# Windows temp folder first and are copied to public from there.
TMP="/mnt/c/Users/brian/AppData/Local/Temp/claude_sprites/export"
rm -rf "$TMP"
mkdir -p "$TMP"
TMP_WIN="$(wslpath -w "$TMP")"

# Exports one source as <OUT_LABEL>/<out>.{png,json}; extra arguments (like
# --ignore-layer) go to Aseprite before the input file.
export_sheet() {
  local out="$1" src="$2"
  shift 2
  # Aseprite is a Windows binary: run it from the source folder with a
  # relative input path and Windows-style output paths.
  (
    cd "$SRC_DIR/$(dirname "$src")"
    "$ASEPRITE" -b "$@" "$(basename "$src")" \
      --sheet "$TMP_WIN\\$out.png" \
      --data "$TMP_WIN\\$out.json" \
      --format json-array \
      --list-tags \
      --sheet-type packed \
      </dev/null
  )
  cp "$TMP/$out.png" "$TMP/$out.json" "$PUBLIC/$OUT_LABEL/"
  echo "Exported $out -> public/$OUT_LABEL/$out.{png,json}"
}

OUT_LABEL="sprites"
for name in "${!SPRITES[@]}"; do
  src="${SPRITES[$name]}"
  # shellcheck disable=SC2206 # ARGS values are meant to split into words
  args=(${ARGS[$name]:-})
  export_sheet "$name" "$src" "${args[@]}"
  # Trees also get their trunk and their crown apart, so the game can fade a
  # crown while the trunk under it stays solid.
  if [[ "$name" == arbol_* ]]; then
    export_sheet "${name}_tronco" "$src" "${args[@]}" --ignore-layer Copa --ignore-layer Hojas
    export_sheet "${name}_copa" "$src" "${args[@]}" --ignore-layer Sombra --ignore-layer Tronco
  fi
done

OUT_LABEL="assets"
for name in "${!ASSET_SPRITES[@]}"; do
  export_sheet "$name" "${ASSET_SPRITES[$name]}"
done
rm -rf "$TMP"
