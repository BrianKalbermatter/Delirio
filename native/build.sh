#!/usr/bin/env bash
# Compiles Delirio as a desktop program (./build/delirio): the same C core the
# browser runs (../src, minus the web.c bridge), drawn with VimMon's 2D
# renderer on SDL_GPU instead of PixiJS.
#
# VIMMON points at the VimMon checkout that holds plugins/renderer2d.
set -euo pipefail

cd "$(dirname "$0")"
VIMMON="${VIMMON:-$HOME/proyectos/Proyect_K/VimMon}"
R2D="$VIMMON/plugins/renderer2d"
OUT=build
mkdir -p "$OUT"

if [[ ! -f "$R2D/renderer2d.h" ]]; then
  echo "renderer2d not found in $VIMMON (set VIMMON=...)" >&2
  exit 1
fi
make -s -C "$VIMMON" plugins/renderer2d/shaders/sprite2d.vert.spv plugins/renderer2d/shaders/sprite2d.frag.spv

CFLAGS=(-std=c11 -D_DEFAULT_SOURCE -Wall -Wextra -O2 -I. -I../src -I"$VIMMON"
        $(pkg-config --cflags sdl3 sdl3-image)
        -DRUTA_PUBLIC="\"$(cd ../client/public && pwd)\""
        -DRUTA_SHADERS_2D="\"$R2D/shaders\"")

# The core's main.c has a test main(); it is renamed so this one wins.
CORE=()
while IFS= read -r file; do
  case "$file" in
    ../src/web.c) ;;
    ../src/main.c) clang "${CFLAGS[@]}" -Dmain=nucleo_main_de_prueba -Wno-return-type -c "$file" -o "$OUT/nucleo_main.o" ;;
    *) CORE+=("$file") ;;
  esac
done < <(find ../src -name '*.c' | sort)

clang "${CFLAGS[@]}" main.c json.c hoja.c personaje.c vista_laberinto.c "$R2D/gpu2d_sdl.c" \
  "${CORE[@]}" "$OUT/nucleo_main.o" \
  $(pkg-config --libs sdl3 sdl3-image) -lm -o "$OUT/delirio"
echo "Built $OUT/delirio"
