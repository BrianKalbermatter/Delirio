// Hand-written types for the Emscripten-generated game.js (built by src/build-web.sh).
// game.js and game.wasm are build output and git-ignored; this file is committed.
export interface EmscriptenModule {
  // returnType "string": the C function returns a `const char *`, read as text.
  cwrap<T extends (...args: number[]) => number | string | void>(
    name: string,
    returnType: "number" | "string" | null,
    argTypes: "number"[],
  ): T;
}

declare const createModule: () => Promise<EmscriptenModule>;
export default createModule;
