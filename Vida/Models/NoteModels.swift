import Foundation
import SwiftData

@Model
final class NoteList {
    var name: String = ""
    var sortOrder: Int = 0
    var createdAt: Date = Date()
    @Relationship(deleteRule: .cascade, inverse: \NoteItem.list)
    var items: [NoteItem]? = []

    init(name: String = "", sortOrder: Int = 0) {
        self.name = name
        self.sortOrder = sortOrder
    }

    /// Pendentes na ordem em que entraram, feitos no fim.
    var sortedItems: [NoteItem] {
        (items ?? []).sorted { a, b in
            if a.isDone != b.isDone { return !a.isDone }
            if a.isDone { return (a.doneAt ?? a.createdAt) < (b.doneAt ?? b.createdAt) }
            return a.createdAt < b.createdAt
        }
    }

    var pendingCount: Int { (items ?? []).filter { !$0.isDone }.count }
}

@Model
final class NoteItem {
    var text: String = ""
    var isDone: Bool = false
    var createdAt: Date = Date()
    var doneAt: Date?
    var list: NoteList?

    /// A lista é ligada depois do `insert` (mais seguro no SwiftData).
    init(text: String = "") {
        self.text = text
    }
}
