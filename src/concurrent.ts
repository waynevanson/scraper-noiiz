import { main } from "./logs"

export async function concurrent<R, T extends ReadonlyArray<unknown>>(
  limit: number,
  inputs: ReadonlyArray<R>,
  tasks: { [P in keyof T]: (param: R) => Promise<T[P]> }
): Promise<T> {
  const results = [] as any
  const readies = Array.from({ length: limit }, () => true)
  const executing = new Set()

  for (const task of tasks) {
    // first <limit> needs to be 0-n, then after that it's based on what finishes.
    const readyIndex = readies.indexOf(true)

    if (readyIndex < 0) {
      throw new Error(`Expected ready index to be non-negative`)
    }

    readies[readyIndex] = false

    const input = inputs[readyIndex]

    const promise = task(input).then((result) => {
      results.push(result)
      executing.delete(promise)
      readies[readyIndex] = true
    })

    executing.add(promise)

    if (executing.size >= limit) {
      await Promise.race(executing)
    }
  }

  await Promise.all(executing)
  return results
}

// emit after runing in series
// then emit after 1 finishes
export async function seriesparallel(
  limit: number,
  tasks: Array<() => Promise<{ promise: Promise<unknown> }>>
): Promise<void> {
  main.info("%o", { limit, tasks: tasks.length })
  const promises: Set<Promise<unknown>> = new Set()

  for (const task of tasks) {
    const { promise } = await task()
    promises.add(promise)

    if (promises.size >= limit) {
      await Promise.race(promises)
    }
  }

  await Promise.all(promises)
}
