import path from "node:path"
import { BrowserContext, chromium, Page } from "playwright"
import { saveCatalogueMetadata } from "./catalogue"
import { createEnvironment } from "./environment"
import { login } from "./login"
import { createStore, PackMetadata } from "./store"
import { seriesparallel } from "./concurrent"

async function main() {
  const environment = createEnvironment()

  const store = createStore(path.join(environment.state, "db.json"))

  const downloadsPath = path.join(environment.state, "downloads")

  const browser = await chromium.launch({
    headless: true,
    downloadsPath,
  })

  const context = await browser.newContext({ baseURL: "https://www.noiiz.com" })
  const page = await context.newPage()

  await login(page, environment)
  await saveCatalogueMetadata(page, store)

  await page.close()

  // todo: download stufs

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

  console.log(`Downloading %s by %s`, metadata.title, metadata.artist)
  const download = await waiter
  await page.close()

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
      console.log(`Downloaded %s by %s`, metadata.title, metadata.artist)

      resolve()
    }),
  }
}
