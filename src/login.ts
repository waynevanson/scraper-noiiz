import { Page } from "playwright"
import { Contexts } from "./bin"

export async function login(page: Page, contexts: Contexts) {
  await page.goto("")

  const form = page.getByRole("link", { name: "Log in" })
  const email = page.getByRole("textbox", { name: "email" })
  const password = page.getByRole("textbox", { name: "password" })
  const submit = page.getByRole("button", { name: "Sign in" })

  await form.click()
  await email.fill(contexts.environment.NOIIZ_EMAIL)
  await password.fill(contexts.environment.NOIIZ_PASSWORD)

  const regexp = /\/users\/sign_in/

  const waiter = page.waitForResponse(
    (response) =>
      regexp.test(response.url()) && response.request().method() === "POST"
  )

  await submit.click()

  contexts.loggers.main.info("Logging in...")
  await waiter
  contexts.loggers.main.info("Logged in!")
}
