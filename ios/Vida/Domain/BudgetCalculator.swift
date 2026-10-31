import Foundation

struct BudgetLine: Hashable, Identifiable, Codable {
    var category: BudgetCategory
    /// Alvo do plano no período.
    var target: Int
    /// Fixos comprometidos no período.
    var fixed: Int
    /// Gasto real lançado no período.
    var spent: Int

    var id: BudgetCategory { category }
    /// O que conta como usado: o real, ou os fixos se ainda não foram lançados.
    var effective: Int { max(spent, fixed) }
    var remaining: Int { target - effective }
    var isOver: Bool { effective > target }
    var fixedOver: Bool { fixed > target }
    var progress: Double { target > 0 ? min(1, Double(effective) / Double(target)) : (effective > 0 ? 1 : 0) }
}

struct BudgetSummary: Hashable {
    var income: Int
    var savings: Int
    var totalFixed: Int
    var lines: [BudgetLine]

    /// Livre depois de fixos e poupança.
    var free: Int { income - totalFixed - savings }
    var totalSpent: Int { lines.reduce(0) { $0 + $1.spent } }

    func line(_ c: BudgetCategory) -> BudgetLine? { lines.first { $0.category == c } }
}

enum BudgetCalculator {
    /// Divide a renda pelos percentuais com o método do maior resto: a soma bate exatamente.
    static func split(incomeCents: Int, percents: [BudgetCategory: Int]) -> [BudgetCategory: Int] {
        let income = max(0, incomeCents)
        let totalPercent = BudgetCategory.allCases.reduce(0) { $0 + max(0, percents[$1] ?? 0) }
        var result: [BudgetCategory: Int] = [:]
        var remainders: [(BudgetCategory, Int)] = []
        var allocated = 0
        for c in BudgetCategory.allCases {
            let exact = income * max(0, percents[c] ?? 0)
            result[c] = exact / 100
            allocated += exact / 100
            remainders.append((c, exact % 100))
        }
        var leftover = income * totalPercent / 100 - allocated
        let order = remainders.enumerated().sorted {
            $0.element.1 != $1.element.1 ? $0.element.1 > $1.element.1 : $0.offset < $1.offset
        }
        for item in order where leftover > 0 && item.element.1 > 0 {
            result[item.element.0, default: 0] += 1
            leftover -= 1
        }
        return result
    }

    /// Renda do período: só as entradas marcadas como salário. Outras entradas não mudam o plano.
    static func periodIncome(_ entries: [(cents: Int, isSalary: Bool)]) -> Int {
        entries.reduce(0) { $0 + ($1.isSalary ? max(0, $1.cents) : 0) }
    }

    /// Converte um gasto fixo mensal para o período (semanal: ×12/52, arredondado).
    static func perPeriod(monthlyCents: Int, frequency: PayFrequency) -> Int {
        switch frequency {
        case .monthly: monthlyCents
        case .weekly: (monthlyCents * 12 + 26) / 52
        }
    }

    static func summary(
        incomeCents: Int,
        percents: [BudgetCategory: Int],
        fixedByCategory: [BudgetCategory: Int],
        spentByCategory: [BudgetCategory: Int]
    ) -> BudgetSummary {
        summary(incomeCents: incomeCents, targets: split(incomeCents: incomeCents, percents: percents),
                fixedByCategory: fixedByCategory, spentByCategory: spentByCategory)
    }

    /// Resumo com alvos já prontos (ex.: com a sobra do período anterior aplicada).
    static func summary(
        incomeCents: Int,
        targets: [BudgetCategory: Int],
        fixedByCategory: [BudgetCategory: Int],
        spentByCategory: [BudgetCategory: Int]
    ) -> BudgetSummary {
        let lines = BudgetCategory.spending.map {
            BudgetLine(category: $0, target: targets[$0] ?? 0, fixed: fixedByCategory[$0] ?? 0, spent: spentByCategory[$0] ?? 0)
        }
        return BudgetSummary(
            income: max(0, incomeCents),
            savings: targets[.poupanca] ?? 0,
            totalFixed: fixedByCategory.values.reduce(0, +),
            lines: lines
        )
    }
}
