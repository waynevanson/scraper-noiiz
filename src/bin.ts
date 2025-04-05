import path from "node:path"
import { chromium } from "playwright"
import { seriesparallel } from "./concurrent"
import { createEnvironment } from "./environment"
import { login } from "./login"
import * as logs from "./logs"
import { checkAndDownloadPack } from "./pack"
import { createStore } from "./store"

async function main() {
  logs.main.info("Welcome!")
  const environment = createEnvironment()

  const store = createStore(path.join(environment.state, "db.json"))

  const downloadsPath = path.join(environment.state, "downloads")

  const browser = await chromium.launch({
    headless: false,
    downloadsPath,
    timeout: 60_000,
    logger: {
      isEnabled(name, severity) {
        return logs.playwright.level === "debug"
      },
      log(name, severity, message, args, hints) {
        logs.playwright[severity]({ kind: name, args }, message.toString())
      },
    },
  })

  const context = await browser.newContext({ baseURL: "https://www.noiiz.com" })
  const page = await context.newPage()

  await login(page, environment)
  // await saveCatalogueMetadata(page, store)

  // todo: check downloads so we don't redownload.
  const tasks = store.packs.map(
    (metadata) => () => checkAndDownloadPack(page, metadata, downloadsPath)
  )

  await seriesparallel(environment.concurrency, tasks)

  await browser.close()
}

main()
