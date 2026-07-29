import fs from "node:fs/promises"
import path from "node:path"

import {
  assembleSnapshot,
  parseBoxScore,
  parseLeaguePlayers,
  parseRoster,
  parseSchedule,
  parseStandings,
  SOURCE_URLS,
} from "../src/data/parser"
import { stableStringify } from "../src/data/hash"
import { team1SnapshotSchema } from "../src/data/schema"
import type { GameBoxScore, SourceReference } from "../src/data/types"
import { fetchText, sha256 } from "./source"

const ROOT = process.cwd()
const SNAPSHOT_PATH = path.join(ROOT, "data", "snapshot.json")
const RECEIPT_PATH = path.join(ROOT, "data", "receipt.json")

async function main() {
  const checkedAt = new Date().toISOString()
  const entries = await Promise.all(
    Object.entries(SOURCE_URLS).map(async ([label, url]) => {
      const html = await fetchText(url)
      return { label, url, html }
    })
  )
  const source = Object.fromEntries(
    entries.map((entry) => [entry.label, entry.html])
  )
  const games = parseSchedule(source.schedule)
  const finalGames = games.filter((game) => game.state === "final")
  const gamePages = await Promise.all(
    finalGames.map(async (game) => ({
      game,
      html: await fetchText(game.officialUrl),
    }))
  )
  const boxScores = gamePages
    .map(({ game, html }) => parseBoxScore(html, game))
    .filter((boxScore): boxScore is GameBoxScore => boxScore !== null)

  const sources: SourceReference[] = [
    ...entries.map((entry) => ({
      label: entry.label,
      url: entry.url,
      checkedAt,
      hash: sha256(entry.html),
    })),
    ...gamePages.map(({ game, html }) => ({
      label: `box-score-${game.id}`,
      url: game.officialUrl,
      checkedAt,
      hash: sha256(html),
    })),
  ]

  const core = {
    standings: parseStandings(source.standings),
    roster: parseRoster(source.team),
    games,
    leaguePlayers: parseLeaguePlayers(source.stats),
    boxScores,
  }
  const contentHash = sha256(stableStringify(core))
  const snapshot = assembleSnapshot({
    generatedAt: checkedAt,
    contentHash,
    ...core,
    sources,
  })
  const validated = team1SnapshotSchema.parse(snapshot)

  let previousHash: string | null
  try {
    const previous = JSON.parse(await fs.readFile(SNAPSHOT_PATH, "utf8")) as {
      contentHash?: string
    }
    previousHash = previous.contentHash ?? null
  } catch {
    previousHash = null
  }

  if (previousHash === contentHash) {
    process.stdout.write(`UNCHANGED ${contentHash}\n`)
    return
  }

  await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true })
  await fs.writeFile(SNAPSHOT_PATH, `${JSON.stringify(validated, null, 2)}\n`)
  await fs.writeFile(
    RECEIPT_PATH,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: checkedAt,
        contentHash,
        previousHash,
        sourceCount: sources.length,
        gameCount: games.length,
        boxScoreCount: boxScores.length,
      },
      null,
      2
    )}\n`
  )
  process.stdout.write(`CHANGED ${contentHash}\n`)
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
