import { mkdirSync, readdirSync } from "fs"
import path from "path"
import { Page } from "playwright"
import { Contexts } from "./bin"
import { PackMetadata } from "./store"

export async function checkAndDownloadPack(
  page: Page,
  metadata: PackMetadata,
  count: number,
  contexts: Contexts
): Promise<void> {
  const log = contexts.loggers.pack(metadata, count)
  log.info("Checking cache")

  const dir = contexts.paths.createArtist(metadata.artist)

  mkdirSync(dir, { recursive: true })

  const dirs = readdirSync(dir, { encoding: "utf-8" })

  const exists = dirs.some((dir) => dir.startsWith(metadata.title + "."))

  if (exists) {
    log.info("Cache hit, skipping")
    return
  }

  log.info("Cache miss, applying")

  await page.goto(metadata.path.url)
  const waiter = page.waitForEvent("download")

  const button = page.getByRole("button", { name: "Download" })
  await button.click({ delay: 10_000 })

  const download = await waiter
  log.info("Download started")

  const extension = path.extname(download.suggestedFilename())
  const filename = metadata.path.fsWithoutExtension + extension

  await download.saveAs(filename)
  log.info(`Download complete`)
}
