import puppeteer_, { Browser, Page } from "puppeteer"
import { config } from "dotenv"
import zod from "zod"
import fs from "node:fs"
import { createDownloadsAggregator, createDownloadsSession } from "./downloads"
import { login } from "./login"
import { logger } from "./logger"
import { meta } from "./proxy-meta"
import path from "node:path"

const proxier =
  (log: (message: string) => void) =>
  <T extends {}>(target: T): T =>
    meta(
      target,
      {
        apply: {
          before: ({ target, context }) => {
            //@ts-expect-error
            const name = `${context.name ?? target.name}()`

            log(name)

            return { name }
          },
        },
        construct: {
          before: ({ target }) => {
            const name = `new ${target.constructor}.`

            log(name)

            return { name }
          },
        },
        get: {
          before: ({ property, context }) => {
            const prefix = context.name ? `${context.name}.` : ""
            const name = `${prefix}${property}`

            return { name }
          },
        },
      },
      { name: "" }
    )

const proxer = proxier((message) => logger.trace(message))

// const puppeteer = proxer(puppeteer_)
const puppeteer = puppeteer_

const schema = zod.object({
  EMAIL: zod.string(),
  PASSWORD: zod.string(),
  CHROMIUM_EXECUTABLE_PATH: zod.string().optional(),
  MAX_CONCURRENT_DOWNLOADS: zod.number().min(1).optional().default(3),
})

async function downloadByUrl(browser: Browser, url: string): Promise<string> {
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

  const response = await page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname.endsWith(".zip")
  })

  await page.close()

  return response.url()
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
              const [title, artist] = Array.from(texts).map((element) =>
                element.textContent?.trim()
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
  logger.debug("dotenv:parse")
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

  const downloadPath = path.resolve("./.cache/downloads")

  let datas = await getUrls(page)

  datas = datas.filter((downloadable) => {
    const filename = path.join(
      downloadPath,
      downloadable.artist,
      downloadable.title,
      ".zip"
    )

    return !fs.existsSync(filename)
  })

  await page.close()

  const aggregator = await createDownloadsAggregator(browser, {
    concurrency: 3,
    download: ({ browser, data }) => downloadByUrl(browser, data.url),
    downloads: datas,
    downloadPath,
  })

  aggregator.start()

  // rename files?
  await new Promise<void>((resolve) => {
    aggregator.target.addListener("downloads-completed", () => {
      resolve()
    })

    aggregator.target.addListener("downloads-in-progress", (event) => {
      const message = Object.entries(event)
        .sort(([left], [right]) => right.localeCompare(left))
        .map(([_guid, download]) => {
          const integer = Math.trunc(download.percentage)
            .toString()
            .slice(0, 3)
            .padStart(3, " ")
          const decimal = ((download.percentage % 1) * 2)
            .toString()
            .slice(0, 2)
            .padEnd(2, "0")
          const percentage = integer + decimal + "%"
          const filename = [
            download.data.artist,
            download.data.title.slice(0, 8).concat("..."),
          ].join("/")
          const message = [filename, percentage].join(" ")
          return message
        })
        .join(", ")

      logger.info(message)
    })

    // need file name and GUID.
    aggregator.target.addListener("download-completed", (event) => {
      const filename = path.join(
        downloadPath,
        event.data.artist,
        event.data.title,
        ".zip"
      )

      fs.mkdirSync(path.dirname(filename), { recursive: true })
      fs.renameSync(path.join(downloadPath, event.guid), filename)
    })
  })

  logger.info("Completed all downloads, closing browser")

  await browser.close()
}

main()
