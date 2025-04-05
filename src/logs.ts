import pino from "pino"
import { PackMetadata } from "./store"

export function createLoggers() {
  const base = pino({
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

  const main = base.child({
    name: "main",
  })

  const playwright = main.child<"verbose" | "warning">({
    name: "puppeteer",
  })

  function catalogue(page: number) {
    const name = `catalogue/${page.toString().padStart(2, "0")}`
    return base.child({ name })
  }

  function pack(metadata: PackMetadata) {
    const name = `${metadata.artist}/${metadata.title}`
      .toLocaleLowerCase()
      .replaceAll(/\s+/g, "_")
    return base.child({ name })
  }

  return { base, main, playwright, catalogue, pack }
}
