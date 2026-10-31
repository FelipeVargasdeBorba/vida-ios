import Foundation

/// Situação de uma conta fixa no período.
enum BillState: Hashable {
    case paid
    case overdue(days: Int)
    case dueToday
    case upcoming(days: Int)
    /// Conta sem dia de vencimento definido.
    case noDate
}

enum BillCalculator {
    /// Data da conta que vale para o período. O dia é ajustado ao último dia do mês quando ele não existe.
    /// Mensal: a ocorrência dentro do período. Semanal: a do mês em que o período começa.
    /// Sem dia definido (0): início do período (mensal) ou do mês (semanal).
    static func occurrence(dueDay: Int, period: PayPeriod, frequency: PayFrequency, calendar: Calendar) -> Date {
        let c = calendar.dateComponents([.year, .month], from: period.start)
        let (year, month) = (c.year!, c.month!)
        guard dueDay > 0 else {
            return frequency == .monthly ? period.start
                : PayPeriodCalculator.payday(year: year, month: month, dayOfMonth: 1, calendar: calendar)
        }
        let inStartMonth = PayPeriodCalculator.payday(year: year, month: month, dayOfMonth: dueDay, calendar: calendar)
        guard frequency == .monthly, !period.contains(inStartMonth) else { return inStartMonth }
        let firstOfStart = PayPeriodCalculator.payday(year: year, month: month, dayOfMonth: 1, calendar: calendar)
        let n = calendar.dateComponents([.year, .month], from: calendar.date(byAdding: .month, value: 1, to: firstOfStart)!)
        let inNextMonth = PayPeriodCalculator.payday(year: n.year!, month: n.month!, dayOfMonth: dueDay, calendar: calendar)
        return period.contains(inNextMonth) ? inNextMonth : inStartMonth
    }

    /// A conta vence neste dia? (Dia ajustado ao último dia do mês.)
    static func isDue(dueDay: Int, on date: Date, calendar: Calendar) -> Bool {
        guard dueDay > 0 else { return false }
        let c = calendar.dateComponents([.year, .month], from: date)
        return PayPeriodCalculator.payday(year: c.year!, month: c.month!, dayOfMonth: dueDay, calendar: calendar)
            == calendar.startOfDay(for: date)
    }

    static func state(due: Date, hasDueDay: Bool, paid: Bool, today: Date, calendar: Calendar) -> BillState {
        if paid { return .paid }
        guard hasDueDay else { return .noDate }
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: today), to: calendar.startOfDay(for: due)).day ?? 0
        if days < 0 { return .overdue(days: -days) }
        return days == 0 ? .dueToday : .upcoming(days: days)
    }
}
