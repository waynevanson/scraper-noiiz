import path from "node:path"
import { chromium, Page } from "playwright"
import {
  findLinksOnCatalogue,
  findMetadataFromCatalogueLink,
} from "./catalogue"
import { createEnvironment } from "./environment"
import { login } from "./login"
import { createStore, PackMetadata, updateStoreWithLinks } from "./store"
import { concurrent } from "./concurrent"
import { log } from "./log"

// go through each page of 48 items.
// get metadata for all samples.

// todo: concurrency at the top, setup all pages in advance.
// create additional page for the catalogues.
// how to manage GID's? Each browser is separate page so I'll listen to the only download
async function main() {
  const environment = createEnvironment()
  const store = createStore()

  const browser = await chromium.launch({
    headless: true,
    downloadsPath: ".state/downloads",
  })

  async function setupPage() {
    const page = await browser.newPage({ baseURL: "https://www.noiiz.com" })
    await login(page, environment)
    return page
  }

  log.info("Setting up catalogue page")
  const catalogue = await setupPage()

  log.info("Navigating to the catalogue")
  await catalogue.goto("/sounds/packs?order=created_at&priority=asc")

  // keep the new pages open at all times so we don't have to log in.

  // first things first bitches,
  // get all metadata in the entire catalogue.

  const pagination = catalogue.locator('ul[class*="pagination"]')
  const active = pagination.locator('button[class*="--active"]')
  const last = pagination.locator("li:nth-last-child(2) > button")
  const next = pagination.locator("li:nth-last-child(1) > button")

  // todo: use active + last or next:disabled ?
  const isLastPage = () =>
    active
      .and(last)
      .waitFor({ timeout: 2_000 })
      .then(() => true)
      .catch(() => false)

  // todo: do it twice to ensure we've gotten all packs up to date.
  let page = 1
  while (true) {
    log.info("Finding links in catalogue on page %d", page)

    const links = await findLinksOnCatalogue(catalogue)

    log.info("Finding metadata fields for packs on page %d", page)
    const metadatas = await Promise.all(
      links.map(findMetadataFromCatalogueLink)
    )

    log.info("Updating the store with packs from page %d", page)
    updateStoreWithLinks(store, metadatas)

    if (await isLastPage()) {
      log.info("Detected last page as page %d", page)
      break
    }

    let waiter: Promise<unknown> = catalogue.waitForEvent("response", {
      predicate(request) {
        return request.url().includes("/packs") && request.status() === 200
      },
    })

    page++
    log.info(`Navigating to catalogue page %d`, page)
    await next.click()

    log.info("Waiting for page %d to be ready", page)

    await waiter
  }

  // const pages = {
  //   catalogue,
  //   packs: await Promise.all(
  //     Array.from({ length: environment.concurrency }, setupPage)
  //   ),
  // }

  // await downloadMissingPacksFromStore(
  //   store.packs,
  //   pages.packs,
  //   environment.concurrency
  // )

  await browser.close()
}

async function downloadMissingPacksFromStore(
  metadatas: Array<PackMetadata>,
  pages: Array<Page>,
  concurrency: number
) {
  const tasks = metadatas.map(
    (metadata) => (page: Page) => downloadPack(page, metadata)
  )

  await concurrent(concurrency, pages, tasks)
}

main()

async function downloadPack(page: Page, metadata: PackMetadata) {
  await page.goto(metadata.path)
  const waiter = page.waitForEvent("download")

  const button = page.getByRole("button", { name: "Download" })
  await button.click({ delay: 5_000 })

  console.log(`Downloading %s by %s`, metadata.title, metadata.artist)
  const download = await waiter

  const extension = path.extname(download.suggestedFilename())
  const filename = metadata.title + extension
  const fullpath = path.resolve(".downloads/samples", metadata.artist, filename)

  await download.saveAs(fullpath)
  console.log(`Downloaded %s by %s`, metadata.title, metadata.artist)
}
