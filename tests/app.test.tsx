import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import App from "@/App"
import { ThemeProvider } from "@/components/theme-provider"
import snapshotJson from "../data/snapshot.json"
import type { TeamSnapshot } from "@/data/types"

const snapshot = snapshotJson as TeamSnapshot
const providerLabel =
  snapshot.identity.provider === "stm" ? "STM Sports" : "TeamLinkt"

function renderApp(hash: string) {
  window.location.hash = hash
  return render(
    <ThemeProvider defaultTheme="dark" storageKey="test-theme">
      <App />
    </ThemeProvider>
  )
}

describe("selected-team interface", () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    cleanup()
    window.location.hash = ""
  })

  it("renders the operational overview with the corrected next-game time", () => {
    renderApp("#/overview")
    expect(
      screen.getByRole("heading", {
        name: new RegExp(
          `${snapshot.team.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} Command Center`
        ),
      })
    ).toBeInTheDocument()
    if (snapshot.identity.provider === "stm") {
      expect(screen.getByText("Wednesday, July 29, 2026")).toBeInTheDocument()
      expect(screen.getByText("8:00 p.m.")).toBeInTheDocument()
    }
  })

  it("uses direct game video links and a distinct channel fallback", () => {
    renderApp("#/schedule")
    const ready = snapshot.games.find((game) => game.videoUrl)!
    const pending = snapshot.games.find((game) => !game.videoUrl)!
    expect(
      screen.getByRole("link", {
        name: `Watch ${snapshot.team.name} ${
          ready.isHome ? "versus" : "at"
        } ${ready.opponentName} on YouTube`,
      })
    ).toHaveAttribute("href", ready.videoUrl)
    expect(
      screen.getAllByRole("link", {
        name: `Game video pending; check the ${providerLabel} YouTube channel`,
      })[0]
    ).toHaveAttribute("href", snapshot.identity.youtubeChannelUrl)
    expect(pending.videoUrl).toBeNull()
  })

  it("navigates hash routes without a data request", () => {
    renderApp("#/standings")
    expect(
      screen.getByRole("heading", { name: /Standings/ })
    ).toBeInTheDocument()
    window.location.hash = "#/roster"
    fireEvent(window, new HashChangeEvent("hashchange"))
    expect(screen.getByRole("heading", { name: /Roster/ })).toBeInTheDocument()
  })

  it("filters the roster locally", () => {
    renderApp("#/roster")
    const selected = snapshot.roster[0]
    const excluded = snapshot.roster[1]
    fireEvent.change(screen.getByRole("textbox", { name: "Search roster" }), {
      target: { value: selected.name },
    })
    expect(screen.getByText(selected.name)).toBeInTheDocument()
    expect(screen.queryByText(excluded.name)).not.toBeInTheDocument()
  })
})
