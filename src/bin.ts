import path from "node:path"
import { chromium, Page } from "playwright"
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
    contexts.loggers.main.info("Skiping catalogue")
    await saveCatalogueMetadata(page, contexts)
  }

  // download packs one at a time
  let count = 1
  for (const metadata of contexts.store.packs) {
    await checkAndDownloadPack(page, metadata, count, contexts)
    count++
  }

  await browser.close()
}

/**
 * @summary Normalise a string to be a path segment.
 */
function segmentize(segment: string, sep: string = "") {
  return segment
    .replaceAll(new RegExp(`[\\${path.delimiter}\\${path.sep}]+`, "g"), sep)
    .trim()
}

function createPaths(state: string) {
  const dir = path.resolve(state)
  const store = path.join(dir, "db.json")
  const samples = path.join(dir, "samples")

  function createArtist(artist: string) {
    return path.join(samples, segmentize(artist))
  }

  function createPack(artist: string, title: string) {
    return path.join(createArtist(artist), segmentize(title))
  }

  function createPacked(artist: string, title: string, extension: string) {
    return createPack(artist, title) + extension
  }

  return {
    state: dir,
    store,
    samples,
    createArtist,
    createPack,
    createPacked,
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
