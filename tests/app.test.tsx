import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import App from "@/App"
import { ThemeProvider } from "@/components/theme-provider"

function renderApp(hash: string) {
  window.location.hash = hash
  return render(
    <ThemeProvider defaultTheme="dark" storageKey="test-theme">
      <App />
    </ThemeProvider>
  )
}

describe("Team 1 interface", () => {
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
      screen.getByRole("heading", { name: /Team 1 Command Center/ })
    ).toBeInTheDocument()
    expect(screen.getByText("Wednesday, July 29, 2026")).toBeInTheDocument()
    expect(screen.getByText("8:00 p.m.")).toBeInTheDocument()
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
    fireEvent.change(screen.getByRole("textbox", { name: "Search roster" }), {
      target: { value: "Shady" },
    })
    expect(screen.getByText("Shady Bishay")).toBeInTheDocument()
    expect(screen.queryByText("Ramy Bishay")).not.toBeInTheDocument()
  })
})
