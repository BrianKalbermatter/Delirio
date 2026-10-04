#!/usr/bin/env bash
# Compiles the C core as a normal program (./main), without the browser.
# Same sources as build-web.sh except the browser bridge (web.c).
set -euo pipefail

cd "$(dirname "$0")"

IGNORE=(personaje.c web.c)

SOURCES=()
while IFS= read -r file; do
  [[ " ${IGNORE[*]} " == *" ${file#./} "* ]] || SOURCES+=("$file")
done < <(find . -name '*.c' | sort)

gcc "${SOURCES[@]}" -std=c11 -Wall -Wextra -lm -o main
echo "Built ./main"
