import { describe, test, vi, expect } from "vitest"
import { createProxyLogger } from "./proxy-logger"

test("should log when a property is accessed", () => {
  const log = vi.fn()
  const property = "property"
  const value = 2

  const target = {
    [property]: value,
  }

  const proxy = createProxyLogger(target, { log })

  expect(proxy[property]).toBe(value)

  expect(log).toHaveBeenCalledWith(`object.${property}`)
})

test("should not log when a method is accessed", () => {
  const log = vi.fn()

  class Targetable {
    method() {}
  }

  const target = new Targetable()

  const proxy = createProxyLogger(target, { log })

  proxy.method

  expect(log).not.toBeCalled()
})

test("should log when a method is called", () => {
  const log = vi.fn()

  class Targetable {
    method() {}
  }

  const target = new Targetable()

  const proxy = createProxyLogger(target, { log })

  proxy.method()

  expect(log).toBeCalled()
})

test("should not log when the constructor is accessed", () => {
  const log = vi.fn()

  class Target {}

  const proxy = createProxyLogger(Target, { log })

  proxy.constructor

  expect(log).not.toBeCalled()
})

test("should not wrap the prototype in a proxy", () => {
  const log = vi.fn()

  class Target {}

  const Proxy = createProxyLogger(Target, { log })

  expect(Proxy.prototype).toBe(Target.prototype)
})

test("should log when the constructor is called", () => {
  const log = vi.fn()

  const target = class Target {}

  const Proxy = createProxyLogger(target, { log })

  new Proxy()

  expect(log).toHaveBeenCalledWith("new Target()")
})
