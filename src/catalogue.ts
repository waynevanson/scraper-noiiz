import { Page, Locator } from "playwright"
import { PackMetadata, Store, updateStoreWithLinks } from "./store"
import * as logs from "./logs"

export async function findLinksOnCatalogue(
  page: Page
): Promise<Array<Locator>> {
  const locator = page.locator('a[href*="/sounds/packs/"]')
  await locator.first().waitFor({ state: "visible" })

  return await locator.all()
}

export async function findMetadataFromCatalogueLink(
  link: Locator
): Promise<PackMetadata> {
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

export async function saveCatalogueMetadata(page: Page, store: Store) {
  logs.main.info("Navigating to the catalogue")
  await page.goto("/sounds/packs?order=created_at&priority=asc")

  const pagination = page.locator('ul[class*="pagination"]')
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

  for (let pagenumber = 1; ; pagenumber++) {
    const logger = logs.base.child({
      name: `catalogue.page.${pagenumber.toString().padStart(2, "0")}`,
    })
    logger.info("Finding links", page)

    const links = await findLinksOnCatalogue(page)

    logger.info("Finding metadata fields")

    const metadatas = await Promise.all(
      links.map(findMetadataFromCatalogueLink)
    )

    logs.main.info("Updating the store with packs")
    updateStoreWithLinks(store, metadatas)

    if (await isLastPage()) {
      logs.main.info("Detected last page")
      break
    }

    logger.info(`Next page`)
    await next.click()
  }
}
