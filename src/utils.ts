export type Sum<T extends Record<string, unknown>> = {
  [P in keyof T]: { type: P; value: T[P] }
}[keyof T]
