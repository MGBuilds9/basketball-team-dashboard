export type GameState =
  | "scheduled"
  | "live"
  | "final"
  | "forfeit"
  | "unreported"
  | "bye"
  | "postponed"
  | "canceled"
  | "rescheduled"
  | "tbd"

export type Result = "W" | "L" | null
export type LeaderCategory = "ppg" | "rpg" | "apg" | "spg" | "bpg"
export type ProviderKind = "stm" | "teamlinkt"

export interface TeamIdentity {
  provider: ProviderKind
  leagueId: string
  seasonId: string
  teamId: string
  name: string
  seasonName: string
  leagueName: string
  timezone: string
  youtubeChannelUrl: string
}

export interface ProviderCapabilities {
  roster: boolean
  standings: "official" | "derived" | "unavailable"
  leagueLeaders: "official" | "derived" | "unavailable"
  boxScores: boolean
  liveScores: boolean
  gameVideos: boolean
}

export interface SourceReference {
  label: string
  url: string
  checkedAt: string
  hash: string
}

export interface TeamSummary {
  id: string
  name: string
  season: string
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  differential: number
  standing: number
}

export interface PlayerRow {
  id: string
  name: string
  jersey: number | null
  gamesPlayed: number
  ppg: number
  rpg: number
  apg: number
  spg: number
  bpg: number
  fgPct: number | null
  threePct: number | null
  ftPct: number | null
}

export interface StandingRow {
  rank: number
  teamId: string
  teamName: string
  wins: number
  losses: number
  gamesPlayed: number
  winPct: number
  pointsFor: number
  pointsAgainst: number
  differential: number
  streak: string
  form?: Array<Exclude<Result, null>>
}

export interface GameRow {
  id: string
  date: string
  scheduledAt: string | null
  displayTime: string | null
  state: GameState
  opponentId: string
  opponentName: string
  venue: string | null
  isHome: boolean
  teamScore: number | null
  opponentScore: number | null
  result: Result
  officialUrl: string
  hasBoxScore: boolean
  videoUrl: string | null
  videoTitle: string | null
}

export interface LeaderRow {
  category: LeaderCategory
  label: string
  playerName: string
  teamName: string
  value: number
  unit: string
  tied: boolean
}

export interface ShootingLine {
  made: number
  attempted: number
  percentage: number | null
}

export interface BoxScorePlayerLine {
  playerId: string
  playerName: string
  jersey: number | null
  points: number
  rebounds: number
  assists: number
  steals: number
  blocks: number
  turnovers: number
  fouls: number
  fieldGoals: ShootingLine
  threePointers: ShootingLine
  freeThrows: ShootingLine
}

export interface BoxScoreSide {
  teamId: string
  teamName: string
  score: number
  players: BoxScorePlayerLine[]
  totals: Omit<BoxScorePlayerLine, "playerId" | "playerName" | "jersey">
}

export interface GameBoxScore {
  gameId: string
  date: string
  officialUrl: string
  home: BoxScoreSide
  away: BoxScoreSide
}

export interface TeamStats {
  gamesWithBoxScores: number
  pointsPerGame: number
  reboundsPerGame: number
  assistsPerGame: number
  stealsPerGame: number
  blocksPerGame: number
  fieldGoalPct: number | null
  threePointPct: number | null
  freeThrowPct: number | null
}

export interface TeamSnapshot {
  schemaVersion: 2
  generatedAt: string
  contentHash: string
  identity: TeamIdentity
  capabilities: ProviderCapabilities
  team: TeamSummary
  roster: PlayerRow[]
  games: GameRow[]
  standings: StandingRow[]
  teamLeaders: LeaderRow[]
  leagueLeaders: LeaderRow[]
  teamStats: TeamStats
  boxScores: GameBoxScore[]
  sources: SourceReference[]
}

/** @deprecated Use TeamSnapshot. Retained while child projects merge the base release. */
export type Team1Snapshot = TeamSnapshot
