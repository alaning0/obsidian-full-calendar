# Full Calendar Plugin

> **Fork note:** This is [alaning0/obsidian-full-calendar](https://github.com/alaning0/obsidian-full-calendar), forked from [obsidian-community/obsidian-full-calendar](https://github.com/obsidian-community/obsidian-full-calendar). It keeps the same plugin id (`obsidian-full-calendar`) so it can override a Community Plugin install. Upstream is tracked as the `upstream` remote.

Obsidian calendar plugin based on [FullCalendar](https://github.com/fullcalendar/fullcalendar). Events live as notes in your vault (or remote ICS/CalDAV). Upstream docs: [obsidian-community.github.io/obsidian-full-calendar](https://obsidian-community.github.io/obsidian-full-calendar/).

## Changes in this fork

- Today button stays enabled in week/month views
- Today highlight recovers correctly after sleep / overnight
- Configurable today background color (Settings → Full Calendar; default `#4a4a4a`)
- **Force mobile layout** toggle (toolbar `mobile`/`desktop` button, command, or Settings) for developing phone chrome on desktop
- Local calendars load notes in nested subfolders (e.g. `Year/2026-07/...`)
- Click a **day number** to open that day's Daily/Periodic Notes note (creates it if needed); click the **rest of the cell** to create an event
- Multi-day all-day events use an inclusive `endDate` in frontmatter and render as spanning bars in month/week views
- Click a **week number** to open that week's Periodic Notes weekly note (e.g. `Year/2026-W31.md`)
- Ribbon / open actions focus an existing calendar or day-note tab when it is already open but unfocused
- Sidebar calendar opens on the **left** with week view by default (command: **Open in left sidebar**)
- **Year** view: scrollable big-picture day grid for the whole calendar year, sticky month banners, scrolls to today
- **Seasons** view: Southern Hemisphere month layout for the year (Summer→Autumn→Winter→Spring), with the current month marked; ISO week chip tracker shows each week’s month (from the Monday start), weeks left, and opens weekly notes on click; calendar quarter cards (Q1–Q4) with progress summary
- ISO **week numbers** on the left in month/year (and other) views

## Installation

### From GitHub Releases (recommended)

1. Open the [latest release](https://github.com/alaning0/obsidian-full-calendar/releases/latest)
2. Download `obsidian-full-calendar.zip` (or the individual `main.js`, `manifest.json`, and `styles.css` files)
3. Unzip into `.obsidian/plugins/obsidian-full-calendar/` in your vault
4. Enable **Full Calendar** under Settings → Community plugins

Turn off auto-update for this plugin in Obsidian so the stock Community Plugin build does not overwrite the fork.

### BRAT (auto-update from this repo)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. Add beta plugin: `alaning0/obsidian-full-calendar`

### Build from source

```bash
npm ci --legacy-peer-deps
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` (rename `main.css` → `styles.css` if needed) into `.obsidian/plugins/obsidian-full-calendar`.

### Publishing a release

Push a version tag to trigger [.github/workflows/release.yml](.github/workflows/release.yml), which builds the plugin and uploads release assets:

```bash
npm version patch   # bumps package.json + manifest via the version script
git push origin HEAD --tags
```

## License

MIT, same as upstream. FullCalendar is MIT by [Adam Shaw](https://github.com/arshaw).
