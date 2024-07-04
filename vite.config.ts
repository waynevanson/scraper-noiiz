/// <reference types="vitest"/>
import { Plugin, defineConfig } from "vite"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"

interface PinoVitePluginOptions {
  /**
   * A list of input source files relative to the current directory.
   *
   * @example
   * { tui: "./src/transports/transport.ts" }
   */
  transports: Record<string, string>
}

// - get name of lookup in pino lookup table.
function pino(options: PinoVitePluginOptions): Plugin {
  const tmp = fs.mkdtempSync("vite-pino")

  return {
    name: "pino",
    config() {
      const overrides = Object.fromEntries(
        Object.entries(options.transports).map(([pinoTarget, sourceFile]) => {
          const filename = path.resolve(tmp, pinoTarget + ".js")

          return [pinoTarget, filename] as const
        })
      )

      return {
        define: {
          globalThis: {
            __bundlerPathsOverrides: overrides,
          },
        },
        build: {
          rollupOptions: {
            input: options.transports,
            output: { dir: tmp },
          },
        },
        test: {},
      }
    },
  }
}

export default defineConfig({
  plugins: [
    // pino({
    //   transports: {
    //     "transports/tui": "./src/transports/tui.js",
    //   },
    // }),
  ],
})
