import { load, type CheerioAPI } from "cheerio"

import { deriveLeaders, deriveTeamStats } from "./derive"
import type {
  BoxScorePlayerLine,
  BoxScoreSide,
  GameBoxScore,
  GameRow,
  PlayerRow,
  ShootingLine,
  StandingRow,
  Team1Snapshot,
} from "./types"

export const TEAM_1_ID = "0dce2102-2b06-4750-b25d-8cbdba23d2c5"
export const STM_BASE_URL = "https://stmsports.ca/mens-basketball"

export const SOURCE_URLS = {
  schedule: `${STM_BASE_URL}/schedule?view=all`,
  standings: `${STM_BASE_URL}/standings`,
  team: `${STM_BASE_URL}/teams/${TEAM_1_ID}`,
  stats: `${STM_BASE_URL}/stats`,
} as const

interface RawGame {
  id: string
  homeTeamId: string
  awayTeamId: string
  homeTeamName: string
  awayTeamName: string
  scheduledAt: string
  status: string
  homeScore: number | null
  awayScore: number | null
  isForfeit: boolean
}

export interface ParsedLeaguePlayer {
  name: string
  teamName: string
  ppg: number
  rpg: number
  apg: number
  spg: number
  bpg: number
}

function text(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function integer(value: string): number {
  const parsed = Number.parseInt(value.replace(/[^\d-]/g, ""), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function decimal(value: string): number {
  const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

function percentage(value: string): number | null {
  if (value.trim() === "" || value.trim() === "—") return null
  return decimal(value)
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

function teamId(teamName: string): string {
  return teamName === "Team 1" ? TEAM_1_ID : `stm-${slug(teamName)}`
}

function tableRows($: CheerioAPI, tableIndex = 0): string[][] {
  const rows: string[][] = []
  $("table")
    .eq(tableIndex)
    .find("tbody tr")
    .each((_index, element) => {
      rows.push(
        $(element)
          .find("td")
          .toArray()
          .map((cell) => text($(cell).text()))
      )
    })
  return rows
}

function rawGamesFromSchedule(html: string): RawGame[] {
  const decoded = html.replace(/\\"/g, '"')
  const pattern =
    /\{"id":"(?<id>[a-f0-9-]{36})","homeTeamId":"(?<homeTeamId>[a-f0-9-]{36})","awayTeamId":"(?<awayTeamId>[a-f0-9-]{36})","homeTeamName":"(?<homeTeamName>[^"]+)","awayTeamName":"(?<awayTeamName>[^"]+)","scheduledAt":"(?<scheduledAt>[^"]+)","displayTime":"[^"]*","status":"(?<status>[^"]+)","homeScore":(?<homeScore>null|\d+|"\$undefined"),"awayScore":(?<awayScore>null|\d+|"\$undefined"),"isForfeit":(?<isForfeit>true|false)/g
  const games = new Map<string, RawGame>()
  for (const match of decoded.matchAll(pattern)) {
    const groups = match.groups
    if (!groups) continue
    games.set(groups.id, {
      id: groups.id,
      homeTeamId: groups.homeTeamId,
      awayTeamId: groups.awayTeamId,
      homeTeamName: groups.homeTeamName,
      awayTeamName: groups.awayTeamName,
      scheduledAt: groups.scheduledAt,
      status: groups.status,
      homeScore: /^\d+$/.test(groups.homeScore)
        ? Number.parseInt(groups.homeScore, 10)
        : null,
      awayScore: /^\d+$/.test(groups.awayScore)
        ? Number.parseInt(groups.awayScore, 10)
        : null,
      isForfeit: groups.isForfeit === "true",
    })
  }
  return [...games.values()]
}

function stateFor(game: RawGame): GameRow["state"] {
  if (game.isForfeit) return "forfeit"
  const normalized = game.status.toLowerCase()
  if (
    normalized === "scheduled" ||
    normalized === "live" ||
    normalized === "final" ||
    normalized === "postponed" ||
    normalized === "canceled" ||
    normalized === "rescheduled" ||
    normalized === "tbd"
  ) {
    return normalized
  }
  return "scheduled"
}

export function parseSchedule(html: string): GameRow[] {
  const games = rawGamesFromSchedule(html)
    .filter(
      (game) => game.homeTeamId === TEAM_1_ID || game.awayTeamId === TEAM_1_ID
    )
    .map((game): GameRow => {
      const isHome = game.homeTeamId === TEAM_1_ID
      const state = stateFor(game)
      const decided = state === "final" || state === "forfeit"
      const team1Score = decided
        ? isHome
          ? game.homeScore
          : game.awayScore
        : null
      const opponentScore = decided
        ? isHome
          ? game.awayScore
          : game.homeScore
        : null
      const result =
        team1Score === null || opponentScore === null
          ? null
          : team1Score > opponentScore
            ? "W"
            : "L"
      const date = game.scheduledAt.slice(0, 10)
      const displayTime = game.scheduledAt.slice(11, 16) || null
      return {
        id: game.id,
        date,
        scheduledAt: game.scheduledAt,
        displayTime,
        state,
        opponentId: isHome ? game.awayTeamId : game.homeTeamId,
        opponentName: isHome ? game.awayTeamName : game.homeTeamName,
        venue: null,
        isHome,
        team1Score,
        opponentScore,
        result,
        officialUrl: `${STM_BASE_URL}/game/${game.id}`,
        hasBoxScore: false,
      }
    })
  return games.sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!))
}

export function parseStandings(html: string): StandingRow[] {
  const $ = load(html)
  return tableRows($)
    .filter((cells) => cells.length >= 10)
    .map((cells) => {
      const name = cells[1].match(/Team\s+\d+/i)?.[0] ?? cells[1]
      const pointsFor = integer(cells[6])
      const pointsAgainst = integer(cells[7])
      return {
        rank: integer(cells[0]),
        teamId: teamId(name),
        teamName: name,
        wins: integer(cells[2]),
        losses: integer(cells[3]),
        gamesPlayed: integer(cells[4]),
        winPct: percentage(cells[5])! / 100,
        pointsFor,
        pointsAgainst,
        differential: pointsFor - pointsAgainst,
        streak: cells[9],
      }
    })
}

export function parseRoster(html: string): PlayerRow[] {
  const $ = load(html)
  return tableRows($)
    .filter((cells) => cells.length >= 11)
    .map((cells) => {
      const jersey = cells[0] === "—" ? null : integer(cells[0])
      const name = cells[1]
      return {
        id: `${slug(name)}-${jersey ?? "na"}`,
        name,
        jersey,
        gamesPlayed: integer(cells[2]),
        ppg: decimal(cells[3]),
        rpg: decimal(cells[4]),
        apg: decimal(cells[5]),
        spg: decimal(cells[6]),
        bpg: decimal(cells[7]),
        fgPct: percentage(cells[8]),
        threePct: percentage(cells[9]),
        ftPct: percentage(cells[10]),
      }
    })
}

export function parseLeaguePlayers(html: string): ParsedLeaguePlayer[] {
  const $ = load(html)
  const players: ParsedLeaguePlayer[] = []
  $("table")
    .first()
    .find("tbody tr")
    .each((_index, element) => {
      const cells = $(element).find("td")
      if (cells.length < 13) return
      const identity = cells.eq(0)
      const leafText = identity
        .find("span")
        .toArray()
        .filter((node) => $(node).children().length === 0)
        .map((node) => text($(node).text()))
      const teamName =
        leafText.find((value) => /^Team\s+\d+$/i.test(value)) ?? ""
      const name =
        leafText.find((value) => value !== teamName && value.length > 0) ??
        text(identity.text()).replace(teamName, "")
      players.push({
        name,
        teamName,
        ppg: decimal(cells.eq(2).text()),
        rpg: decimal(cells.eq(3).text()),
        apg: decimal(cells.eq(4).text()),
        spg: decimal(cells.eq(5).text()),
        bpg: decimal(cells.eq(6).text()),
      })
    })
  return players.filter((player) => player.name && player.teamName)
}

function parseShooting(value: string): ShootingLine {
  const match = value.match(/(\d+)\s*\/\s*(\d+)/)
  const made = match ? Number.parseInt(match[1], 10) : 0
  const attempted = match ? Number.parseInt(match[2], 10) : 0
  return {
    made,
    attempted,
    percentage:
      attempted === 0 ? null : Math.round((made / attempted) * 1000) / 10,
  }
}

function parseCountingLine(cells: string[]) {
  return {
    points: integer(cells[1]),
    rebounds: integer(cells[2]),
    assists: integer(cells[3]),
    steals: integer(cells[4]),
    blocks: integer(cells[5]),
    turnovers: integer(cells[6]),
    fouls: integer(cells[7]),
    fieldGoals: parseShooting(cells[8]),
    threePointers: parseShooting(cells[10]),
    freeThrows: parseShooting(cells[12]),
  }
}

function parseBoxScoreSide(
  $: CheerioAPI,
  tableIndex: number,
  sideTeamId: string,
  sideTeamName: string
): BoxScoreSide {
  const rows = tableRows($, tableIndex).filter((cells) => cells.length >= 14)
  const totalCells = rows.find((cells) => /^totals$/i.test(cells[0]))
  if (!totalCells) {
    throw new Error(`Missing ${sideTeamName} totals row`)
  }
  const playerRows = rows.filter((cells) => !/^totals$/i.test(cells[0]))
  const players: BoxScorePlayerLine[] = playerRows.map((cells) => {
    const jerseyMatch = cells[0].match(/#\s*(\d+)$/)
    const playerName = cells[0].replace(/#\s*\d+$/, "").trim()
    const jersey = jerseyMatch ? Number.parseInt(jerseyMatch[1], 10) : null
    return {
      playerId: `${slug(playerName)}-${jersey ?? "na"}`,
      playerName,
      jersey,
      ...parseCountingLine(cells),
    }
  })
  const totals = parseCountingLine(totalCells)
  return {
    teamId: sideTeamId,
    teamName: sideTeamName,
    score: totals.points,
    players,
    totals,
  }
}

export function parseBoxScore(
  html: string,
  game: GameRow
): GameBoxScore | null {
  const $ = load(html)
  if ($("table").length < 2) return null
  const homeName = game.isHome ? "Team 1" : game.opponentName
  const awayName = game.isHome ? game.opponentName : "Team 1"
  const homeId = game.isHome ? TEAM_1_ID : game.opponentId
  const awayId = game.isHome ? game.opponentId : TEAM_1_ID
  return {
    gameId: game.id,
    date: game.date,
    officialUrl: game.officialUrl,
    home: parseBoxScoreSide($, 0, homeId, homeName),
    away: parseBoxScoreSide($, 1, awayId, awayName),
  }
}

export function assembleSnapshot(input: {
  generatedAt: string
  contentHash: string
  standings: StandingRow[]
  roster: PlayerRow[]
  games: GameRow[]
  leaguePlayers: ParsedLeaguePlayer[]
  boxScores: GameBoxScore[]
  sources: Team1Snapshot["sources"]
}): Team1Snapshot {
  const standing = input.standings.find((row) => row.teamName === "Team 1")
  if (!standing) throw new Error("Team 1 is missing from standings")
  const gamesWithBoxScores = new Set(
    input.boxScores.map((score) => score.gameId)
  )
  const games = input.games.map((game) => ({
    ...game,
    hasBoxScore: gamesWithBoxScores.has(game.id),
  }))
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    contentHash: input.contentHash,
    team: {
      id: TEAM_1_ID,
      name: "Team 1",
      season: "Summer 2026",
      wins: standing.wins,
      losses: standing.losses,
      pointsFor: standing.pointsFor,
      pointsAgainst: standing.pointsAgainst,
      differential: standing.differential,
      standing: standing.rank,
    },
    roster: input.roster,
    games,
    standings: input.standings,
    teamLeaders: deriveLeaders(input.roster, "Team 1"),
    leagueLeaders: deriveLeaders(input.leaguePlayers, "League"),
    teamStats: deriveTeamStats(input.boxScores),
    boxScores: input.boxScores,
    sources: input.sources,
  }
}
