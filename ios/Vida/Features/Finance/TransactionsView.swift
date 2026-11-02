import SwiftData
import SwiftUI

/// Transações de um período por vez (‹ ›), agrupadas por dia, com filtro por categoria.
struct TransactionsView: View {
    let settings: FinanceSettings
    @Environment(AppRouter.self) private var router
    @State private var period: PayPeriod
    @State private var filter: BudgetCategory?

    init(settings: FinanceSettings, initial: PayPeriod) {
        self.settings = settings
        _period = State(initialValue: initial)
    }

    var body: some View {
        TransactionList(period: period, filter: filter, currency: settings.currency)
            .safeAreaInset(edge: .top) {
                HStack {
                    Button { period = PayPeriodCalculator.previous(period, schedule: settings.schedule, calendar: .current) } label: {
                        Image(systemName: "chevron.left").padding(8)
                    }
                    .accessibilityLabel("Previous period")
                    Spacer()
                    Text(Fmt.period(period)).font(.subheadline.weight(.medium))
                    Spacer()
                    Button { period = PayPeriodCalculator.next(period, schedule: settings.schedule, calendar: .current) } label: {
                        Image(systemName: "chevron.right").padding(8)
                    }
                    .accessibilityLabel("Next period")
                }
                .padding(.horizontal)
                .padding(.vertical, 4)
                .background(.bar)
            }
            .vidaList()
            .navigationTitle("Transactions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Category", selection: $filter) {
                            Text("All").tag(BudgetCategory?.none)
                            ForEach(BudgetCategory.spending) { Text($0.transactionTitle).tag(BudgetCategory?.some($0)) }
                        }
                    } label: {
                        Image(systemName: filter == nil ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
                    }
                    .accessibilityLabel("Filter by category")
                }
                ToolbarItem(placement: .primaryAction) {
                    Button { router.transactionDraft = TransactionDraft() } label: { Image(systemName: "plus.circle.fill") }
                        .accessibilityLabel("New transaction")
                }
            }
    }
}

private struct TransactionList: View {
    let currency: Currency
    @Query private var items: [Transaction]
    @Environment(\.modelContext) private var context
    @Environment(AppRouter.self) private var router

    init(period: PayPeriod, filter: BudgetCategory?, currency: Currency) {
        self.currency = currency
        let start = period.start, end = period.end
        if let filter {
            // Lançamentos antigos de "Lazer" contam como "Outro".
            let raws = filter == .outro ? [BudgetCategory.outro.rawValue, "lazer"] : [filter.rawValue]
            let expense = TransactionKind.expense.rawValue
            _items = Query(filter: #Predicate<Transaction> {
                $0.date >= start && $0.date < end && raws.contains($0.categoryRaw) && $0.kindRaw == expense
            }, sort: \Transaction.date, order: .reverse)
        } else {
            _items = Query(filter: #Predicate<Transaction> { $0.date >= start && $0.date < end },
                           sort: \Transaction.date, order: .reverse)
        }
    }

    var body: some View {
        let groups = grouped()
        List {
            if items.isEmpty {
                ContentUnavailableView("No transactions", systemImage: "tray", description: Text("Tap + to add one."))
            } else {
                Section {
                    let income = items.filter { $0.kind == .income }.reduce(0) { $0 + $1.amountCents }
                    let spent = items.filter { $0.kind == .expense }.reduce(0) { $0 + $1.amountCents }
                    ValueRow(title: "Income", value: Money.format(income, currency), tint: .green)
                    ValueRow(title: "Expenses", value: Money.format(spent, currency))
                }
            }
            ForEach(groups, id: \.day) { group in
                Section(Fmt.day(group.day)) {
                    ForEach(group.items) { t in
                        row(t)
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    context.delete(t)
                                    try? context.save()
                                } label: { Label("Delete", systemImage: "trash") }
                                Button { router.transactionDraft = TransactionDraft(transaction: t) } label: {
                                    Label("Edit", systemImage: "pencil")
                                }
                                .tint(.blue)
                            }
                    }
                }
            }
        }
    }

    private func row(_ t: Transaction) -> some View {
        HStack {
            Image(systemName: t.kind == .income ? "arrow.down.circle" : t.category.symbol)
                .foregroundStyle(t.kind == .income ? .green : .secondary)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(t.title)
                if !t.note.isEmpty { Text(t.note).font(.caption).foregroundStyle(.secondary) }
            }
            Spacer()
            Text((t.kind == .income ? "+" : "−") + Money.format(t.amountCents, currency))
                .monospacedDigit()
                .foregroundStyle(t.kind == .income ? .green : .primary)
        }
        .contentShape(Rectangle())
        .onTapGesture { router.transactionDraft = TransactionDraft(transaction: t) }
    }

    private func grouped() -> [(day: Date, items: [Transaction])] {
        let cal = Calendar.current
        var order: [Date] = []
        var dict: [Date: [Transaction]] = [:]
        for t in items { // já ordenadas por data decrescente
            let d = cal.startOfDay(for: t.date)
            if dict[d] == nil { order.append(d) }
            dict[d, default: []].append(t)
        }
        return order.map { ($0, dict[$0] ?? []) }
    }
}
