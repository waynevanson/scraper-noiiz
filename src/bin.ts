import puppeteer, { Browser, Page } from "puppeteer"
import { config } from "dotenv"
import zod from "zod"
import fs from "node:fs"

type Credentials = Record<"email" | "password", string>

const schema = zod.object({
  EMAIL: zod.string(),
  PASSWORD: zod.string(),
  CHROMIUM_EXECUTABLE_PATH: zod.string().optional(),
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

  console.info(`Searching for download button`)
  const download = await page.waitForSelector(
    'button[class~="download-button"]'
  )

  if (!download) {
    console.info(`Download button missing`)

    throw new Error(`Unable to find download button for url ${url}`)
  }

  console.info(`Found download button`)

  await download.click()

  console.info("Download button clicked")

  console.info("Waiting for download to start")
  // todo - return true when download starts
  await page.waitForResponse((response) => {
    const url = new URL(response.url())

    return url.hostname.includes("cloudfront") && url.pathname.endsWith(".zip")
  })

  console.info("Download started")

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

async function getRemainingDownloads(page: Page) {
  const manager = await page.waitForSelector("downloads-manager")

  if (!manager) {
    throw new Error("Could not find the download manager in the downloads page")
  }

  // do every 5 seconds until theres "none" remaining.
  // todo - allow multiple downloads at once.
  return await manager.evaluate((manager) => {
    const items = Array.from(
      manager.shadowRoot!.querySelectorAll("downloads-item")
    )

    const remaining = items.filter(
      (download) =>
        !download.shadowRoot!.querySelector(
          '[class~="description"][description-color][hidden]'
        )
    ).length

    return remaining ?? 0
  })
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

  const main = await browser.newPage()

  // Smaller resolutions won't see the login button.
  await main.setViewport({ width: 1280, height: 720 })

  await main.goto("https://www.noiiz.com")

  await login(main, credentials)

  await main.goto(
    "https://www.noiiz.com/sounds/packs?order=created_at&priority=asc"
  )

  const urls = await getUrls(main)

  const downloads = await browser.newPage()

  await downloads.goto("chrome://downloads")

  for await (const url of urls) {
    const remaining = await until(async () => {
      const remaining = await getRemainingDownloads(downloads)
      return { value: remaining, done: remaining <= 0 }
    }, 5_000)

    await downloadByUrl(browser, url)
  }

  await browser.close()
}

main()

async function until<Value>(
  callback: () => Promise<
    { value: Value; done: true } | { value?: Value; done: false }
  >,
  ms: number = 1_000
): Promise<Value> {
  return new Promise<Value>((resolve) => {
    const id = setInterval(async () => {
      const result = await callback()

      if (!result.done) return

      clearInterval(id)

      resolve(result.value)
    }, ms)
  })
}
