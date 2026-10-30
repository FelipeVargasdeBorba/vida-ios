import SwiftData
import SwiftUI

/// Marcar e desmarcar itens do checklist. Desmarcar só desfaz o que o próprio checklist criou.
enum ChecklistActions {
    /// Nota dos aportes criados pelo checklist (para poder desfazer).
    static let goalNote = "Separado no checklist"

    static func toggleTransfer(_ model: FinanceModel, context: ModelContext) {
        if let check = model.transferCheck {
            context.delete(check)
        } else {
            context.insert(PeriodCheck(kind: .savesTransfer, forDate: model.period.start))
        }
        try? context.save()
    }

    static func toggleBill(_ bill: BillRow, context: ModelContext) {
        if let check = bill.check {
            context.delete(check)
        } else {
            let check = PeriodCheck(kind: .bill, forDate: bill.due)
            context.insert(check)
            check.fixed = bill.fixed
        }
        try? context.save()
        NotificationService.refresh(context)
    }

    /// Desfaz as transferências que o checklist registrou neste período.
    static func undoGoal(_ row: GoalRow, period: PayPeriod, context: ModelContext) {
        for c in row.goal.contributions ?? [] where c.note == goalNote && period.contains(c.date) {
            context.delete(c)
        }
        try? context.save()
    }
}

/// Toque no círculo de uma meta: informar quanto foi transferido, ou desfazer.
enum GoalAction {
    case transfer(GoalRow)
    case undo(GoalRow)

    init(_ row: GoalRow) { self = row.isDoneThisPeriod ? .undo(row) : .transfer(row) }
}

private struct GoalTransferModifier: ViewModifier {
    @Binding var action: GoalAction?
    let model: FinanceModel
    @Environment(\.modelContext) private var context

    private var transferRow: Binding<GoalRow?> {
        Binding(get: { if case .transfer(let r) = action { r } else { nil } },
                set: { if $0 == nil, case .transfer = action { action = nil } })
    }

    private var undoRow: GoalRow? { if case .undo(let r) = action { r } else { nil } }

    func body(content: Content) -> some View {
        content
            .sheet(item: transferRow) { row in
                ContributionForm(goal: row.goal, contribution: nil, currency: model.currency,
                                 suggested: row.toMove, defaultNote: ChecklistActions.goalNote)
            }
            .confirmationDialog("Desfazer a transferência?", isPresented: Binding(
                get: { undoRow != nil }, set: { if !$0 { action = nil } }
            ), titleVisibility: .visible, presenting: undoRow) { row in
                Button("Desfazer", role: .destructive) {
                    ChecklistActions.undoGoal(row, period: model.period, context: context)
                }
            } message: { row in
                Text("\(row.goal.name): \(model.money(row.transferred)) deixam de contar neste período.")
            }
    }
}

extension View {
    func goalTransfer(_ action: Binding<GoalAction?>, model: FinanceModel) -> some View {
        modifier(GoalTransferModifier(action: action, model: model))
    }
}

/// Bolinha de check usada nas linhas.
struct CheckCircle: View {
    let done: Bool
    var tint: Color = .vidaSaves

    var body: some View {
        Image(systemName: done ? "checkmark.circle.fill" : "circle")
            .font(.title3)
            .foregroundStyle(done ? tint : Color.secondary.opacity(0.6))
            .contentTransition(.symbolEffect(.replace))
    }
}
