import SwiftData
import SwiftUI

struct FixedExpensesView: View {
    @Query(sort: \FixedExpense.createdAt) private var items: [FixedExpense]
    @Query private var settingsList: [FinanceSettings]
    @Environment(\.modelContext) private var context
    @State private var editing: FixedDraft?

    private var settings: FinanceSettings? { settingsList.first }
    private var currency: Currency { settings?.currency ?? .eur }

    private static let suggestions: [(String, BudgetCategory)] = [
        ("Aluguel", .casa), ("Internet", .fixos), ("Telemóvel", .fixos), ("Seguro", .fixos), ("Passe", .transporte),
    ]

    var body: some View {
        List {
            ForEach(BudgetCategory.spending) { c in
                let group = items.filter { $0.category == c }
                if !group.isEmpty {
                    Section(c.title) {
                        ForEach(group) { f in
                            Button { editing = FixedDraft(item: f) } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(f.name.isEmpty ? c.title : f.name).foregroundStyle(.primary)
                                        if f.dueDay > 0 {
                                            Label("vence dia \(f.dueDay)", systemImage: f.remindOn ? "bell.fill" : "calendar")
                                                .font(.caption).foregroundStyle(.secondary)
                                        }
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing) {
                                        Text("\(Money.format(f.monthlyCents, currency))/mês").monospacedDigit()
                                        if settings?.frequency == .weekly {
                                            Text("\(Money.format(BudgetCalculator.perPeriod(monthlyCents: f.monthlyCents, frequency: .weekly), currency))/semana")
                                                .font(.caption).foregroundStyle(.secondary)
                                        }
                                    }
                                }
                            }
                            .swipeActions {
                                Button(role: .destructive) {
                                    context.delete(f)
                                    try? context.save()
                                    NotificationService.refresh(context)
                                } label: {
                                    Label("Apagar", systemImage: "trash")
                                }
                            }
                        }
                    }
                }
            }
            let missing = Self.suggestions.filter { s in !items.contains { $0.name == s.0 } }
            if !missing.isEmpty {
                Section("Sugestões") {
                    ForEach(missing, id: \.0) { s in
                        Button { editing = FixedDraft(name: s.0, category: s.1) } label: {
                            Label("\(s.0) (\(s.1.title))", systemImage: "plus.circle")
                        }
                    }
                }
            }
            Section {
                ValueRow(title: "Total mensal", value: Money.format(items.reduce(0) { $0 + $1.monthlyCents }, currency))
            } footer: {
                Text("Cadastre só os valores mensais. Em renda semanal, o app converte por ×12/52.")
            }
        }
        .vidaList()
        .navigationTitle("Gastos fixos")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { editing = FixedDraft() } label: { Image(systemName: "plus") }.accessibilityLabel("Novo gasto fixo")
            }
        }
        .sheet(item: $editing) {
            FixedExpenseForm(draft: $0, currency: currency, reminderMinutes: settings?.reminderMinutes ?? 540)
        }
    }
}

struct FixedDraft: Identifiable {
    let id = UUID()
    var item: FixedExpense?
    var name = ""
    var category: BudgetCategory = .casa
}

private struct FixedExpenseForm: View {
    let draft: FixedDraft
    let currency: Currency
    let reminderMinutes: Int
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var category: BudgetCategory = .casa
    @State private var monthly = 0
    @State private var dueDay = 0
    @State private var remindOn = false
    @State private var loaded = false

    var body: some View {
        NavigationStack {
            Form {
                TextField("Nome", text: $name)
                Picker("Categoria", selection: $category) {
                    ForEach(BudgetCategory.spending) { Text($0.title).tag($0) }
                }
                LabeledContent("Valor mensal") { MoneyField(currency.rawValue, cents: $monthly).id(loaded) }
                Section {
                    Picker("Vence no dia", selection: $dueDay) {
                        Text("Sem data").tag(0)
                        ForEach(1...31, id: \.self) { Text("Dia \($0)").tag($0) }
                    }
                    if dueDay > 0 {
                        Toggle("Lembrar de pagar", isOn: $remindOn)
                    }
                } footer: {
                    if dueDay > 0 && remindOn {
                        Text("Avisa no dia \(dueDay) às \(NotificationPlanner.timeText(reminderMinutes)) (a hora do lembrete do salário). O aviso some quando você marca como paga no checklist.")
                    } else if dueDay > 28 {
                        Text("Nos meses sem o dia \(dueDay), vence no último dia do mês.")
                    }
                }
            }
            .vidaList()
            .navigationTitle(draft.item == nil ? "Novo fixo" : "Editar fixo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvar") {
                        let f = draft.item ?? FixedExpense()
                        f.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
                        f.category = category
                        f.monthlyCents = monthly
                        f.dueDay = dueDay
                        f.remindOn = dueDay > 0 && remindOn
                        if draft.item == nil { context.insert(f) }
                        try? context.save()
                        NotificationService.refresh(context)
                        dismiss()
                    }
                    .disabled(monthly <= 0)
                }
            }
            .onAppear {
                guard !loaded else { return }
                name = draft.item?.name ?? draft.name
                category = draft.item?.category ?? draft.category
                monthly = draft.item?.monthlyCents ?? 0
                dueDay = draft.item?.dueDay ?? 0
                remindOn = draft.item?.remindOn ?? true
                loaded = true
            }
        }
    }
}
