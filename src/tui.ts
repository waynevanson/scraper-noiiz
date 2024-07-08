import readline from "node:readline"
import pico from "picocolors"
import { Logger } from "./logger"

export interface ProgressState {
  total: number
  concurrency: number
  downloaded: number
  downloading: Record<
    number,
    | { status: "starting"; message: string }
    | { status: "in-progress"; percentage: number; message: string }
    | { status: "complete"; message: string }
  >
}

export const splitRE = /\r?\n/g

export function createTui(logger: Logger, options: { title: string }) {
  const title = ` ${pico.underline(`[${pico.bold(options.title)}]`)} `
  const state: { progress: ProgressState; logs: Array<string> } = {
    progress: {
      concurrency: 1,
      downloaded: 0,
      downloading: {},
      total: 0,
    },
    logs: [],
  }

  // todo: update comes in, update the state.
  // any log event happens, trigger a redraw.

  function log(message: string) {
    const lines = message.split(splitRE)
    state.logs.push(...lines)
  }

  logger.on("info", (message) => {
    log(message)
    draw()
  })

  logger.on("warn", (message) => {
    log(message)
    draw()
  })

  logger.on("error", (message) => {
    log(message)
    draw()
  })

  function draw() {
    readline.cursorTo(process.stdout, 0, 0)
    readline.clearScreenDown(process.stdout)

    const progress = createProgress(state.progress)

    const taken = progress.split(/\n/g).length

    const [_columns, rows] = process.stdout.getWindowSize()
    const diff = Math.min(rows - taken - 4)

    state.logs.splice(0, -Math.max(0, state.logs.length - diff))

    const logs = state.logs.join("\n")

    const frame = [title, "", logs, "", progress].join("\n")

    console.log(frame)
  }

  return {
    update(total: number, concurrency: number) {
      state.progress.concurrency = concurrency
      state.progress.total = total
      draw()
    },
    progress(event: ProgressPayload) {
      state.progress.downloading[event.thread] = event
      draw()
    },
  }
}

export type ProgressPayload = { thread: number; message: string } & (
  | { status: "starting" }
  | { status: "in-progress"; percentage: number }
  | { status: "complete" }
)

export function createProgress(options: ProgressState) {
  const max = Math.log10(options.concurrency + 1)
  const downloaded = `Downloaded ${options.downloaded} of ${options.total}`

  const downloadings = Object.entries(options.downloading).map(
    ([id, payload]) => {
      const number = id.padEnd(max, " ")
      const status =
        payload.status === "starting"
          ? "Starting"
          : payload.status === "complete"
          ? "100% Complete"
          : (100 * payload.percentage).toFixed(2).padStart(3, " ") + "%"

      return [number, status, payload.message].join(" ")
    }
  )

  const remaining = options.concurrency - downloadings.length
  const offset = options.downloaded - remaining

  const pendings = Array.from({ length: remaining }, (_, index) =>
    [index + 1 + offset, "Pending"].join(" ")
  )

  return [downloaded, ...downloadings, ...pendings].join("\n")
}
