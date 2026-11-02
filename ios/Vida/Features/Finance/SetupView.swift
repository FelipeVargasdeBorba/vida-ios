import SwiftData
import SwiftUI

struct SetupView: View {
    @Bindable var settings: FinanceSettings
    @Environment(\.modelContext) private var context

    var body: some View {
        Form {
            Section {
                Picker("Currency", selection: $settings.currencyCode) {
                    ForEach(Currency.allCases) { Text($0.title).tag($0.rawValue) }
                }
                Picker("Frequency", selection: $settings.frequencyRaw) {
                    ForEach(PayFrequency.allCases) { Text($0.title).tag($0.rawValue) }
                }
                .pickerStyle(.segmented)
            } header: {
                Text("Salary")
            } footer: {
                Text("The plan amount is the salary you log under New income, with the source set to Salary.")
            }

            Section {
                if settings.frequency == .monthly {
                    Picker("Payday", selection: $settings.payDayOfMonth) {
                        ForEach(1...31, id: \.self) { Text("Day \($0)").tag($0) }
                    }
                } else {
                    Picker("Payday", selection: $settings.payWeekday) {
                        ForEach(1...7, id: \.self) { Text(Weekday.name($0)).tag($0) }
                    }
                }
                Toggle("Reminder on payday", isOn: $settings.paydayReminderOn)
                DatePicker("Reminder time", selection: $settings.reminderMinutes.asTime(), displayedComponents: .hourAndMinute)
            } header: {
                Text("Payday")
            } footer: {
                if settings.frequency == .monthly && settings.payDayOfMonth > 28 {
                    Text("In months without day \(settings.payDayOfMonth), the last day of the month counts.")
                }
            }

            Section("Split model") {
                ForEach(BudgetPreset.allCases) { preset in
                    Button {
                        settings.preset = preset
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(preset.title).foregroundStyle(.primary)
                                Text(preset.summary).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if settings.preset == preset { Image(systemName: "checkmark").foregroundStyle(.tint) }
                        }
                    }
                }
            }

            Section {
                ForEach(BudgetCategory.spending) { c in
                    Toggle(isOn: Binding(
                        get: { settings.spendingAccount.contains(c) },
                        set: { on in
                            var s = settings.spendingAccount
                            if on { s.insert(c) } else { s.remove(c) }
                            settings.spendingAccount = s
                        }
                    )) {
                        Label(c.title, systemImage: c.symbol)
                    }
                }
            } header: {
                Text("Stays in the spending account")
            } footer: {
                Text("Anything switched off goes to saves when you get paid, together with savings and goals.")
            }

            Section {
                Toggle("Adapt plan to hit the goal", isOn: $settings.adaptEnabled)
                if settings.adaptEnabled {
                    LabeledContent("Minimum for Food") {
                        MoneyField("0", cents: $settings.foodMinimumCents)
                    }
                    NavigationLink("Flexible categories and cut order") { FlexibleOrderView(settings: settings) }
                }
            } header: {
                Text("Automatic adaptation")
            } footer: {
                Text("If you spend above target, the app recalculates the rest of the period by cutting flexible categories. The savings required by goals, Home and Fixed expenses are never cut.")
            }
        }
        .vidaList()
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear {
            try? context.save()
            NotificationService.refresh(context)
        }
    }
}

struct FlexibleOrderView: View {
    @Bindable var settings: FinanceSettings

    var body: some View {
        let order = settings.flexibleOrder
        let locked = BudgetCategory.cuttable.filter { !order.contains($0) }
        List {
            Section {
                ForEach(order) { c in
                    HStack {
                        Label(c.title, systemImage: c.symbol)
                        Spacer()
                        Button("Protect") { settings.flexibleOrder.removeAll { $0 == c } }
                            .buttonStyle(.borderless)
                            .font(.caption)
                    }
                }
                .onMove { settings.flexibleOrder.move(fromOffsets: $0, toOffset: $1) }
            } header: {
                Text("Cut in this order")
            } footer: {
                Text("Drag to change the order. \"Protect\" removes the category from cuts.")
            }
            if !locked.isEmpty {
                Section("Protected") {
                    ForEach(locked) { c in
                        Button { settings.flexibleOrder.append(c) } label: {
                            Label("Make flexible: \(c.title)", systemImage: "plus.circle")
                        }
                    }
                }
            }
            Section("Always protected") {
                Text("Home, Fixed expenses and the savings required by goals").foregroundStyle(.secondary)
            }
        }
        .environment(\.editMode, .constant(.active))
        .vidaList()
        .navigationTitle("Flexible")
        .navigationBarTitleDisplayMode(.inline)
    }
}
