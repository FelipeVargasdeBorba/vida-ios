import SwiftData
import SwiftUI

struct HistoryView: View {
    @Query(sort: \PeriodSnapshot.savedAt, order: .reverse) private var snapshots: [PeriodSnapshot]
    @Environment(\.modelContext) private var context

    var body: some View {
        List {
            if snapshots.isEmpty {
                ContentUnavailableView("History is empty", systemImage: "clock",
                                       description: Text("Use \"Save to history\" in Finance."))
            } else {
                Section {
                    // Somado por moeda, caso ela tenha mudado.
                    ForEach(Currency.allCases) { cur in
                        let total = snapshots.filter { $0.currency == cur }.reduce(0) { $0 + $1.savingsPlannedCents }
                        if total > 0 { ValueRow(title: "Poupança planejada (\(cur.rawValue))", value: Money.format(total, cur), tint: .green) }
                    }
                }
            }
            ForEach(snapshots) { s in
                NavigationLink { HistoryDetailView(snapshot: s) } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(Fmt.period(PayPeriod(start: s.periodStart, end: s.periodEnd))).font(.headline)
                        Text("\(s.preset.title) · save \(Money.format(s.savingsPlannedCents, s.currency))")
                            .font(.caption).foregroundStyle(.secondary)
                        Text("Saved on \(s.savedAt.formatted(.dateTime.day().month().hour().minute().locale(Money.locale)))")
                            .font(.caption2).foregroundStyle(.tertiary)
                    }
                }
                .swipeActions {
                    Button(role: .destructive) { context.delete(s); try? context.save() } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }
        }
        .vidaList()
        .navigationTitle("History")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct HistoryDetailView: View {
    let snapshot: PeriodSnapshot

    var body: some View {
        let cur = snapshot.currency
        let p = snapshot.payload
        List {
            Section("Period") {
                ValueRow(title: "Dates", value: Fmt.period(PayPeriod(start: snapshot.periodStart, end: snapshot.periodEnd)))
                ValueRow(title: "Income", value: "\(Money.format(snapshot.incomeCents, cur)) · \(snapshot.frequency.title)")
                ValueRow(title: "Plan", value: snapshot.preset.title)
                ValueRow(title: "Planned savings", value: Money.format(snapshot.savingsPlannedCents, cur), tint: .green)
                if let p {
                    ValueRow(title: "Fixed", value: Money.format(p.totalFixed, cur))
                    ValueRow(title: "Free", value: Money.format(p.free, cur))
                    ValueRow(title: "Actual spending", value: Money.format(p.totalSpent, cur))
                    ValueRow(title: "Income logged", value: Money.format(p.incomeLogged, cur))
                }
            }
            if let p {
                Section("Lines") {
                    ForEach(p.lines, id: \.category) { l in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Text(l.category.title)
                                Spacer()
                                Text("\(Money.format(l.spent, cur)) / \(Money.format(l.target, cur))").monospacedDigit()
                                    .foregroundStyle(max(l.spent, l.fixed) > l.target ? .red : .secondary)
                            }
                            HStack {
                                if l.fixed > 0 { Text("Fixed \(Money.format(l.fixed, cur))") }
                                Spacer()
                                if let a = l.adjusted, a != l.target { Text("Adjusted \(Money.format(a, cur))").foregroundStyle(.orange) }
                            }
                            .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                if snapshot.adaptEnabled {
                    Section("Adaptation") {
                        if let v = p.adjustedSavings { ValueRow(title: "Adjusted savings", value: Money.format(v, cur)) }
                        if let v = p.dailyAllowance { ValueRow(title: "Per day", value: Money.format(v, cur)) }
                        if let v = p.shortfall, v > 0 {
                            ValueRow(title: "Shortfall", value: Money.format(v, cur), tint: .red)
                            ValueRow(title: "Delay accepted", value: p.shortfallAccepted ? "Yes" : "No")
                        }
                    }
                }
                if !p.goals.isEmpty {
                    Section("Goals") {
                        ForEach(p.goals, id: \.self) { g in
                            VStack(alignment: .leading, spacing: 2) {
                                HStack {
                                    Text(g.name)
                                    Spacer()
                                    Text("\(Money.format(g.saved, cur)) / \(Money.format(g.target, cur))").monospacedDigit()
                                }
                                Text("Required this period \(Money.format(g.requiredThisPeriod, cur)) · contributed \(Money.format(g.contributedThisPeriod, cur))")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .vidaList()
        .navigationTitle("Details")
        .navigationBarTitleDisplayMode(.inline)
    }
}
