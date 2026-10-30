# Architecture

> [Versão em português](pt/ARCHITECTURE.md)

## Overview

```
View (SwiftUI)  →  FinanceModel (ready-made structs)  →  Domain (pure Swift)
      ↑                          ↑
 @Query (filtered)        SwiftData (@Model)
```

- **Views** only present data. They receive precomputed structs and hold no business rules.
- **`FinanceModel.make`** runs once per data update and returns everything a screen needs: summary, goals, account split, checklist, adaptation.
- **Domain** holds the rules in pure Swift: no SwiftData, no SwiftUI, with an injected `Calendar`. That makes it testable with fixed dates.
- **Models** are SwiftData `@Model` classes.

## Layers

| Folder | Contents |
|---|---|
| `Vida/App` | app entry, tabs, router (notification taps), seed data |
| `Vida/Domain` | `PayPeriodCalculator`, `BudgetCalculator`, `GoalCalculator`, `PlanAdapter`, `AccountSplitCalculator`, `BillCalculator`, `CarryOverCalculator`, `NotificationPlanner`, `Money` |
| `Vida/Models` | `FinanceSettings`, `FixedExpense`, `Transaction`, `Goal`, `GoalContribution`, `PeriodCheck`, `PeriodSnapshot`, agenda and notes |
| `Vida/Services` | `NotificationService`: 14-day window, at most 60 pending alerts, rebuilt when the app opens and on every edit |
| `Vida/Features` | Finance, Agenda and Notes screens, plus shared components (`Theme`, `Components`) |

## Decisions and reasoning

**Money as `Int` cents.** `Double` accumulates rounding errors. Percentage splits use the largest-remainder method, so the parts always add up to the total.

**CloudKit-ready models.** Every field has a default, relationships are optional with an `inverse`, there is no `@Attribute(.unique)`, and enums are stored as a raw `String` with a typed computed property. Relationships are linked after `context.insert`. iCloud sync can be turned on later without a destructive migration.

**Nothing is lost.** No destructive migrations: a new field always has a default. For example, `incomeCents` became unused when income started coming from the logged salary, but it stays in the model.

**Performance.** `@Query` with a `#Predicate` filters by period (transactions, checks, leftover). Lists are native `List` views and there is no heavy animation.

**Local notifications with a sliding window.** iOS caps pending notifications at 64, so the app schedules only the next 14 days (at most 60) and rebuilds the window. Salary day and bills due have priority.

**Generated project.** The `.xcodeproj` is disposable and not committed; `project.yml` is the source of truth. The signing team lives in `Config/Local.xcconfig`, which is git-ignored.

**No dependencies.** Less maintenance risk, and it shows command of the platform APIs (SwiftUI, SwiftData, Swift Charts, UserNotifications).

## Tests

Tests live in `VidaTests` and use a fixed Gregorian UTC calendar (`TestSupport.swift`), so they do not depend on the device. The agenda and transfer tests use an in-memory `ModelContainer`.

| File | Tests | Covers |
|---|---:|---|
| `PayPeriodTests` | 10 | monthly and weekly periods, day 31, year rollover |
| `BudgetCalculatorTests` | 9 | presets sum to 100, largest remainder, period income |
| `GoalCalculatorTests` | 9 | per-period requirement, priority allocation |
| `PlanAdapterTests` | 10 | cuts in order, food floor, shortfall |
| `AccountSplitTests` | 8 | three destinations, parts sum to salary, goals capped by savings |
| `BillCalculatorTests` | 7 | due date in period, month end, reminder respects paid |
| `CarryOverTests` | 8 | accumulated leftover and overspend, categories, reset |
| `GoalTransferTests` | 4 | transferred amount above or below plan |
| `AgendaTests` | 10 | occurrences, notifications, window and limit |
| **Total** | **75** | |

CI (GitHub Actions) builds the project and runs the whole suite on a simulator for every push and pull request.
