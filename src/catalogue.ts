import { Page, Locator } from "playwright"
import { PackMetadata } from "./store"

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
