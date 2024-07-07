// implementation hijacked from https://github.com/vitejs/vite/blob/main/packages/vite/src/node/utils.ts
// removed multiple warnings errors (not required)
// todo: adds {concurrency} progress bar to bottom, with logs above.
// - "{downloading} of {total}" on top of progresses.
// - "{nn} Pending"
// - "{nn} Starting     {artist} - {title}"
// - "{nn} {ppp}% {artist} - {title}"
// - "{nn} 100%   Complete     {artist} - {title}"
import { EventEmitter } from "node:events"
import { ProgressEventStateless } from "./downloads"

export type LogType = "error" | "warn" | "info" | "progress"
export type LogLevel = LogType | "silent"
export interface Logger extends Record<LogType, (message: string) => void> {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

export const LogLevels: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  progress: 4,
}

export const splitRE = /\r?\n/g

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

// stringify for progress data
function progress(options: ProgressState) {
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

export interface LoggerEventMap {
  error: [message: string, error: Error]
  warn: [message: string]
  info: [message: string]
  progresses: [state: ProgressState]
  progress: [data: ProgressEventStateless]
}

export function createLogger(level: LogLevel = "progress") {
  const emitter = new EventEmitter<LoggerEventMap>()

  const linear = () => {
    emitter.on("info", console.log.bind(console))
    emitter.on("warn", console.warn.bind(console))
    emitter.on("progress", console.log.bind(console))
    emitter.on("error", console.error.bind(console))
  }

  // update TUI on stdout
  const tui = () => {}

  linear()

  return {
    error(message: string, error: Error) {
      if (LogLevels.error > LogLevels[level]) return
      emitter.emit("error", message, error)
    },
    progresses(state: ProgressState) {
      if (LogLevels.progress > LogLevels[level]) return
      emitter.emit("progresses", state)
    },
    progress(data: ProgressEventStateless) {
      if (LogLevels.progress > LogLevels[level]) return
      emitter.emit("progress", data)
    },
    info(message: string) {
      if (LogLevels.info > LogLevels[level]) return
      emitter.emit("info", message)
    },
    warn(message: string) {
      if (LogLevels.warn > LogLevels[level]) return
      emitter.emit("warn", message)
    },
  }
}

export const logger = createLogger("progress")
