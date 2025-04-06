import { Page, Locator } from "playwright"
import { PackMetadata, updateStoreWithLinks } from "./store"
import { Contexts, segmentize } from "./bin"
import path from "node:path"

export async function findLinksOnCatalogue(
  page: Page
): Promise<Array<Locator>> {
  const locator = page.locator('a[href*="/sounds/packs/"]')
  await locator.first().waitFor({ state: "visible" })

  return await locator.all()
}

export async function findMetadataFromCatalogueLink(
  link: Locator,
  samplesPath: string
): Promise<PackMetadata> {
  const texts = link.locator("div > div:nth-of-type(2)")

  const [url, title, artist] = await Promise.all([
    link.getAttribute("href"),
    texts.locator("span:nth-of-type(1)").textContent(),
    texts.locator("span:nth-of-type(2)").textContent(),
  ])

  if (!url || !title || !artist) {
    throw new Error(`Expected href, title or artist for a pack to be defined`)
  }

  const fsWithoutExtension = path.join(
    samplesPath,
    segmentize(title),
    segmentize(artist)
  )

  return { path: { url, fsWithoutExtension }, title, artist }
}

export async function saveCatalogueMetadata(page: Page, contexts: Contexts) {
  contexts.loggers.main.info("Navigating to the catalogue")
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
    const logger = contexts.loggers.catalogue(pagenumber)
    logger.info("Finding links", page)

    const links = await findLinksOnCatalogue(page)

    logger.info("Finding metadata fields")

    const metadatas = await Promise.all(
      links.map((link) =>
        findMetadataFromCatalogueLink(link, contexts.paths.samples)
      )
    )

    logger.info("Updating the store with packs")
    updateStoreWithLinks(contexts.store, metadatas)

    if (await isLastPage()) {
      logger.info("Detected last page")
      break
    }

    logger.info(`Next page`)
    await next.click()
  }
}
