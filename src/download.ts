import { Browser } from "puppeteer"

export async function downloadByUrl(
  browser: Browser,
  url: string
): Promise<string> {
  const page = await browser.newPage()

  await page.goto(url)

  await page.waitForNetworkIdle()

  const download = await page.waitForSelector(
    'button[class~="download-button"]'
  )

  if (!download) {
    throw new Error(`Unable to find download button for url ${url}`)
  }

  await download.click()

  const response = await page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname.endsWith(".zip") || url.pathname.endsWith(".rar")
  })

  await page.close()

  return response.url()
}
