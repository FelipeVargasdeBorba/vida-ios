import SwiftData
import SwiftUI

struct AdaptationView: View {
    var body: some View {
        CurrentPeriodReader { settings, model in
            if let a = model.adaptation {
                AdaptationContent(settings: settings, model: model, result: a)
            } else {
                ContentUnavailableView("Adaptation is off", systemImage: "slider.horizontal.3",
                                       description: Text("Turn it on in Settings › Adapt plan to hit the goal."))
            }
        }
        .vidaList()
        .navigationTitle("Adjusted budget")
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
                ValueRow(title: "Can spend per day", value: model.money(result.dailyAllowance), tint: .accentColor)
                ValueRow(title: "Days until payday", value: "\(model.daysLeft)")
                if result.isNeeded {
                    ValueRow(title: "To make up", value: model.money(result.need), tint: .orange)
                }
            } footer: {
                Text(result.isNeeded ? "Remaining flexible categories divided by the days left."
                     : "No category went over its target. Nothing was adjusted.")
            }

            Section {
                HStack {
                    Text("Category").frame(maxWidth: .infinity, alignment: .leading)
                    Text("Original").frame(width: 92, alignment: .trailing)
                    Text("Adjusted").frame(width: 92, alignment: .trailing)
                }
                .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                ForEach(result.lines) { l in
                    compareRow(l.category.title, l.original, l.adjusted)
                }
                compareRow("Savings", result.originalSavings, result.adjustedSavings)
            } header: {
                Text("Original × adjusted")
            } footer: {
                Text("Protected goal floor: \(model.money(result.savingsFloor)). Home and Fixed expenses are not cut.")
            }

            if !result.isFeasible {
                shortfallSection
            }
        }
        .confirmationDialog(title(for: pending), isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } }),
                            titleVisibility: .visible, presenting: pending) { option in
            Button("Confirm") { apply(option) }
            Button("Cancel", role: .cancel) {}
        }
    }

    private var shortfallSection: some View {
        Section {
            Label("Even cutting everything flexible, \(model.money(result.shortfall)) is still missing to meet the goal this period.",
                  systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
            if model.shortfallAccepted {
                Label("Delay accepted this period", systemImage: "checkmark.circle").foregroundStyle(.secondary)
            } else {
                if let p = GoalCalculator.moreAggressive(than: settings.preset) {
                    Button("Switch to \(p.title)") { pending = .preset(p) }
                }
                if let ext = deadlineExtension {
                    Button("Extend \(ext.goal.name) to \(Fmt.full(ext.date))") { pending = .extend(ext.goal, ext.date) }
                }
                Button("Accept the delay") { pending = .accept }
            }
        } header: {
            Text("Does not add up")
        } footer: {
            Text("Nothing changes without your confirmation.")
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
        case .preset(let p): "Switch the plan to \(p.title)?"
        case .extend(let g, let d): "Extend the deadline of \(g.name) to \(Fmt.full(d))?"
        case .accept: "Accept that the goal falls behind this period?"
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
