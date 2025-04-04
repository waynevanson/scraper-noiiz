import pino from "pino"

export const log = pino({
  transport: { target: "pino-pretty", options: { hideObject: true } },
  formatters: {
    bindings: () => ({}),
  },
})

export const pl = log.child<"verbose" | "warning">({ name: "puppeteer" })
