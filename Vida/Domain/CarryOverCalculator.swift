import Foundation

/// Lançamento reduzido ao que importa para a conta de gastos.
struct LedgerEntry: Hashable {
    enum Kind: Hashable {
        case salary
        case otherIncome
        case expense(BudgetCategory)
    }

    var date: Date
    var cents: Int
    var kind: Kind
}

/// O que sobra (ou falta) na conta de gastos passa para o período seguinte.
enum CarryOverCalculator {
    /// Saldo acumulado da conta de gastos antes de `period`: soma de (parte do salário para gastos − usado)
    /// de cada período anterior, desde o primeiro salário lançado a partir de `since`.
    /// "Usado" segue a regra do gasto efetivo: `max(real, fixos)` nos períodos com salário; só o real nos sem salário.
    static func carry(entries: [LedgerEntry], before period: PayPeriod, since: Date, schedule: PaySchedule,
                      percents: [BudgetCategory: Int], fixedPerPeriod: [BudgetCategory: Int],
                      spending: Set<BudgetCategory>, calendar: Calendar) -> Int {
        let relevant = entries.filter { $0.date >= since && $0.date < period.start }
        guard let firstSalary = relevant.filter({ $0.kind == .salary }).map(\.date).min() else { return 0 }
        let start = PayPeriodCalculator.period(containing: firstSalary, schedule: schedule, calendar: calendar).start

        var income: [Date: Int] = [:]
        var spent: [Date: [BudgetCategory: Int]] = [:]
        for e in relevant where e.date >= start {
            let key = PayPeriodCalculator.period(containing: e.date, schedule: schedule, calendar: calendar).start
            switch e.kind {
            case .salary: income[key, default: 0] += max(0, e.cents)
            case .otherIncome: break
            case .expense(let c): spent[key, default: [:]][c, default: 0] += e.cents
            }
        }

        var total = 0
        for key in Set(income.keys).union(spent.keys) {
            let salary = income[key] ?? 0
            let targets = BudgetCalculator.split(incomeCents: salary, percents: percents)
            for c in spending {
                let real = spent[key]?[c] ?? 0
                let used = salary > 0 ? max(real, fixedPerPeriod[c] ?? 0) : real
                total += (targets[c] ?? 0) - used
            }
        }
        return total
    }

    /// Onde a sobra entra (e de onde a falta sai), na ordem: Lazer, Outro, Alimentação, Transporte.
    static let order: [BudgetCategory] = [.lazer, .outro, .alimentacao, .transporte]

    /// Sobra entra inteira na primeira categoria da conta de gastos. Falta é descontada na ordem, sem deixar
    /// nenhum alvo negativo; o que não couber continua no saldo e aparece no período seguinte.
    static func apply(_ carry: Int, to targets: [BudgetCategory: Int], spending: Set<BudgetCategory>) -> [BudgetCategory: Int] {
        let cats = order.filter(spending.contains)
        guard carry != 0, let first = cats.first else { return targets }
        var result = targets
        if carry > 0 {
            result[first, default: 0] += carry
            return result
        }
        var debt = -carry
        for c in cats where debt > 0 {
            let take = min(debt, max(0, result[c] ?? 0))
            result[c] = (result[c] ?? 0) - take
            debt -= take
        }
        return result
    }
}
