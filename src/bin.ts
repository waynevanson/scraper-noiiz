import path from "node:path"
import { BrowserContext, chromium } from "playwright"
import { saveCatalogueMetadata } from "./catalogue"
import { seriesparallel } from "./concurrent"
import { createEnvironment } from "./environment"
import { login } from "./login"
import { createStore, PackMetadata } from "./store"
import * as logs from "./logs"

async function main() {
  logs.main.info("Welcome!")
  const environment = createEnvironment()

  const store = createStore(path.join(environment.state, "db.json"))

  const downloadsPath = path.join(environment.state, "downloads")

  const browser = await chromium.launch({
    // headless: false,
    downloadsPath,
    logger: {
      isEnabled(name, severity) {
        return true
      },
      log(name, severity, message, args, hints) {
        logs.playwright[severity]({ kind: name, args }, message.toString())
      },
    },
  })

  const context = await browser.newContext({ baseURL: "https://www.noiiz.com" })
  const page = await context.newPage()

  await login(page, environment)
  await saveCatalogueMetadata(page, store)

  await page.close()

  const tasks = store.packs.map(
    (metadata) => () => downloadPack(context, metadata, downloadsPath)
  )

  await seriesparallel(environment.concurrency, tasks)

  await browser.close()
}

main()

async function downloadPack(
  context: BrowserContext,
  metadata: PackMetadata,
  downloads: string
) {
  const page = await context.newPage()
  await page.goto(metadata.path)
  const waiter = page.waitForEvent("download")

  const button = page.getByRole("button", { name: "Download" })
  await button.click({ delay: 5_000 })

  logs.main.info(`Downloading %s by %s`, metadata.title, metadata.artist)
  const download = await waiter

  return {
    promise: new Promise<void>(async (resolve) => {
      const extension = path.extname(download.suggestedFilename())
      const filename = metadata.title + extension
      const fullpath = path.join(
        downloads,
        "samples",
        metadata.artist,
        filename
      )

      await download.saveAs(fullpath)
      logs.main.info(`Downloaded %s by %s`, metadata.title, metadata.artist)

      await page.close()

      resolve()
    }),
  }
}
