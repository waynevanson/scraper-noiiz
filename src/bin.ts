import path from "node:path"
import { chromium, Page } from "playwright"
import {
  findLinksOnCatalogue,
  findMetadataFromCatalogueLink,
} from "./catalogue"
import { createEnvironment } from "./environment"
import { login } from "./login"
import { createStore, PackMetadata, updateStoreWithLinks } from "./store"

// go through each page of 48 items.
// get metadata for all samples.

// todo: concurrency at the top, setup all pages in advance.
// create additional page for the catalogues.
// how to manage GID's? Each browser is separate page so I'll listen to the only download
async function main() {
  const environment = createEnvironment()
  const store = createStore()

  const browser = await chromium.launch({
    headless: false,
    downloadsPath: ".state/downloads",
  })

  async function setupPage() {
    const page = await browser.newPage({ baseURL: "https://www.noiiz.com" })
    await login(page, environment)
    return page
  }

  const catalogue = await setupPage()
  await catalogue.goto("/sounds/packs?order=created_at&priority=asc")

  // keep the new pages open at all times so we don't have to log in.
  const pages = {
    catalogue,
    packs: await Promise.all(
      Array.from({ length: environment.concurrency }, setupPage)
    ),
  }

  // first things first bitches,
  // get all metadata in the entire catalogue.

  const pagination = pages.catalogue.locator("ul.pagination")
  const active = pagination.locator('button[class~="--active"]')
  const last = pagination.locator("button:nth-last-child(2)")
  const next = pagination.locator("button:nth-last-child(1)")

  // todo: use active + last or next:disabled ?
  const isLastPage = () =>
    active
      .and(last)
      .waitFor({ timeout: 2_000 })
      .then(() => true)
      .catch(() => false)

  // todo: do it twice to ensure we've gotten all packs up to date.
  while (true) {
    const links = await findLinksOnCatalogue(pages.catalogue)
    const metadatas = await Promise.all(
      links.map(findMetadataFromCatalogueLink)
    )

    updateStoreWithLinks(store, metadatas)

    if (await isLastPage()) {
      break
    }

    await next.click()
  }

  await downloadMissingPacksFromStore(
    store.packs,
    pages.packs,
    environment.concurrency
  )

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
  await button.click({ delay: 2000 })

  const download = await waiter

  const extension = path.extname(download.suggestedFilename())
  const filename = metadata.title + extension
  const fullpath = path.resolve(".downloads/samples", metadata.artist, filename)

  await download.saveAs(fullpath)
}
