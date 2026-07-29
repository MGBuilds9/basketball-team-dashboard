import fs from "node:fs"

import { describe, expect, it } from "vitest"

import snapshotJson from "../data/snapshot.json"
import { team1SnapshotSchema } from "@/data/schema"
import type { Team1Snapshot } from "@/data/types"

const base = snapshotJson as Team1Snapshot
const clone = () => structuredClone(base)

describe("Team1Snapshot validation", () => {
  it("accepts the current validated live snapshot", () => {
    expect(team1SnapshotSchema.parse(base).contentHash).toBe(base.contentHash)
  })

  it("fails closed on a Wednesday 10:00 p.m. game", () => {
    const snapshot = clone()
    const wednesday = snapshot.games.find((game) => game.date === "2026-07-29")!
    wednesday.displayTime = "22:00"
    expect(() => team1SnapshotSchema.parse(snapshot)).toThrow(/Wednesday/)
  })

  it("supports all published game states and a doubleheader", () => {
    const snapshot = clone()
    const seed = snapshot.games.find((game) => game.state === "scheduled")!
    const states = [
      "scheduled",
      "live",
      "postponed",
      "canceled",
      "rescheduled",
      "tbd",
    ] as const
    snapshot.games.push(
      ...states.map((state, index) => ({
        ...seed,
        id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        date: "2026-08-08",
        scheduledAt: state === "tbd" ? null : `2026-08-08T${12 + index}:00:00`,
        displayTime: state === "tbd" ? null : `${12 + index}:00`,
        state,
      }))
    )
    expect(() => team1SnapshotSchema.parse(snapshot)).not.toThrow()
  })

  it.each([
    [
      "negative values",
      (snapshot: Team1Snapshot) => {
        snapshot.standings[0].wins = -1
      },
    ],
    [
      "inconsistent records",
      (snapshot: Team1Snapshot) => {
        snapshot.standings[0].gamesPlayed += 1
      },
    ],
    [
      "unsafe URLs",
      (snapshot: Team1Snapshot) => {
        snapshot.games[0].officialUrl = "https://evil.example/game"
      },
    ],
    [
      "duplicate identities",
      (snapshot: Team1Snapshot) => {
        snapshot.roster[1].id = snapshot.roster[0].id
      },
    ],
    [
      "tied finals",
      (snapshot: Team1Snapshot) => {
        snapshot.games[0].opponentScore = snapshot.games[0].team1Score
      },
    ],
    [
      "box-score mismatches",
      (snapshot: Team1Snapshot) => {
        snapshot.boxScores[0].away.score += 1
      },
    ],
    [
      "impossible shooting lines",
      (snapshot: Team1Snapshot) => {
        snapshot.boxScores[0].home.players[0].fieldGoals.made = 99
      },
    ],
  ])("rejects %s", (_label, mutate) => {
    const snapshot = clone()
    mutate(snapshot)
    expect(() => team1SnapshotSchema.parse(snapshot)).toThrow()
  })

  it("represents zero-attempt shooting with a null percentage", () => {
    const zeroAttempt = base.boxScores
      .flatMap((score) => [...score.home.players, ...score.away.players])
      .find((player) => player.fieldGoals.attempted === 0)
    expect(zeroAttempt?.fieldGoals.percentage).toBeNull()
  })

  it("keeps unsafe HTML APIs out of application source", () => {
    const files = [
      "src/App.tsx",
      "src/components/ui/chart.tsx",
      "src/data/parser.ts",
    ]
    for (const file of files) {
      expect(fs.readFileSync(file, "utf8")).not.toContain(
        "dangerouslySetInnerHTML"
      )
    }
  })
})
