#!/usr/bin/env bash
# Exports Aseprite sources into sprite sheets (PNG + JSON) served by Vite.
# Sources stay in the Windows sprites folder; outputs go to client/public/sprites.
set -euo pipefail

ASEPRITE="/mnt/c/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe"
SRC_DIR="/mnt/c/Users/brian/sprites"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/sprites"

# name -> source path relative to SRC_DIR
declare -A SPRITES=(
  [personaje_2]="PersonajePrincipales/Personaje_2_Anim.aseprite"
  [arbol_redondo]="Arboles/redondo.aseprite"
  [arbol_grande]="Arboles/grande.aseprite"
  [arbol_deforme]="Arboles/deforme.aseprite"
  [arbol_roto]="Arboles/roto.aseprite"
  [arbol_joven]="Arboles/joven.aseprite"
  [arbol_viejo]="Arboles/viejo.aseprite"
  [bosque_ancho]="Arboles/bosque_ancho.aseprite"
  [bosque_torcido]="Arboles/bosque_torcido.aseprite"
  [bosque_alto]="Arboles/bosque_alto.aseprite"
)

mkdir -p "$OUT_DIR"
OUT_WIN="$(wslpath -w "$OUT_DIR")"

# Exports one source as public/sprites/<out>.{png,json}; extra arguments
# (like --ignore-layer) go to Aseprite before the input file.
export_sheet() {
  local out="$1" src="$2"
  shift 2
  # Aseprite is a Windows binary: run it from the source folder with a
  # relative input path and Windows-style output paths.
  (
    cd "$SRC_DIR/$(dirname "$src")"
    "$ASEPRITE" -b "$@" "$(basename "$src")" \
      --sheet "$OUT_WIN\\$out.png" \
      --data "$OUT_WIN\\$out.json" \
      --format json-array \
      --list-tags \
      --sheet-type packed \
      </dev/null
  )
  echo "Exported $out -> public/sprites/$out.{png,json}"
}

for name in "${!SPRITES[@]}"; do
  src="${SPRITES[$name]}"
  export_sheet "$name" "$src"
  # Trees also get their trunk and their crown apart, so the game can fade a
  # crown while the trunk under it stays solid.
  if [[ "$name" == arbol_* || "$name" == bosque_* ]]; then
    export_sheet "${name}_tronco" "$src" --ignore-layer Copa --ignore-layer Hojas
    export_sheet "${name}_copa" "$src" --ignore-layer Sombra --ignore-layer Tronco
  fi
done
