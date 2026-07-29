import fs from "node:fs/promises"
import path from "node:path"

import { load } from "cheerio"

import {
  parseBoxScore,
  parseLeaguePlayers,
  parseRoster,
  parseSchedule,
  parseStandings,
  SOURCE_URLS,
} from "../src/data/parser"
import { fetchText } from "./source"

const ROOT = process.cwd()
const FIXTURE_DIR = path.join(ROOT, "tests", "fixtures", "live")

function sanitizedTable(html: string, index = 0): string {
  const $ = load(html)
  const table = $("table").eq(index).clone()
  table.find("img,svg,script,style").remove()
  table.find("*").each((_nodeIndex, node) => {
    const element = $(node)
    for (const attribute of Object.keys(node.attribs ?? {})) {
      if (!["colspan", "rowspan"].includes(attribute))
        element.removeAttr(attribute)
    }
  })
  return `<html><body>${$.html(table)}</body></html>`
}

async function main() {
  const pages = await Promise.all(
    Object.entries(SOURCE_URLS).map(async ([label, url]) => ({
      label,
      html: await fetchText(url),
    }))
  )
  const source = Object.fromEntries(
    pages.map((page) => [page.label, page.html])
  )
  const games = parseSchedule(source.schedule)
  const complete = games.filter((game) => game.state === "final")
  const gamePages = await Promise.all(
    complete.map(async (game) => ({
      game,
      html: await fetchText(game.officialUrl),
    }))
  )
  const proof = {
    capturedAt: new Date().toISOString(),
    schedule: games,
    standings: parseStandings(source.standings),
    roster: parseRoster(source.team),
    leaguePlayers: parseLeaguePlayers(source.stats),
    boxScores: gamePages
      .map(({ game, html }) => parseBoxScore(html, game))
      .filter(Boolean),
  }
  await fs.mkdir(FIXTURE_DIR, { recursive: true })
  await fs.writeFile(
    path.join(FIXTURE_DIR, "proof.json"),
    `${JSON.stringify(proof, null, 2)}\n`
  )
  await fs.writeFile(
    path.join(FIXTURE_DIR, "standings.html"),
    sanitizedTable(source.standings)
  )
  await fs.writeFile(
    path.join(FIXTURE_DIR, "roster.html"),
    sanitizedTable(source.team)
  )
  await fs.writeFile(
    path.join(FIXTURE_DIR, "stats.html"),
    sanitizedTable(source.stats)
  )
  for (const { game, html } of gamePages) {
    await fs.writeFile(
      path.join(FIXTURE_DIR, `box-score-${game.id}.html`),
      `<html><body>${sanitizedTable(html, 0)}${sanitizedTable(html, 1)}</body></html>`
    )
  }
  process.stdout.write(
    `Captured sanitized fixture proof: ${games.length} games, ${complete.length} completed games.\n`
  )
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`
  )
  process.exitCode = 1
})
