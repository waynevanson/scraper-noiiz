import { Browser, Product, Protocol } from "puppeteer"

export interface EventMap {
  started: Protocol.Browser.DownloadWillBeginEvent
  completed: Omit<Protocol.Browser.DownloadProgressEvent, "state">
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

  await session.send("Browser.setDownloadBehavior", {
    behavior: "default",
    eventsEnabled: true,
  })

  session.on("Browser.downloadWillBegin", (event) => {
    target.dispatchEvent(new CustomEvent("started", { detail: event }))
  })

  session.on("Browser.downloadProgress", (event) => {
    if (event.state === "completed") {
      //@ts-expect-error
      delete detail.state
      target.dispatchEvent(new CustomEvent("completed", { detail: event }))
    }
  })

  return target
}
