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
                TextField("Title", text: $title)

                Section("When") {
                    if kind == .reminder {
                        Picker("Repeat", selection: $isOneTime) {
                            Text("Weekdays").tag(false)
                            Text("Once").tag(true)
                        }
                        .pickerStyle(.segmented)
                    }
                    if kind == .reminder && isOneTime {
                        DatePicker("Date", selection: $oneTimeDate, displayedComponents: .date)
                    } else {
                        WeekdayPicker(mask: $mask)
                        HStack {
                            Button("Mon–Fri") { mask = 0b0011111 }
                            Spacer()
                            Button("All") { mask = 0b1111111 }
                        }
                        .buttonStyle(.borderless).font(.caption)
                    }
                    DatePicker(kind == .obligation ? "Start" : "Time", selection: $start.asTime(), displayedComponents: .hourAndMinute)
                    if kind == .obligation {
                        DatePicker("End", selection: $end.asTime(), displayedComponents: .hourAndMinute)
                    }
                }

                if !(kind == .reminder && isOneTime) {
                    Section {
                        Toggle("Limited period", isOn: $hasRange)
                        if hasRange {
                            DatePicker("De", selection: $rangeStart, displayedComponents: .date)
                            DatePicker("Until", selection: $rangeEnd, in: rangeStart..., displayedComponents: .date)
                        }
                    }
                }

                Section {
                    Toggle("Alert", isOn: $notify)
                    if notify {
                        Picker("Lead time", selection: $before) {
                            ForEach(Self.beforeOptions, id: \.self) { Text($0 == 0 ? "At the time" : "\($0) min before").tag($0) }
                        }
                    }
                } footer: {
                    if notify { Text("Alerts for the next 14 days are scheduled on the device and renewed whenever you open the app.") }
                }

                if let item = draft.item {
                    Section {
                        Button("Delete", role: .destructive) {
                            context.delete(item)
                            finish()
                        }
                    }
                }
            }
            .vidaList()
            .navigationTitle(draft.item == nil ? "New \(kind.title.lowercased())" : "Edit \(kind.title.lowercased())")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save", action: save).disabled(!isValid) }
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
        .navigationTitle("Work days")
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
                DatePicker("Start", selection: $day.startMinutes.asTime(), displayedComponents: .hourAndMinute)
                DatePicker("End", selection: $day.endMinutes.asTime(), displayedComponents: .hourAndMinute)
            }
        }
    }
}
