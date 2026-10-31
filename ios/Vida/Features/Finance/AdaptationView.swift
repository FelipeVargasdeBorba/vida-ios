import SwiftData
import SwiftUI

struct AdaptationView: View {
    var body: some View {
        CurrentPeriodReader { settings, model in
            if let a = model.adaptation {
                AdaptationContent(settings: settings, model: model, result: a)
            } else {
                ContentUnavailableView("Adaptação desligada", systemImage: "slider.horizontal.3",
                                       description: Text("Ligue em Configurações › Adaptar plano para bater a meta."))
            }
        }
        .vidaList()
        .navigationTitle("Orçamento ajustado")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private enum AdaptationOption: Identifiable {
    case preset(BudgetPreset)
    case extend(Goal, Date)
    case accept

    var id: String {
        switch self {
        case .preset: "preset"
        case .extend: "extend"
        case .accept: "accept"
        }
    }
}

private struct AdaptationContent: View {
    let settings: FinanceSettings
    let model: FinanceModel
    let result: AdaptationResult
    @Environment(\.modelContext) private var context
    @State private var pending: AdaptationOption?

    /// Meta de menor prioridade cujo prazo, estendido, cobre sozinho o que falta.
    private var deadlineExtension: (goal: Goal, date: Date)? {
        for row in model.goals.reversed() {
            let s = row.status
            let remainingAtStart = max(0, s.target - (s.saved - s.contributedThisPeriod))
            if let d = GoalCalculator.extendedDeadline(remainingAtStart: remainingAtStart, required: s.requiredThisPeriod,
                                                       reduceBy: result.shortfall, period: model.period,
                                                       schedule: model.schedule, calendar: .current) {
                return (row.goal, d)
            }
        }
        return nil
    }

    var body: some View {
        List {
            Section {
                ValueRow(title: "Pode gastar por dia", value: model.money(result.dailyAllowance), tint: .accentColor)
                ValueRow(title: "Dias até o pagamento", value: "\(model.daysLeft)")
                if result.isNeeded {
                    ValueRow(title: "A compensar", value: model.money(result.need), tint: .orange)
                }
            } footer: {
                Text(result.isNeeded ? "Restante das categorias flexíveis dividido pelos dias que faltam."
                     : "Nenhuma categoria passou do alvo. Nada foi ajustado.")
            }

            Section {
                HStack {
                    Text("Categoria").frame(maxWidth: .infinity, alignment: .leading)
                    Text("Original").frame(width: 92, alignment: .trailing)
                    Text("Ajustado").frame(width: 92, alignment: .trailing)
                }
                .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                ForEach(result.lines) { l in
                    compareRow(l.category.title, l.original, l.adjusted)
                }
                compareRow("Poupança", result.originalSavings, result.adjustedSavings)
            } header: {
                Text("Original × ajustado")
            } footer: {
                Text("Piso protegido das metas: \(model.money(result.savingsFloor)). Casa e Gastos fixos não são cortados.")
            }

            if !result.isFeasible {
                shortfallSection
            }
        }
        .confirmationDialog(title(for: pending), isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } }),
                            titleVisibility: .visible, presenting: pending) { option in
            Button("Confirmar") { apply(option) }
            Button("Cancelar", role: .cancel) {}
        }
    }

    private var shortfallSection: some View {
        Section {
            Label("Mesmo cortando tudo que é flexível, faltam \(model.money(result.shortfall)) para cumprir a meta neste período.",
                  systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
            if model.shortfallAccepted {
                Label("Atraso aceito neste período", systemImage: "checkmark.circle").foregroundStyle(.secondary)
            } else {
                if let p = GoalCalculator.moreAggressive(than: settings.preset) {
                    Button("Trocar para \(p.title)") { pending = .preset(p) }
                }
                if let ext = deadlineExtension {
                    Button("Estender \(ext.goal.name) até \(Fmt.full(ext.date))") { pending = .extend(ext.goal, ext.date) }
                }
                Button("Aceitar o atraso") { pending = .accept }
            }
        } header: {
            Text("Não fecha")
        } footer: {
            Text("Nada muda sem a sua confirmação.")
        }
    }

    private func compareRow(_ title: String, _ original: Int, _ adjusted: Int) -> some View {
        HStack {
            Text(title).frame(maxWidth: .infinity, alignment: .leading)
            Text(model.money(original)).frame(width: 92, alignment: .trailing).foregroundStyle(.secondary)
            Text(model.money(adjusted)).frame(width: 92, alignment: .trailing)
                .foregroundStyle(adjusted < original ? .orange : adjusted > original ? .red : .primary)
        }
        .font(.subheadline).monospacedDigit()
        .lineLimit(1).minimumScaleFactor(0.7)
    }

    private func title(for option: AdaptationOption?) -> String {
        switch option {
        case .preset(let p): "Trocar o plano para \(p.title)?"
        case .extend(let g, let d): "Estender o prazo de \(g.name) para \(Fmt.full(d))?"
        case .accept: "Aceitar que a meta atrase neste período?"
        case nil: ""
        }
    }

    private func apply(_ option: AdaptationOption) {
        switch option {
        case .preset(let p): settings.preset = p
        case .extend(let g, let d): g.deadline = d
        case .accept: settings.acceptedShortfallPeriodStart = model.period.start
        }
        try? context.save()
        pending = nil
    }
}
