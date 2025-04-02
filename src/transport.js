import { Writable } from "stream"
import pretty from "pino-pretty"

const stdout = process.stdout

/**
 * @typedef Options
 * @property {number | undefined} limit
 * @param {Options} [options]
 */
export function limit(options) {
  const limit = options?.limit ?? 1

  if (limit < 1) {
    throw new Error("Expected the limit to be greater than 0")
  }

  /** @type {Array<string>} */
  const buffer = []
  let index = 0

  return new Writable({
    async write(chunk, encoding, callback) {
      const line = chunk.toString()

      clearLines(buffer.length)

      if (buffer.length < limit) {
        buffer.push(line)
      } else {
        buffer[index] = line
        index = (index + 1) % limit
      }

      for (let i = 0; i < buffer.length; i++) {
        const lineIndex = (index + i) % buffer.length
        stdout.write(buffer[lineIndex])
      }

      callback()
    },
  })
}

const clear = () => stdout.write("\x1b[2k")
const up = () => stdout.write("\x1b[1A")

/** @param {number} lines */
function clearLines(lines) {
  if (lines > 0) clear()

  for (let i = 0; i < lines; i++) {
    up()
    clear()
  }
}

/**
 * @param {Options} options
 */
export default function (options) {
  return pretty({ destination: limit(options) })
}
