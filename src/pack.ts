import { mkdirSync, readdirSync } from "fs"
import path from "path"
import { Page } from "playwright"
import { Contexts } from "./bin"
import { PackMetadata } from "./store"

export async function checkAndDownloadPack(
  page: Page,
  metadata: PackMetadata,
  contexts: Contexts
): Promise<{ promise: Promise<void> }> {
  const log = contexts.loggers.pack(metadata)
  log.info("Checking cache")

  const dir = contexts.paths.artist(metadata.artist)

  mkdirSync(dir, { recursive: true })

  const dirs = readdirSync(dir, { encoding: "utf-8" })

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

  async function next() {
    const extension = path.extname(download.suggestedFilename())
    const filename = contexts.paths.packed(
      metadata.artist,
      metadata.title,
      extension
    )

    await download.saveAs(filename)
    log.info(`Download complete`)
  }

  return { promise: next() }
}
