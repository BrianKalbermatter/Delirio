// Rebuilds the C core whenever a .c or .h file under ../src changes (any
// subfolder), so saving main.c is enough to see the change in the browser.
// Compile errors show up as Vite's error overlay.
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const C_SRC = resolve(import.meta.dirname, "../src");
const BUILD_SCRIPT = resolve(C_SRC, "build-web.sh");

function cCore(): Plugin {
  let building = false;
  let pending = false;

  return {
    name: "c-core",
    configureServer(server) {
      const build = () => {
        if (building) {
          pending = true; // saved again while compiling: build once more after
          return;
        }
        building = true;
        server.config.logger.info("[c-core] compiling src/ ...", { timestamp: true });
        execFile("bash", [BUILD_SCRIPT], (error, _stdout, stderr) => {
          building = false;
          if (error) {
            const message = stderr
              .split("\n")
              .filter((line) => !/^(shared|cache|system_libs):/.test(line))
              .join("\n");
            server.config.logger.error(`[c-core] build failed\n${message}`);
            server.ws.send({
              type: "error",
              err: { message: `C build failed\n\n${message}`, stack: "", plugin: "c-core" },
            });
          } else {
            // The new game.js/game.wasm trigger the page reload on their own.
            server.config.logger.info("[c-core] ok", { timestamp: true });
          }
          if (pending) {
            pending = false;
            build();
          }
        });
      };

      server.watcher.add(C_SRC);
      server.watcher.on("change", (file) => {
        if (file.startsWith(C_SRC) && /\.(c|h)$/.test(file)) build();
      });
      server.watcher.on("add", (file) => {
        if (file.startsWith(C_SRC) && /\.(c|h)$/.test(file)) build();
      });
      build(); // always start from a fresh build
    },
  };
}

export default defineConfig({
  plugins: [cCore()],
});
