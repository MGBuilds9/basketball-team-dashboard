import { createHash } from "node:crypto"

export const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex")

export async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "STM-Team-1-Dashboard/1.0 (+https://github.com/MGBuilds9)",
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`)
  }
  const html = await response.text()
  if (html.length < 1_000) {
    throw new Error(`${url} returned an unexpectedly small response`)
  }
  return html
}
