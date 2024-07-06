// implementation hijacked from https://github.com/vitejs/vite/blob/main/packages/vite/src/node/utils.ts
import readline from "node:readline"
import colors from "picocolors"

export type LogType = "error" | "warn" | "info"
export type LogLevel = LogType | "silent"
export interface Logger {
  info(msg: string, options?: LogOptions): void
  warn(msg: string, options?: LogOptions): void
  error(msg: string, options?: LogErrorOptions): void
  clearScreen(type: LogType): void
}

export interface LogOptions {
  clear?: boolean
  timestamp?: boolean
}

export interface LogErrorOptions extends LogOptions {
  error?: Error | null
}

export const LogLevels: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
}

export const splitRE = /\r?\n/g

let lastType: LogType | undefined
let lastMsg: string | undefined
let sameCount = 0

function clearScreen() {
  const repeatCount = process.stdout.rows - 2
  const blank = repeatCount > 0 ? "\n".repeat(repeatCount) : ""
  console.log(blank)
  readline.cursorTo(process.stdout, 0, 0)
  readline.clearScreenDown(process.stdout)
}

export interface LoggerOptions {
  prefix?: string
  allowClearScreen?: boolean
  customLogger?: Logger
}

// Only initialize the timeFormatter when the timestamp option is used, and
// reuse it across all loggers
let timeFormatter: Intl.DateTimeFormat
function getTimeFormatter() {
  timeFormatter ??= new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  })
  return timeFormatter
}

const MAX_LOG_CHAR = 5000

export function createLogger(
  level: LogLevel = "info",
  options: LoggerOptions = {}
): Logger {
  if (options.customLogger) {
    return options.customLogger
  }

  const loggedErrors = new WeakSet<Error>()
  const { prefix = "[vite]", allowClearScreen = true } = options
  const thresh = LogLevels[level]
  const canClearScreen =
    allowClearScreen && process.stdout.isTTY && !process.env.CI
  const clear = canClearScreen ? clearScreen : () => {}

  function preventOverflow(msg: string) {
    if (msg.length > MAX_LOG_CHAR) {
      const shorten = msg.slice(0, MAX_LOG_CHAR)
      const lines = msg.slice(MAX_LOG_CHAR).match(splitRE)?.length || 0

      return `${shorten}\n... and ${lines} lines more`
    }
    return msg
  }

  function format(
    type: LogType,
    rawMsg: string,
    options: LogErrorOptions = {}
  ) {
    const msg = preventOverflow(rawMsg)
    if (options.timestamp) {
      const tag =
        type === "info"
          ? colors.cyan(colors.bold(prefix))
          : type === "warn"
          ? colors.yellow(colors.bold(prefix))
          : colors.red(colors.bold(prefix))
      return `${colors.dim(
        getTimeFormatter().format(new Date())
      )} ${tag} ${msg}`
    } else {
      return msg
    }
  }

  function output(type: LogType, msg: string, options: LogErrorOptions = {}) {
    if (thresh >= LogLevels[type]) {
      const method = type === "info" ? "log" : type

      if (options.error) {
        loggedErrors.add(options.error)
      }

      if (canClearScreen) {
        if (type === lastType && msg === lastMsg) {
          sameCount++
          clear()
          console[method](
            format(type, msg, options),
            colors.yellow(`(x${sameCount + 1})`)
          )
        } else {
          sameCount = 0
          lastMsg = msg
          lastType = type
          if (options.clear) {
            clear()
          }
          console[method](format(type, msg, options))
        }
      } else {
        console[method](format(type, msg, options))
      }
    }
  }

  const logger: Logger = {
    info(msg, opts) {
      output("info", msg, opts)
    },
    warn(msg, opts) {
      output("warn", msg, opts)
    },
    error(msg, opts) {
      output("error", msg, opts)
    },
    clearScreen(type) {
      if (thresh >= LogLevels[type]) {
        clear()
      }
    },
  }

  return logger
}

export const logger = createLogger("info")
