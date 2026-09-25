#!/usr/bin/env bash
# Compiles web.c (which includes main.c) to WebAssembly and drops the
# output where the Vite client can serve it.
set -euo pipefail

cd "$(dirname "$0")"
OUT_DIR="../client/src/infrastructure/wasm/generated"
mkdir -p "$OUT_DIR"

emcc web.c \
  -O1 \
  -sMODULARIZE \
  -sEXPORT_ES6 \
  -sEXPORTED_RUNTIME_METHODS=cwrap \
  -o "$OUT_DIR/game.js"

echo "Built $OUT_DIR/game.js + game.wasm"
