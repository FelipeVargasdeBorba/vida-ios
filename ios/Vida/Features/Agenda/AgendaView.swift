import SwiftData
import SwiftUI

struct AgendaView: View {
    @Environment(AppRouter.self) private var router
    @Query(sort: \AgendaItem.startMinutes) private var items: [AgendaItem]
    @Query(sort: \WorkDay.weekday) private var workDays: [WorkDay]
    @State private var selected = Calendar.current.startOfDay(for: Date())
    @State private var editing: AgendaDraft?

    private let calendar = Calendar.current

    private var weekStart: Date {
        PayPeriodCalculator.addDays(-(Weekday.iso(selected, calendar) - 1), to: selected, calendar)
    }

    var body: some View {
        let dayItems = items.filter { $0.occurs(on: selected, calendar: calendar) }
        let shift = workDays.first { $0.weekday == Weekday.iso(selected, calendar) && $0.isOn }
        NavigationStack {
            List {
                Section {
                    WeekStrip(weekStart: weekStart, selected: $selected, today: calendar.startOfDay(for: router.today))
                        .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
                }
                Section(Fmt.day(selected)) {
                    if let shift {
                        Label("Shift \(NotificationPlanner.timeText(shift.startMinutes))–\(NotificationPlanner.timeText(shift.endMinutes))",
                              systemImage: "briefcase.fill")
                            .foregroundStyle(.tint)
                    }
                    if dayItems.isEmpty && shift == nil {
                        Text("Nothing on this day").foregroundStyle(.secondary)
                    }
                    ForEach(dayItems) { item in
                        Button { editing = AgendaDraft(item: item, kind: item.kind) } label: { AgendaRow(item: item) }
                    }
                }
                Section {
                    NavigationLink { AllAgendaItemsView() } label: { Label("All items", systemImage: "list.bullet") }
                    NavigationLink { WorkScheduleView() } label: { Label("Dias de trabalho", systemImage: "briefcase") }
                }
            }
            .vidaList()
            .navigationTitle("Agenda")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Today") { selected = calendar.startOfDay(for: Date()) }
                }
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button { editing = AgendaDraft(kind: .obligation, day: selected) } label: {
                            Label("Commitment", systemImage: AgendaKind.obligation.symbol)
                        }
                        Button { editing = AgendaDraft(kind: .reminder, day: selected) } label: {
                            Label("Reminder", systemImage: AgendaKind.reminder.symbol)
                        }
                    } label: { Image(systemName: "plus.circle.fill") }
                    .accessibilityLabel("New item")
                }
            }
            .sheet(item: $editing) { AgendaItemForm(draft: $0) }
        }
    }
}

struct AgendaRow: View {
    let item: AgendaItem

    var body: some View {
        HStack(spacing: 12) {
            Text(NotificationPlanner.timeText(item.startMinutes))
                .font(.subheadline.monospacedDigit().weight(.medium))
                .frame(width: 48, alignment: .leading)
                .foregroundStyle(.primary)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title.isEmpty ? item.kind.title : item.title).foregroundStyle(.primary)
                Text(item.kind == .obligation ? "until \(NotificationPlanner.timeText(item.endMinutes))" : item.kind.title)
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if item.notify { Image(systemName: "bell.fill").font(.caption).foregroundStyle(.secondary) }
        }
    }
}

private struct WeekStrip: View {
    let weekStart: Date
    @Binding var selected: Date
    let today: Date
    private let calendar = Calendar.current

    var body: some View {
        HStack(spacing: 4) {
            Button { selected = PayPeriodCalculator.addDays(-7, to: selected, calendar) } label: {
                Image(systemName: "chevron.left").frame(width: 24, height: 44)
            }
            .accessibilityLabel("Previous week")
            ForEach(0..<7, id: \.self) { i in
                let day = PayPeriodCalculator.addDays(i, to: weekStart, calendar)
                let isSel = day == selected
                Button { selected = day } label: {
                    VStack(spacing: 2) {
                        Text(Weekday.short[i]).font(.caption2)
                        Text("\(calendar.component(.day, from: day))").font(.callout.weight(day == today ? .bold : .regular))
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(isSel ? Color.accentColor : .clear, in: RoundedRectangle(cornerRadius: 8))
                    .foregroundStyle(isSel ? Color.white : (day == today ? Color.accentColor : Color.primary))
                }
                .accessibilityLabel(Fmt.day(day))
            }
            Button { selected = PayPeriodCalculator.addDays(7, to: selected, calendar) } label: {
                Image(systemName: "chevron.right").frame(width: 24, height: 44)
            }
            .accessibilityLabel("Next week")
        }
        .buttonStyle(.plain)
    }
}

private struct AllAgendaItemsView: View {
    @Query(sort: \AgendaItem.startMinutes) private var items: [AgendaItem]
    @Environment(\.modelContext) private var context
    @State private var editing: AgendaDraft?

    var body: some View {
        List {
            ForEach(AgendaKind.allCases) { kind in
                let group = items.filter { $0.kind == kind }
                Section(kind == .obligation ? "Commitments" : "Reminders") {
                    if group.isEmpty { Text("None").foregroundStyle(.secondary) }
                    ForEach(group) { item in
                        Button { editing = AgendaDraft(item: item, kind: kind) } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.title.isEmpty ? kind.title : item.title).foregroundStyle(.primary)
                                Text(item.scheduleText).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .swipeActions {
                            Button(role: .destructive) {
                                context.delete(item)
                                try? context.save()
                                NotificationService.refresh(context)
                            } label: { Label("Delete", systemImage: "trash") }
                        }
                    }
                }
            }
        }
        .vidaList()
        .navigationTitle("All items")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $editing) { AgendaItemForm(draft: $0) }
    }
}
