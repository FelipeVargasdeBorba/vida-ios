import SwiftData
import SwiftUI

struct AgendaDraft: Identifiable {
    let id = UUID()
    var item: AgendaItem?
    var kind: AgendaKind
    var day = Date()
}

struct AgendaItemForm: View {
    let draft: AgendaDraft
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var start = 540
    @State private var end = 600
    @State private var mask = 0
    @State private var isOneTime = false
    @State private var oneTimeDate = Date()
    @State private var hasRange = false
    @State private var rangeStart = Date()
    @State private var rangeEnd = Date()
    @State private var notify = false
    @State private var before = 0
    @State private var loaded = false

    private var kind: AgendaKind { draft.kind }
    private static let beforeOptions = [0, 5, 10, 15, 30, 60]

    private var isValid: Bool {
        guard !title.trimmingCharacters(in: .whitespaces).isEmpty else { return false }
        if kind == .obligation && end <= start { return false }
        if hasRange && rangeEnd < rangeStart { return false }
        return (kind == .reminder && isOneTime) || mask != 0
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Título", text: $title)

                Section("Quando") {
                    if kind == .reminder {
                        Picker("Repetição", selection: $isOneTime) {
                            Text("Dias da semana").tag(false)
                            Text("Uma vez").tag(true)
                        }
                        .pickerStyle(.segmented)
                    }
                    if kind == .reminder && isOneTime {
                        DatePicker("Data", selection: $oneTimeDate, displayedComponents: .date)
                    } else {
                        WeekdayPicker(mask: $mask)
                        HStack {
                            Button("Seg–Sex") { mask = 0b0011111 }
                            Spacer()
                            Button("Todos") { mask = 0b1111111 }
                        }
                        .buttonStyle(.borderless).font(.caption)
                    }
                    DatePicker(kind == .obligation ? "Início" : "Hora", selection: $start.asTime(), displayedComponents: .hourAndMinute)
                    if kind == .obligation {
                        DatePicker("Fim", selection: $end.asTime(), displayedComponents: .hourAndMinute)
                    }
                }

                if !(kind == .reminder && isOneTime) {
                    Section {
                        Toggle("Período limitado", isOn: $hasRange)
                        if hasRange {
                            DatePicker("De", selection: $rangeStart, displayedComponents: .date)
                            DatePicker("Até", selection: $rangeEnd, in: rangeStart..., displayedComponents: .date)
                        }
                    }
                }

                Section {
                    Toggle("Avisar", isOn: $notify)
                    if notify {
                        Picker("Antecedência", selection: $before) {
                            ForEach(Self.beforeOptions, id: \.self) { Text($0 == 0 ? "Na hora" : "\($0) min antes").tag($0) }
                        }
                    }
                } footer: {
                    if notify { Text("Avisos dos próximos 14 dias ficam agendados no aparelho e são renovados ao abrir o app.") }
                }

                if let item = draft.item {
                    Section {
                        Button("Apagar", role: .destructive) {
                            context.delete(item)
                            finish()
                        }
                    }
                }
            }
            .vidaList()
            .navigationTitle(draft.item == nil ? "Novo: \(kind.title.lowercased())" : "Editar \(kind.title.lowercased())")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Salvar", action: save).disabled(!isValid) }
            }
            .onAppear(perform: load)
        }
    }

    private func load() {
        guard !loaded else { return }
        loaded = true
        if let i = draft.item {
            title = i.title
            start = i.startMinutes
            end = i.endMinutes
            mask = i.weekdaysMask
            isOneTime = i.isOneTime
            oneTimeDate = i.oneTimeDate
            hasRange = i.hasDateRange
            rangeStart = i.rangeStart
            rangeEnd = i.rangeEnd
            notify = i.notify
            before = i.notifyMinutesBefore
        } else {
            let cal = Calendar.current
            mask = 1 << (Weekday.iso(draft.day, cal) - 1)
            oneTimeDate = draft.day
            rangeStart = draft.day
            rangeEnd = cal.date(byAdding: .month, value: 1, to: draft.day) ?? draft.day
            notify = kind == .reminder
        }
    }

    private func save() {
        let i = draft.item ?? AgendaItem(kind: kind)
        i.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        i.kind = kind
        i.startMinutes = start
        i.endMinutes = kind == .obligation ? end : start
        i.weekdaysMask = mask
        i.isOneTime = kind == .reminder && isOneTime
        i.oneTimeDate = oneTimeDate
        i.hasDateRange = hasRange
        i.rangeStart = rangeStart
        i.rangeEnd = rangeEnd
        i.notify = notify
        i.notifyMinutesBefore = notify ? before : 0
        if draft.item == nil { context.insert(i) }
        finish()
    }

    private func finish() {
        try? context.save()
        NotificationService.refresh(context)
        dismiss()
    }
}

struct WorkScheduleView: View {
    @Query(sort: \WorkDay.weekday) private var days: [WorkDay]
    @Environment(\.modelContext) private var context

    var body: some View {
        Form {
            ForEach(days) { WorkDayRow(day: $0) }
        }
        .vidaList()
        .navigationTitle("Dias de trabalho")
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { try? context.save() }
    }
}

private struct WorkDayRow: View {
    @Bindable var day: WorkDay

    var body: some View {
        Section {
            Toggle(Weekday.name(day.weekday), isOn: $day.isOn)
            if day.isOn {
                DatePicker("Início", selection: $day.startMinutes.asTime(), displayedComponents: .hourAndMinute)
                DatePicker("Fim", selection: $day.endMinutes.asTime(), displayedComponents: .hourAndMinute)
            }
        }
    }
}
