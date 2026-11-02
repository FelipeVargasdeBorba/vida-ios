import Foundation

/// Para onde vai cada fatia do salário quando ele cai no banco.
enum BankAccount: String, CaseIterable, Identifiable, Codable {
    /// Conta do dia a dia: o que se gasta no período.
    case spending
    /// Conta separada ("saves"): contas grandes e reserva.
    case saves
    /// Cada meta tem a sua própria conta.
    case goal

    var id: String { rawValue }

    var title: String {
        switch self {
        case .spending: "Spending account"
        case .saves: "Saves"
        case .goal: "Goals"
        }
    }
}

struct SplitSlice: Hashable, Identifiable {
    enum Kind: Hashable {
        case category(BudgetCategory)
        /// Índice da meta na lista recebida (já ordenada por prioridade).
        case goal(Int)
        /// Poupança que sobra depois das metas.
        case reserve
    }

    var kind: Kind
    var title: String
    var amount: Int
    var account: BankAccount

    var id: Kind { kind }
}

struct AccountSplit: Hashable {
    var spending: [SplitSlice]
    var saves: [SplitSlice]
    /// Uma fatia por meta, cada uma para a conta da meta.
    var goals: [SplitSlice]

    var spendingTotal: Int { spending.reduce(0) { $0 + $1.amount } }
    var savesTotal: Int { saves.reduce(0) { $0 + $1.amount } }
    var goalsTotal: Int { goals.reduce(0) { $0 + $1.amount } }
    /// O que sai da conta de gastos ao receber: saves + contas das metas.
    var movedOut: Int { savesTotal + goalsTotal }
    /// O que entra em saves para ser pago logo (aluguel, fixos…), não para ficar guardado.
    var savesBills: Int {
        saves.reduce(0) { if case .category = $1.kind { $0 + $1.amount } else { $0 } }
    }
    /// O que entra em saves e fica guardado (reserva).
    var savesKept: Int { savesTotal - savesBills }
    var all: [SplitSlice] { spending + saves + goals }
}

/// Visão da carteira de saves: o que já tem, o que entra e o que sai neste período.
struct WalletOverview: Hashable {
    var balance: Int
    var incoming: Int
    var bills: Int

    /// Saldo depois de receber o salário e pagar as contas que saem de saves.
    var afterPeriod: Int { balance + incoming - bills }
}

enum AccountSplitCalculator {
    /// Gastos do dia a dia que costumam ficar na conta de gastos.
    static let defaultSpendingCategories: [BudgetCategory] = [.alimentacao, .transporte, .outro]

    /// Divide os alvos do plano entre as contas. A poupança sai da conta de gastos: primeiro a parte de cada
    /// meta (para a conta da meta), e o que sobrar vira a reserva em saves. A soma das fatias é a soma dos alvos.
    static func split(
        targets: [BudgetCategory: Int],
        spendingCategories: Set<BudgetCategory>,
        goals: [(name: String, allocation: Int)]
    ) -> AccountSplit {
        var spending: [SplitSlice] = []
        var saves: [SplitSlice] = []
        for c in BudgetCategory.spending {
            let amount = max(0, targets[c] ?? 0)
            guard amount > 0 else { continue }
            let account: BankAccount = spendingCategories.contains(c) ? .spending : .saves
            let slice = SplitSlice(kind: .category(c), title: c.title, amount: amount, account: account)
            if account == .spending { spending.append(slice) } else { saves.append(slice) }
        }
        var savings = max(0, targets[.poupanca] ?? 0)
        var goalSlices: [SplitSlice] = []
        for (i, g) in goals.enumerated() {
            let amount = min(savings, max(0, g.allocation))
            savings -= amount
            if amount > 0 { goalSlices.append(SplitSlice(kind: .goal(i), title: g.name, amount: amount, account: .goal)) }
        }
        if savings > 0 { saves.append(SplitSlice(kind: .reserve, title: "Reserve", amount: savings, account: .saves)) }
        return AccountSplit(spending: spending, saves: saves, goals: goalSlices)
    }

    static func wallet(balance: Int, split: AccountSplit) -> WalletOverview {
        WalletOverview(balance: max(0, balance), incoming: split.savesTotal, bills: split.savesBills)
    }
}
