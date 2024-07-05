export interface Options {
  log: (message: string) => void
}

export function constructor<Target extends new (...args: Array<any>) => any>(
  target: Target,
  { log }: Options
): Target {
  return new Proxy(target, {
    construct(target, args, constructor) {
      const name = `new ${constructor.name}()`

      log(name)

      const value = Reflect.construct(target, args, constructor)

      return object(value, { log, name })
    },
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)

      const name = `${constructor.name}()`

      switch (typeof value) {
        case "bigint":
        case "number":
        case "boolean":
        case "symbol":
        case "string":
        case "undefined":
          return value

        case "object":
          if (value == null) {
            return value
          }

        case "function":
          if (property === "constructor" || "prototype") {
            return value
          } else if (property in target.constructor.prototype) {
            // method on prototype chain (method)
            return method(value as never, property, {
              log,
              name,
            })
          } else {
            return function_(value as never, { log, name })
          }
      }
    },
  })
}

export function object<Target extends {}>(
  target: Target,
  { log, name }: Options & { name?: string }
): Target {
  return new Proxy(target, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      name =
        name || target.constructor.name === "Object"
          ? "object"
          : target.constructor.name

      switch (typeof value) {
        case "bigint":
        case "number":
        case "boolean":
        case "symbol":
        case "string":
        case "undefined":
          return value

        case "object":
          if (value == null) {
            return value
          } else {
            return object(value, { log, name })
          }

        case "function":
          if (property === "constructor" || property === "prototype") {
            return value
          } else if (property in target.constructor.prototype) {
            // method on prototype chain (method)
            return method(value as never, property, {
              log,
              name,
            })
          } else {
            return function_(value as never, { log, name })
          }
      }
    },
  })
}

function function_<Target extends (...args: Array<any>) => any>(
  target: Target,
  options: Options & { name?: string }
): Target {
  return new Proxy(target, {
    apply(target, self, args) {
      options.log(`${options.name}.${target.name}()`)
      const value = Reflect.apply(target, self, args)
      return value
    },
  })
}

export { function_ as function }

// I think we need to carry the non proxied target down,
// as we're getting invariant errors
export function method<Target extends (...args: Array<any>) => any>(
  target: Target,
  property: string | symbol,
  { log }: { log: (message: string) => void; name: string }
): Target {
  return new Proxy(target, {
    apply(target, self, args) {
      const name = `${self.constructor.name}.${property.toString()}()`

      log(name)

      const value = Reflect.apply(target, self, args)

      switch (typeof value) {
        case "bigint":
        case "number":
        case "boolean":
        case "symbol":
        case "string":
        case "undefined":
          return value

        case "object":
          if (value == null) {
            return value
          } else {
            return object(value, { log, name })
          }

        case "function":
          if (property === "constructor" || property === "prototype") {
            return value
          } else {
            return function_(value as never, { log, name })
          }
      }
    },
  })
}
