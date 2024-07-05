import { test, vi, expect, describe } from "vitest"
import * as proxies from "./proxy-logger"

describe("class", () => {
  describe("constructor", () => {
    test("should not log when the constructor is accessed", () => {
      const log = vi.fn()

      class Target {}

      const proxy = proxies.constructor(Target, { log })

      proxy.constructor

      expect(log).not.toBeCalled()
    })

    test("should return the constructor when the constructor is accessed", () => {
      const log = vi.fn()

      class Target {}

      const proxy = proxies.constructor(Target, { log })

      expect(proxy.constructor).toBe(Target.constructor)
    })

    test("should log when the constructor is called", () => {
      const log = vi.fn()

      const target = class Target {}

      const Proxy = proxies.constructor(target, { log })

      new Proxy()

      expect(log).toHaveBeenCalledWith("new Target()")
    })
  })

  describe("method", () => {
    test("should log when a method is called", () => {
      const log = vi.fn()

      class Targetable {
        method() {}
      }

      const target = new Targetable()

      const proxy = proxies.object(target, { log })

      proxy.method()

      expect(log).toBeCalledWith("Targetable.method()")
    })
  })

  describe("property", () => {
    test("should log when a function property is called", () => {
      const log = vi.fn()

      class Targetable {
        fn = () => {}
      }

      const target = new Targetable()

      const proxy = proxies.object(target, { log })

      proxy.fn()

      expect(log).toBeCalledWith("Targetable.fn()")
    })
  })

  describe("prototype", () => {
    test("should not throw when the prototype is accessed", () => {
      const log = vi.fn()

      class Target {}

      const proxy = proxies.constructor(Target, { log })

      expect(() => proxy.prototype).not.toThrow()
    })
  })
})
