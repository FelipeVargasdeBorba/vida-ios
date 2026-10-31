import SwiftData
import SwiftUI

struct SetupView: View {
    @Bindable var settings: FinanceSettings
    @Environment(\.modelContext) private var context

    var body: some View {
        Form {
            Section {
                Picker("Moeda", selection: $settings.currencyCode) {
                    ForEach(Currency.allCases) { Text($0.title).tag($0.rawValue) }
                }
                Picker("Frequência", selection: $settings.frequencyRaw) {
                    ForEach(PayFrequency.allCases) { Text($0.title).tag($0.rawValue) }
                }
                .pickerStyle(.segmented)
            } header: {
                Text("Salário")
            } footer: {
                Text("O valor do plano é o salário que você lança em Nova entrada, com origem Salário.")
            }

            Section {
                if settings.frequency == .monthly {
                    Picker("Dia do pagamento", selection: $settings.payDayOfMonth) {
                        ForEach(1...31, id: \.self) { Text("Dia \($0)").tag($0) }
                    }
                } else {
                    Picker("Dia do pagamento", selection: $settings.payWeekday) {
                        ForEach(1...7, id: \.self) { Text(Weekday.name($0)).tag($0) }
                    }
                }
                Toggle("Lembrete no dia do pagamento", isOn: $settings.paydayReminderOn)
                DatePicker("Hora dos lembretes", selection: $settings.reminderMinutes.asTime(), displayedComponents: .hourAndMinute)
            } header: {
                Text("Pagamento")
            } footer: {
                if settings.frequency == .monthly && settings.payDayOfMonth > 28 {
                    Text("Nos meses sem o dia \(settings.payDayOfMonth), conta o último dia do mês.")
                }
            }

            Section("Modelo de divisão") {
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
                let lazer = settings.preset.basePercents[.lazer] ?? 0
                Stepper("Outro: \(min(settings.outroPoints, lazer))% (sai do Lazer)", value: $settings.outroPoints, in: 0...lazer)
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
                Text("Fica na conta de gastos")
            } footer: {
                Text("O que estiver desligado vai para saves ao receber, junto com a poupança e as metas.")
            }

            Section {
                Toggle("Adaptar plano para bater a meta", isOn: $settings.adaptEnabled)
                if settings.adaptEnabled {
                    LabeledContent("Mínimo de Alimentação") {
                        MoneyField("0", cents: $settings.foodMinimumCents)
                    }
                    NavigationLink("Categorias flexíveis e ordem de corte") { FlexibleOrderView(settings: settings) }
                }
            } header: {
                Text("Adaptação automática")
            } footer: {
                Text("Se você gastar acima do alvo, o app recalcula o resto do período cortando as categorias flexíveis. A poupança exigida pelas metas, Casa e Gastos fixos nunca são cortados.")
            }
        }
        .vidaList()
        .navigationTitle("Configurações")
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
                        Button("Proteger") { settings.flexibleOrder.removeAll { $0 == c } }
                            .buttonStyle(.borderless)
                            .font(.caption)
                    }
                }
                .onMove { settings.flexibleOrder.move(fromOffsets: $0, toOffset: $1) }
            } header: {
                Text("Cortadas nesta ordem")
            } footer: {
                Text("Arraste para mudar a ordem. \"Proteger\" tira a categoria dos cortes.")
            }
            if !locked.isEmpty {
                Section("Protegidas") {
                    ForEach(locked) { c in
                        Button { settings.flexibleOrder.append(c) } label: {
                            Label("Tornar flexível: \(c.title)", systemImage: "plus.circle")
                        }
                    }
                }
            }
            Section("Sempre protegidas") {
                Text("Casa, Gastos fixos e a poupança exigida pelas metas").foregroundStyle(.secondary)
            }
        }
        .environment(\.editMode, .constant(.active))
        .vidaList()
        .navigationTitle("Flexíveis")
        .navigationBarTitleDisplayMode(.inline)
    }
}
