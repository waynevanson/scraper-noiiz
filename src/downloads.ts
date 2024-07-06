import { Browser, Protocol } from "puppeteer"
import path from "node:path"
import { EventEmitter } from "node:events"

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
  "downloads-started": [Protocol.Browser.DownloadWillBeginEvent]
  "downloads-in-progress": [
    Record<string, { data: Input; percentage: number; resource: string }>
  ]
  "downloads-completed": []
  // "downloads-canceled": []

  "download-started": [Protocol.Browser.DownloadWillBeginEvent]
  "download-completed": [ProgressEventStateless]
  "download-in-progress": [ProgressEventStateless]
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

  session.once("started", (event) => {
    target.emit("downloads-started", event)
  })

  session.on("started", handleStarted)
  session.on("in-progress", handleInProgress)
  session.on("completed", handleCompleted)

  function cleanup() {
    session.off("started", handleStarted)
    session.off("in-progress", handleInProgress)
    session.off("completed", handleCompleted)

    target.emit("downloads-completed")
  }

  const state = {
    index: 0,
    downloaded: 0,

    dataByIndex: new Map<number, Input>(),
    guidByResource: new Map<string, string>(),
    progressByGuid: new Map<string, number>(),
    indexByResource: new Map<string, number>(),
    resourceByGuid: new Map<string, string>(),
  }

  const total = options.downloads.length

  function handleStarted(...args: DownloadsSessionEventMap["started"]) {
    target.emit("download-started", ...args)

    const event = args[0]
    state.guidByResource.set(event.url, event.guid)
    state.resourceByGuid.set(event.guid, event.url)
  }

  function handleInProgress(...args: DownloadsSessionEventMap["in-progress"]) {
    target.emit("download-in-progress", ...args)

    const event = args[0]

    state.progressByGuid.set(
      event.guid,
      (event.receivedBytes / event.totalBytes) * 100
    )

    const progresses = Array.from(state.guidByResource.entries()).reduce(
      (accu, [resource, guid]) => {
        const index = state.indexByResource.get(resource)
        if (index === undefined) return accu

        const data = state.dataByIndex.get(index)

        const percentage = state.progressByGuid.get(guid)

        if (data === undefined || percentage === undefined) return accu

        accu[guid] = { data, percentage, resource }

        return accu
      },
      {} as DownloadsAggregatorEventMap<Input>["downloads-in-progress"][0]
    )

    target.emit("downloads-in-progress", progresses)
  }

  async function handleCompleted(
    ...args: DownloadsSessionEventMap["completed"]
  ) {
    target.emit("download-completed", ...args)

    const event = args[0]
    state.downloaded++

    const resource = state.resourceByGuid.get(event.guid)!
    state.resourceByGuid.delete(event.guid)

    state.guidByResource.delete(resource)
    state.progressByGuid.delete(event.guid)

    const index = state.indexByResource.get(resource)!
    state.indexByResource.delete(resource)

    state.dataByIndex.delete(index)

    // downloads have all complete, resolve promise.
    if (state.downloaded >= total) return cleanup()

    await download()
  }

  async function download() {
    const index = state.index++
    const data = options.downloads[index]

    state.dataByIndex.set(index, data)

    const resource = await options.download({ browser, data, index })
    state.indexByResource.set(resource, index)
  }

  function start() {
    for (let i = 0; i < options.concurrency; i++) {
      download()
    }
  }

  return { target, start }
}
