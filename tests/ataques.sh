#!/usr/bin/env bash
# Tests of the enemies' attacks (src/mecanicas/enemigos.c): the ghost's drop, the
# skeleton's jump, the wheel's slaps and the spartan's blow, each alone with a
# player on the open floor of the square.
#   bash tests/ataques.sh
# They live outside src/ because the builds there compile every .c they find.
set -euo pipefail

cd "$(dirname "$0")"
BIN="$(mktemp)"
trap 'rm -f "$BIN"' EXIT

mapfile -t SOURCES < <(find ../src/mecanicas -name '*.c' ! -name enemigos.c | sort)
gcc ataques_test.c ../src/entidad.c "${SOURCES[@]}" -std=c11 -Wall -Wextra -lm -o "$BIN"
"$BIN" "$@"
