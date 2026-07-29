# STM Team 1 Command Center — Design Contract

## Product boundary

This is a focused, mobile-first Team 1 command center. Team 1 is always the
primary subject; standings and league leaders are contextual. It is public but
unlisted, with no authentication, no search indexing, and no product expansion
into a general STM league dashboard.

## Visual direction

- Dark command-center theme by default with a complete light theme.
- Archivo Black for display headings and Source Sans 3 for body and tabular text.
- Deep navy surfaces, STM blue for interaction hierarchy, and orange only for
  source/status emphasis.
- No fake crests, player photography, fabricated venues, gradients, or decorative
  product controls.
- Geometry-matched initial skeletons run only during genuine application mounting.
- Desktop uses the full shadcn sidebar; mobile uses Overview, Schedule, Standings,
  Roster, and More. More opens a titled sheet for Leaders, Team Stats, and Box Scores.

## Information architecture

- `#/overview`
- `#/schedule`
- `#/standings`
- `#/roster`
- `#/leaders`
- `#/team-stats`
- `#/box-scores/<gameId>`

## Accessibility and interaction

Touch targets are at least 44 px in primary navigation, focus states are visible,
all interaction has an accessible name, semantic landmarks are unique, and reduced
motion removes meaningful transitions. The interface must pass automated axe checks
at 390×844 and 1440×900 in both themes.

## Source treatment

STM Sports is the operational source. The dashboard embeds one validated snapshot
and requires no runtime requests. Official game links are retained as secondary
references. Team Stats are derived only from completed games with published player
box-score tables.
