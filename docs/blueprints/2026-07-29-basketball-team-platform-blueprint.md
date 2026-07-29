# Basketball Team Platform Blueprint

## Part 0: Classification and assumptions

**Project type:** Public-but-unlisted, mobile-first sports data application with
scheduled ingestion.

**Design archetype:** Courtside Editorial. The application should feel like a
well-produced basketball publication with the speed and information density of a
scorekeeping product.

| Assumption | Rationale |
| --- | --- |
| Every team deployment is an independent Git project | A broken source or release for one league must not affect another team. |
| A canonical base repository owns shared code | Visual, accessibility, parser, validation, and iOS-oriented model improvements should be made once. |
| Team repositories contain configuration and snapshots, not divergent application forks | This keeps upstream Git merges predictable. |
| Official public league pages are the operational sources | STM and TeamLinkt already publish the schedule, results, roster, and statistics required by the product. |
| GitHub Pages remains the initial hosting target | It supports the existing single-file, offline-capable, unlisted release model at no added monthly cost. |

**Identified risks**

- Source HTML and undocumented public endpoints can change without notice.
- TeamLinkt responses contain fields the dashboard does not need. Adapters must
  whitelist normalized fields and must never persist raw payloads or team join data.
- TeamLinkt's public standings screen currently defaults to an unrelated division
  for the selected season. The adapter must derive standings and recent form from
  official season game results, then cross-check the selected team's record against
  the official team summary.
- GitHub does not allow same-owner repositories to behave like normal GitHub forks
  in every configuration. Child projects therefore share history and use a normal
  `upstream` Git remote instead of relying on GitHub's fork button.
- A provider may omit a roster, a box score, or one statistical category. Missing
  provider capability is a visible data state, not fabricated zero data.

## Part 1: Foundation

**Core function:** Turn any supported league team's official public data into a
fast, polished, team-first basketball command center.

**Success metrics**

- A new team using an existing provider requires only one reviewed configuration
  file and a fresh validated data snapshot.
- Every child project can merge a base release without editing shared source files.
- Unchanged source data produces no snapshot commit and no deployment.
- Invalid changed data preserves the last-known-good release.
- All seven views remain usable at 390 x 844 and 1440 x 900 in dark and light modes.

| Persona | Need | Primary action |
| --- | --- | --- |
| Player | Know the next game, recent result, record, and personal/team performance | Open Overview, then a game or leader detail |
| Teammate | See the same reliable team information without learning the league site | Use Schedule, Standings, Roster, Leaders, Team Stats, and Box Scores |
| Maintainer | Add another team or ship a shared improvement once | Create a child from the base and merge future base releases |

**Positioning:** Your team, distilled. Official league data with basketball-native
presentation and none of the league-site friction.

## Part 2: Repository and release architecture

### Repositories

| Repository | Responsibility | Team-specific files |
| --- | --- | --- |
| `basketball-team-dashboard` | Canonical React UI, normalized contract, validation, provider adapters, shared workflows, tests, and documentation | Example configuration and sanitized fixtures only |
| `stm-team-1-dashboard` | STM Team 1 production project | `config/team.json`, optional reviewed overrides, `data` branch |
| `tax-collectors-dashboard` | SMSV/TeamLinkt Tax Collectors production project | `config/team.json`, optional reviewed overrides, `data` branch |

### Git inheritance

Each child is cloned from the base history and keeps two remotes:

```text
origin    git@github.com:MGBuilds9/<team-project>.git
upstream  git@github.com:MGBuilds9/basketball-team-dashboard.git
```

The upgrade operation is ordinary Git:

```bash
git fetch upstream
git merge upstream/main
npm ci
npm run verify
git push origin main
```

The base never edits a child project's `config/team.json` after initialization.
Base releases are tagged. Child upgrades use a reviewed merge commit or fast-forward
and pass that child's complete release gate before deployment.

### Why not copy, templates, submodules, or a monorepo?

| Option | Result |
| --- | --- |
| Copy files | Immediate drift and no upgrade path |
| GitHub template only | Easy creation, but no maintained ancestry or automatic upstream |
| Git submodule | Makes local development and Pages workflows fragile for a small app |
| Single monorepo | Couples releases and source failures despite the requirement for separate projects |
| Shared Git history plus upstream remote | Independent projects, familiar Git, traceable upgrades, minimal machinery |

## Part 3: Technical stack

| Layer | Recommended | Alternative | Rationale |
| --- | --- | --- | --- |
| Web application | React, TypeScript, Vite | Next.js static export | Existing tested stack and one-file artifact |
| UI system | Tailwind CSS and shadcn/ui | CSS Modules | Accessible primitives and reusable design tokens |
| Charts | Recharts through shadcn Chart | Visx | Already installed and sufficient for small basketball datasets |
| Data validation | Zod | Valibot | Existing cross-field validation investment |
| Routine extraction | Provider adapters using `fetch`, Cheerio, and JSON parsing | Playwright | Cheap and deterministic; browser only for verified gaps |
| Persistence | Versioned JSON snapshot on `data` branch | SQLite artifact | Offline, reviewable, and no runtime backend |
| Automation | GitHub Actions | Forge scheduled job | Existing exact-artifact Pages release path |
| Hosting | GitHub Pages | Cloudflare Pages | Zero monthly cost and proven current deployment |

**Estimated monthly cost:** $0 at the current scale.

## Part 4: Design system and information architecture

The approved Courtside Editorial direction is the base visual system. Team branding
is expressed through constrained tokens, not one-off layouts.

```text
/
├── #/overview
├── #/schedule
├── #/standings
├── #/roster
├── #/leaders
├── #/team-stats
└── #/box-scores/<gameId>
```

Desktop uses a persistent sidebar. Mobile uses a five-item bottom rail plus a titled
More sheet. Skeletons match the final geometry and appear only during genuine initial
mounting or reload.

Required basketball visual grammar:

- next-game matchup card with date, tip time, venue, and home/away role;
- result scoreline with W/L hierarchy and opponent context;
- standings neighborhood centered on the selected team, including each nearby
  team's recent W/L form;
- schedule state treatments for scheduled, live, final, forfeit, postponed,
  canceled, rescheduled, TBD, missing score, and missing box score;
- leader cards for scoring, rebounding, assists, steals, and blocks;
- shooting splits that distinguish zero attempts from missing data;
- game books that show both teams' player lines and verified totals.

## Part 5: Normalized data contract

Rename the current `Team1Snapshot` to `TeamSnapshot` and remove literal STM and Team 1
constraints from shared types.

```ts
interface TeamIdentity {
  provider: "stm" | "teamlinkt";
  leagueId: string;
  seasonId: string;
  teamId: string;
  name: string;
  seasonName: string;
  timezone: string;
}

interface ProviderCapabilities {
  roster: boolean;
  standings: "official" | "derived" | "unavailable";
  leagueLeaders: "official" | "derived" | "unavailable";
  boxScores: boolean;
  liveScores: boolean;
}

interface TeamSnapshot {
  schemaVersion: 2;
  generatedAt: string;
  contentHash: string;
  identity: TeamIdentity;
  capabilities: ProviderCapabilities;
  team: TeamSummary;
  roster: PlayerRow[];
  games: GameRow[];
  standings: StandingRow[];
  teamLeaders: LeaderRow[];
  leagueLeaders: LeaderRow[];
  teamStats: TeamStats;
  boxScores: GameBoxScore[];
  sources: SourceReference[];
}
```

The UI consumes only `TeamSnapshot`. Provider-specific shapes stop at the adapter.

## Part 6: Provider boundary

```ts
interface LeagueSourceAdapter {
  readonly provider: TeamIdentity["provider"];
  probe(config: TeamConfig): Promise<SourceProbe>;
  buildSnapshot(config: TeamConfig, previous?: TeamSnapshot): Promise<TeamSnapshot>;
}
```

### STM adapter

- Server-rendered schedule, standings, team, stats, and game pages.
- Wednesday 8:00 p.m. correction remains an STM configuration rule, not a global
  basketball rule.
- Published box-score tables remain the source for player and team totals.

### TeamLinkt adapter

Configuration:

```json
{
  "provider": "teamlinkt",
  "leagueId": "9966",
  "seasonId": "57100",
  "teamId": "892656",
  "teamName": "The Tax Collectors",
  "seasonName": "2026 Summer Men's Season",
  "timezone": "America/Toronto"
}
```

Live source plan:

- team identity: `/leagues/getTeam/9966/892656`;
- team home summary: `/leagues/getTeamHomePage/892656`;
- roster: `/leagues/getTeamRosterForDatatable/9966/892656/1`;
- team and league schedule: `/leagues/getAllEvents/9966`;
- event summary: `/Leagues/event/9966/<eventId>`;
- published event statistics: `/leagues/getPlayerStatsForEvent/9966`.

The event page exposes the short-lived/public request header required by the event
statistics call. The adapter discovers it at sync time and never stores it.

Standings and recent form are derived deterministically from completed official
season events because the public standings route currently selects the wrong
division. The selected team's derived record must match the official team home
summary before the snapshot can publish.

League and team leaders are derived only from games with published official player
statistics. The dashboard labels the coverage count so incomplete games are visible.

## Part 7: Validation and failure recovery

| Failure point | Detection | User-facing result | Recovery |
| --- | --- | --- | --- |
| Source unavailable | HTTP status, timeout, minimum payload markers | Existing release shows stale/freshness status | Retry next scheduled run; keep last-known-good |
| Source layout changed | Adapter parser tests and required markers | No data replacement | Capture sanitized fixture and update base adapter |
| Identity mismatch | Config values versus official response | No data replacement | Review team configuration |
| Standings mismatch | Derived record versus official team summary | No data replacement | Inspect missing or rescored events |
| Missing event statistics | Explicit capability/coverage count | Game result remains, box score marked unavailable | Publish when official statistics appear |
| Unsafe provider content | URL allowlist, HTML stripping, schema limits | Content remains inert | Reject malformed source |
| Stale queued release | Code/data revision comparison | Previous production remains live | Latest workflow publishes exact tested pair |

## Part 8: Project creation checklist

1. Clone `basketball-team-dashboard`.
2. Rename `origin` to `upstream`.
3. Create the new empty GitHub repository and add it as `origin`.
4. Add the team's `config/team.json`.
5. Run a fresh provider proof and commit only sanitized fixtures.
6. Seed the `data` branch from a validated live snapshot.
7. Run lint, unit tests, build, browser tests, accessibility, and bundle budgets.
8. Enable GitHub Pages from the custom workflow.
9. Verify production on phone and desktop.

## Part 9: Deferred work

- Native SwiftUI client consuming the same `TeamSnapshot` schema.
- A private authenticated team mode.
- Push notifications and calendar subscriptions.
- Multiple concurrent seasons in one child project.
- Cross-team account home screen.
