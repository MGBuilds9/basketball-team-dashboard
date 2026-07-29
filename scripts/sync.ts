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
import {
  teamConfigSchema,
  type StmTeamConfig,
} from "../src/data/config"
import { stableStringify } from "../src/data/hash"
import { teamSnapshotSchema } from "../src/data/schema"
import type {
  GameBoxScore,
  GameRow,
  SourceReference,
  TeamSnapshot,
} from "../src/data/types"
import { fetchText, sha256 } from "./source"
import { resolveGameVideos } from "./youtube"
import { buildTeamLinktSnapshot } from "./providers/teamlinkt"

const ROOT = process.cwd()
const DATA_DIRECTORY =
  process.env.DASHBOARD_DATA_DIR ?? path.join(ROOT, "data")
const SNAPSHOT_PATH = path.join(DATA_DIRECTORY, "snapshot.json")
const RECEIPT_PATH = path.join(DATA_DIRECTORY, "receipt.json")

interface SyncBuild {
  snapshot: TeamSnapshot
  sourceCount: number
  gameCount: number
  boxScoreCount: number
  matchedVideoCount: number
}

async function buildStmSnapshot(
  config: StmTeamConfig,
  checkedAt: string,
  previousSnapshot: TeamSnapshot | null
): Promise<SyncBuild> {
  const entries = await Promise.all(
    Object.entries(SOURCE_URLS).map(async ([label, url]) => {
      const html = await fetchText(url)
      return { label, url, html }
    })
  )
  const source = Object.fromEntries(
    entries.map((entry) => [entry.label, entry.html])
  )
  const parsedGames = parseSchedule(source.schedule)
  let games: GameRow[]
  let videoSource: SourceReference | null = null
  let matchedVideoCount = 0
  try {
    const videoResolution = await resolveGameVideos({
      games: parsedGames,
      channelUrl: config.youtube.channelUrl,
      teamAliases: config.youtube.teamAliases,
    })
    games = videoResolution.games
    matchedVideoCount = videoResolution.matchedCount
    videoSource = {
      label: "youtube-channel",
      url: config.youtube.channelUrl,
      checkedAt,
      hash: sha256(videoResolution.channelHtml),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(
      `YouTube check unavailable; preserving verified game links: ${message}\n`
    )
    games = parsedGames.map((game) => {
      const previous = previousSnapshot?.games.find(
        (candidate) => candidate.id === game.id
      )
      return {
        ...game,
        videoUrl: previous?.videoUrl ?? null,
        videoTitle: previous?.videoTitle ?? null,
      }
    })
  }
  const finalGames = games.filter((game) => game.state === "final")
  const gamePages = await Promise.all(
    finalGames.map(async (game) => ({
      game,
      html: await fetchText(game.officialUrl),
    }))
  )
  const boxScores = gamePages
    .map(({ game, html }) =>
      parseBoxScore(html, game, {
        id: config.teamId,
        name: config.teamName,
      })
    )
    .filter((boxScore): boxScore is GameBoxScore => boxScore !== null)

  const sources: SourceReference[] = [
    ...entries.map((entry) => ({
      label: entry.label,
      url: entry.url,
      checkedAt,
      hash: sha256(entry.html),
    })),
    ...(videoSource ? [videoSource] : []),
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
    identity: {
      provider: config.provider,
      leagueId: config.leagueId,
      seasonId: config.seasonId,
      teamId: config.teamId,
      name: config.teamName,
      seasonName: config.seasonName,
      leagueName: config.leagueName,
      timezone: config.timezone,
      youtubeChannelUrl: config.youtube.channelUrl,
    },
    sourceTeamName: config.sourceTeamName,
  })
  return {
    snapshot,
    sourceCount: sources.length,
    gameCount: games.length,
    boxScoreCount: boxScores.length,
    matchedVideoCount,
  }
}

async function main() {
  const checkedAt = new Date().toISOString()
  const configPath =
    process.env.TEAM_CONFIG_PATH ?? path.join(ROOT, "config", "team.json")
  const config = teamConfigSchema.parse(
    JSON.parse(await fs.readFile(configPath, "utf8"))
  )
  let previousSnapshot: TeamSnapshot | null = null
  try {
    previousSnapshot = teamSnapshotSchema.parse(
      JSON.parse(await fs.readFile(SNAPSHOT_PATH, "utf8"))
    )
  } catch {
    // A missing or pre-v2 snapshot is treated as a first validated sync.
  }
  const build =
    config.provider === "stm"
      ? await buildStmSnapshot(config, checkedAt, previousSnapshot)
      : await buildTeamLinktSnapshot(config, checkedAt)
  const { snapshot } = build
  const validated = teamSnapshotSchema.parse(snapshot)
  const previousHash = previousSnapshot?.contentHash ?? null
  const contentHash = validated.contentHash

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
        schemaVersion: 2,
        generatedAt: checkedAt,
        contentHash,
        previousHash,
        provider: config.provider,
        teamId: config.teamId,
        sourceCount: build.sourceCount,
        gameCount: build.gameCount,
        boxScoreCount: build.boxScoreCount,
        matchedVideoCount: build.matchedVideoCount,
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
