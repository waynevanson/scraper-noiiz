import { config } from "dotenv"
import fs from "node:fs"
import path from "node:path"
import puppeteer from "puppeteer"
import zod from "zod"
import { createDownloadsAggregator } from "./downloads"
import { logger } from "./logger"
import { login } from "./login"
import { createTui } from "./tui"
import { getUrls } from "./urls"
import { downloadByUrl } from "./download"

const schema = zod.object({
  EMAIL: zod.string(),
  PASSWORD: zod.string(),
  CHROMIUM_EXECUTABLE_PATH: zod.string().optional(),
  MAX_CONCURRENT_DOWNLOADS: zod.number().min(1).optional().default(3),
})

logger.info("Setting up..")
const env = schema.parse(config({ processEnv: {} }).parsed)

const linear = () => {
  logger.on("info", console.log.bind(console))
  logger.on("warn", console.warn.bind(console))
  logger.on("error", console.error.bind(console))
}

const tui = createTui(logger, {
  title: "Sample Scraper",
})

export async function main() {
  const browser = await puppeteer.launch({
    executablePath: env.CHROMIUM_EXECUTABLE_PATH ?? undefined,
  })

  const page = await browser.newPage()

  // Smaller resolutions won't see the login button.
  await page.setViewport({ width: 1280, height: 720 })

  await page.goto("https://www.noiiz.com")

  logger.info("app:login")
  await login(page, {
    email: env.EMAIL,
    password: env.PASSWORD,
  })

  logger.info("Logged in!")
  await page.goto(
    "https://www.noiiz.com/sounds/packs?order=created_at&priority=asc"
  )

  const downloadPath = path.resolve("./.cache/downloads")

  let datas = await getUrls(page)

  datas = datas.filter((downloadable) => {
    const zip = path.join(
      downloadPath,
      downloadable.artist,
      downloadable.title + ".zip"
    )

    const rar = path.join(
      downloadPath,
      downloadable.artist,
      downloadable.title + ".rar"
    )

    return [zip, rar].every((filename) => !fs.existsSync(filename))
  })

  logger.info(JSON.stringify(datas, null, 2))

  await page.close()

  const aggregator = await createDownloadsAggregator(browser, {
    concurrency: env.MAX_CONCURRENT_DOWNLOADS,
    download: ({ browser, data }) => downloadByUrl(browser, data.url),
    downloads: datas,
    downloadPath,
  })

  tui.update(datas.length, env.MAX_CONCURRENT_DOWNLOADS)

  aggregator.start()

  await new Promise<void>((resolve) => {
    aggregator.target.addListener("downloads-complete", () => {
      resolve()
    })

    aggregator.target.addListener("download-in-progress", (event) => {
      const message = `${event.data.artist} - ${event.data.title}`
      tui.progress({
        message,
        status: "in-progress",
        percentage: event.receivedBytes / event.totalBytes,
        thread: event.thread,
      })
    })

    // need file name and GUID.
    aggregator.target.addListener("download-completed", (event) => {
      const ext = path.extname(new URL(event.resource).pathname)
      const filename = path.join(
        downloadPath,
        event.data.artist,
        event.data.title + ext
      )

      fs.mkdirSync(path.dirname(filename), { recursive: true })
      fs.renameSync(path.join(downloadPath, event.guid), filename)
    })
  })

  logger.info("Completed all downloads, closing browser")

  await browser.close()
}

main()
