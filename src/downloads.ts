import { Browser, Protocol } from "puppeteer"
import path from "node:path"
import { EventEmitter } from "node:events"
import { ProgressPayload } from "./tui"
import { InputTypeOfTuple } from "zod"
import { Sum } from "./utils"

export type ProgressEventStateless = Omit<
  Protocol.Browser.DownloadProgressEvent,
  "state"
>

export interface DownloadsSessionEventMap {
  starting: [Protocol.Browser.DownloadWillBeginEvent]
  completed: [ProgressEventStateless]
  "in-progress": [ProgressEventStateless]
  canceled: [ProgressEventStateless]
}

export interface DownloadSessionOptions
  extends Pick<
    Partial<Protocol.Browser.SetDownloadBehaviorRequest>,
    "downloadPath" | "behavior"
  > {}

export async function createDownloadsSession(
  browser: Browser,
  options: DownloadSessionOptions = {}
): Promise<EventEmitter<DownloadsSessionEventMap>> {
  if (
    options.downloadPath !== undefined &&
    !path.isAbsolute(options.downloadPath)
  ) {
    throw new Error(
      `Expected \`downloadPath\` to be an absolute path, but received ${options.downloadPath}`
    )
  }

  const session = await browser.target().createCDPSession()

  await session.send("Browser.setDownloadBehavior", {
    behavior: options.behavior ?? "default",
    eventsEnabled: true,
    downloadPath: options.downloadPath,
    browserContextId: browser.target().browserContext().id,
  })

  const target = new EventEmitter<DownloadsSessionEventMap>()

  // todo: this should be starting,
  session.on("Browser.downloadWillBegin", (event) => {
    target.emit("starting", event)
  })

  // split 1 event into 3 events
  session.on("Browser.downloadProgress", (event) => {
    const name = event.state === "inProgress" ? "in-progress" : event.state

    //@ts-expect-error
    delete event.state

    target.emit(name, event)
  })

  return target
}

export interface DownloadsAggregatorEventMap<Input> {
  "download-trigger-started": [{ trigger: number; data: Input }]
  "download-trigger-completed": [{ trigger: number; data: Input; url: string }]
  "download-started": [
    Protocol.Browser.DownloadWillBeginEvent & { position: number }
  ]

  "download-in-progress": [
    ProgressEventStateless & {
      data?: Input
      position: number
      trigger?: number
      url: string
    }
  ]
  "download-completed": [
    ProgressEventStateless & {
      data?: Input
      position: number
      trigger?: number
      url: string
    }
  ]
  "downloads-complete": []
  // "download-canceled": [ProgressEventStateless]
}

export interface DownloadContext<Input> {
  browser: Browser
  data: Input
  index: number
}

export interface DownloadAggregatorOptions<Input>
  extends Pick<DownloadSessionOptions, "downloadPath"> {
  downloads: Array<Input>
  download: (context: DownloadContext<Input>) => Promise<string>
  concurrency: number
}

export async function createDownloadsAggregator<
  Input extends NonNullable<unknown>
>(
  browser: Browser,
  options: DownloadAggregatorOptions<Input>
): Promise<EventEmitter<DownloadsAggregatorEventMap<Input>>> {
  if (options.concurrency < 1) {
    throw new Error(
      `Expected concurrency to be greater than 0 but received ${options.concurrency}`
    )
  }

  if (options.downloads.length < 1) {
    throw new Error(
      `Expected there do be atleast one download but received ${options.downloads.length}`
    )
  }

  const session = await createDownloadsSession(browser, {
    behavior: "allowAndName",
    downloadPath: options.downloadPath,
  })

  const target = new EventEmitter<DownloadsAggregatorEventMap<Input>>()

  interface State<Input> {
    cursor: Record<"trigger" | "completed" | "position", number>
    lifecycles: {
      triggered: Array<{ data: Input; trigger: number; url: string }>
      started: Record<string, { position: number; url: string }>
    }
    triggers: Array<Promise<unknown>>
  }

  const state: State<Input> = {
    cursor: {
      trigger: 0,
      completed: 0,
      position: 0,
    },
    lifecycles: {
      triggered: [],
      started: {},
    },
    triggers: [],
  }

  async function download() {
    const trigger = state.cursor.trigger++
    const data = options.downloads[trigger]

    target.emit("download-trigger-started", { data, trigger })

    const url = await options.download({ browser, data, index: trigger })

    const payload = { data, trigger, url }

    state.lifecycles.triggered.push(payload)

    target.emit("download-trigger-completed", payload)
  }

  const handlers: {
    [P in keyof DownloadsSessionEventMap]: (
      ...args: DownloadsSessionEventMap[P]
    ) => void
  } = {
    starting: (event) => {
      const position = state.cursor.position++

      target.emit("download-started", { ...event, position })

      state.lifecycles.started[event.guid] = { position, url: event.url }

      target.emit("download-started", { ...event, position })
    },

    "in-progress": (event) => {
      const { position, url } = state.lifecycles.started[event.guid]!

      const triggered =
        state.lifecycles.triggered.find((item) => item.url === url) ?? {}

      target.emit("download-in-progress", {
        ...event,
        ...triggered,
        position,
        url,
      })
    },

    completed: async (event) => {
      state.cursor.completed++

      const { position, url } = state.lifecycles.started[event.guid]!

      const triggered =
        state.lifecycles.triggered.find((item) => item.url === url) ?? {}

      target.emit("download-completed", {
        ...event,
        ...triggered,
        position,
        url,
      })

      // downloads have all complete, resolve promise.
      if (state.cursor.completed >= options.downloads.length)
        return await cleanup()

      await download()
    },
    canceled: () => {},
  }

  function setup() {
    Object.entries(handlers).map(([name, listener]) =>
      session.on(name, listener as never)
    )
  }

  function start() {
    const count = Math.min(options.concurrency, options.downloads.length)

    for (let i = 0; i < count; i++) {
      state.triggers.push(download())
    }
  }

  async function cleanup() {
    await Promise.all(state.triggers)

    Object.entries(handlers).map(([name, listener]) =>
      session.off(name, listener as never)
    )

    target.emit("downloads-complete")
  }

  setup()
  start()

  return target
}
