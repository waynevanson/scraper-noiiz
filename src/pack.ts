import { readdirSync } from "fs"
import path from "path"
import { BrowserContext, Page } from "playwright"
import * as logs from "./logs"
import { PackMetadata } from "./store"

export async function checkAndDownloadPack(
  page: Page,
  metadata: PackMetadata,
  downloads: string
) {
  const log = logs.base.child({ name: `${metadata.artist}/${metadata.title}` })
  log.info("Checking cache")

  const fullArtistDir = path.resolve(downloads, "samples", metadata.artist)

  const dirs = readdirSync(fullArtistDir, { encoding: "utf-8" })

  const exists = dirs.some((dir) => dir.startsWith(metadata.title + "."))

  if (exists) {
    log.info("Cache hit, skipping")
    return { promise: Promise.resolve() }
  }

  log.info("Cache miss, applying")

  await page.goto(metadata.path)
  const waiter = page.waitForEvent("download")

  const button = page.getByRole("button", { name: "Download" })
  await button.click({ delay: 15_000 })

  const download = await waiter
  log.info("Download started")

  return {
    promise: new Promise<void>(async (resolve) => {
      const absoluteBasePath = path.resolve(fullArtistDir, metadata.title)
      const extension = path.extname(download.suggestedFilename())
      const filename = absoluteBasePath + extension

      await download.saveAs(filename)
      log.info(`Download complete`)

      resolve()
    }),
  }
}
