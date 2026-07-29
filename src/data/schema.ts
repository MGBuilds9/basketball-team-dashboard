import { z } from "zod"

function isSupportedBasketballUrl(value: string): boolean {
  const url = new URL(value)
  const safeHosts = new Set([
    "stmsports.ca",
    "leagues.teamlinkt.com",
    "www.youtube.com",
    "youtu.be",
  ])
  if (url.protocol !== "https:" || !safeHosts.has(url.hostname)) return false
  if (url.hostname === "stmsports.ca") {
    return url.pathname.startsWith("/mens-basketball/")
  }
  if (url.hostname === "leagues.teamlinkt.com") {
    return url.pathname.toLowerCase().startsWith("/leagues/")
  }
  if (url.hostname === "youtu.be") {
    return /^\/[A-Za-z0-9_-]{11}$/.test(url.pathname)
  }
  return (
    /^\/@[A-Za-z0-9._-]+\/?$/.test(url.pathname) ||
    (url.pathname === "/watch" &&
      /^[A-Za-z0-9_-]{11}$/.test(url.searchParams.get("v") ?? ""))
  )
}

const safeSourceUrl = z
  .string()
  .url()
  .refine(isSupportedBasketballUrl, "URL must be a safe supported basketball source URL")

const safeYoutubeVideoUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value)
    return (
      url.protocol === "https:" &&
      ((url.hostname === "www.youtube.com" &&
        url.pathname === "/watch" &&
        /^[A-Za-z0-9_-]{11}$/.test(url.searchParams.get("v") ?? "")) ||
        (url.hostname === "youtu.be" &&
          /^\/[A-Za-z0-9_-]{11}$/.test(url.pathname)))
    )
  }, "Game video must be a direct safe YouTube watch URL")

const nonNegative = z.number().finite().nonnegative()
const nullablePct = z.number().finite().min(0).max(100).nullable()

const shootingLineSchema = z
  .object({
    made: nonNegative.int(),
    attempted: nonNegative.int(),
    percentage: nullablePct,
  })
  .superRefine((line, context) => {
    if (line.made > line.attempted) {
      context.addIssue({
        code: "custom",
        message: "Made shots cannot exceed attempts",
      })
    }
    if (line.attempted === 0 && line.percentage !== null) {
      context.addIssue({
        code: "custom",
        message: "Zero-attempt shooting percentages must be null",
      })
    }
    if (line.attempted > 0) {
      const expected = Math.round((line.made / line.attempted) * 1000) / 10
      if (
        line.percentage === null ||
        Math.abs(line.percentage - expected) > 0.6
      ) {
        context.addIssue({
          code: "custom",
          message: "Shooting percentage does not match made/attempted",
        })
      }
    }
  })

const countingLineSchema = z.object({
  points: nonNegative.int(),
  rebounds: nonNegative.int(),
  assists: nonNegative.int(),
  steals: nonNegative.int(),
  blocks: nonNegative.int(),
  turnovers: nonNegative.int(),
  fouls: nonNegative.int(),
  fieldGoals: shootingLineSchema,
  threePointers: shootingLineSchema,
  freeThrows: shootingLineSchema,
})

const boxScorePlayerSchema = countingLineSchema.extend({
  playerId: z.string().min(1),
  playerName: z.string().trim().min(1).max(100),
  jersey: nonNegative.int().nullable(),
})

const boxScoreSideSchema = z.object({
  teamId: z.string().min(1),
  teamName: z.string().trim().min(1).max(100),
  score: nonNegative.int(),
  players: z.array(boxScorePlayerSchema).min(1),
  totals: countingLineSchema,
})

export const teamSnapshotSchema = z
  .object({
    schemaVersion: z.literal(2),
    generatedAt: z.string().datetime(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    identity: z.object({
      provider: z.enum(["stm", "teamlinkt"]),
      leagueId: z.string().trim().min(1).max(100),
      seasonId: z.string().trim().min(1).max(100),
      teamId: z.string().trim().min(1).max(100),
      name: z.string().trim().min(1).max(100),
      seasonName: z.string().trim().min(1).max(100),
      leagueName: z.string().trim().min(1).max(100),
      timezone: z.literal("America/Toronto"),
      youtubeChannelUrl: safeSourceUrl,
    }),
    capabilities: z.object({
      roster: z.boolean(),
      standings: z.enum(["official", "derived", "unavailable"]),
      leagueLeaders: z.enum(["official", "derived", "unavailable"]),
      boxScores: z.boolean(),
      liveScores: z.boolean(),
      gameVideos: z.boolean(),
    }),
    team: z.object({
      id: z.string().trim().min(1).max(100),
      name: z.string().trim().min(1).max(100),
      season: z.string().trim().min(1).max(100),
      wins: nonNegative.int(),
      losses: nonNegative.int(),
      pointsFor: nonNegative.int(),
      pointsAgainst: nonNegative.int(),
      differential: z.number().int(),
      standing: z.number().int().positive(),
    }),
    roster: z.array(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(100),
        jersey: nonNegative.int().nullable(),
        gamesPlayed: nonNegative.int(),
        ppg: nonNegative,
        rpg: nonNegative,
        apg: nonNegative,
        spg: nonNegative,
        bpg: nonNegative,
        fgPct: nullablePct,
        threePct: nullablePct,
        ftPct: nullablePct,
      })
    ),
    games: z.array(
      z.object({
        id: z.string().trim().min(1).max(100),
        date: z.string().date(),
        scheduledAt: z.string().datetime({ local: true }).nullable(),
        displayTime: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .nullable(),
        state: z.enum([
          "scheduled",
          "live",
          "final",
          "forfeit",
          "unreported",
          "bye",
          "postponed",
          "canceled",
          "rescheduled",
          "tbd",
        ]),
        opponentId: z.string().min(1),
        opponentName: z.string().trim().min(1).max(100),
        venue: z.string().trim().max(200).nullable(),
        isHome: z.boolean(),
        teamScore: nonNegative.int().nullable(),
        opponentScore: nonNegative.int().nullable(),
        result: z.enum(["W", "L"]).nullable(),
        officialUrl: safeSourceUrl,
        hasBoxScore: z.boolean(),
        videoUrl: safeYoutubeVideoUrl.nullable(),
        videoTitle: z.string().trim().min(1).max(200).nullable(),
      })
    ),
    standings: z.array(
      z.object({
        rank: z.number().int().positive(),
        teamId: z.string().min(1),
        teamName: z.string().trim().min(1).max(100),
        wins: nonNegative.int(),
        losses: nonNegative.int(),
        gamesPlayed: nonNegative.int(),
        winPct: z.number().finite().min(0).max(1),
        pointsFor: nonNegative.int(),
        pointsAgainst: nonNegative.int(),
        differential: z.number().int(),
        streak: z.string().trim().min(1).max(20),
        form: z.array(z.enum(["W", "L"])).max(10).optional(),
      })
    ),
    teamLeaders: z.array(
      z.object({
        category: z.enum(["ppg", "rpg", "apg", "spg", "bpg"]),
        label: z.string().min(1),
        playerName: z.string().min(1),
        teamName: z.string().min(1),
        value: nonNegative,
        unit: z.string().min(1),
        tied: z.boolean(),
      })
    ),
    leagueLeaders: z.array(
      z.object({
        category: z.enum(["ppg", "rpg", "apg", "spg", "bpg"]),
        label: z.string().min(1),
        playerName: z.string().min(1),
        teamName: z.string().min(1),
        value: nonNegative,
        unit: z.string().min(1),
        tied: z.boolean(),
      })
    ),
    teamStats: z.object({
      gamesWithBoxScores: nonNegative.int(),
      pointsPerGame: nonNegative,
      reboundsPerGame: nonNegative,
      assistsPerGame: nonNegative,
      stealsPerGame: nonNegative,
      blocksPerGame: nonNegative,
      fieldGoalPct: nullablePct,
      threePointPct: nullablePct,
      freeThrowPct: nullablePct,
    }),
    boxScores: z.array(
      z.object({
        gameId: z.string().trim().min(1).max(100),
        date: z.string().date(),
        officialUrl: safeSourceUrl,
        home: boxScoreSideSchema,
        away: boxScoreSideSchema,
      })
    ),
    sources: z.array(
      z.object({
        label: z.string().min(1),
        url: safeSourceUrl,
        checkedAt: z.string().datetime(),
        hash: z.string().regex(/^[a-f0-9]{64}$/),
      })
    ),
  })
  .superRefine((snapshot, context) => {
    if (
      snapshot.team.id !== snapshot.identity.teamId ||
      snapshot.team.name !== snapshot.identity.name ||
      snapshot.team.season !== snapshot.identity.seasonName
    ) {
      context.addIssue({
        code: "custom",
        path: ["identity"],
        message: "Snapshot identity must match the selected team summary",
      })
    }

    const ids = snapshot.roster.map((player) => player.id)
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["roster"],
        message: "Roster contains duplicate player identities",
      })
    }

    for (const [index, game] of snapshot.games.entries()) {
      if ((game.videoUrl === null) !== (game.videoTitle === null)) {
        context.addIssue({
          code: "custom",
          path: ["games", index, "videoUrl"],
          message: "Game video URL and title must be published together",
        })
      }
      const weekday = new Date(`${game.date}T12:00:00Z`).getUTCDay()
      if (
        snapshot.identity.provider === "stm" &&
        weekday === 3 &&
        game.displayTime !== "20:00"
      ) {
        context.addIssue({
          code: "custom",
          path: ["games", index, "displayTime"],
          message: "Wednesday Team 1 games must be exactly 20:00",
        })
      }

      const decided = game.state === "final" || game.state === "forfeit"
      if (decided) {
        if (game.teamScore === null || game.opponentScore === null) {
          context.addIssue({
            code: "custom",
            path: ["games", index],
            message: "Completed games require both scores",
          })
        } else if (game.teamScore === game.opponentScore) {
          context.addIssue({
            code: "custom",
            path: ["games", index],
            message: "Completed basketball games cannot be tied",
          })
        }
      } else if (
        game.teamScore !== null ||
        game.opponentScore !== null ||
        game.result !== null
      ) {
        context.addIssue({
          code: "custom",
          path: ["games", index],
          message: "Unfinished games cannot publish a result",
        })
      }
    }

    for (const [index, row] of snapshot.standings.entries()) {
      if (row.wins + row.losses !== row.gamesPlayed) {
        context.addIssue({
          code: "custom",
          path: ["standings", index],
          message: "Standing record must equal games played",
        })
      }
      if (row.pointsFor - row.pointsAgainst !== row.differential) {
        context.addIssue({
          code: "custom",
          path: ["standings", index],
          message: "Standing differential is inconsistent",
        })
      }
    }

    const teamStanding = snapshot.standings.find(
      (row) => row.teamName === snapshot.team.name
    )
    if (
      !teamStanding ||
      teamStanding.wins !== snapshot.team.wins ||
      teamStanding.losses !== snapshot.team.losses ||
      teamStanding.rank !== snapshot.team.standing ||
      teamStanding.pointsFor !== snapshot.team.pointsFor ||
      teamStanding.pointsAgainst !== snapshot.team.pointsAgainst
    ) {
      context.addIssue({
        code: "custom",
        path: ["team"],
        message: "Team summary must match the selected team standings row",
      })
    }

    for (const [index, boxScore] of snapshot.boxScores.entries()) {
      const game = snapshot.games.find(
        (candidate) => candidate.id === boxScore.gameId
      )
      if (!game || game.state !== "final") {
        context.addIssue({
          code: "custom",
          path: ["boxScores", index],
          message: "Box score must belong to a final scheduled game",
        })
        continue
      }
      const teamSide =
        boxScore.home.teamId === snapshot.team.id
          ? boxScore.home
          : boxScore.away
      const opponentSide =
        boxScore.home.teamId === snapshot.team.id
          ? boxScore.away
          : boxScore.home
      if (
        teamSide.score !== game.teamScore ||
        opponentSide.score !== game.opponentScore ||
        teamSide.totals.points !== teamSide.score ||
        opponentSide.totals.points !== opponentSide.score
      ) {
        context.addIssue({
          code: "custom",
          path: ["boxScores", index],
          message: "Box-score totals must match the published final score",
        })
      }
    }
  })

/** @deprecated Use teamSnapshotSchema. */
export const team1SnapshotSchema = teamSnapshotSchema
