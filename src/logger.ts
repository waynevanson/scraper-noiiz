import { EventEmitter } from "node:events"

export type LogType = "error" | "warn" | "info"
export type LogLevel = LogType | "silent"

export const LogLevels: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
}

// stringify for progress data

export interface LoggerEventMap {
  error: [message: string, error: Error]
  warn: [message: string]
  info: [message: string]
}

export class Logger extends EventEmitter<LoggerEventMap> {
  constructor(public level: LogLevel = "info") {
    super()
  }

  error(message: string, error: Error) {
    if (LogLevels.error > LogLevels[this.level]) return
    this.emit("error", message, error)
  }

  info(message: string) {
    if (LogLevels.info > LogLevels[this.level]) return
    this.emit("info", message)
  }

  warn(message: string) {
    if (LogLevels.warn > LogLevels[this.level]) return
    this.emit("warn", message)
  }
}

export const logger = new Logger("info")

// logs will be the rest of the rows available.
