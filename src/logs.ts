import pino from "pino"

export const main = pino({
  transport: {
    targets: [
      { target: "pino-pretty" },
      {
        target: "pino/file",
        options: { destination: "./logs.ndjson", append: false },
      },
    ],
  },
  formatters: {
    bindings: () => ({}),
    log() {
      return {
        name: "main",
      }
    },
  },
})

export const playwright = main.child<"verbose" | "warning">({
  name: "puppeteer",
})

export const pack = main.child({
  name: "pack",
})
