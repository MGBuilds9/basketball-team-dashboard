import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

const views = [
  "overview",
  "schedule",
  "standings",
  "roster",
  "leaders",
  "team-stats",
  "box-scores",
] as const

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  for (const theme of ["dark", "light"] as const) {
    test.describe(`${viewport.name} ${theme}`, () => {
      for (const view of views) {
        test(`${view} renders without browser or accessibility errors`, async ({
          page,
        }) => {
          const errors: string[] = []
          page.on("console", (message) => {
            if (message.type() === "error") errors.push(message.text())
          })
          await page.setViewportSize(viewport)
          await page.addInitScript((selectedTheme) => {
            localStorage.setItem("team-1-theme", selectedTheme)
          }, theme)
          await page.goto(`/#/${view}`)
          await expect(page.locator("h1")).toBeVisible()
          await expect(page.locator("html")).toHaveClass(theme)
          expect(errors).toEqual([])
          const results = await new AxeBuilder({ page })
            .disableRules(["color-contrast"])
            .analyze()
          expect(results.violations).toEqual([])
        })
      }
    })
  }
}

test("schedule publishes Wednesday games at 8 p.m. and never 10 p.m.", async ({
  page,
}) => {
  await page.goto("/#/schedule")
  await expect(page.getByText("WED, JUL 29, 2026")).toBeVisible()
  await expect(
    page
      .locator("article", { hasText: "WED, JUL 29, 2026" })
      .getByText("8:00 p.m.")
  ).toBeVisible()
  await expect(page.getByText("10:00 p.m.")).toHaveCount(0)
})

test("mobile More sheet exposes all secondary views", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/#/overview")
  await page.getByRole("button", { name: "More" }).click()
  await expect(
    page.getByRole("heading", { name: "More Team 1 views" })
  ).toBeVisible()
  await expect(page.getByRole("link", { name: "Leaders" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Team Stats" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Box Scores" })).toBeVisible()
})

test("game books include both teams and retain the official link", async ({
  page,
}) => {
  await page.goto("/#/box-scores/ecbe5296-d355-4d8a-abf5-6ba6f73d2964")
  await expect(page.getByRole("table")).toHaveCount(2)
  await expect(page.locator(".scoreboard-card")).toContainText("Team 1")
  await expect(page.locator(".scoreboard-card")).toContainText("Team 2")
  await expect(
    page.getByRole("link", { name: "Official STM game" })
  ).toHaveAttribute("href", /^https:\/\/stmsports\.ca\/mens-basketball\/game\//)
})

test("hash navigation remains functional after the network goes offline", async ({
  context,
  page,
}) => {
  await page.goto("/#/overview")
  await context.setOffline(true)
  await page.getByRole("link", { name: "Schedule" }).first().click()
  await expect(page).toHaveURL(/#\/schedule$/)
  await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible()
})

test("reduced motion removes meaningful transition duration", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/#/overview")
  const duration = await page
    .locator("article")
    .first()
    .evaluate((element) => getComputedStyle(element).transitionDuration)
  expect(["0s", "0.00001s", "1e-05s"]).toContain(duration)
})
