import Foundation
@testable import Vida

/// Calendário fixo (gregoriano, UTC) para os testes não dependerem do aparelho.
let utc: Calendar = {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(identifier: "UTC")!
    return c
}()

func day(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0, _ min: Int = 0) -> Date {
    utc.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: min))!
}

func monthly(_ dayOfMonth: Int) -> PaySchedule { PaySchedule(frequency: .monthly, dayOfMonth: dayOfMonth, weekday: 5) }
func weekly(_ weekday: Int) -> PaySchedule { PaySchedule(frequency: .weekly, dayOfMonth: 1, weekday: weekday) }
