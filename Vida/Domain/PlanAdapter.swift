import Foundation

struct AdaptationInput: Hashable {
    var lines: [BudgetLine]
    var plannedSavings: Int
    /// Poupança exigida pelas metas neste período: piso protegido, nunca reduzido.
    var goalRequired: Int
    /// Ordem de corte; só categorias de `BudgetCategory.cuttable` são consideradas.
    var flexibleOrder: [BudgetCategory]
    var foodMinimum: Int
    /// Dias até o próximo pagamento, contando hoje.
    var daysLeft: Int
}

struct AdaptedLine: Hashable, Identifiable, Codable {
    var category: BudgetCategory
    var original: Int
    var adjusted: Int
    var effective: Int

    var id: BudgetCategory { category }
    var change: Int { adjusted - original }
    var remaining: Int { adjusted - effective }
}

struct AdaptationResult: Hashable {
    var lines: [AdaptedLine]
    var originalSavings: Int
    var adjustedSavings: Int
    var savingsFloor: Int
    /// Excesso nas categorias + o que falta para a poupança cobrir as metas.
    var need: Int
    /// O que não deu para compensar nem cortando tudo que é flexível.
    var shortfall: Int
    var dailyAllowance: Int

    var isNeeded: Bool { need > 0 }
    var isFeasible: Bool { shortfall == 0 }
    func line(_ c: BudgetCategory) -> AdaptedLine? { lines.first { $0.category == c } }
}

enum PlanAdapter {
    static func adapt(_ input: AdaptationInput) -> AdaptationResult {
        let floor = max(0, input.goalRequired)
        let overspend = input.lines.reduce(0) { $0 + max(0, $1.effective - $1.target) }
        let savingsGap = max(0, floor - input.plannedSavings)
        let need = overspend + savingsGap

        // Categoria estourada absorve o que já foi gasto; o resto começa no alvo.
        var adjusted: [BudgetCategory: Int] = [:]
        for l in input.lines { adjusted[l.category] = max(l.target, l.effective) }
        var savings = max(input.plannedSavings, floor)

        var left = need
        let flexible = input.flexibleOrder.filter { BudgetCategory.cuttable.contains($0) }
        for c in flexible where left > 0 {
            guard let line = input.lines.first(where: { $0.category == c }) else { continue }
            let minimum = max(line.effective, c == .alimentacao ? input.foodMinimum : 0)
            let available = max(0, (adjusted[c] ?? 0) - minimum)
            let take = min(available, left)
            adjusted[c, default: 0] -= take
            left -= take
        }
        // Última reserva: poupança acima do piso das metas (o piso nunca é tocado).
        if left > 0 {
            let extra = max(0, savings - floor)
            let take = min(extra, left)
            savings -= take
            left -= take
        }

        let lines = input.lines.map {
            AdaptedLine(category: $0.category, original: $0.target, adjusted: adjusted[$0.category] ?? $0.target, effective: $0.effective)
        }
        let flexibleLeft = lines.filter { flexible.contains($0.category) }.reduce(0) { $0 + max(0, $1.remaining) }
        return AdaptationResult(
            lines: lines,
            originalSavings: input.plannedSavings,
            adjustedSavings: savings,
            savingsFloor: floor,
            need: need,
            shortfall: left,
            dailyAllowance: flexibleLeft / max(1, input.daysLeft)
        )
    }
}
