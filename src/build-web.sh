#!/usr/bin/env bash
# Compiles the C core to WebAssembly and drops the output where the Vite client
# can serve it. Every .c under src/ (any subfolder) is compiled, so new
# mechanics only need their files: nothing to add here.
set -euo pipefail

cd "$(dirname "$0")"
OUT_DIR="../client/src/infrastructure/wasm/generated"
mkdir -p "$OUT_DIR"

mapfile -t SOURCES < <(find . -name '*.c' | sort)

emcc "${SOURCES[@]}" \
  -O1 \
  -Wall -Wextra \
  -sMODULARIZE \
  -sEXPORT_ES6 \
  -sEXPORTED_RUNTIME_METHODS=cwrap \
  -o "$OUT_DIR/game.js"

echo "Built $OUT_DIR/game.js + game.wasm"
