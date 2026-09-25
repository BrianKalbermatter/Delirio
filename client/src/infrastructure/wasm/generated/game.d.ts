// Hand-written types for the Emscripten-generated game.js (built by src/build-web.sh).
// game.js and game.wasm are build output and git-ignored; this file is committed.
export interface EmscriptenModule {
  cwrap<T extends (...args: number[]) => number | void>(
    name: string,
    returnType: "number" | null,
    argTypes: "number"[],
  ): T;
}

declare const createModule: () => Promise<EmscriptenModule>;
export default createModule;
