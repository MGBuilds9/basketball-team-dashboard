import fs from "node:fs"
import path from "node:path"
import { gzipSync } from "node:zlib"

const htmlPath = path.join(process.cwd(), "dist", "index.html")
const html = fs.readFileSync(htmlPath)
const htmlBudget = 1.5 * 1024 * 1024
const gzipBudget = 350 * 1024
const scripts = [
  ...html.toString("utf8").matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g),
]
  .map((match) => match[1])
  .join("")
const gzipBytes = gzipSync(scripts).byteLength

if (html.byteLength > htmlBudget) {
  throw new Error(
    `dist/index.html is ${html.byteLength} bytes; budget is ${htmlBudget} bytes`
  )
}
if (gzipBytes > gzipBudget) {
  throw new Error(
    `Inline JavaScript is ${gzipBytes} gzip bytes; budget is ${gzipBudget} bytes`
  )
}
process.stdout.write(
  `Bundle budget passed: ${html.byteLength} B HTML, ${gzipBytes} B JS gzip.\n`
)
