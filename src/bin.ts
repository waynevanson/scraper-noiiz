import puppeteer_, { Browser, Page } from "puppeteer"
import { config } from "dotenv"
import zod from "zod"
import fs from "node:fs"
import { createDownloadsSession } from "./downloads"
import { login } from "./login"
import { logger } from "./logger"
import { createProxyLogger } from "./proxy-logger"

const puppeteer = createProxyLogger(puppeteer_, {
  name: "puppeteer",
  log: (message) => logger.trace(message),
})

const schema = zod.object({
  EMAIL: zod.string(),
  PASSWORD: zod.string(),
  CHROMIUM_EXECUTABLE_PATH: zod.string().optional(),
  MAX_CONCURRENT_DOWNLOADS: zod.number().min(1).optional().default(3),
})

async function downloadByUrl(browser: Browser, url: string) {
  const page = await browser.newPage()

  await page.goto(url)

  await page.waitForNetworkIdle()

  const download = await page.waitForSelector(
    'button[class~="download-button"]'
  )

  if (!download) {
    throw new Error(`Unable to find download button for url ${url}`)
  }

  await download.click()

  await page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname.endsWith(".zip")
  })

  await page.close()
}

interface Downloadable {
  artist: string
  title: string
  url: string
}

async function getUrls(page: Page): Promise<Array<Downloadable>> {
  logger.info("Getting urls")

  const exists = fs.existsSync(".cache/urls.json")

  if (!exists) {
    const results = []

    while (true) {
      await page.waitForNetworkIdle()

      const pagination = await page.waitForSelector(
        'ul[class~="v-pagination"]',
        { visible: true }
      )

      if (!pagination) {
        throw new Error("Pagination element not found")
      }

      const urls = await page.$$eval(
        '[class~="grid--packs-list"] a[href]',
        (elements) =>
          elements
            .map((element) => {
              const path = element.getAttribute("href")!
              const url = new URL(path, "https://www.noiiz.com").toString()
              const texts =
                element.querySelectorAll('[class~="grid__item__link-text"]') ??
                []
              const [title, artist] = Array.from(texts).map(
                (element) => element.textContent
              )

              return { title, artist, url }
            })
            .map((path) => path)
      )

      results.push(...urls)

      const [_previous, next] = await pagination.$$(
        'ul[class~="v-pagination"] button[class~="v-pagination__navigation"]'
      )

      const isLast = await next.evaluate((element) =>
        element.classList.contains("v-pagination__navigation--disabled")
      )

      logger.info("Page scraped during pagination")

      if (isLast) break

      await next.click()
    }

    fs.mkdirSync(".cache", { recursive: true })

    fs.writeFileSync(".cache/urls.json", JSON.stringify(results, null, 2))
  } else {
    logger.info("Getting urls from file system")
  }

  return JSON.parse(
    fs.readFileSync(".cache/urls.json", { encoding: "utf-8" })
  ) as never
}

export async function main() {
  logger.info("Setting up..")
  logger.trace("dotenv:parse")
  const env = schema.parse(config({ processEnv: {} }).parsed)

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

  const urls = await getUrls(page)

  await page.close()

  // todo - how to check what is left to download?
  // I might have to keep a map between the url and file name.
  // so the cache isn't the files, it would be this application.
  // I can also get other details when scraping initially.

  // I think we're gonna need a confidence search for a match.
  // if it's above like 70% then it's a match right fam?

  const downloads = await createDownloadsSession(browser)

  await new Promise<void>((resolve) => {
    let index = 0
    let downloaded = 0

    const progresses = new Map()

    const interval = setInterval(() => {
      if (progresses.size <= 0) return

      const percentages = Array.from(progresses.entries())
        .sort(([left], [right]) => right - left)
        .map(([guid, percentage]) => percentage)
        .join(" ")

      logger.info(percentages)
    }, 1000 * 60)

    downloads.addEventListener("in-progress", (event) => {
      progresses.set(
        event.detail.guid,
        (100 * (event.detail.receivedBytes / event.detail.totalBytes))
          .toString()
          .padStart(3, " ")
          .slice(0, 5)
          .concat("%")
      )
    })

    downloads.addEventListener("completed", async (event) => {
      downloaded++

      progresses.delete(event.detail.guid)

      logger.info(`Completed download ${downloaded} of ${urls.length}`)

      if (downloaded >= urls.length) {
        clearInterval(interval)
        resolve()
        return
      }

      const downloadable = urls[index]!
      index++

      logger.info(`Initiating download ${index} of ${urls.length}`)

      await downloadByUrl(browser, downloadable.url)

      logger.info(`Starting download ${index} of ${urls.length}`)
    })

    logger.info(
      `Initiating ${env.MAX_CONCURRENT_DOWNLOADS} downloads of ${urls.length}`
    )
    // trigger the max amount of downloads to begin with
    urls
      .slice(0, env.MAX_CONCURRENT_DOWNLOADS)
      .forEach((downloadable) => downloadByUrl(browser, downloadable.url))

    index += env.MAX_CONCURRENT_DOWNLOADS
  })

  logger.info("Completed all downloads, closing browser")

  await browser.close()
}

main()
