import SwiftData
import SwiftUI

struct GoalRow: Identifiable {
    let goal: Goal
    let status: GoalStatus
    /// Parte da poupança do plano deste período destinada à meta (por prioridade).
    let allocation: Int
    var id: PersistentIdentifier { goal.persistentModelID }
}

struct BillRow: Identifiable {
    let fixed: FixedExpense
    /// Vencimento que vale para este período.
    let due: Date
    let state: BillState
    let check: PeriodCheck?
    var id: PersistentIdentifier { fixed.persistentModelID }
    var title: String { fixed.name.isEmpty ? fixed.category.title : fixed.name }

    /// Com data antes das sem data; depois por vencimento e nome.
    static func dueFirst(_ a: BillRow, _ b: BillRow) -> Bool {
        let aDated = a.fixed.dueDay > 0, bDated = b.fixed.dueDay > 0
        if aDated != bDated { return aDated }
        if a.due != b.due { return a.due < b.due }
        return a.title < b.title
    }
}

extension GoalRow {
    /// Quanto ainda colocar nesta meta neste período (a parte do plano menos o que já foi aportado).
    var toMove: Int { max(0, allocation - status.contributedThisPeriod) }
    var isDoneThisPeriod: Bool { allocation > 0 && toMove == 0 }
    /// O que já foi transferido para a conta da meta neste período.
    var transferred: Int { status.contributedThisPeriod }
    /// O que a meta recebe no período: o plano, ou o que foi transferido de fato se for maior.
    var effectiveAllocation: Int { max(allocation, transferred) }
}

/// Tudo que as telas de finanças mostram para um período, calculado uma vez por atualização dos dados.
struct FinanceModel {
    let period: PayPeriod
    let schedule: PaySchedule
    let currency: Currency
    let daysUntilPayday: Int
    let daysLeft: Int
    /// Sobra (+) ou falta (−) da conta de gastos vinda dos períodos anteriores, já somada aos alvos.
    let carry: Int
    /// Categoria que recebeu a sobra ou de onde a falta começou a sair.
    let carryCategory: BudgetCategory?
    /// Soma dos salários lançados no período: é a renda que o plano divide.
    let income: Int
    let summary: BudgetSummary
    let goals: [GoalRow]
    /// Soma do exigido pelas metas neste período.
    let goalRequired: Int
    let savingsCheck: SavingsCheck
    let adaptation: AdaptationResult?
    let incomeLogged: Int
    let contributedThisPeriod: Int
    let shortfallAccepted: Bool
    /// Como o salário se divide entre conta de gastos e saves.
    let split: AccountSplit
    let wallet: WalletOverview
    /// Contas fixas do período, por vencimento.
    let bills: [BillRow]
    /// Check de "separei para saves" deste período, se feito.
    let transferCheck: PeriodCheck?

    static func make(settings: FinanceSettings, period: PayPeriod, today: Date,
                     transactions: [Transaction], fixed: [FixedExpense],
                     goals: [Goal], contributions: [GoalContribution], checks: [PeriodCheck] = [],
                     earlier: [Transaction] = [],
                     calendar: Calendar = .current) -> FinanceModel {
        let schedule = settings.schedule
        let frequency = settings.frequency

        var spent: [BudgetCategory: Int] = [:]
        var incomeLogged = 0
        var entries: [(cents: Int, isSalary: Bool)] = []
        for t in transactions {
            if t.kind == .income {
                incomeLogged += t.amountCents
                entries.append((t.amountCents, t.source == .salary))
            } else {
                spent[t.category, default: 0] += t.amountCents
            }
        }
        let income = BudgetCalculator.periodIncome(entries)
        var fixedBy: [BudgetCategory: Int] = [:]
        for f in fixed { fixedBy[f.category, default: 0] += BudgetCalculator.perPeriod(monthlyCents: f.monthlyCents, frequency: frequency) }

        let spendingAccount = settings.spendingAccount
        let carry = CarryOverCalculator.carry(
            entries: (earlier + transactions).map(\.ledgerEntry), before: period, since: settings.carryFromDate,
            schedule: schedule, percents: settings.percents, fixedPerPeriod: fixedBy,
            spending: spendingAccount, calendar: calendar)
        let targets = CarryOverCalculator.apply(
            carry, to: BudgetCalculator.split(incomeCents: income, percents: settings.percents), spending: spendingAccount)
        let summary = BudgetCalculator.summary(incomeCents: income, targets: targets,
                                               fixedByCategory: fixedBy, spentByCategory: spent)

        // Aportes separados em "antes do período" e "no período" por meta.
        var before: [PersistentIdentifier: Int] = [:]
        var inside: [PersistentIdentifier: Int] = [:]
        var contributedThisPeriod = 0
        for c in contributions {
            guard let id = c.goal?.persistentModelID else { continue }
            if c.date < period.start {
                before[id, default: 0] += c.amountCents
            } else {
                inside[id, default: 0] += c.amountCents
                if period.contains(c.date) { contributedThisPeriod += c.amountCents }
            }
        }
        let statuses = goals.map { g in
            GoalCalculator.status(
                GoalInput(name: g.name, targetCents: g.targetCents, deadline: g.deadline,
                          savedBeforePeriod: before[g.persistentModelID] ?? 0, savedInPeriod: inside[g.persistentModelID] ?? 0),
                period: period, schedule: schedule, today: today, calendar: calendar)
        }
        let allocations = GoalCalculator.allocate(summary.savings, requirements: statuses.map(\.requiredThisPeriod))
        let rows = zip(goals, zip(statuses, allocations)).map { GoalRow(goal: $0, status: $1.0, allocation: $1.1) }
        let required = statuses.reduce(0) { $0 + $1.requiredThisPeriod }

        let split = AccountSplitCalculator.split(targets: targets, spendingCategories: spendingAccount,
                                                 goals: rows.map { ($0.goal.name, $0.effectiveAllocation) })
        let wallet = AccountSplitCalculator.wallet(balance: settings.savesBalanceCents, split: split)

        let bills = fixed.map { f in
            let due = BillCalculator.occurrence(dueDay: f.dueDay, period: period, frequency: frequency, calendar: calendar)
            let check = checks.first { $0.kind == .bill && $0.forDate == due && $0.fixed?.persistentModelID == f.persistentModelID }
            return BillRow(fixed: f, due: due,
                           state: BillCalculator.state(due: due, hasDueDay: f.dueDay > 0, paid: check != nil, today: today, calendar: calendar),
                           check: check)
        }
        .sorted(by: BillRow.dueFirst)
        let transferCheck = checks.first { $0.kind == .savesTransfer && $0.forDate == period.start }

        let daysLeft = PayPeriodCalculator.daysLeft(in: period, from: today, calendar: calendar)
        let adaptation: AdaptationResult? = settings.adaptEnabled
            ? PlanAdapter.adapt(AdaptationInput(lines: summary.lines, plannedSavings: summary.savings, goalRequired: required,
                                                flexibleOrder: settings.flexibleOrder, foodMinimum: settings.foodMinimumCents,
                                                daysLeft: daysLeft))
            : nil

        return FinanceModel(
            period: period,
            schedule: schedule,
            currency: settings.currency,
            daysUntilPayday: PayPeriodCalculator.daysUntilNextPayday(from: today, schedule: schedule, calendar: calendar),
            daysLeft: daysLeft,
            carry: carry,
            carryCategory: CarryOverCalculator.order.first(where: spendingAccount.contains),
            income: income,
            summary: summary,
            goals: rows,
            goalRequired: required,
            savingsCheck: GoalCalculator.check(incomeCents: income, preset: settings.preset,
                                               outroPoints: settings.outroPoints, required: required),
            adaptation: adaptation,
            incomeLogged: incomeLogged,
            contributedThisPeriod: contributedThisPeriod,
            shortfallAccepted: settings.acceptedShortfallPeriodStart == period.start,
            split: split,
            wallet: wallet,
            bills: bills,
            transferCheck: transferCheck
        )
    }

    func money(_ cents: Int) -> String { Money.format(cents, currency) }

    /// Foto do período para o histórico.
    func snapshot(settings: FinanceSettings) -> PeriodSnapshot {
        let s = PeriodSnapshot()
        s.periodStart = period.start
        s.periodEnd = period.end
        s.incomeCents = summary.income
        s.currencyCode = currency.rawValue
        s.frequencyRaw = settings.frequencyRaw
        s.presetRaw = settings.presetRaw
        s.savingsPlannedCents = summary.savings
        s.adaptEnabled = adaptation != nil
        let payload = SnapshotPayload(
            outroPoints: settings.outroPoints,
            totalFixed: summary.totalFixed,
            free: summary.free,
            totalSpent: summary.totalSpent,
            incomeLogged: incomeLogged,
            lines: summary.lines.map {
                .init(category: $0.category, target: $0.target, fixed: $0.fixed, spent: $0.spent,
                      adjusted: adaptation?.line($0.category)?.adjusted)
            },
            goals: goals.map {
                .init(name: $0.goal.name, saved: $0.status.saved, target: $0.status.target,
                      requiredThisPeriod: $0.status.requiredThisPeriod,
                      contributedThisPeriod: $0.status.contributedThisPeriod, deadline: $0.goal.deadline)
            },
            adjustedSavings: adaptation?.adjustedSavings,
            shortfall: adaptation?.shortfall,
            dailyAllowance: adaptation?.dailyAllowance,
            shortfallAccepted: shortfallAccepted
        )
        s.payloadData = (try? JSONEncoder().encode(payload)) ?? Data()
        return s
    }
}

/// Lê só os dados do período (queries filtradas) e entrega o `FinanceModel` pronto.
struct FinancePeriodReader<Content: View>: View {
    let settings: FinanceSettings
    let period: PayPeriod
    let today: Date
    @ViewBuilder let content: (FinanceModel) -> Content

    @Query private var transactions: [Transaction]
    @Query private var fixed: [FixedExpense]
    @Query(sort: [SortDescriptor(\Goal.priority), SortDescriptor(\Goal.createdAt)]) private var goals: [Goal]
    @Query private var contributions: [GoalContribution]
    @Query private var checks: [PeriodCheck]
    /// Lançamentos anteriores ao período, para a sobra da conta de gastos.
    @Query private var earlier: [Transaction]

    init(settings: FinanceSettings, period: PayPeriod, today: Date, @ViewBuilder content: @escaping (FinanceModel) -> Content) {
        self.settings = settings
        self.period = period
        self.today = today
        self.content = content
        let start = period.start, end = period.end
        _transactions = Query(filter: #Predicate<Transaction> { $0.date >= start && $0.date < end })
        // Vencimentos ficam no período ou, no semanal, no mês dele: uma folga de 40 dias cobre os dois.
        let from = start.addingTimeInterval(-40 * 86_400), to = end.addingTimeInterval(40 * 86_400)
        _checks = Query(filter: #Predicate<PeriodCheck> { $0.forDate >= from && $0.forDate < to })
        let since = settings.carryFromDate
        _earlier = Query(filter: #Predicate<Transaction> { $0.date >= since && $0.date < start })
    }

    var body: some View {
        content(FinanceModel.make(settings: settings, period: period, today: today, transactions: transactions,
                                  fixed: fixed, goals: goals, contributions: contributions, checks: checks,
                                  earlier: earlier))
    }
}

/// Período atual a partir das configurações e do "hoje" do roteador.
struct CurrentPeriodReader<Content: View>: View {
    @Environment(AppRouter.self) private var router
    @Query private var settingsList: [FinanceSettings]
    @ViewBuilder let content: (FinanceSettings, FinanceModel) -> Content

    init(@ViewBuilder content: @escaping (FinanceSettings, FinanceModel) -> Content) {
        self.content = content
    }

    var body: some View {
        if let settings = settingsList.first {
            let period = PayPeriodCalculator.period(containing: router.today, schedule: settings.schedule, calendar: .current)
            FinancePeriodReader(settings: settings, period: period, today: router.today) { model in
                content(settings, model)
            }
        } else {
            ProgressView()
        }
    }
}
