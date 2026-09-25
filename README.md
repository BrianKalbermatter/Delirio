# Delirio

Co-op wave-based browser game for up to 10 players. Retro neon voxel look, third-person camera.

- `server/`   — authoritative game server in C (hand-written WebSocket, 20 Hz tick)
- `client/`   — TypeScript + Three.js renderer and input
- `gateway/`  — Go HTTP lobby and room manager
- `protocol/` — the binary wire protocol both sides implement

## Getting started (fresh clone)

Requirements: [Emscripten](https://emscripten.org/docs/getting_started/downloads.html) (`emcc`), Node.js + npm, a C compiler.

```bash
# 1. Build the C lab (src/main.c via src/web.c) to WebAssembly
./src/build-web.sh

# 2. Run the browser client
cd client
npm install
npm run dev
```

Generated files (`client/src/infrastructure/wasm/generated/game.{js,wasm}`, `node_modules/`, `src/main`) are not versioned — step 1 and 2 recreate them.
