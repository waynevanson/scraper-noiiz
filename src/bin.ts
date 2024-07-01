import puppeteer, { Browser, Page } from "puppeteer"
import { config } from "dotenv"
import zod from "zod"
import fs from "node:fs"
import { createDownloadsSession } from "./downloads"

type Credentials = Record<"email" | "password", string>

const schema = zod.object({
  EMAIL: zod.string(),
  PASSWORD: zod.string(),
  CHROMIUM_EXECUTABLE_PATH: zod.string().optional(),
  MAX_CONCURRENT_DOWNLOADS: zod.number().min(1).optional().default(3),
})

async function wait(time: number) {
  console.info(`Waiting for ${time} milliseconds to pass`)

  await new Promise((resolve) => setTimeout(resolve, time))

  console.info(`${time} milliseconds has pass`)
}

async function login(page: Page, credentials: Credentials) {
  const login = await page.waitForSelector(
    '[class~="account-navigation"] > [class~="login-link"]'
  )

  if (!login) {
    throw new Error("Unable to find button to enter login details")
  }

  await login.click()

  const email = await page.waitForSelector('input[name="email"]')

  if (!email) {
    throw new Error("Unable to find email input element")
  }

  await email.type(credentials.email)

  const password = await page.$('input[name="password"]')

  if (!password) {
    throw new Error("Unable to find email input element")
  }

  await password.type(credentials.password)

  await password.focus()

  await page.keyboard.press("Enter")

  await page.waitForNetworkIdle({ idleTime: 2_000 })
}

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

async function getUrls(page: Page) {
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
            .map((element) => element.getAttribute("href")!)
            .map((path) => new URL(path, "https://www.noiiz.com").toString())
      )

      results.push(...urls)

      const [_previous, next] = await pagination.$$(
        'ul[class~="v-pagination"] button[class~="v-pagination__navigation"]'
      )

      const isLast = await next.evaluate((element) =>
        element.classList.contains("v-pagination__navigation--disabled")
      )

      if (isLast) break

      await next.click()
    }

    fs.mkdirSync(".cache", { recursive: true })

    fs.writeFileSync(".cache/urls.json", JSON.stringify(results, null, 2))
  }

  return JSON.parse(
    fs.readFileSync(".cache/urls.json", { encoding: "utf-8" })
  ) as Array<string>
}

export async function main() {
  const env = schema.parse(config({ processEnv: {} }).parsed)

  const credentials: Credentials = {
    email: env.EMAIL,
    password: env.PASSWORD,
  }

  const browser = await puppeteer.launch({
    executablePath: env.CHROMIUM_EXECUTABLE_PATH ?? undefined,
    headless: false,
    // devtools: true,
  })

  const page = await browser.newPage()

  // Smaller resolutions won't see the login button.
  await page.setViewport({ width: 1280, height: 720 })

  await page.goto("https://www.noiiz.com")

  await login(page, credentials)

  await page.goto(
    "https://www.noiiz.com/sounds/packs?order=created_at&priority=asc"
  )

  const urls = await getUrls(page)

  await page.close()

  // todo - how to check what is left to download?
  // I might have to keep a map between the url and file name.
  // so the cache isn't the files, it would be this application.
  // I can also get other details when scraping initially.

  const downloads = await createDownloadsSession(browser)

  await new Promise<void>((resolve) => {
    let index = 0
    let downloaded = 0

    downloads.addEventListener("completed", () => {
      downloaded++

      if (downloaded >= urls.length) return resolve()

      const url = urls[index]!
      index++

      downloadByUrl(browser, url)
    })

    // trigger the max amount of downloads to begin with
    urls
      .slice(0, env.MAX_CONCURRENT_DOWNLOADS)
      .forEach((url) => downloadByUrl(browser, url))

    index += env.MAX_CONCURRENT_DOWNLOADS
  })

  await browser.close()
}

main()
