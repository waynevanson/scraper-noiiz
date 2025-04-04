import { Page, Locator } from "playwright"
import { PackMetadata, Store, updateStoreWithLinks } from "./store"
import { log } from "./log"

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
  log.info("Navigating to the catalogue")
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

  let pagenumber = 1
  while (true) {
    log.info("Finding links in catalogue on page %d", page)

    const links = await findLinksOnCatalogue(page)

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

    pagenumber++
    log.info(`Navigating to catalogue page %d`, page)
    await next.click()
  }
}
