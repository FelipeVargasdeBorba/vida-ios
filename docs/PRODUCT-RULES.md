# Product rules

> [Versão em português](pt/PRODUCT-RULES.md)

The business decisions behind the app. Each one has tests in `VidaTests`.

## Period and income
- A period runs from payday (inclusive) to the next payday (exclusive). Monthly or weekly; for monthly, months without the configured day use their last day.
- **Period income** = sum of the entries logged in the period with source **Salary**. "Other income" does not change the plan.
- Weekdays follow ISO (1 = Monday … 7 = Sunday); times of day are minutes since midnight.

## Plan
- Five split presets (Balanced 50/30/20, More leisure, Saver 30%, Aggressive 40%, Extreme 50%).
- "Other" takes `outroPoints` (default 5) from the Leisure percentage, capped at Leisure itself.
- Effective spending of a category = `max(actual, fixed)`: a fixed bill not yet logged already counts.

## Where the salary goes
- **Spending account:** the chosen categories (default Food, Transport, Leisure, Other).
- **Savings:** the rest (Housing, Fixed bills) plus the **Reserve**, which is whatever is left of the savings share after goals.
- **Each goal's own account:** the part of the savings share assigned to the goal, by priority, transferred directly and never passing through savings.
- All slices add up to the salary.

## Goals
- Required this period = (target − saved before the period) ÷ periods that start before the deadline. It stays fixed during the period.
- When a goal is checked, the amount actually transferred is what counts. If it is above plan, the difference comes out of the Reserve; if below, the rest stays pending. The next period's requirement drops on its own.

## Period checklist
- Move money to savings; each fixed bill (due date of the period); each goal with a share in the plan.
- Marking a bill as paid does not log an expense, because fixed bills already count in the plan.
- Undoing a goal transfer deletes only the contributions created by the checklist.

## Fixed bills
- `dueDay` from 1 to 31 (0 = no date), clamped to the last day of the month. For monthly periods the occurrence inside the period applies; for weekly periods, the one in the month the period starts.
- The reminder fires on the day, at the configured time, and stays silent if the bill is already paid.

## Spending-account leftover
- Accumulated balance of (salary share for spending − used) over all earlier periods, from the first logged salary.
- Leftover adds to Leisure (or the first category in the spending account). Overspend is deducted in the order Leisure, Other, Food, Transport, never leaving a target negative.
- "Reset" restarts the count at the current period and asks for confirmation.

## Automatic adaptation
- Cuts flexible categories, in the configured order, down to `max(spent, minimum)`; then uses only the savings **above** the floor required by goals.
- Housing, Fixed bills and the goals' floor are never cut.
- **Never changes a plan or goal without the user's confirmation.**
