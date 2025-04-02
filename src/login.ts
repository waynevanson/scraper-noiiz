import { Page } from "playwright"
import { Environment } from "./environment"
import { log } from "./log"

export async function login(page: Page, env: Environment) {
  await page.goto("")

  const form = page.getByRole("link", { name: "Log in" })
  const email = page.getByRole("textbox", { name: "email" })
  const password = page.getByRole("textbox", { name: "password" })
  const submit = page.getByRole("button", { name: "Sign in" })

  await form.click()
  await email.fill(env.email)
  await password.fill(env.password)

  const regexp = /\/users\/sign_in/

  const waiter = page.waitForResponse(
    (response) =>
      regexp.test(response.url()) && response.request().method() === "POST"
  )

  await submit.click()

  log.info("Logging in...")
  await waiter
  log.info("Logged in!")
}
