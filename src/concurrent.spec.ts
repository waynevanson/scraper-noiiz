import { seriesparallel } from "./concurrent"
import { describe, test, expect, vi } from "vitest"
import { Delegate, delegate } from "./delegate"

describe(seriesparallel, () => {
  test("classic", async () => {
    let first: Delegate<{ promise: Delegate<void> }>
    let second: Delegate<{ promise: Delegate<void> }>
    let third: Delegate<void>
    let fourth: Delegate<void>

    const promise = seriesparallel(1, [
      () => {
        first = delegate<{ promise: Delegate<void> }>()
        return first
      },
      () => {
        second = delegate<{ promise: Delegate<void> }>()
        return second
      },
    ])

    expect(first!.status()).toBe("pending")
    expect(second!).not.toBeDefined()
    expect(third!).not.toBeDefined()
    expect(fourth!).not.toBeDefined()

    first!.resolve({ promise: (third = delegate()) })

    expect(first!.status()).toBe("resolved")
    expect(second!).not.toBeDefined()
    expect(third!.status()).toBe("pending")
    expect(fourth!).not.toBeDefined()

    third.resolve()

    expect(first!.status()).toBe("resolved")
    expect(third!.status()).toBe("resolved")
    await vi.waitFor(() => expect(second!.status()).toBe("pending"))
    expect(fourth!).not.toBeDefined()

    second!.resolve({ promise: (fourth = delegate()) })

    expect(first!.status()).toBe("resolved")
    expect(third!.status()).toBe("resolved")
    expect(second!.status()).toBe("resolved")
    expect(fourth!.status()).toBe("pending")

    fourth.resolve()

    expect(first!.status()).toBe("resolved")
    expect(third!.status()).toBe("resolved")
    expect(second!.status()).toBe("resolved")
    expect(fourth!.status()).toBe("resolved")

    expect(promise).resolves.toBeUndefined()
  })
})
