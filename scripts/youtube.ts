import fs from "node:fs/promises"
import path from "node:path"

import { z } from "zod"

import type { GameRow } from "../src/data/types"
import { fetchText } from "./source"

const youtubeVideoUrlSchema = z
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
  })

const overridesSchema = z.object({
  gameVideos: z.record(z.string().min(1), youtubeVideoUrlSchema),
})

interface YouTubeVideo {
  id: string
  title: string
  authorUrl: string
}

export interface VideoResolution {
  games: GameRow[]
  channelHtml: string
  matchedCount: number
}

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bthe\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function videoIdFromUrl(value: string): string | null {
  const url = new URL(value)
  if (url.hostname === "youtu.be") return url.pathname.slice(1) || null
  return url.searchParams.get("v")
}

export function extractYouTubeVideoIds(html: string, limit = 80): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const match of html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)) {
    const id = match[1]
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
    if (ids.length >= limit) break
  }
  return ids
}

function dateTokens(date: string): string[] {
  const value = new Date(`${date}T12:00:00Z`)
  const month = new Intl.DateTimeFormat("en-CA", {
    month: "long",
    timeZone: "UTC",
  }).format(value)
  const day = value.getUTCDate()
  const year = value.getUTCFullYear()
  return [
    normalized(`${month} ${day} ${year}`),
    normalized(`${month} ${day}th ${year}`),
    normalized(`${month} ${day}st ${year}`),
    normalized(`${month} ${day}nd ${year}`),
    normalized(`${month} ${day}rd ${year}`),
  ]
}

function containsName(title: string, aliases: string[]): boolean {
  return aliases.some((alias) => {
    const needle = normalized(alias)
    return needle.length > 0 && title.includes(needle)
  })
}

function hasPublishedDate(title: string): boolean {
  return (
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(
      title
    ) && /\b20\d{2}\b/.test(title)
  )
}

function canonicalChannel(value: string): string {
  return value.replace(/^http:/, "https:").replace(/\/+$/, "")
}

async function fetchVideo(id: string): Promise<YouTubeVideo | null> {
  const response = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${id}`
    )}&format=json`,
    {
      headers: {
        accept: "application/json",
        "user-agent":
          "Basketball-Team-Dashboard/1.0 (+https://github.com/MGBuilds9)",
      },
      signal: AbortSignal.timeout(15_000),
    }
  )
  if (!response.ok) return null
  const payload = (await response.json()) as {
    title?: unknown
    author_url?: unknown
  }
  if (
    typeof payload.title !== "string" ||
    typeof payload.author_url !== "string"
  ) {
    return null
  }
  return {
    id,
    title: payload.title,
    authorUrl: canonicalChannel(payload.author_url),
  }
}

async function readOverrides(): Promise<Record<string, string>> {
  const file = path.join(process.cwd(), "config", "video-overrides.json")
  const parsed = overridesSchema.parse(JSON.parse(await fs.readFile(file, "utf8")))
  return parsed.gameVideos
}

export async function resolveGameVideos(input: {
  games: GameRow[]
  channelUrl: string
  teamAliases: string[]
}): Promise<VideoResolution> {
  const channelUrl = canonicalChannel(input.channelUrl)
  const channelHtml = await fetchText(`${channelUrl}/videos`)
  const overrides = await readOverrides()
  const overrideIds = Object.values(overrides)
    .map(videoIdFromUrl)
    .filter((id): id is string => id !== null)
  const ids = [
    ...new Set([...overrideIds, ...extractYouTubeVideoIds(channelHtml)]),
  ]
  const videos = (await Promise.all(ids.map(fetchVideo))).filter(
    (video): video is YouTubeVideo =>
      video !== null && video.authorUrl === channelUrl
  )
  const gamesByOpponent = new Map<string, GameRow[]>()
  for (const game of input.games) {
    const key = normalized(game.opponentName)
    gamesByOpponent.set(key, [...(gamesByOpponent.get(key) ?? []), game])
  }

  let matchedCount = 0
  const games = input.games.map((game) => {
    const override = overrides[game.id]
    if (override) {
      const overrideId = videoIdFromUrl(override)
      const video = videos.find((candidate) => candidate.id === overrideId)
      if (!video) {
        throw new Error(
          `Video override for ${game.id} is not published by ${channelUrl}`
        )
      }
      matchedCount += 1
      return {
        ...game,
        videoUrl: `https://www.youtube.com/watch?v=${video.id}`,
        videoTitle: video.title,
      }
    }

    const candidates = videos.filter((video) => {
      const title = normalized(video.title)
      if (
        !containsName(title, input.teamAliases) ||
        !containsName(title, [game.opponentName])
      ) {
        return false
      }
      const publishedDate = hasPublishedDate(title)
      return !publishedDate || dateTokens(game.date).some((date) => title.includes(date))
    })
    const gamesAgainstOpponent =
      gamesByOpponent.get(normalized(game.opponentName)) ?? []
    const exact = candidates.filter((video) =>
      dateTokens(game.date).some((date) => normalized(video.title).includes(date))
    )
    const match =
      exact.length === 1
        ? exact[0]
        : exact.length === 0 &&
            candidates.length === 1 &&
            gamesAgainstOpponent.length === 1
          ? candidates[0]
          : null
    if (!match) {
      return { ...game, videoUrl: null, videoTitle: null }
    }
    matchedCount += 1
    return {
      ...game,
      videoUrl: `https://www.youtube.com/watch?v=${match.id}`,
      videoTitle: match.title,
    }
  })

  return { games, channelHtml, matchedCount }
}
