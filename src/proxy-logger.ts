import { logger } from "./logger"

export interface ProxyLoggerOptions {
  log: (message: string) => void
}

function createClassProxy() {}

function createFunctionProxy() {}

function createMethodProxy() {}

export function createProxyLogger<T extends {}>(
  target: T,
  options: ProxyLoggerOptions
): T {
  return new Proxy(target, {
    apply(target, self, args) {
      const name = `${target.constructor.name}()`

      options.log(name)

      //@ts-expect-error
      const value = Reflect.apply(target, self, args)

      switch (typeof value) {
        case "function":
        case "object":
          if (value !== null) {
            return createProxyLogger(value, options)
          }
        default:
          return value
      }
    },
    //@ts-expect-error
    construct(target, args, constructor) {
      const name = `new ${constructor.name}()`

      options.log(name)

      const value = Reflect.construct(target, args, constructor)

      return value
    },
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)

      if (typeof value === "object" && value !== null) {
        return value
      }

      // method on prototype chain (method)
      if (
        typeof value === "function" &&
        property in target.constructor.prototype
      ) {
        return new Proxy(value, {
          apply(target, self, args) {
            options.log(`${self.constructor.name}.${property.toString()}()`)

            const value = Reflect.apply(target, self, args)

            switch (typeof value) {
              case "function":
              case "object":
                if (value !== null) {
                  return createProxyLogger(value, options)
                }
              default:
                return value
            }
          },
        })
      }

      // we are a property on an object

      const name = `${
        options.name || target.constructor.name !== "Object"
          ? target.constructor.name
          : "object"
      }.${property.toString()}`

      options.log(name)

      switch (typeof value) {
        case "function":
          // if it's a method on the prototype we probably shouldn't wrap it.
          return value
        case "object":
          if (value !== null) {
            return createProxyLogger(value, { ...options, name })
          }
        default:
          return value
      }
    },
  })
}
