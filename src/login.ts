import { Page } from "puppeteer"

export type Credentials = Record<"email" | "password", string>

export async function login(page: Page, credentials: Credentials) {
  console.info(`Logging in as ${credentials.email}`)

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

  console.info(`Logged in as ${credentials.email}`)
}
