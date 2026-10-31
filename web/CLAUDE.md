# Vida web (PWA) — project rules

Installable PWA, TypeScript strict, UI in Portuguese. Mirrors the native app in `../ios`; product rules are in `../docs/PRODUCT-RULES.md`.

## Build
- `npm ci`, `npm run dev`, `npm test` (Vitest), `npm run build` (typecheck + Vite + service-worker precache injection).
- Deployed by `.github/workflows/web.yml` to GitHub Pages. Vite `base` stays `'./'`.

## Rules
- **Zero runtime dependencies.** Only devDependencies (Vite, TypeScript, Vitest, jsdom, @types/node).
- **Money is integer cents**, formatted only through `formatMoney`. Splits use largest remainder (`split`).
- **Dates are `Day` integers** (days since 1970 UTC). No `Date` arithmetic in the domain.
- **Logic lives in `src/domain`** (pure, no DOM) with a test in `tests/`. Screens compute once via `makeFinanceModel`.
- **Never change a plan or goal without a confirmation dialog.**
- New persisted fields need a default in `defaultState()` and handling in `normalize()` so old backups still load.
- Weekdays are ISO (1 = Monday … 7 = Sunday); times are minutes since midnight.
- No personal data in the repo (no emails, team IDs, tokens).
