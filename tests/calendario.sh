#!/usr/bin/env bash
# Tests of the lunar calendar (src/mecanicas/calendario.c): prints the 30 days
# of a month with their name and luminosity, then checks everything.
#   bash tests/calendario.sh      -> Mes de Zeus
#   bash tests/calendario.sh 3    -> month 3 (0 to 5)
# They live outside src/ because the builds there compile every .c they find.
set -euo pipefail

cd "$(dirname "$0")"
BIN="$(mktemp)"
trap 'rm -f "$BIN"' EXIT

gcc calendario_test.c ../src/mecanicas/calendario.c ../src/mecanicas/mecanica.c \
  -std=c11 -Wall -Wextra -lm -o "$BIN"
"$BIN" "$@"
