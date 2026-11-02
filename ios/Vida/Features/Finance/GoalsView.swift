import SwiftData
import SwiftUI

struct GoalsView: View {
    var body: some View {
        CurrentPeriodReader { settings, model in
            GoalsContent(settings: settings, model: model)
        }
        .vidaList()
        .navigationTitle("Goals")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct GoalsContent: View {
    let settings: FinanceSettings
    let model: FinanceModel
    @Environment(\.modelContext) private var context
    @State private var goalDraft: GoalDraft?
    @State private var contributionGoal: GoalRow?
    @State private var goalAction: GoalAction?

    var body: some View {
        let toMove = model.goals.reduce(0) { $0 + $1.toMove }
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text("This \(settings.frequency.periodNoun)").font(.caption).foregroundStyle(.secondary)
                    if model.income == 0 {
                        Text("Log your salary to see how much to transfer").font(.headline)
                    } else if toMove > 0 {
                        Text("Transfer \(model.money(toMove)) to your goals").font(.headline)
                    } else {
                        Label("All transferred", systemImage: "checkmark.seal.fill").font(.headline).foregroundStyle(Color.vidaSaves)
                    }
                    Text("Each goal has its own account: transfer straight to it. Tap the circle once you do.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
                if model.income > 0 && !model.savingsCheck.isEnough {
                    SavingsWarning(check: model.savingsCheck, currency: model.currency, settings: settings)
                }
            }

            Section {
                ForEach(Array(model.goals.enumerated()), id: \.element.id) { i, row in
                    HStack(spacing: 12) {
                        Button {
                            goalAction = GoalAction(row)
                        } label: {
                            CheckCircle(done: row.isDoneThisPeriod, tint: SplitSlice.goalTint(i))
                        }
                        .buttonStyle(.borderless)
                        .disabled(row.allocation == 0)
                        .accessibilityLabel(row.isDoneThisPeriod ? "Undo" : "Mark as transferred")
                        NavigationLink { GoalDetailView(goal: row.goal, currency: model.currency) } label: {
                            GoalRowView(row: row, model: model, tint: SplitSlice.goalTint(i))
                        }
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) { context.delete(row.goal); try? context.save() } label: {
                            Label("Delete", systemImage: "trash")
                        }
                        Button { goalDraft = GoalDraft(goal: row.goal) } label: { Label("Edit", systemImage: "pencil") }
                            .tint(.blue)
                    }
                    .swipeActions(edge: .leading) {
                        Button { contributionGoal = row } label: { Label("Outro valor", systemImage: "plus") }.tint(.green)
                    }
                }
                .onMove(perform: move)
            } header: {
                Text("Your goals")
            } footer: {
                Text(model.goals.count > 1
                     ? "The top one is funded first. To change the order, tap Edit and drag."
                     : "Swipe right to record a different amount.")
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { EditButton() }
            ToolbarItem(placement: .primaryAction) {
                Button { goalDraft = GoalDraft() } label: { Image(systemName: "plus") }.accessibilityLabel("New goal")
            }
        }
        .goalTransfer($goalAction, model: model)
        .sheet(item: $goalDraft) { GoalForm(draft: $0, currency: model.currency, nextPriority: model.goals.count) }
        .sheet(item: $contributionGoal) { row in
            ContributionForm(goal: row.goal, contribution: nil, currency: model.currency, suggested: row.toMove)
        }
    }

    private func move(from: IndexSet, to: Int) {
        var goals = model.goals.map(\.goal)
        goals.move(fromOffsets: from, toOffset: to)
        for (i, g) in goals.enumerated() { g.priority = i }
        try? context.save()
    }
}

/// Meta: quanto transferir agora, em destaque; o resto em uma linha curta.
private struct GoalRowView: View {
    let row: GoalRow
    let model: FinanceModel
    let tint: Color

    var body: some View {
        let s = row.status
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(row.goal.name).font(.subheadline.weight(.medium)).lineLimit(1)
                Spacer(minLength: 8)
                Text(headline).font(.subheadline.weight(.semibold)).monospacedDigit()
                    .foregroundStyle(row.toMove > 0 ? Color.primary : Color.secondary)
            }
            SoftBar(progress: s.progress, tint: tint)
            Text(s.isComplete ? "Goal completed · \(model.money(s.saved))"
                 : "\(model.money(s.saved)) of \(model.money(s.target)) · by \(Fmt.full(row.goal.deadline))")
                .font(.caption).foregroundStyle(s.isOverdue && !s.isComplete ? Color.red : Color.secondary)
                .monospacedDigit()
        }
        .padding(.vertical, 3)
    }

    private var headline: String {
        if row.status.isComplete { return "completed" }
        if row.isDoneThisPeriod { return "transferred \(model.money(row.transferred))" }
        if row.toMove > 0 { return "transfer \(model.money(row.toMove))" }
        return "nothing now"
    }
}

struct GoalDraft: Identifiable {
    let id = UUID()
    var goal: Goal?
}

struct GoalForm: View {
    let draft: GoalDraft
    let currency: Currency
    let nextPriority: Int
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var target = 0
    @State private var deadline = Calendar.current.date(byAdding: .month, value: 12, to: Date()) ?? Date()
    @State private var loaded = false

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $name)
                LabeledContent("Valor-alvo") { MoneyField(currency.rawValue, cents: $target).id(loaded) }
                DatePicker("Deadline", selection: $deadline, displayedComponents: .date)
            }
            .vidaList()
            .navigationTitle(draft.goal == nil ? "New goal" : "Edit goal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let g = draft.goal ?? Goal(priority: nextPriority)
                        g.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
                        g.targetCents = target
                        g.deadline = deadline
                        if draft.goal == nil { context.insert(g) }
                        try? context.save()
                        dismiss()
                    }
                    .disabled(target <= 0 || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear {
                guard !loaded else { return }
                if let g = draft.goal {
                    name = g.name
                    target = g.targetCents
                    deadline = g.deadline
                }
                loaded = true
            }
        }
    }
}

struct ContributionForm: View {
    let goal: Goal
    let contribution: GoalContribution?
    let currency: Currency
    var suggested = 0
    var defaultNote = ""
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @State private var amount = 0
    @State private var date = Date()
    @State private var note = ""
    @State private var loaded = false

    var body: some View {
        NavigationStack {
            Form {
                LabeledContent("Valor") { MoneyField(currency.rawValue, cents: $amount).id(loaded) }
                DatePicker("Date", selection: $date, displayedComponents: .date)
                TextField("Note (optional)", text: $note)
            }
            .vidaList()
            .navigationTitle(contribution == nil ? "Contribution to \(goal.name)" : "Edit contribution")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let c = contribution ?? GoalContribution()
                        c.amountCents = amount
                        c.date = date
                        c.note = note
                        if contribution == nil {
                            context.insert(c)
                            c.goal = goal
                        }
                        try? context.save()
                        dismiss()
                    }
                    .disabled(amount <= 0)
                }
            }
            .onAppear {
                guard !loaded else { return }
                if let c = contribution {
                    amount = c.amountCents
                    date = c.date
                    note = c.note
                } else {
                    amount = suggested
                    note = defaultNote
                }
                loaded = true
            }
        }
    }
}

private struct GoalDetailView: View {
    let goal: Goal
    let currency: Currency
    @Environment(\.modelContext) private var context
    @State private var editingContribution: GoalContribution?
    @State private var adding = false
    @State private var editingGoal: GoalDraft?

    var body: some View {
        let items = (goal.contributions ?? []).sorted { $0.date > $1.date }
        List {
            Section {
                ValueRow(title: "Saved", value: Money.format(goal.savedCents, currency), tint: .green)
                ValueRow(title: "Target", value: Money.format(goal.targetCents, currency))
                ValueRow(title: "Deadline", value: Fmt.full(goal.deadline))
            }
            Section("Contributions") {
                if items.isEmpty { Text("No contributions yet").foregroundStyle(.secondary) }
                ForEach(items) { c in
                    Button { editingContribution = c } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(Fmt.full(c.date)).foregroundStyle(.primary)
                                if !c.note.isEmpty { Text(c.note).font(.caption).foregroundStyle(.secondary) }
                            }
                            Spacer()
                            Text(Money.format(c.amountCents, currency)).monospacedDigit().foregroundStyle(.primary)
                        }
                    }
                    .swipeActions {
                        Button(role: .destructive) { context.delete(c); try? context.save() } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
        }
        .vidaList()
        .navigationTitle(goal.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Edit") { editingGoal = GoalDraft(goal: goal) }
            }
            ToolbarItem(placement: .primaryAction) {
                Button { adding = true } label: { Image(systemName: "plus") }.accessibilityLabel("New contribution")
            }
        }
        .sheet(isPresented: $adding) { ContributionForm(goal: goal, contribution: nil, currency: currency) }
        .sheet(item: $editingContribution) { ContributionForm(goal: goal, contribution: $0, currency: currency) }
        .sheet(item: $editingGoal) { GoalForm(draft: $0, currency: currency, nextPriority: 0) }
    }
}
