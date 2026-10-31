import SwiftUI

/// Campo de valor em dinheiro: edita texto, guarda centavos.
struct MoneyField: View {
    let title: String
    @Binding var cents: Int
    @State private var text = ""

    init(_ title: String, cents: Binding<Int>) {
        self.title = title
        self._cents = cents
    }

    var body: some View {
        TextField(title, text: $text)
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.trailing)
            .onAppear { if text.isEmpty && cents != 0 { text = Money.plain(cents) } }
            .onChange(of: text) { _, new in cents = Money.parseCents(new) ?? 0 }
    }
}

/// Linha "rótulo ........ valor".
struct ValueRow: View {
    let title: String
    let value: String
    var tint: Color = .primary

    var body: some View {
        LabeledContent {
            Text(value).foregroundStyle(tint).monospacedDigit()
                .lineLimit(1).minimumScaleFactor(0.8)
        } label: {
            Text(title).lineLimit(2)
        }
        .font(.subheadline)
    }
}

/// Barra fina de progresso; vermelha quando passa do limite.
struct BudgetBar: View {
    let progress: Double
    var isOver = false

    var body: some View {
        SoftBar(progress: progress, isOver: isOver)
    }
}

enum Fmt {
    static func day(_ d: Date) -> String {
        d.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(Money.locale))
    }

    static func short(_ d: Date) -> String {
        d.formatted(.dateTime.day().month(.abbreviated).locale(Money.locale))
    }

    static func full(_ d: Date) -> String {
        d.formatted(.dateTime.day().month(.abbreviated).year().locale(Money.locale))
    }

    /// Período exibido com o último dia inclusive.
    static func period(_ p: PayPeriod) -> String {
        let last = Calendar.current.date(byAdding: .day, value: -1, to: p.end) ?? p.end
        return "\(short(p.start)) – \(short(last))"
    }
}

extension Binding where Value == Int {
    /// Minutos desde a meia-noite ↔ Date de hoje, para DatePicker de hora.
    func asTime() -> Binding<Date> {
        Binding<Date>(
            get: {
                Calendar.current.date(byAdding: .minute, value: wrappedValue, to: Calendar.current.startOfDay(for: Date())) ?? Date()
            },
            set: {
                let c = Calendar.current.dateComponents([.hour, .minute], from: $0)
                wrappedValue = (c.hour ?? 0) * 60 + (c.minute ?? 0)
            }
        )
    }
}

/// Seletor de dias da semana (segunda a domingo) sobre uma máscara de bits.
struct WeekdayPicker: View {
    @Binding var mask: Int

    var body: some View {
        HStack(spacing: 6) {
            ForEach(1...7, id: \.self) { d in
                let bit = 1 << (d - 1)
                let on = mask & bit != 0
                Button {
                    mask ^= bit
                } label: {
                    Text(String(Weekday.short[d - 1].prefix(1)))
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 34)
                        .background(on ? Color.accentColor : Color(.tertiarySystemFill), in: Circle())
                        .foregroundStyle(on ? Color.white : Color.primary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Weekday.name(d))
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(.vertical, 4)
    }
}
