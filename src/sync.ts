import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

export function createSync<T extends object>(filepath: string, target: T) {
  if (existsSync(filepath)) {
    const data = readFileSync(filepath, { encoding: "utf-8" })
    target = JSON.parse(data)
  } else {
    mkdirSync(path.dirname(filepath), { recursive: true })
    write()
  }

  function write() {
    const data = JSON.stringify(target, null, 4)
    writeFileSync(filepath, data, { encoding: "utf-8" })
  }

  return new Proxy(target, {
    set(target, property, value, receiver) {
      const result = Reflect.set(target, property, value, receiver)
      write()
      return result
    },
    deleteProperty(target, property) {
      const result = Reflect.deleteProperty(target, property)
      write()
      return result
    },
  })
}
