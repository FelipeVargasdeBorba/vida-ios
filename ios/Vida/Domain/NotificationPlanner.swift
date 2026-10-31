import Foundation

enum AgendaKind: String, CaseIterable, Identifiable, Codable {
    case obligation, reminder

    var id: String { rawValue }
    var title: String { self == .obligation ? "Obrigação" : "Lembrete" }
    var symbol: String { self == .obligation ? "checklist" : "bell" }
}

/// Cópia em valor de um item da agenda: regras de ocorrência testáveis sem SwiftData.
struct AgendaRule: Hashable {
    var uid: String
    var title: String
    var kind: AgendaKind
    var startMinutes: Int
    var endMinutes: Int
    /// Bit 0 = segunda … bit 6 = domingo.
    var weekdaysMask: Int
    var isOneTime: Bool
    var oneTimeDate: Date
    var hasDateRange: Bool
    var rangeStart: Date
    var rangeEnd: Date
    var notify: Bool
    var notifyMinutesBefore: Int

    func occurs(on date: Date, calendar: Calendar) -> Bool {
        if isOneTime {
            return calendar.isDate(date, inSameDayAs: oneTimeDate)
        }
        let bit = 1 << (Weekday.iso(date, calendar) - 1)
        guard weekdaysMask & bit != 0 else { return false }
        if hasDateRange {
            let day = calendar.startOfDay(for: date)
            guard day >= calendar.startOfDay(for: rangeStart), day <= calendar.startOfDay(for: rangeEnd) else { return false }
        }
        return true
    }
}

struct PlannedNotification: Hashable {
    var id: String
    var date: Date
    var title: String
    var body: String
    /// O que abrir ao tocar (`paydayAction`, `billAction`) ou nil.
    var action: String?

    var isPayday: Bool { action == NotificationPlanner.paydayAction }
}

/// Conta fixa com lembrete: avisa no dia do vencimento, a menos que já tenha sido paga.
struct BillReminder: Hashable {
    var title: String
    var body: String
    /// 1…31, ajustado ao último dia do mês.
    var dueDay: Int
    /// Datas de vencimento (início do dia) já marcadas como pagas.
    var paid: Set<Date>
}

enum NotificationPlanner {
    static let windowDays = 14
    static let maxPending = 60
    static let paydayAction = "payday"
    static let billAction = "bill"

    /// Janela deslizante: próximos `days` dias, só datas futuras, no máximo `limit`.
    /// Pagamento do salário e contas a pagar têm prioridade; contas avisam na hora do lembrete do salário.
    static func plan(rules: [AgendaRule], payday: PaySchedule?, bills: [BillReminder] = [], paydayMinutes: Int,
                     now: Date, calendar: Calendar,
                     days: Int = windowDays, limit: Int = maxPending) -> [PlannedNotification] {
        let today = calendar.startOfDay(for: now)
        var priority: [PlannedNotification] = []
        var items: [PlannedNotification] = []
        let active = rules.filter(\.notify)

        for offset in 0..<days {
            let day = PayPeriodCalculator.addDays(offset, to: today, calendar)
            let key = dayKey(day, calendar)

            if let schedule = payday,
               PayPeriodCalculator.period(containing: day, schedule: schedule, calendar: calendar).start == day,
               let fire = calendar.date(byAdding: .minute, value: paydayMinutes, to: day), fire > now {
                priority.append(PlannedNotification(id: "payday-\(key)", date: fire, title: "Dia de pagamento",
                                                   body: "Seu salário caiu? Confirme", action: paydayAction))
            }
            for (i, bill) in bills.enumerated()
            where BillCalculator.isDue(dueDay: bill.dueDay, on: day, calendar: calendar) && !bill.paid.contains(day) {
                guard let fire = calendar.date(byAdding: .minute, value: paydayMinutes, to: day), fire > now else { continue }
                priority.append(PlannedNotification(id: "bill-\(i)-\(key)", date: fire, title: "Pagar \(bill.title)",
                                                   body: bill.body, action: billAction))
            }
            for rule in active where rule.occurs(on: day, calendar: calendar) {
                guard let fire = calendar.date(byAdding: .minute, value: rule.startMinutes - rule.notifyMinutesBefore, to: day),
                      fire > now else { continue }
                items.append(PlannedNotification(id: "agenda-\(rule.uid)-\(key)", date: fire, title: rule.title,
                                                 body: body(for: rule), action: nil))
            }
        }

        let kept = Array(priority.prefix(limit))
        let rest = items.sorted { $0.date < $1.date }.prefix(max(0, limit - kept.count))
        return (kept + rest).sorted { $0.date < $1.date }
    }

    static func timeText(_ minutes: Int) -> String {
        let m = ((minutes % 1440) + 1440) % 1440
        let h = m / 60, mm = m % 60
        return "\(h < 10 ? "0" : "")\(h):\(mm < 10 ? "0" : "")\(mm)"
    }

    private static func body(for rule: AgendaRule) -> String {
        switch rule.kind {
        case .obligation: "\(timeText(rule.startMinutes))–\(timeText(rule.endMinutes))"
        case .reminder: rule.notifyMinutesBefore > 0 ? "Às \(timeText(rule.startMinutes))" : "Lembrete"
        }
    }

    private static func dayKey(_ day: Date, _ calendar: Calendar) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: day)
        return String(format: "%04d%02d%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}
