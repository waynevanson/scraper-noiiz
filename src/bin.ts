import path from "node:path"
import { chromium, Page } from "playwright"
import { seriesparallel } from "./concurrent"
import { createEnvironment } from "./environment"
import { login } from "./login"
import * as logs from "./logs"
import { checkAndDownloadPack } from "./pack"
import { createStore } from "./store"
import { saveCatalogueMetadata } from "./catalogue"

main()

async function main() {
  const contexts = createContexts()

  const browser = await chromium.launch({
    headless: false,
    downloadsPath: contexts.paths.downloads,
    timeout: 60_000,
    logger: {
      isEnabled(name, severity) {
        return contexts.loggers.playwright.level === "debug"
      },
      log(name, severity, message, args, hints) {
        contexts.loggers.playwright[severity](
          { kind: name, args },
          message.toString()
        )
      },
    },
  })

  const page = await browser.newPage({ baseURL: "https://www.noiiz.com" })

  await login(page, contexts)

  if (!contexts.environment.SKIP_CATALOGUE) {
    await saveCatalogueMetadata(page, contexts)
  }

  const tasks = createTasks(page, contexts)
  await seriesparallel(contexts.environment.DOWNLOAD_CONCURRENCY, tasks)

  await browser.close()
}

function createTasks(page: Page, contexts: Contexts) {
  return contexts.store.packs.map(
    (metadata) => () => checkAndDownloadPack(page, metadata, contexts)
  )
}

function createPaths(state: string) {
  const dir = path.resolve(state)
  const store = path.join(dir, "db.json")
  const downloads = path.join(dir, "downloads")
  const samples = path.join(dir, "samples")

  function artist(artist: string) {
    return path.join(samples, artist)
  }

  function pack(artist: string, title: string) {
    return path.join(samples, artist, title)
  }

  function packed(artist: string, title: string, extension: string) {
    return path.join(samples, artist, title + extension)
  }

  return {
    state: dir,
    store,
    downloads,
    samples,
    artist,
    pack,
    packed,
  }
}

function createContexts() {
  const loggers = logs.createLoggers()
  const environment = createEnvironment()
  const paths = createPaths(environment.STATE_DIR)
  const store = createStore(path.join(environment.STATE_DIR, "db.json"))
  return { environment, paths, store, loggers }
}

export type Contexts = ReturnType<typeof createContexts>
