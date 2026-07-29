import { createHash } from "node:crypto"

export const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex")

export async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent":
        "Basketball-Team-Dashboard/1.0 (+https://github.com/MGBuilds9)",
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

export async function fetchJson<T>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      "user-agent":
        "Basketball-Team-Dashboard/1.0 (+https://github.com/MGBuilds9)",
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`)
  }
  return (await response.json()) as T
}

export async function postFormJson<T>(
  url: string,
  values: Record<string, string>,
  headers: Record<string, string> = {}
): Promise<T> {
  return fetchJson<T>(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      ...headers,
    },
    body: new URLSearchParams(values),
  })
}
