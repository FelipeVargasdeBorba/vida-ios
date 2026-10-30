import Foundation
import SwiftData

@Model
final class WorkDay {
    /// ISO: 1 = segunda … 7 = domingo.
    var weekday: Int = 1
    var isOn: Bool = false
    var startMinutes: Int = 540
    var endMinutes: Int = 1080

    init(weekday: Int = 1, isOn: Bool = false, startMinutes: Int = 540, endMinutes: Int = 1080) {
        self.weekday = weekday
        self.isOn = isOn
        self.startMinutes = startMinutes
        self.endMinutes = endMinutes
    }
}

@Model
final class AgendaItem {
    /// Identificador estável para as notificações.
    var uid: String = UUID().uuidString
    var title: String = ""
    var kindRaw: String = AgendaKind.obligation.rawValue
    var startMinutes: Int = 540
    var endMinutes: Int = 600
    /// Bit 0 = segunda … bit 6 = domingo.
    var weekdaysMask: Int = 0
    var isOneTime: Bool = false
    var oneTimeDate: Date = Date()
    var hasDateRange: Bool = false
    var rangeStart: Date = Date()
    var rangeEnd: Date = Date()
    var notify: Bool = false
    var notifyMinutesBefore: Int = 0
    var createdAt: Date = Date()

    init(kind: AgendaKind = .obligation, title: String = "") {
        self.kindRaw = kind.rawValue
        self.title = title
        self.notify = kind == .reminder
    }

    var kind: AgendaKind {
        get { AgendaKind(rawValue: kindRaw) ?? .obligation }
        set { kindRaw = newValue.rawValue }
    }

    var rule: AgendaRule {
        AgendaRule(uid: uid, title: title, kind: kind, startMinutes: startMinutes, endMinutes: endMinutes,
                   weekdaysMask: weekdaysMask, isOneTime: kind == .reminder && isOneTime, oneTimeDate: oneTimeDate,
                   hasDateRange: hasDateRange, rangeStart: rangeStart, rangeEnd: rangeEnd,
                   notify: notify, notifyMinutesBefore: notifyMinutesBefore)
    }

    func occurs(on date: Date, calendar: Calendar = .current) -> Bool {
        rule.occurs(on: date, calendar: calendar)
    }

    var scheduleText: String {
        let time = kind == .obligation
            ? "\(NotificationPlanner.timeText(startMinutes))–\(NotificationPlanner.timeText(endMinutes))"
            : NotificationPlanner.timeText(startMinutes)
        if kind == .reminder && isOneTime {
            return "\(oneTimeDate.formatted(.dateTime.day().month(.abbreviated).year().locale(Money.locale))) · \(time)"
        }
        let days = (1...7).filter { weekdaysMask & (1 << ($0 - 1)) != 0 }
        let daysText = days.count == 7 ? "Todos os dias" : (days.isEmpty ? "Nenhum dia" : days.map { Weekday.short[$0 - 1] }.joined(separator: ", "))
        return "\(daysText) · \(time)"
    }
}
