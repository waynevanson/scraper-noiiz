// this file is imported as a path so pino.js can use for logging as a worker.
//
// I want to create a logger that takes all these events and depending on what it is displays the status.
import { Transform } from "node:stream"
import build from "pino-abstract-transport"
import { pipeline } from "stream"
import chalk from "chalk"
import pino from "pino"
import formatDistance from "date-fns/formatDistance"

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const ESC = "\x1b"
const CSI = ESC + "["
const START = "\r"
const DELETE = CSI + "K"
const UP = CSI + "A"

// how to keep track of the console we clear?
//  ______________________
//  | WEB SCRAPER         |
//  || info | working..  |
//  |____________________|

export function createTuiStream() {
  const title = "Web scraper - Noiiz.com".toUpperCase()
  let initialised = false

  // {loglevel: { ms, msg }, ...}
  const history = new Map()
  let height = 0
  let last

  const colors = {
    fatal: chalk.bgRed,
    error: chalk.bgRed,
    warn: chalk.bgYellow,
    info: chalk.bgBlue,
    debug: chalk.bgGreen,
    trace: chalk.bgGray,
  }

  const max = Object.keys(pino.levels.values).reduce(
    (left, right) => Math.max(left, right.length),
    0
  )

  function getScreen() {
    const heading = chalk.bgBlue(chalk.bold(" " + title + " "))
    const now = Date.now()

    const messageWidth = Array.from(history.values()).reduce(
      (left, right) => Math.max(left, right.message.length),
      0
    )

    const logs = Array.from(history.entries())
      .sort(([left], [right]) => right - left)
      .map(([level, { date, message }]) => {
        const color = colors[pino.levels.labels[level]]
        const left = color(
          chalk.bold(
            " " + pino.levels.labels[level].toUpperCase().padEnd(max, " ") + " "
          )
        )
        const right = chalk.dim(
          formatDistance(date, now, { includeSeconds: true, addSuffix: true })
        )

        return [left, message.padEnd(messageWidth, " "), right].join(" ")
      })

    return [heading, "", ...logs, "", ""]
  }

  function clear(stream) {
    // don't clear when it's empty
    if (height < 1) return

    for (let index = 0; index < height - 1; index++) {
      stream.push(START + DELETE + UP)
    }

    stream.push(START + DELETE)
  }

  const stream = new Transform({
    transform(chunk, _, callback) {
      const date = new Date(chunk.time)
      last = chunk.level

      history.set(chunk.level, { date, message: chunk.msg })

      const screen = getScreen()

      const text = screen.join("\n")

      clear(this)
      this.push(text)

      height = screen.length

      callback(undefined)
    },
    objectMode: true,
  })

  setInterval(() => {
    clear(stream)
    const screen = getScreen()
    const text = screen.join("\n")

    stream.push(text)

    height = screen.length
  }, 1000)

  return stream
}

export default function tui(options) {
  return build(
    (source) => {
      const tui = createTuiStream()

      pipeline(source, tui, () => {})

      return tui
    },
    { enablePipelining: true }
  )
}
