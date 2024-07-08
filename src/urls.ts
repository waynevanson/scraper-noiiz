import fs from "node:fs"
import { Page } from "puppeteer"
import { logger } from "./logger"

interface Downloadable {
  artist: string
  title: string
  url: string
}

export async function getUrls(page: Page): Promise<Array<Downloadable>> {
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
                element.textContent?.trim().replaceAll(/\s*\/+/, ":")
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
