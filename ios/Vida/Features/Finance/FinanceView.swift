import Charts
import SwiftData
import SwiftUI

struct FinanceView: View {
    @Environment(AppRouter.self) private var router

    var body: some View {
        @Bindable var router = router
        NavigationStack {
            CurrentPeriodReader { settings, model in
                FinanceDashboard(settings: settings, model: model)
            }
            .vidaList()
            .navigationTitle("Finance")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { router.transactionDraft = TransactionDraft() } label: { Image(systemName: "plus.circle.fill") }
                        .accessibilityLabel("New transaction")
                }
            }
        }
        .sheet(item: $router.transactionDraft) { TransactionForm(draft: $0) }
    }
}

private struct FinanceDashboard: View {
    let settings: FinanceSettings
    let model: FinanceModel
    @Environment(\.modelContext) private var context
    @Environment(AppRouter.self) private var router
    @State private var savedAlert = false
    @State private var confirmCarryReset = false

    var body: some View {
        List {
            if model.income > 0 {
                Section { SplitHero(model: model, income: model.income) }
            } else {
                Section { salaryPrompt }
            }
            ChecklistSection(model: model)
            if model.income > 0 {
                spendingSection
                savesSection
                if !model.goals.isEmpty { goalsSection }
                WalletSection(settings: settings, model: model)
                if let a = model.adaptation { adaptationSection(a) }
            }
            Section {
                NavigationLink { TransactionsView(settings: settings, initial: model.period) } label: {
                    Label("Transactions", systemImage: "list.bullet")
                }
                NavigationLink { FixedExpensesView() } label: { Label("Fixed expenses", systemImage: "pin") }
                NavigationLink { GoalsView() } label: { Label("Goals", systemImage: "target") }
                NavigationLink { HistoryView() } label: { Label("History", systemImage: "clock.arrow.circlepath") }
                NavigationLink { SetupView(settings: settings) } label: { Label("Settings", systemImage: "gearshape") }
            }
            .font(.subheadline)
            if model.income > 0 {
                Section {
                    Button {
                        context.insert(model.snapshot(settings: settings))
                        try? context.save()
                        savedAlert = true
                    } label: {
                        Label("Save to history", systemImage: "square.and.arrow.down")
                    }
                    .font(.subheadline)
                }
            }
        }
        .listSectionSpacing(.compact)
        .scrollDismissesKeyboard(.interactively)
        .alert("Saved to history", isPresented: $savedAlert) { Button("OK", role: .cancel) {} }
    }

    /// Sem salário lançado no período ainda não há o que dividir.
    private var salaryPrompt: some View {
        VStack(alignment: .leading, spacing: 12) {
            IconBadge(symbol: "banknote", tint: .vidaSaves)
            VStack(alignment: .leading, spacing: 4) {
                Text("Got your salary?").font(.headline)
                Text("Log the amount that landed in your account and the app shows how much to keep for spending and how much to set aside for saves.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Button {
                router.transactionDraft = TransactionDraft(kind: .income, date: Date())
            } label: {
                Label("Add salary", systemImage: "plus")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
            .tint(.vidaSaves)
            Text("Period \(Fmt.period(model.period))").font(.caption).foregroundStyle(.secondary)
        }
        .padding(.vertical, 6)
    }

    private func lines(in account: BankAccount) -> [BudgetLine] {
        let spending = settings.spendingAccount
        return model.summary.lines.filter {
            (spending.contains($0.category) ? .spending : .saves) == account && ($0.target > 0 || $0.effective > 0)
        }
    }

    private var spendingSection: some View {
        let rows = lines(in: .spending)
        let total = model.split.spendingTotal
        let spent = rows.reduce(0) { $0 + $1.spent }
        return Section {
            if model.carry != 0 { carryRow }
            ForEach(rows) { line in
                CategoryRow(line: line, currency: model.currency, adjusted: model.adaptation?.line(line.category)?.adjusted)
            }
        } header: {
            AccountHeader(account: .spending, total: model.money(total))
        } footer: {
            if !rows.isEmpty {
                Text(spent > total ? "Spent \(model.money(spent)) · over by \(model.money(spent - total))"
                                   : "Spent \(model.money(spent)) · \(model.money(total - spent)) left")
            }
        }
    }

    /// Sobra (ou gasto a mais) dos períodos anteriores, já somada aos alvos.
    private var carryRow: some View {
        let weekly = settings.frequency == .weekly
        let positive = model.carry > 0
        let title = positive ? (weekly ? "Left over from last week" : "Left over from last month")
                             : (weekly ? "Overspent last week" : "Overspent last month")
        let caption = positive ? "added to \(model.carryCategory?.title ?? "the plan")" : "taken from day-to-day spending"
        return AmountRow(symbol: positive ? "arrow.uturn.forward" : "arrow.uturn.backward",
                         tint: positive ? .vidaSaves : .red, title: title,
                         amount: "\(positive ? "+" : "−") \(model.money(abs(model.carry)))", caption: caption)
            .swipeActions {
                Button("Reset") { confirmCarryReset = true }.tint(.orange)
            }
            .confirmationDialog("Reset the carry-over?", isPresented: $confirmCarryReset, titleVisibility: .visible) {
                Button("Reset and restart here") { settings.carryFromDate = model.period.start }
            } message: {
                Text("This period's plan goes back to its normal value. Use it when the spending account balance at the bank does not match the app.")
            }
    }

    private var savesSection: some View {
        let split = model.split
        let reserve = split.saves.first { $0.kind == .reserve }?.amount ?? 0
        return Section {
            ForEach(lines(in: .saves)) { line in
                CategoryRow(line: line, currency: model.currency, adjusted: model.adaptation?.line(line.category)?.adjusted)
            }
            if reserve > 0 {
                AmountRow(symbol: "leaf", tint: BudgetCategory.poupanca.tint, title: "Reserve",
                          amount: model.money(reserve), caption: "what is left after the goals")
            }
        } header: {
            AccountHeader(account: .saves, total: model.money(split.savesTotal))
        } footer: {
            Text(split.savesKept > 0 ? "Set aside when you get paid. Of that, \(model.money(split.savesKept)) stays as reserve."
                                     : "Set aside when you get paid to cover the bills.")
        }
    }

    /// Cada meta tem a sua própria conta: o valor vai direto para ela, sem passar por saves.
    private var goalsSection: some View {
        Section {
            ForEach(Array(model.goals.enumerated()), id: \.element.id) { i, row in
                GoalSplitRow(row: row, tint: SplitSlice.goalTint(i), currency: model.currency)
            }
            if !model.savingsCheck.isEnough {
                SavingsWarning(check: model.savingsCheck, currency: model.currency, settings: settings)
            }
        } header: {
            AccountHeader(account: .goal, total: model.money(model.split.goalsTotal))
        } footer: {
            Text("Each goal has its own account. Transfer straight to it, without going through saves.")
        }
    }

    private func adaptationSection(_ a: AdaptationResult) -> some View {
        Section("Automatic adaptation") {
            NavigationLink { AdaptationView() } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text("You can spend \(model.money(a.dailyAllowance)) per day").font(.subheadline)
                    Text(!a.isNeeded ? "Everything within the plan"
                         : a.isFeasible ? "Adjusted to make up \(model.money(a.need))"
                         : (model.shortfallAccepted ? "Delay accepted: \(model.money(a.shortfall)) short"
                            : "\(model.money(a.shortfall)) short for the goal"))
                        .font(.caption)
                        .foregroundStyle(a.isFeasible || model.shortfallAccepted ? Color.secondary : Color.red)
                }
            }
        }
    }
}

/// O que fazer neste período: separar para saves, pagar as contas e colocar nas metas.
private struct ChecklistSection: View {
    let model: FinanceModel
    @Environment(\.modelContext) private var context
    @State private var goalAction: GoalAction?

    var body: some View {
        let showTransfer = model.split.savesTotal > 0
        let goals = model.goals.enumerated().filter { $0.element.allocation > 0 }
        let total = (showTransfer ? 1 : 0) + model.bills.count + goals.count
        let done = (showTransfer && model.transferCheck != nil ? 1 : 0)
            + model.bills.filter { $0.check != nil }.count
            + goals.filter { $0.element.isDoneThisPeriod }.count
        if total > 0 {
            Section {
                if showTransfer {
                    let isDone = model.transferCheck != nil
                    CheckRow(done: isDone, title: "Move to saves",
                             subtitle: isDone ? "done" : "move when you get paid",
                             amount: model.money(model.split.savesTotal), tint: .vidaSaves) {
                        ChecklistActions.toggleTransfer(model, context: context)
                    }
                }
                ForEach(model.bills) { bill in
                    let (text, color) = subtitle(bill)
                    CheckRow(done: bill.check != nil, title: bill.title, subtitle: text, subtitleTint: color,
                             amount: model.money(bill.fixed.monthlyCents), tint: bill.fixed.category.tint) {
                        ChecklistActions.toggleBill(bill, context: context)
                    }
                }
                ForEach(goals, id: \.element.id) { i, row in
                    CheckRow(done: row.isDoneThisPeriod, title: "Goal \(row.goal.name)",
                             subtitle: goalSubtitle(row),
                             amount: model.money(row.isDoneThisPeriod ? row.transferred : row.toMove),
                             tint: SplitSlice.goalTint(i)) {
                        goalAction = GoalAction(row)
                    }
                }
            } header: {
                HStack {
                    Label("Checklist", systemImage: "checklist")
                    Spacer()
                    Text("\(done) of \(total)").monospacedDigit()
                }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(done == total ? Color.vidaSaves : Color.secondary)
                .textCase(nil)
            }
            .goalTransfer($goalAction, model: model)
        }
    }

    private func goalSubtitle(_ row: GoalRow) -> String {
        guard row.isDoneThisPeriod else {
            return row.transferred > 0 ? "still to transfer to the goal account" : "transfer to the goal account"
        }
        return row.transferred == row.allocation ? "transferred" : "transferred · plan \(model.money(row.allocation))"
    }

    private func subtitle(_ bill: BillRow) -> (String, Color) {
        switch bill.state {
        case .paid: ("pago", .secondary)
        case .overdue(let d): ("overdue by \(d) \(d == 1 ? "day" : "days")", .red)
        case .dueToday: ("due today", .orange)
        case .upcoming(let d) where d <= 3: ("due in \(d) \(d == 1 ? "day" : "days")", .orange)
        case .upcoming: ("due \(Fmt.short(bill.due))", .secondary)
        case .noDate: ("this month", .secondary)
        }
    }
}

private struct CheckRow: View {
    let done: Bool
    let title: String
    let subtitle: String
    var subtitleTint: Color = .secondary
    let amount: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                CheckCircle(done: done, tint: tint)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.subheadline.weight(.medium)).lineLimit(1)
                        .foregroundStyle(done ? Color.secondary : Color.primary)
                    Text(subtitle).font(.caption).foregroundStyle(done ? Color.secondary : subtitleTint)
                }
                Spacer(minLength: 8)
                Text(amount).font(.subheadline.weight(.semibold)).monospacedDigit()
                    .foregroundStyle(done ? Color.secondary : Color.primary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.success, trigger: done) { _, new in new }
        .accessibilityAddTraits(done ? .isSelected : [])
    }
}

/// Topo: quando cai o salário e o gráfico de como ele se divide entre as contas.
private struct SplitHero: View {
    let model: FinanceModel
    let income: Int

    var body: some View {
        let split = model.split
        VStack(spacing: 16) {
            HStack {
                Label(model.daysUntilPayday == 0 ? "Payday today"
                      : "Payday in \(model.daysUntilPayday) \(model.daysUntilPayday == 1 ? "day" : "days")",
                      systemImage: "calendar")
                    .font(.footnote.weight(.medium))
                Spacer()
                Text(Fmt.period(model.period)).font(.footnote).foregroundStyle(.secondary)
            }
            if !split.all.isEmpty {
                ZStack {
                    Chart(split.all) { slice in
                        SectorMark(angle: .value("Amount", slice.amount), innerRadius: .ratio(0.72), angularInset: 1.5)
                            .cornerRadius(4)
                            .foregroundStyle(slice.tint)
                    }
                    .chartLegend(.hidden)
                    VStack(spacing: 1) {
                        Text("Separar").font(.caption).foregroundStyle(.secondary)
                        Text(model.money(split.movedOut))
                            .font(.title3.weight(.semibold)).monospacedDigit()
                            .lineLimit(1).minimumScaleFactor(0.6)
                        Text("de \(model.money(income))").font(.caption2).foregroundStyle(.secondary)
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                    .frame(maxWidth: 116)
                }
                .frame(height: 180)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Salary split")
                .accessibilityValue(split.all.map { "\($0.title) \(model.money($0.amount))" }.joined(separator: ", "))
            }
            HStack(spacing: 8) {
                AccountTile(account: .spending, amount: model.money(split.spendingTotal), caption: "day to day")
                AccountTile(account: .saves, amount: model.money(split.savesTotal), caption: "bills and reserve")
                if split.goalsTotal > 0 {
                    AccountTile(account: .goal, amount: model.money(split.goalsTotal),
                                caption: split.goals.count == 1 ? "goal account" : "\(split.goals.count) accounts")
                }
            }
        }
        .padding(.vertical, 6)
    }
}

private struct AccountTile: View {
    let account: BankAccount
    let amount: String
    let caption: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Label(account.title, systemImage: account.symbol)
                .font(.caption.weight(.semibold))
                .foregroundStyle(account.tint)
                .lineLimit(1)
            Text(amount).font(.headline).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
            Text(caption).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(account.tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

private struct AccountHeader: View {
    let account: BankAccount
    let total: String

    var body: some View {
        HStack {
            Label(account.title, systemImage: account.symbol).foregroundStyle(account.tint)
            Spacer()
            Text(total).monospacedDigit().foregroundStyle(.secondary)
        }
        .font(.footnote.weight(.semibold))
        .textCase(nil)
    }
}

/// Categoria do plano: quanto separar, quanto já foi e quanto resta.
private struct CategoryRow: View {
    let line: BudgetLine
    let currency: Currency
    var adjusted: Int?

    private func fmt(_ cents: Int) -> String { Money.format(cents, currency) }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            IconBadge(symbol: line.category.symbol, tint: line.category.tint)
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text(line.category.title).font(.subheadline.weight(.medium)).lineLimit(1)
                    Spacer(minLength: 8)
                    Text(fmt(line.target)).font(.subheadline.weight(.semibold)).monospacedDigit()
                }
                SoftBar(progress: line.progress, tint: line.category.tint, isOver: line.isOver)
                HStack {
                    Text(line.fixed > line.spent ? "fixed \(fmt(line.fixed))" : "spent \(fmt(line.spent))")
                    Spacer()
                    Text(line.isOver ? "over by \(fmt(-line.remaining))" : "\(fmt(line.remaining)) left")
                        .foregroundStyle(line.isOver ? Color.red : Color.secondary)
                }
                .font(.caption).foregroundStyle(.secondary).monospacedDigit()
                if line.fixedOver {
                    Text("Os fixos passam do plano").font(.caption2).foregroundStyle(.red)
                }
                if let adjusted, adjusted != line.target {
                    Text("Adjusted to \(fmt(adjusted))").font(.caption2).foregroundStyle(.orange)
                }
            }
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
    }
}

/// Meta dentro de saves: quanto vai para ela neste salário e o progresso total.
private struct GoalSplitRow: View {
    let row: GoalRow
    let tint: Color
    let currency: Currency

    private func fmt(_ cents: Int) -> String { Money.format(cents, currency) }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            IconBadge(symbol: "target", tint: tint)
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text(row.goal.name).font(.subheadline.weight(.medium)).lineLimit(1)
                    Spacer(minLength: 8)
                    Text(fmt(row.effectiveAllocation)).font(.subheadline.weight(.semibold)).monospacedDigit()
                        .foregroundStyle(row.effectiveAllocation > 0 ? Color.primary : Color.secondary)
                }
                SoftBar(progress: row.status.progress, tint: tint)
                HStack {
                    Text("\(fmt(row.status.saved)) of \(fmt(row.status.target))")
                    Spacer()
                    Text(row.status.isComplete ? "completed" : "by \(Fmt.short(row.goal.deadline))")
                }
                .font(.caption).foregroundStyle(.secondary).monospacedDigit()
            }
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
    }
}

/// Linha simples com ícone, título, valor e legenda curta.
private struct AmountRow: View {
    let symbol: String
    let tint: Color
    let title: String
    let amount: String
    let caption: String

    var body: some View {
        HStack(spacing: 12) {
            IconBadge(symbol: symbol, tint: tint)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.medium))
                Text(caption).font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            Text(amount).font(.subheadline.weight(.semibold)).monospacedDigit()
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
    }
}

/// Carteira de saves: o saldo que já existe e como fica depois deste salário.
private struct WalletSection: View {
    @Bindable var settings: FinanceSettings
    let model: FinanceModel
    @FocusState private var editing: Bool

    var body: some View {
        let w = model.wallet
        Section {
            HStack(spacing: 12) {
                IconBadge(symbol: "building.columns", tint: .vidaSaves)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Already in saves").font(.subheadline.weight(.medium))
                    Text(settings.savesBalanceUpdatedAt > .distantPast
                         ? "updated \(Fmt.short(settings.savesBalanceUpdatedAt))" : "tap to enter")
                        .font(.caption).foregroundStyle(.secondary)
                }
                MoneyField("0,00", cents: $settings.savesBalanceCents)
                    .font(.subheadline.weight(.semibold))
                    .focused($editing)
            }
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("OK") { editing = false }
                }
            }
            ValueRow(title: "Comes in from this salary", value: "+ \(model.money(w.incoming))", tint: .vidaSaves)
            if w.bills > 0 {
                ValueRow(title: "Goes out to bills", value: "− \(model.money(w.bills))")
            }
            LabeledContent("Left after the \(settings.frequency.periodNoun)") {
                Text(model.money(w.afterPeriod)).monospacedDigit()
            }
            .font(.subheadline.weight(.semibold))
        } header: {
            Text("Saves wallet")
        }
        .onChange(of: settings.savesBalanceCents) { settings.savesBalanceUpdatedAt = Date() }
    }
}

/// Aviso quando o plano não reserva o que as metas exigem, com sugestão (só muda com confirmação).
struct SavingsWarning: View {
    let check: SavingsCheck
    let currency: Currency
    let settings: FinanceSettings
    @State private var confirm = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("\(Money.format(check.shortfall, currency)) per period short for the goals.",
                  systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
                .font(.footnote)
            if let s = check.suggestion {
                Button("Switch to \(s.title)") { confirm = true }
                    .font(.footnote.weight(.semibold))
                    .confirmationDialog("Switch the plan to \(s.title)?", isPresented: $confirm, titleVisibility: .visible) {
                        Button("Switch plan") { settings.preset = s }
                    }
            } else {
                Text("No plan covers it alone. Extend the deadline or reduce the goal.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}
