# Changelog

Based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). [Versão em português](docs/pt/CHANGELOG.md).

## [Unreleased]

### Added
- PWA account sync: sign in on any phone and the data follows. End-to-end encrypted (AES-256-GCM, key from the password), Supabase REST with no client library, conflict-safe. See [docs/SYNC.md](docs/SYNC.md).
- **Progressive Web App** in `web/`: full port of finance, agenda and notes; installable on the iPhone Home Screen with no expiry, offline via service worker, encrypted backup (AES-256, saved to iCloud Drive via the share sheet), `.ics` calendar export for bills and agenda items. 88 Vitest tests; deployed to GitHub Pages.
- Salary split into three destinations (spending account, savings, and one account per goal), with a donut chart.
- Period checklist: move money to savings, pay fixed bills, transfer to goals.
- Due dates and reminders on fixed bills; the alert stays silent once the bill is paid.
- Rolling leftover of the spending account across periods, with a reset option.
- Actual amount transferred to each goal; the plan adapts to it.
- Soft per-category colour theme and rounded type.

### Changed
- Repository is now a monorepo: native app moved to `ios/`, web app in `web/`, separate CI workflows.
- Period income is now the logged salary instead of a fixed value in settings.
- The goals screen shows only how much to transfer.

## [1.0] - 2026-10-30

### Added
- Pay-period finances (monthly or weekly), split presets, goals, automatic adaptation and history.
- Agenda with obligations, reminders, work days and local notifications.
- Note lists.
