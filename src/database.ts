import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

export function createMutableDatabase<T extends object>(
  filepath: string,
  target: T
): T {
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

  let dirty = false
  function save() {
    if (dirty) return

    queueMicrotask(() => {
      write()
      dirty = false
    })
  }

  const handler: ProxyHandler<object> = {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)

      if (typeof value === "object" && value !== null) {
        return new Proxy(value, handler)
      }

      return value
    },
    set(target, property, value, receiver) {
      const result = Reflect.set(target, property, value, receiver)
      save()
      return result
    },
    deleteProperty(target, property) {
      const result = Reflect.deleteProperty(target, property)
      save()
      return result
    },
  }

  return new Proxy(target, handler as ProxyHandler<T>)
}
