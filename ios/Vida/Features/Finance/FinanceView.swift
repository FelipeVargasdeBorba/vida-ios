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
            .navigationTitle("Finanças")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { router.transactionDraft = TransactionDraft() } label: { Image(systemName: "plus.circle.fill") }
                        .accessibilityLabel("Nova transação")
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
                    Label("Transações", systemImage: "list.bullet")
                }
                NavigationLink { FixedExpensesView() } label: { Label("Gastos fixos", systemImage: "pin") }
                NavigationLink { GoalsView() } label: { Label("Metas", systemImage: "target") }
                NavigationLink { HistoryView() } label: { Label("Histórico", systemImage: "clock.arrow.circlepath") }
                NavigationLink { SetupView(settings: settings) } label: { Label("Configurações", systemImage: "gearshape") }
            }
            .font(.subheadline)
            if model.income > 0 {
                Section {
                    Button {
                        context.insert(model.snapshot(settings: settings))
                        try? context.save()
                        savedAlert = true
                    } label: {
                        Label("Salvar no histórico", systemImage: "square.and.arrow.down")
                    }
                    .font(.subheadline)
                }
            }
        }
        .listSectionSpacing(.compact)
        .scrollDismissesKeyboard(.interactively)
        .alert("Salvo no histórico", isPresented: $savedAlert) { Button("OK", role: .cancel) {} }
    }

    /// Sem salário lançado no período ainda não há o que dividir.
    private var salaryPrompt: some View {
        VStack(alignment: .leading, spacing: 12) {
            IconBadge(symbol: "banknote", tint: .vidaSaves)
            VStack(alignment: .leading, spacing: 4) {
                Text("Recebeu o salário?").font(.headline)
                Text("Lance o valor que caiu na conta e o app mostra quanto deixar para gastos e quanto separar para saves.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Button {
                router.transactionDraft = TransactionDraft(kind: .income, date: Date())
            } label: {
                Label("Adicionar salário", systemImage: "plus")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
            .tint(.vidaSaves)
            Text("Período \(Fmt.period(model.period))").font(.caption).foregroundStyle(.secondary)
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
                Text(spent > total ? "Gasto \(model.money(spent)) · passou \(model.money(spent - total))"
                                   : "Gasto \(model.money(spent)) · resta \(model.money(total - spent))")
            }
        }
    }

    /// Sobra (ou gasto a mais) dos períodos anteriores, já somada aos alvos.
    private var carryRow: some View {
        let weekly = settings.frequency == .weekly
        let positive = model.carry > 0
        let title = positive ? (weekly ? "Sobra da semana passada" : "Sobra do mês passado")
                             : (weekly ? "Gasto a mais na semana passada" : "Gasto a mais no mês passado")
        let caption = positive ? "somada ao \(model.carryCategory?.title ?? "plano")" : "descontada dos gastos do dia a dia"
        return AmountRow(symbol: positive ? "arrow.uturn.forward" : "arrow.uturn.backward",
                         tint: positive ? .vidaSaves : .red, title: title,
                         amount: "\(positive ? "+" : "−") \(model.money(abs(model.carry)))", caption: caption)
            .swipeActions {
                Button("Zerar") { confirmCarryReset = true }.tint(.orange)
            }
            .confirmationDialog("Zerar a sobra?", isPresented: $confirmCarryReset, titleVisibility: .visible) {
                Button("Zerar e recomeçar daqui") { settings.carryFromDate = model.period.start }
            } message: {
                Text("O plano deste período volta ao valor normal. Use quando o saldo da conta de gastos no banco não bater com o app.")
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
                AmountRow(symbol: "leaf", tint: BudgetCategory.poupanca.tint, title: "Reserva",
                          amount: model.money(reserve), caption: "o que sobra depois das metas")
            }
        } header: {
            AccountHeader(account: .saves, total: model.money(split.savesTotal))
        } footer: {
            Text(split.savesKept > 0 ? "Separe ao receber. Disso, \(model.money(split.savesKept)) ficam de reserva."
                                     : "Separe ao receber para pagar as contas.")
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
            Text("Cada meta tem a sua conta. Transfira direto para ela, sem passar por saves.")
        }
    }

    private func adaptationSection(_ a: AdaptationResult) -> some View {
        Section("Adaptação automática") {
            NavigationLink { AdaptationView() } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Pode gastar \(model.money(a.dailyAllowance)) por dia").font(.subheadline)
                    Text(!a.isNeeded ? "Tudo dentro do plano"
                         : a.isFeasible ? "Ajustado para compensar \(model.money(a.need))"
                         : (model.shortfallAccepted ? "Atraso aceito: faltam \(model.money(a.shortfall))"
                            : "Faltam \(model.money(a.shortfall)) para a meta"))
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
                    CheckRow(done: isDone, title: "Separar para saves",
                             subtitle: isDone ? "feito" : "mover ao receber o salário",
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
                    CheckRow(done: row.isDoneThisPeriod, title: "Meta \(row.goal.name)",
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
                    Text("\(done) de \(total)").monospacedDigit()
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
            return row.transferred > 0 ? "falta transferir para a conta da meta" : "transferir para a conta da meta"
        }
        return row.transferred == row.allocation ? "transferido" : "transferido · plano \(model.money(row.allocation))"
    }

    private func subtitle(_ bill: BillRow) -> (String, Color) {
        switch bill.state {
        case .paid: ("pago", .secondary)
        case .overdue(let d): ("venceu há \(d) \(d == 1 ? "dia" : "dias")", .red)
        case .dueToday: ("vence hoje", .orange)
        case .upcoming(let d) where d <= 3: ("vence em \(d) \(d == 1 ? "dia" : "dias")", .orange)
        case .upcoming: ("vence \(Fmt.short(bill.due))", .secondary)
        case .noDate: ("neste mês", .secondary)
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
                Label(model.daysUntilPayday == 0 ? "Salário hoje"
                      : "Salário em \(model.daysUntilPayday) \(model.daysUntilPayday == 1 ? "dia" : "dias")",
                      systemImage: "calendar")
                    .font(.footnote.weight(.medium))
                Spacer()
                Text(Fmt.period(model.period)).font(.footnote).foregroundStyle(.secondary)
            }
            if !split.all.isEmpty {
                ZStack {
                    Chart(split.all) { slice in
                        SectorMark(angle: .value("Valor", slice.amount), innerRadius: .ratio(0.72), angularInset: 1.5)
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
                .accessibilityLabel("Divisão do salário")
                .accessibilityValue(split.all.map { "\($0.title) \(model.money($0.amount))" }.joined(separator: ", "))
            }
            HStack(spacing: 8) {
                AccountTile(account: .spending, amount: model.money(split.spendingTotal), caption: "dia a dia")
                AccountTile(account: .saves, amount: model.money(split.savesTotal), caption: "contas e reserva")
                if split.goalsTotal > 0 {
                    AccountTile(account: .goal, amount: model.money(split.goalsTotal),
                                caption: split.goals.count == 1 ? "conta da meta" : "\(split.goals.count) contas")
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
                    Text(line.fixed > line.spent ? "fixos \(fmt(line.fixed))" : "gasto \(fmt(line.spent))")
                    Spacer()
                    Text(line.isOver ? "passou \(fmt(-line.remaining))" : "resta \(fmt(line.remaining))")
                        .foregroundStyle(line.isOver ? Color.red : Color.secondary)
                }
                .font(.caption).foregroundStyle(.secondary).monospacedDigit()
                if line.fixedOver {
                    Text("Os fixos passam do plano").font(.caption2).foregroundStyle(.red)
                }
                if let adjusted, adjusted != line.target {
                    Text("Ajustado para \(fmt(adjusted))").font(.caption2).foregroundStyle(.orange)
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
                    Text("\(fmt(row.status.saved)) de \(fmt(row.status.target))")
                    Spacer()
                    Text(row.status.isComplete ? "concluída" : "até \(Fmt.short(row.goal.deadline))")
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
                    Text("Já tenho em saves").font(.subheadline.weight(.medium))
                    Text(settings.savesBalanceUpdatedAt > .distantPast
                         ? "atualizado \(Fmt.short(settings.savesBalanceUpdatedAt))" : "toque para informar")
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
            ValueRow(title: "Entra deste salário", value: "+ \(model.money(w.incoming))", tint: .vidaSaves)
            if w.bills > 0 {
                ValueRow(title: "Sai para contas", value: "− \(model.money(w.bills))")
            }
            LabeledContent("Fica depois do \(settings.frequency.periodNoun)") {
                Text(model.money(w.afterPeriod)).monospacedDigit()
            }
            .font(.subheadline.weight(.semibold))
        } header: {
            Text("Carteira saves")
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
            Label("Faltam \(Money.format(check.shortfall, currency)) por período para as metas.",
                  systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
                .font(.footnote)
            if let s = check.suggestion {
                Button("Trocar para \(s.title)") { confirm = true }
                    .font(.footnote.weight(.semibold))
                    .confirmationDialog("Trocar o plano para \(s.title)?", isPresented: $confirm, titleVisibility: .visible) {
                        Button("Trocar plano") { settings.preset = s }
                    }
            } else {
                Text("Nenhum plano cobre sozinho. Estenda o prazo ou reduza a meta.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}
