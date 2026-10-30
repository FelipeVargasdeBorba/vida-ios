import Foundation
import SwiftData

// Regras para CloudKit: todo campo com valor padrão, relações opcionais, nada de @Attribute(.unique).

@Model
final class FinanceSettings {
    var incomeCents: Int = 0
    var currencyCode: String = Currency.eur.rawValue
    var frequencyRaw: String = PayFrequency.monthly.rawValue
    var payDayOfMonth: Int = 1
    /// ISO: 1 = segunda … 7 = domingo.
    var payWeekday: Int = 5
    var presetRaw: String = BudgetPreset.balanced.rawValue
    /// Pontos percentuais tirados do Lazer para "Outro".
    var outroPoints: Int = 5
    var paydayReminderOn: Bool = true
    var reminderMinutes: Int = 540
    var adaptEnabled: Bool = false
    var flexibleOrderRaw: String = BudgetCategory.raw(from: BudgetCategory.defaultFlexibleOrder)
    var foodMinimumCents: Int = 0
    /// Início do período em que o atraso da meta foi aceito.
    var acceptedShortfallPeriodStart: Date = Date.distantPast
    var isConfigured: Bool = false
    /// Categorias cujo dinheiro fica na conta de gastos; o resto vai para saves.
    var spendingAccountRaw: String = BudgetCategory.raw(from: AccountSplitCalculator.defaultSpendingCategories)
    /// Quanto já existe na carteira de saves (informado pelo usuário).
    var savesBalanceCents: Int = 0
    var savesBalanceUpdatedAt: Date = Date.distantPast
    /// A sobra da conta de gastos só conta a partir desta data ("zerar sobra").
    var carryFromDate: Date = Date.distantPast

    init() {}

    var currency: Currency {
        get { Currency(rawValue: currencyCode) ?? .eur }
        set { currencyCode = newValue.rawValue }
    }

    var frequency: PayFrequency {
        get { PayFrequency(rawValue: frequencyRaw) ?? .monthly }
        set { frequencyRaw = newValue.rawValue }
    }

    var preset: BudgetPreset {
        get { BudgetPreset(rawValue: presetRaw) ?? .balanced }
        set { presetRaw = newValue.rawValue }
    }

    var flexibleOrder: [BudgetCategory] {
        get { BudgetCategory.list(from: flexibleOrderRaw) }
        set { flexibleOrderRaw = BudgetCategory.raw(from: newValue) }
    }

    var spendingAccount: Set<BudgetCategory> {
        get {
            Set(spendingAccountRaw.split(separator: ",").compactMap { BudgetCategory(rawValue: String($0)) })
                .intersection(BudgetCategory.spending)
        }
        set { spendingAccountRaw = BudgetCategory.raw(from: BudgetCategory.spending.filter(newValue.contains)) }
    }

    var schedule: PaySchedule {
        PaySchedule(frequency: frequency, dayOfMonth: payDayOfMonth, weekday: payWeekday)
    }

    var percents: [BudgetCategory: Int] { preset.percents(outroPoints: outroPoints) }
}

@Model
final class FixedExpense {
    var name: String = ""
    var categoryRaw: String = BudgetCategory.casa.rawValue
    var monthlyCents: Int = 0
    var createdAt: Date = Date()
    /// Dia do mês em que vence (1…31); 0 = sem data.
    var dueDay: Int = 0
    /// Avisar no dia do vencimento, até marcar como paga.
    var remindOn: Bool = false
    @Relationship(deleteRule: .cascade, inverse: \PeriodCheck.fixed)
    var checks: [PeriodCheck]? = []

    init(name: String = "", category: BudgetCategory = .casa, monthlyCents: Int = 0) {
        self.name = name
        self.categoryRaw = category.rawValue
        self.monthlyCents = monthlyCents
    }

    var category: BudgetCategory {
        get { BudgetCategory(rawValue: categoryRaw) ?? .outro }
        set { categoryRaw = newValue.rawValue }
    }
}

enum CheckKind: String {
    /// Conta fixa paga.
    case bill
    /// Dinheiro separado da conta de gastos para saves.
    case savesTransfer
}

/// Um item do checklist marcado como feito.
@Model
final class PeriodCheck {
    var kindRaw: String = CheckKind.bill.rawValue
    /// Conta: data de vencimento a que se refere. Transferência: início do período.
    var forDate: Date = Date.distantPast
    var doneAt: Date = Date()
    var fixed: FixedExpense?

    /// A conta é ligada depois do `insert` (mais seguro no SwiftData).
    init(kind: CheckKind = .bill, forDate: Date = Date.distantPast) {
        self.kindRaw = kind.rawValue
        self.forDate = forDate
    }

    var kind: CheckKind {
        get { CheckKind(rawValue: kindRaw) ?? .bill }
        set { kindRaw = newValue.rawValue }
    }
}

enum TransactionKind: String, CaseIterable, Identifiable {
    case expense, income
    var id: String { rawValue }
    var title: String { self == .expense ? "Gasto" : "Entrada" }
}

enum IncomeSource: String, CaseIterable, Identifiable {
    case salary, other
    var id: String { rawValue }
    var title: String { self == .salary ? "Salário" : "Outra entrada" }
}

@Model
final class Transaction {
    var kindRaw: String = TransactionKind.expense.rawValue
    var incomeSourceRaw: String = IncomeSource.salary.rawValue
    var amountCents: Int = 0
    var date: Date = Date()
    var categoryRaw: String = BudgetCategory.outro.rawValue
    var note: String = ""
    var createdAt: Date = Date()

    init(kind: TransactionKind = .expense, amountCents: Int = 0, date: Date = Date(),
         category: BudgetCategory = .outro, source: IncomeSource = .salary, note: String = "") {
        self.kindRaw = kind.rawValue
        self.amountCents = amountCents
        self.date = date
        self.categoryRaw = category.rawValue
        self.incomeSourceRaw = source.rawValue
        self.note = note
    }

    var kind: TransactionKind {
        get { TransactionKind(rawValue: kindRaw) ?? .expense }
        set { kindRaw = newValue.rawValue }
    }

    var category: BudgetCategory {
        get { BudgetCategory(rawValue: categoryRaw) ?? .outro }
        set { categoryRaw = newValue.rawValue }
    }

    var source: IncomeSource {
        get { IncomeSource(rawValue: incomeSourceRaw) ?? .other }
        set { incomeSourceRaw = newValue.rawValue }
    }

    var title: String { kind == .income ? source.title : category.transactionTitle }

    var ledgerEntry: LedgerEntry {
        LedgerEntry(date: date, cents: amountCents,
                    kind: kind == .expense ? .expense(category) : source == .salary ? .salary : .otherIncome)
    }
}

@Model
final class Goal {
    var name: String = ""
    var targetCents: Int = 0
    var deadline: Date = Date()
    /// Menor = mais prioritária.
    var priority: Int = 0
    var createdAt: Date = Date()
    @Relationship(deleteRule: .cascade, inverse: \GoalContribution.goal)
    var contributions: [GoalContribution]? = []

    init(name: String = "", targetCents: Int = 0, deadline: Date = Date(), priority: Int = 0) {
        self.name = name
        self.targetCents = targetCents
        self.deadline = deadline
        self.priority = priority
    }

    var savedCents: Int { (contributions ?? []).reduce(0) { $0 + $1.amountCents } }
}

@Model
final class GoalContribution {
    var amountCents: Int = 0
    var date: Date = Date()
    var note: String = ""
    var goal: Goal?

    /// A meta é ligada depois do `insert` (mais seguro no SwiftData).
    init(amountCents: Int = 0, date: Date = Date(), note: String = "") {
        self.amountCents = amountCents
        self.date = date
        self.note = note
    }
}

/// Foto imutável do planejamento de um período. As linhas ficam em JSON (`SnapshotPayload`).
@Model
final class PeriodSnapshot {
    var savedAt: Date = Date()
    var periodStart: Date = Date()
    var periodEnd: Date = Date()
    var incomeCents: Int = 0
    var currencyCode: String = Currency.eur.rawValue
    var frequencyRaw: String = PayFrequency.monthly.rawValue
    var presetRaw: String = BudgetPreset.balanced.rawValue
    var savingsPlannedCents: Int = 0
    var adaptEnabled: Bool = false
    var payloadData: Data = Data()

    init() {}

    var currency: Currency { Currency(rawValue: currencyCode) ?? .eur }
    var preset: BudgetPreset { BudgetPreset(rawValue: presetRaw) ?? .balanced }
    var frequency: PayFrequency { PayFrequency(rawValue: frequencyRaw) ?? .monthly }

    var payload: SnapshotPayload? { try? JSONDecoder().decode(SnapshotPayload.self, from: payloadData) }
}

struct SnapshotPayload: Codable, Hashable {
    struct Line: Codable, Hashable {
        var category: BudgetCategory
        var target: Int
        var fixed: Int
        var spent: Int
        var adjusted: Int?
    }

    struct GoalLine: Codable, Hashable {
        var name: String
        var saved: Int
        var target: Int
        var requiredThisPeriod: Int
        var contributedThisPeriod: Int
        var deadline: Date
    }

    var outroPoints: Int
    var totalFixed: Int
    var free: Int
    var totalSpent: Int
    var incomeLogged: Int
    var lines: [Line]
    var goals: [GoalLine]
    var adjustedSavings: Int?
    var shortfall: Int?
    var dailyAllowance: Int?
    var shortfallAccepted: Bool
}
