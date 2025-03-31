import { chromium, Locator, Page } from "playwright"
import { config as dotenv } from "dotenv"
import * as zod from "zod"
import { createSync } from "./sync"

interface Environment {
  email: string
  password: string
}

function getEnv(): Environment {
  const env = dotenv({ processEnv: {} })

  if (env.error) {
    throw env.error
  }

  const schema = zod.strictObject({
    email: zod.string(),
    password: zod.string(),
  })

  const validation = schema.parse(env.parsed)

  return validation
}

type PackMetadata = Record<"path" | "artist" | "title", string>

export interface Model {
  packs: Array<PackMetadata>
}

// go through each page of 48 items.
// get metadata for all samples.
async function main() {
  const env = getEnv()
  const db = createSync<Model>(".state/db.json", {
    packs: [],
  })

  const browser = await chromium.launch({
    headless: false,
    downloadsPath: ".state/downloads",
  })

  const page = await browser.newPage({ baseURL: "https://www.noiiz.com" })

  await login(page, env)

  // packs page start
  await page.goto("/sounds/packs?order=created_at&priority=asc")

  const pagination = page.locator("ul.pagination")
  const active = pagination.locator('button[class~="--active"]')
  const last = pagination.locator("button:nth-last-child(2)")
  const next = pagination.locator("button:nth-last-child(1)")

  console.info("Finding links..")

  const links = await findLinks(page)

  console.info("Iterating links..")

  for (const link of links) {
    const metadata = await findMetadata(link)

    console.log(metadata)
  }

  await browser.close()
}

async function login(page: Page, env: Environment) {
  await page.goto("")

  const form = page.getByRole("link", { name: "Log in" })
  const email = page.getByRole("textbox", { name: "email" })
  const password = page.getByRole("textbox", { name: "password" })
  const submit = page.getByRole("button", { name: "Sign in" })

  await form.click()
  await email.fill(env.email)
  await password.fill(env.password)

  const waiter = page.waitForResponse(
    (response) =>
      /\/users\/sign_in/.test(response.url()) &&
      response.request().method() === "POST"
  )

  await submit.click()

  console.info("Logging in...")
  await waiter
  console.info("Logged in!")
}

// get all packs on page,
// save all metadata to this.
async function findLinks(page: Page): Promise<Array<Locator>> {
  return page.locator('a[href*="/sounds/packs/"]').all()
}

async function findMetadata(link: Locator): Promise<PackMetadata> {
  const texts = link.locator("div > div:nth-of-type(2)")

  const [path, title, artist] = await Promise.all([
    link.getAttribute("href"),
    texts.locator("span:nth-of-type(1)").textContent(),
    texts.locator("span:nth-of-type(2)").textContent(),
  ])

  if (!path || !title || !artist) {
    throw new Error(`Expected href, title or artist for a pack to be defined`)
  }

  return { path, title, artist }
}

main()
