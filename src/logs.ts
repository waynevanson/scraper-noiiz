import pino from "pino"

export const base = pino({
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
      return {}
    },
  },
})
export const main = base.child({
  name: "main",
})

export const playwright = main.child<"verbose" | "warning">({
  name: "puppeteer",
})
