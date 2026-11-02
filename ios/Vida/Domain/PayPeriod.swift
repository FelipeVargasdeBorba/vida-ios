import Foundation

/// Período financeiro: do dia de pagamento (inclusive) até o próximo (exclusive), sempre em início de dia.
struct PayPeriod: Hashable, Codable {
    let start: Date
    let end: Date

    func contains(_ date: Date) -> Bool { date >= start && date < end }

    func dayCount(_ calendar: Calendar) -> Int {
        calendar.dateComponents([.day], from: start, to: end).day ?? 0
    }
}

struct PaySchedule: Hashable {
    var frequency: PayFrequency
    /// 1…31. Se o mês não tiver esse dia, usa o último dia do mês.
    var dayOfMonth: Int
    /// ISO: 1 = segunda … 7 = domingo.
    var weekday: Int
}

enum Weekday {
    static let names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    static let short = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    /// ISO 1…7 (segunda = 1) a partir de uma data.
    static func iso(_ date: Date, _ calendar: Calendar) -> Int {
        let w = calendar.component(.weekday, from: date) // 1 = domingo
        return (w + 5) % 7 + 1
    }

    static func name(_ iso: Int) -> String { names[(max(1, min(7, iso))) - 1] }
}

enum PayPeriodCalculator {
    /// Data do pagamento num mês, já ajustada ao último dia se necessário.
    static func payday(year: Int, month: Int, dayOfMonth: Int, calendar: Calendar) -> Date {
        let first = calendar.date(from: DateComponents(year: year, month: month, day: 1))!
        let daysInMonth = calendar.range(of: .day, in: .month, for: first)?.count ?? 28
        let day = min(max(1, dayOfMonth), daysInMonth)
        return calendar.startOfDay(for: calendar.date(from: DateComponents(year: year, month: month, day: day))!)
    }

    static func period(containing date: Date, schedule: PaySchedule, calendar: Calendar) -> PayPeriod {
        let day = calendar.startOfDay(for: date)
        switch schedule.frequency {
        case .monthly:
            let c = calendar.dateComponents([.year, .month], from: day)
            let thisMonth = payday(year: c.year!, month: c.month!, dayOfMonth: schedule.dayOfMonth, calendar: calendar)
            if day >= thisMonth {
                return PayPeriod(start: thisMonth, end: monthlyPayday(after: thisMonth, offset: 1, schedule, calendar))
            } else {
                return PayPeriod(start: monthlyPayday(after: thisMonth, offset: -1, schedule, calendar), end: thisMonth)
            }
        case .weekly:
            let diff = (Weekday.iso(day, calendar) - schedule.weekday + 7) % 7
            let start = addDays(-diff, to: day, calendar)
            return PayPeriod(start: start, end: addDays(7, to: start, calendar))
        }
    }

    static func next(_ period: PayPeriod, schedule: PaySchedule, calendar: Calendar) -> PayPeriod {
        self.period(containing: period.end, schedule: schedule, calendar: calendar)
    }

    static func previous(_ period: PayPeriod, schedule: PaySchedule, calendar: Calendar) -> PayPeriod {
        self.period(containing: addDays(-1, to: period.start, calendar), schedule: schedule, calendar: calendar)
    }

    /// 0 quando hoje é dia de pagamento.
    static func daysUntilNextPayday(from date: Date, schedule: PaySchedule, calendar: Calendar) -> Int {
        let day = calendar.startOfDay(for: date)
        let p = period(containing: day, schedule: schedule, calendar: calendar)
        if p.start == day { return 0 }
        return calendar.dateComponents([.day], from: day, to: p.end).day ?? 0
    }

    /// Dias restantes no período contando hoje (mínimo 1).
    static func daysLeft(in period: PayPeriod, from date: Date, calendar: Calendar) -> Int {
        let day = calendar.startOfDay(for: date)
        return max(1, calendar.dateComponents([.day], from: day, to: period.end).day ?? 1)
    }

    /// Quantos períodos começam a partir do atual e antes do prazo. Mínimo 1.
    static func periodCount(from current: PayPeriod, through deadline: Date, schedule: PaySchedule, calendar: Calendar) -> Int {
        let last = calendar.startOfDay(for: deadline)
        var p = current
        var count = 0
        while p.start < last && count < 5000 {
            count += 1
            p = next(p, schedule: schedule, calendar: calendar)
        }
        return max(1, count)
    }

    /// Início do n-ésimo período a partir do atual (0 = atual).
    static func periodStart(offset: Int, from current: PayPeriod, schedule: PaySchedule, calendar: Calendar) -> Date {
        var p = current
        for _ in 0..<max(0, offset) { p = next(p, schedule: schedule, calendar: calendar) }
        return p.start
    }

    private static func monthlyPayday(after reference: Date, offset: Int, _ schedule: PaySchedule, _ calendar: Calendar) -> Date {
        let firstOfMonth = calendar.date(from: calendar.dateComponents([.year, .month], from: reference))!
        let shifted = calendar.date(byAdding: .month, value: offset, to: firstOfMonth)!
        let c = calendar.dateComponents([.year, .month], from: shifted)
        return payday(year: c.year!, month: c.month!, dayOfMonth: schedule.dayOfMonth, calendar: calendar)
    }

    static func addDays(_ n: Int, to date: Date, _ calendar: Calendar) -> Date {
        calendar.startOfDay(for: calendar.date(byAdding: .day, value: n, to: date)!)
    }
}
