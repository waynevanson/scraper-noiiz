export interface Delegate<T> extends Promise<T> {
  resolve(value: T): void
  reject(reason?: any): void
  status(): "pending" | "resolved" | "rejected"
}

export function delegate<T = void>(): Delegate<T> {
  let status: "pending" | "resolved" | "rejected"

  let resolve: (value: T) => void
  let reject: (reason?: any) => void

  const promise = new Promise<T>((resolver, rejecter) => {
    status = "pending"

    resolve = (value) => {
      status = "resolved"
      resolver(value)
    }

    reject = (reason) => {
      status = "rejected"
      rejecter(reason)
    }
  })

  return Object.assign(promise, {
    resolve: resolve!,
    reject: reject!,
    status() {
      return status
    },
  })
}
