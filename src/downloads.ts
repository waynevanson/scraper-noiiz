import { Browser, Protocol } from "puppeteer"
import path from "node:path"
import { EventEmitter } from "node:events"
import { ProgressPayload } from "./tui"

export type ProgressEventStateless = Omit<
  Protocol.Browser.DownloadProgressEvent,
  "state"
>

export interface DownloadsSessionEventMap {
  started: [Protocol.Browser.DownloadWillBeginEvent]
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
    target.emit("started", event)
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
  "download-started": [Protocol.Browser.DownloadWillBeginEvent]
  "download-in-progress": [
    ProgressEventStateless & { thread: number; data: Input }
  ]
  "download-completed": [
    ProgressEventStateless & { thread: number; data: Input; resource: string }
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
): Promise<{
  start: () => void
  target: EventEmitter<DownloadsAggregatorEventMap<Input>>
}> {
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

  session.on("started", handleStarted)
  session.on("in-progress", handleInProgress)
  session.on("completed", handleCompleted)

  function cleanup() {
    session.off("started", handleStarted)
    session.off("in-progress", handleInProgress)
    session.off("completed", handleCompleted)

    target.emit("downloads-complete")
  }

  const state = {
    index: 0,
    downloaded: 0,
    befores: {} as Record<string, { data: Input }>,
    middles: {} as Record<string, { data: Input; resource: string }>,
    afters: {} as Record<
      string,
      { data: Input; guid: string; resource: string }
    >,
  }

  const total = options.downloads.length

  async function download() {
    const thread = state.index++
    const data = options.downloads[thread]

    state.befores[thread] = { data }

    const resource = await options.download({ browser, data, index: thread })

    state.middles[thread] = { data, resource }
  }

  function handleStarted(...args: DownloadsSessionEventMap["started"]) {
    target.emit("download-started", ...args)

    const event = args[0]

    const middled = Object.entries(state.middles).find(
      ([thread, middle]) => middle.resource === event.url
    )

    if (middled == null) return

    const [thread, middle] = middled

    state.afters[thread] = { ...middle, guid: event.guid }
  }

  function handleInProgress(...args: DownloadsSessionEventMap["in-progress"]) {
    const event = args[0]
    const aftered = Object.entries(state.afters).find(
      ([thread, after]) => after.guid === event.guid
    )!

    if (aftered == null) return

    const [thread, after] = aftered

    const { data } = after

    target.emit("download-in-progress", {
      ...event,
      thread: Number(thread),
      data,
    })
  }

  async function handleCompleted(
    ...args: DownloadsSessionEventMap["completed"]
  ) {
    const event = args[0]

    state.downloaded++

    const [thread, after] = Object.entries(state.afters).find(
      ([thread, after]) => after.guid === event.guid
    )!

    target.emit("download-completed", {
      ...event,
      data: after.data,
      resource: after.resource,
      thread: Number(thread),
    })

    // downloads have all complete, resolve promise.
    if (state.downloaded >= total) return cleanup()

    await download()
  }

  function start() {
    for (
      let i = 0;
      i < Math.min(options.concurrency, options.downloads.length);
      i++
    ) {
      download()
    }
  }

  return { target, start }
}
