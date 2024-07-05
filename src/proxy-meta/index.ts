export type Time = "before" | "after"

export interface Handlers<Target, Context> {
  apply: Partial<
    Record<
      Time,
      (options: {
        target: Target
        self: {}
        args: Array<unknown>
        context: Context
      }) => Context
    >
  >
  construct: Partial<
    Record<
      Time,
      (options: {
        target: Target
        args: Array<unknown>
        constructor: Function
        context: Context
      }) => Context
    >
  >
  get: Partial<
    Record<
      Time,
      (options: {
        target: Target
        property: string | Symbol
        receiver: any
        context: Context
      }) => Context
    >
  >
}

export function meta<Target, Context>(
  target: Target,
  handlers: Partial<Handlers<Target, Context>> = {},
  context: Context
): Target {
  return internal(target, handlers, { context, unproxied: { target } })
}

// add context
export function internal<Target, Context>(
  target: Target,
  handlers: Partial<Handlers<Target, Context>> = {},
  state: { unproxied: { target: any; parent?: any }; context: Context }
): Target {
  return new Proxy<any>(target, {
    apply(target, self, args) {
      let context = state.context

      context =
        handlers?.apply?.before?.({ target, self, args, context }) ??
        state.context

      const value = Reflect.apply(
        target,
        state.unproxied.parent ?? state.unproxied.target,
        args
      )

      context =
        handlers.apply?.after?.({ target, self, args, context }) ?? context

      switch (typeof value) {
        case "bigint":
        case "boolean":
        case "number":
        case "string":
        case "symbol":
        case "undefined":
          return value
        case "object":
          if (value === null) {
            return value
          }
        default:
          return internal(value as never, handlers, {
            unproxied: { target: value, parent: state.unproxied.target },
            context,
          })
      }
    },

    construct(target, args, constructor) {
      let context = state.context
      context =
        handlers?.construct?.before?.({ target, args, constructor, context }) ??
        context

      const value = Reflect.construct(target as never, args, constructor)

      context =
        handlers?.construct?.after?.({ target, args, constructor, context }) ??
        context

      switch (typeof value) {
        case "bigint":
        case "boolean":
        case "number":
        case "string":
        case "symbol":
        case "undefined":
          return value
        case "object":
          if (value === null) {
            return value
          }
        default:
          return internal(value as never, handlers, {
            unproxied: {
              target: value,
              parent: state.unproxied.target,
            },
            context,
          })
      }
    },

    get(target, property, receiver) {
      let context = state.context

      context =
        handlers?.get?.before?.({ target, property, receiver, context }) ??
        context

      const value = Reflect.get(target, property, receiver)

      context =
        handlers?.get?.after?.({ target, property, receiver, context }) ??
        context

      switch (typeof value) {
        case "bigint":
        case "boolean":
        case "number":
        case "string":
        case "symbol":
        case "undefined":
          return value
        case "object":
          if (value === null) {
            return value
          }

        case "function":
          // Proxy validates invariant of constructor and prototype
          if (property === "constructor" || property === "prototype")
            return value

        default:
          return internal(value as never, handlers, {
            unproxied: { target: value, parent: state.unproxied.target },
            context,
          })
      }
    },
  })
}
