import pino, { destination } from "pino"

export const logger = pino({
  level: "trace",
  transport: {
    pipeline: [
      {
        target: "./transports/tui.mjs",
      },
      {
        target: "pino/file",
        options: { destination: 1 },
      },
    ],
  },
})
