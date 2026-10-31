import Foundation

struct GoalInput: Hashable {
    var name: String
    var targetCents: Int
    var deadline: Date
    /// Guardado antes do início do período atual.
    var savedBeforePeriod: Int
    /// Aportado dentro do período atual.
    var savedInPeriod: Int
}

struct GoalStatus: Hashable {
    var saved: Int
    var target: Int
    var periodsRemaining: Int
    var monthsRemaining: Int
    /// Quanto este período precisa guardar (fixo durante o período).
    var requiredThisPeriod: Int
    var contributedThisPeriod: Int
    var isOverdue: Bool

    var remaining: Int { max(0, target - saved) }
    var isComplete: Bool { saved >= target }
    var remainingThisPeriod: Int { max(0, requiredThisPeriod - contributedThisPeriod) }
    var progress: Double { target > 0 ? min(1, Double(saved) / Double(target)) : 1 }
}

struct SavingsCheck: Hashable {
    var planned: Int
    var required: Int
    /// Plano mais leve que já cobre o exigido, se o atual não cobrir.
    var suggestion: BudgetPreset?

    var shortfall: Int { max(0, required - planned) }
    var isEnough: Bool { planned >= required }
}

enum GoalCalculator {
    static func status(_ goal: GoalInput, period: PayPeriod, schedule: PaySchedule, today: Date, calendar: Calendar) -> GoalStatus {
        let periods = PayPeriodCalculator.periodCount(from: period, through: goal.deadline, schedule: schedule, calendar: calendar)
        let remainingAtStart = max(0, goal.targetCents - goal.savedBeforePeriod)
        let required = (remainingAtStart + periods - 1) / periods // arredonda para cima
        let months = max(0, calendar.dateComponents([.month], from: calendar.startOfDay(for: today), to: calendar.startOfDay(for: goal.deadline)).month ?? 0)
        return GoalStatus(
            saved: goal.savedBeforePeriod + goal.savedInPeriod,
            target: goal.targetCents,
            periodsRemaining: periods,
            monthsRemaining: months,
            requiredThisPeriod: required,
            contributedThisPeriod: goal.savedInPeriod,
            isOverdue: calendar.startOfDay(for: goal.deadline) < period.start
        )
    }

    /// Distribui um valor entre exigências já ordenadas por prioridade: cada uma é coberta inteira antes da próxima.
    static func allocate(_ amount: Int, requirements: [Int]) -> [Int] {
        var left = max(0, amount)
        return requirements.map { req in
            let take = min(left, max(0, req))
            left -= take
            return take
        }
    }

    static func check(incomeCents: Int, preset: BudgetPreset, outroPoints: Int, required: Int) -> SavingsCheck {
        let planned = savings(incomeCents, preset, outroPoints)
        guard planned < required else { return SavingsCheck(planned: planned, required: required, suggestion: nil) }
        let suggestion = BudgetPreset.byAggressiveness.first {
            $0.savingsPercent > preset.savingsPercent && savings(incomeCents, $0, outroPoints) >= required
        }
        return SavingsCheck(planned: planned, required: required, suggestion: suggestion)
    }

    /// Próximo plano mais agressivo (mais poupança) que o atual.
    static func moreAggressive(than preset: BudgetPreset) -> BudgetPreset? {
        BudgetPreset.byAggressiveness.first { $0.savingsPercent > preset.savingsPercent }
    }

    /// Novo prazo que reduz a exigência do período em `reduceBy`, ou nil se a meta sozinha não cobre.
    static func extendedDeadline(remainingAtStart: Int, required: Int, reduceBy: Int,
                                 period: PayPeriod, schedule: PaySchedule, calendar: Calendar) -> Date? {
        let newRequired = required - reduceBy
        guard reduceBy > 0, newRequired > 0, remainingAtStart > 0 else { return nil }
        let periods = (remainingAtStart + newRequired - 1) / newRequired
        return PayPeriodCalculator.periodStart(offset: periods, from: period, schedule: schedule, calendar: calendar)
    }

    private static func savings(_ income: Int, _ preset: BudgetPreset, _ outroPoints: Int) -> Int {
        BudgetCalculator.split(incomeCents: income, percents: preset.percents(outroPoints: outroPoints))[.poupanca] ?? 0
    }
}
