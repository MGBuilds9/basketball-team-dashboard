export type GameState =
  | "scheduled"
  | "live"
  | "final"
  | "forfeit"
  | "postponed"
  | "canceled"
  | "rescheduled"
  | "tbd"

export type Result = "W" | "L" | null
export type LeaderCategory = "ppg" | "rpg" | "apg" | "spg" | "bpg"

export interface SourceReference {
  label: string
  url: string
  checkedAt: string
  hash: string
}

export interface TeamSummary {
  id: string
  name: "Team 1"
  season: "Summer 2026"
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
  team1Score: number | null
  opponentScore: number | null
  result: Result
  officialUrl: string
  hasBoxScore: boolean
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

export interface Team1Snapshot {
  schemaVersion: 1
  generatedAt: string
  contentHash: string
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
