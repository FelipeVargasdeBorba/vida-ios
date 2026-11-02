import Foundation
import SwiftData

enum Seeder {
    /// Primeira abertura: configurações, meta "Faculdade", listas e semana de trabalho.
    static func seedIfNeeded(_ context: ModelContext) {
        let count = (try? context.fetchCount(FetchDescriptor<FinanceSettings>())) ?? 0
        guard count == 0 else { return }

        context.insert(FinanceSettings())

        let deadline = Calendar.current.date(byAdding: .month, value: 12, to: Calendar.current.startOfDay(for: Date())) ?? Date()
        context.insert(Goal(name: "College", targetCents: 500_000, deadline: deadline, priority: 0))

        context.insert(NoteList(name: "Shopping", sortOrder: 0))
        context.insert(NoteList(name: "To do", sortOrder: 1))

        for weekday in 1...7 {
            context.insert(WorkDay(weekday: weekday))
        }
        try? context.save()
    }
}

extension FinanceSettings {
    /// Singleton: devolve o existente ou cria.
    static func current(_ context: ModelContext) -> FinanceSettings {
        if let existing = try? context.fetch(FetchDescriptor<FinanceSettings>()).first { return existing }
        let s = FinanceSettings()
        context.insert(s)
        return s
    }
}
