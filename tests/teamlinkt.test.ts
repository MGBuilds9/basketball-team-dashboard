import { describe, expect, it } from "vitest"

import {
  deriveTeamLinktStandings,
  parseTeamLinktEvents,
  selectTeamLinktGames,
} from "../scripts/providers/teamlinkt"
import { extractYouTubeVideoIds } from "../scripts/youtube"

const row = (input: {
  id: number
  date: string
  time: string
  epoch: number
  homeId: number
  home: string
  homeScore?: number
  awayId: number
  away: string
  awayScore?: number
}) => ({
  "0": input.date,
  "1": input.time,
  "2": `Game <a href="https://leagues.teamlinkt.com/Leagues/event/9966/${input.id}">[Summary]</a>`,
  "3": `<span>${input.home}</span>${input.homeScore === undefined ? "" : ` (${input.homeScore})`}`,
  "4": `<span>${input.away}</span>${input.awayScore === undefined ? "" : ` (${input.awayScore})`}`,
  "5": "<a>SMSV Gym</a>",
  "6": input.epoch,
  home_association_team_id: input.homeId,
  away_assocation_team_id: input.awayId,
})

function parsedTiming(date: string, time: string, timeZone: string) {
  return parseTeamLinktEvents(
    {
      data: [
        row({
          id: 99,
          date,
          time,
          epoch: 0,
          homeId: 892656,
          home: "The Tax Collectors",
          awayId: 892655,
          away: "Cross Bearers",
        }),
      ],
    },
    "9966",
    timeZone
  )[0]
}

describe("TeamLinkt provider normalization", () => {
  const response = {
    data: [
      row({
        id: 1,
        date: "Sun May 31, 2026",
        time: "8:35 AM - 9:35 AM",
        epoch: 1_780_238_100,
        homeId: 892656,
        home: "The Tax Collectors",
        homeScore: 66,
        awayId: 892655,
        away: "Cross Bearers",
        awayScore: 59,
      }),
      row({
        id: 2,
        date: "Sun Jun 21, 2026",
        time: "6:30 PM - 7:30 PM",
        epoch: 1_782_088_200,
        homeId: 892654,
        home: "Bye",
        awayId: 892656,
        away: "The Tax Collectors",
      }),
      row({
        id: 3,
        date: "Sun Jul 26, 2026",
        time: "8:50 PM - 9:50 PM",
        epoch: 1_785_120_600,
        homeId: 892656,
        home: "The Tax Collectors",
        awayId: 892657,
        away: "The Judah Lions",
      }),
    ],
  }

  it("normalizes final, bye, and unreported games without trusting HTML", () => {
    const events = parseTeamLinktEvents(response, "9966", "America/Toronto")
    const games = selectTeamLinktGames(
      events,
      "892656",
      "2026-07-29T12:00:00.000Z",
      "https://www.youtube.com/@SBLHoops"
    )
    expect(games.map((game) => game.state)).toEqual([
      "final",
      "bye",
      "unreported",
    ])
    expect(games[0]).toMatchObject({
      opponentName: "Cross Bearers",
      displayTime: "08:35",
      teamScore: 66,
      opponentScore: 59,
      result: "W",
      video: {
        state: "channel_only",
        reason: "not_found",
      },
    })
    expect(games[1].video).toEqual({
      state: "not_expected",
      reason: "bye",
    })
  })

  it("derives standings from scored season games and excludes the Bye team", () => {
    const standings = deriveTeamLinktStandings(
      parseTeamLinktEvents(response, "9966", "America/Toronto")
    )
    expect(standings).toHaveLength(3)
    expect(standings.find((team) => team.teamId === "892656")).toMatchObject({
      rank: 1,
      wins: 1,
      losses: 0,
      pointsFor: 66,
      pointsAgainst: 59,
      streak: "W1",
      form: ["W"],
    })
    expect(standings.some((team) => team.teamName === "Bye")).toBe(false)
  })

  it("resolves summer and winter wall-clock times with the Toronto UTC offset", () => {
    expect(
      parsedTiming("Sun May 31, 2026", "8:35 AM - 9:35 AM", "America/Toronto")
    ).toMatchObject({
      scheduledAt: "2026-05-31T08:35:00",
      displayTime: "08:35",
      epochSeconds: Date.parse("2026-05-31T12:35:00.000Z") / 1000,
    })
    expect(
      parsedTiming("Sun Jan 11, 2026", "8:35 AM - 9:35 AM", "America/Toronto")
    ).toMatchObject({
      scheduledAt: "2026-01-11T08:35:00",
      displayTime: "08:35",
      epochSeconds: Date.parse("2026-01-11T13:35:00.000Z") / 1000,
    })
  })

  it("resolves the instant from the explicitly requested tenant time zone", () => {
    expect(
      parsedTiming("Sun May 31, 2026", "8:35 AM - 9:35 AM", "America/Vancouver")
        .epochSeconds
    ).toBe(Date.parse("2026-05-31T15:35:00.000Z") / 1000)
  })

  it("normalizes midnight and noon before resolving the Toronto instant", () => {
    expect(
      parsedTiming("Sun Jan 11, 2026", "12:00 AM - 1:00 AM", "America/Toronto")
    ).toMatchObject({
      scheduledAt: "2026-01-11T00:00:00",
      displayTime: "00:00",
      epochSeconds: Date.parse("2026-01-11T05:00:00.000Z") / 1000,
    })
    expect(
      parsedTiming("Sun Jan 11, 2026", "12:00 PM - 1:00 PM", "America/Toronto")
    ).toMatchObject({
      scheduledAt: "2026-01-11T12:00:00",
      displayTime: "12:00",
      epochSeconds: Date.parse("2026-01-11T17:00:00.000Z") / 1000,
    })
  })

  it("rejects a nonexistent Toronto wall-clock time during spring forward", () => {
    expect(() =>
      parsedTiming("Sun Mar 8, 2026", "2:30 AM - 3:30 AM", "America/Toronto")
    ).toThrow(/does not exist in America\/Toronto/)
  })

  it("rejects an ambiguous Toronto wall-clock time during fall back", () => {
    expect(() =>
      parsedTiming("Sun Nov 1, 2026", "1:30 AM - 2:30 AM", "America/Toronto")
    ).toThrow(/is ambiguous in America\/Toronto/)
  })
})

describe("YouTube upload discovery", () => {
  it("extracts unique direct video IDs from the public channel payload", () => {
    const html =
      '{"videoId":"bmWpYMKVNEI"}{"videoId":"bmWpYMKVNEI"}{"videoId":"6mEdC0PTWgA"}'
    expect(extractYouTubeVideoIds(html)).toEqual(["bmWpYMKVNEI", "6mEdC0PTWgA"])
  })
})
