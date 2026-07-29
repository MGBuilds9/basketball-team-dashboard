# STM Team 1 Command Center

An unlisted, offline-capable Team 1 dashboard for the STM Summer 2026 men’s
basketball season.

## What it includes

- Team 1 schedule and results with official game links
- Wednesday games validated at exactly 8:00 p.m. Toronto time
- Standings, roster, Team 1 leaders, and league leaders
- Team statistics derived from published completed-game tables
- Local two-team box scores with official STM links
- Dark and light themes, desktop sidebar, mobile bottom rail, and noindex controls

## Data integrity

The app does not scrape STM in the browser. `npm run sync` downloads server-rendered
HTML, parses it with Cheerio, validates the normalized contract with Zod, and writes
a snapshot only when normalized content changes. A malformed or inconsistent update
fails before it can replace the last-known-good data.

STM currently publishes several inconsistent derived “Diff” cells. This dashboard
uses the published PF and PA values and computes `PF - PA`, while preserving STM’s
published rank and record.

## Local development

Node 22 is the supported runtime.

```bash
npm ci
npm run sync
npm run dev
```

Useful gates:

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

`npm run fixtures:capture` refreshes sanitized, bounded parser fixtures. Raw STM
responses are never committed.

## Branch and release model

- `main`: application code, tests, configuration, and workflows
- `data`: `snapshot.json` and `receipt.json` only
- `publish.yml`: the only production path

The sync workflow runs at 07:17, 15:17, and 23:17 America/Toronto and supports
manual dispatch. An unchanged source check stops before a data commit, browser test,
build, or deployment. A changed source produces one data commit and calls the shared
publish workflow. The publish workflow tests a resolved `main`/`data` pair, rejects
stale queued work, and deploys the exact uploaded artifact.

Scheduled GitHub Actions can still be delayed by GitHub’s scheduler.

## Privacy and indexing

GitHub Pages is public hosting. This application is unlisted, not private. It ships
`noindex,nofollow,noarchive`, a deny-all `robots.txt`, and no analytics.
