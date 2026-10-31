import SwiftData
import SwiftUI

struct TransactionForm: View {
    let draft: TransactionDraft
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query private var settingsList: [FinanceSettings]

    @State private var kind: TransactionKind = .expense
    @State private var source: IncomeSource = .salary
    @State private var amount = 0
    @State private var date = Date()
    @State private var category: BudgetCategory = .alimentacao
    @State private var note = ""
    @State private var loaded = false

    private var currency: Currency { settingsList.first?.currency ?? .eur }

    var body: some View {
        NavigationStack {
            Form {
                Picker("Tipo", selection: $kind) {
                    ForEach(TransactionKind.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)

                Section {
                    // `id` recria o campo quando o valor é preenchido ao abrir.
                    MoneyField("Valor (\(currency.rawValue))", cents: $amount).id(loaded)
                    DatePicker("Data", selection: $date, displayedComponents: .date)
                    if kind == .income {
                        Picker("Origem", selection: $source) {
                            ForEach(IncomeSource.allCases) { Text($0.title).tag($0) }
                        }
                    } else {
                        Picker("Categoria", selection: $category) {
                            ForEach(BudgetCategory.spending) { Label($0.transactionTitle, systemImage: $0.symbol).tag($0) }
                        }
                    }
                    TextField("Nota (opcional)", text: $note)
                }
            }
            .vidaList()
            .navigationTitle(draft.transaction == nil ? (kind == .income ? "Nova entrada" : "Novo gasto") : "Editar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Salvar", action: save).disabled(amount <= 0) }
            }
            .onAppear(perform: load)
        }
    }

    private func load() {
        guard !loaded else { return }
        if let t = draft.transaction {
            kind = t.kind
            source = t.source
            amount = t.amountCents
            date = t.date
            category = t.category == .poupanca ? .outro : t.category
            note = t.note
        } else {
            kind = draft.kind
            date = draft.date
        }
        loaded = true
    }

    private func save() {
        let t = draft.transaction ?? Transaction()
        t.kind = kind
        t.amountCents = amount
        t.date = date
        t.note = note.trimmingCharacters(in: .whitespacesAndNewlines)
        t.category = kind == .income ? .outro : category
        t.source = source
        if draft.transaction == nil { context.insert(t) }
        // O primeiro salário lançado liga o lembrete do dia de pagamento.
        if kind == .income && source == .salary, let settings = settingsList.first, !settings.isConfigured {
            settings.isConfigured = true
            NotificationService.refresh(context)
        }
        try? context.save()
        dismiss()
    }
}
