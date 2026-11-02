import SwiftData
import SwiftUI

struct NoteListsView: View {
    @Query(sort: [SortDescriptor(\NoteList.sortOrder), SortDescriptor(\NoteList.createdAt)]) private var lists: [NoteList]
    @Environment(\.modelContext) private var context
    @State private var creating = false
    @State private var newName = ""

    var body: some View {
        NavigationStack {
            List {
                ForEach(lists) { list in
                    NavigationLink { NoteListView(list: list) } label: {
                        HStack {
                            Text(list.name)
                            Spacer()
                            let n = list.pendingCount
                            if n > 0 { Text("\(n)").foregroundStyle(.secondary).monospacedDigit() }
                        }
                    }
                }
                .onDelete { idx in
                    for i in idx { context.delete(lists[i]) }
                    try? context.save()
                }
            }
            .vidaList()
            .navigationTitle("Notes")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { newName = ""; creating = true } label: { Image(systemName: "plus.circle.fill") }
                        .accessibilityLabel("New list")
                }
            }
            .alert("New list", isPresented: $creating) {
                TextField("Name", text: $newName)
                Button("Cancel", role: .cancel) {}
                Button("Create") {
                    let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !name.isEmpty else { return }
                    context.insert(NoteList(name: name, sortOrder: (lists.map(\.sortOrder).max() ?? 0) + 1))
                    try? context.save()
                }
            }
        }
    }
}

struct NoteListView: View {
    let list: NoteList
    @Environment(\.modelContext) private var context
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        let items = list.sortedItems
        List {
            Section {
                TextField("Add item", text: $text)
                    .focused($focused)
                    .submitLabel(.done)
                    .onSubmit(add)
            }
            Section {
                ForEach(items) { item in
                    Button { toggle(item) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: item.isDone ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(item.isDone ? Color.secondary : Color.accentColor)
                                .font(.title3)
                            Text(item.text)
                                .strikethrough(item.isDone)
                                .foregroundStyle(item.isDone ? .secondary : .primary)
                        }
                    }
                    .swipeActions {
                        Button(role: .destructive) { context.delete(item); try? context.save() } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
        }
        .vidaList()
        .navigationTitle(list.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Clear completed") {
                    for i in items where i.isDone { context.delete(i) }
                    try? context.save()
                }
                .disabled(!items.contains { $0.isDone })
            }
        }
    }

    private func add() {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        let item = NoteItem(text: t)
        context.insert(item)
        item.list = list
        try? context.save()
        text = ""
        focused = true
    }

    private func toggle(_ item: NoteItem) {
        item.isDone.toggle()
        item.doneAt = item.isDone ? Date() : nil
        try? context.save()
    }
}
