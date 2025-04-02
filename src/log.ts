import pino from "pino"

export const log = pino({
  transport: { target: "./transport.js", options: { limit: 6 } },
})
