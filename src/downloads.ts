import { Browser, Protocol } from "puppeteer"
import path from "node:path"
import fs from "node:fs"

export interface EventMap {
  started: Protocol.Browser.DownloadWillBeginEvent
  completed: Omit<Protocol.Browser.DownloadProgressEvent, "state">
  "in-progress": Omit<Protocol.Browser.DownloadProgressEvent, "state">
  canceled: Omit<Protocol.Browser.DownloadProgressEvent, "state">
}

export interface DownloadsManager {
  addEventListener<K extends keyof EventMap>(
    name: K,
    listener: (event: CustomEvent<EventMap[K]>) => void
  ): void

  removeEventListener<K extends keyof EventMap>(
    name: K,
    listener: (event: CustomEvent<EventMap[K]>) => void
  ): void

  dispatchEvent<K extends keyof EventMap>(event: CustomEvent<EventMap[K]>): void
}

export async function createDownloadsSession(browser: Browser) {
  const session = await browser.target().createCDPSession()

  const target: DownloadsManager = new EventTarget() as never

  fs.mkdirSync(path.resolve(".cache/downloads"), { recursive: true })

  await session.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    eventsEnabled: true,
    downloadPath: path.resolve(".cache/downloads"),
  })

  session.on("Browser.downloadWillBegin", (event) => {
    target.dispatchEvent(new CustomEvent("started", { detail: event }))
  })

  session.on("Browser.downloadProgress", (event) => {
    const name = event.state === "inProgress" ? "in-progress" : event.state

    //@ts-expect-error
    delete event.state

    const custom = new CustomEvent(name, { detail: event })

    target.dispatchEvent(custom)
  })

  return target
}
