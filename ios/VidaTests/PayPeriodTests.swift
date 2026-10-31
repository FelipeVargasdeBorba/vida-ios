import XCTest
@testable import Vida

final class PayPeriodTests: XCTestCase {
    private func period(_ date: Date, _ s: PaySchedule) -> PayPeriod {
        PayPeriodCalculator.period(containing: date, schedule: s, calendar: utc)
    }

    func testMonthlyRegularDay() {
        let p = period(day(2026, 10, 30), monthly(1))
        XCTAssertEqual(p.start, day(2026, 10, 1))
        XCTAssertEqual(p.end, day(2026, 11, 1))
        XCTAssertTrue(p.contains(day(2026, 10, 31, 23, 59)))
        XCTAssertFalse(p.contains(day(2026, 11, 1)))
    }

    func testPaydayIsFirstDayOfItsPeriod() {
        let p = period(day(2026, 10, 15, 8), monthly(15))
        XCTAssertEqual(p.start, day(2026, 10, 15))
        XCTAssertEqual(p.end, day(2026, 11, 15))
    }

    func testDay31InShortMonths() {
        // Fevereiro não bissexto: cai no dia 28.
        XCTAssertEqual(period(day(2025, 2, 15), monthly(31)), PayPeriod(start: day(2025, 1, 31), end: day(2025, 2, 28)))
        XCTAssertEqual(period(day(2025, 2, 28), monthly(31)), PayPeriod(start: day(2025, 2, 28), end: day(2025, 3, 31)))
        // Abril tem 30 dias.
        XCTAssertEqual(period(day(2026, 4, 30), monthly(31)), PayPeriod(start: day(2026, 4, 30), end: day(2026, 5, 31)))
        XCTAssertEqual(period(day(2026, 4, 29), monthly(31)), PayPeriod(start: day(2026, 3, 31), end: day(2026, 4, 30)))
    }

    func testLeapYear() {
        // 2024 é bissexto: dias 29, 30 e 31 caem em 29/02.
        for d in [29, 30, 31] {
            XCTAssertEqual(PayPeriodCalculator.payday(year: 2024, month: 2, dayOfMonth: d, calendar: utc), day(2024, 2, 29))
            XCTAssertEqual(PayPeriodCalculator.payday(year: 2025, month: 2, dayOfMonth: d, calendar: utc), day(2025, 2, 28))
        }
        XCTAssertEqual(period(day(2024, 2, 29), monthly(30)), PayPeriod(start: day(2024, 2, 29), end: day(2024, 3, 30)))
        XCTAssertEqual(period(day(2024, 2, 28), monthly(29)), PayPeriod(start: day(2024, 1, 29), end: day(2024, 2, 29)))
        XCTAssertEqual(period(day(2025, 3, 1), monthly(29)), PayPeriod(start: day(2025, 2, 28), end: day(2025, 3, 29)))
    }

    func testYearBoundary() {
        XCTAssertEqual(period(day(2026, 1, 10), monthly(15)), PayPeriod(start: day(2025, 12, 15), end: day(2026, 1, 15)))
        XCTAssertEqual(period(day(2026, 12, 20), monthly(15)), PayPeriod(start: day(2026, 12, 15), end: day(2027, 1, 15)))
    }

    func testNextAndPrevious() {
        let p = period(day(2025, 2, 10), monthly(31))
        let next = PayPeriodCalculator.next(p, schedule: monthly(31), calendar: utc)
        let prev = PayPeriodCalculator.previous(p, schedule: monthly(31), calendar: utc)
        XCTAssertEqual(next, PayPeriod(start: day(2025, 2, 28), end: day(2025, 3, 31)))
        XCTAssertEqual(prev, PayPeriod(start: day(2024, 12, 31), end: day(2025, 1, 31)))
    }

    func testWeekly() {
        // 30/10/2026 é sexta-feira (ISO 5).
        XCTAssertEqual(period(day(2026, 10, 30), weekly(5)), PayPeriod(start: day(2026, 10, 30), end: day(2026, 11, 6)))
        XCTAssertEqual(period(day(2026, 11, 5), weekly(5)), PayPeriod(start: day(2026, 10, 30), end: day(2026, 11, 6)))
        // Segunda (ISO 1): 26/10/2026.
        XCTAssertEqual(period(day(2026, 11, 1), weekly(1)), PayPeriod(start: day(2026, 10, 26), end: day(2026, 11, 2)))
        XCTAssertEqual(period(day(2026, 10, 30), weekly(5)).dayCount(utc), 7)
    }

    func testDaysUntilNextPayday() {
        XCTAssertEqual(PayPeriodCalculator.daysUntilNextPayday(from: day(2026, 10, 30, 14), schedule: monthly(1), calendar: utc), 2)
        XCTAssertEqual(PayPeriodCalculator.daysUntilNextPayday(from: day(2026, 11, 1, 9), schedule: monthly(1), calendar: utc), 0)
        XCTAssertEqual(PayPeriodCalculator.daysUntilNextPayday(from: day(2026, 10, 28), schedule: weekly(5), calendar: utc), 2)
        // Dia 31 em fevereiro: de 20/02/2025 até 28/02/2025.
        XCTAssertEqual(PayPeriodCalculator.daysUntilNextPayday(from: day(2025, 2, 20), schedule: monthly(31), calendar: utc), 8)
    }

    func testDaysLeftIncludesToday() {
        let p = period(day(2026, 10, 30), monthly(1))
        XCTAssertEqual(PayPeriodCalculator.daysLeft(in: p, from: day(2026, 10, 30, 18), calendar: utc), 2)
        XCTAssertEqual(PayPeriodCalculator.daysLeft(in: p, from: day(2026, 10, 1), calendar: utc), 31)
    }

    func testIsoWeekday() {
        XCTAssertEqual(Weekday.iso(day(2026, 10, 26), utc), 1)
        XCTAssertEqual(Weekday.iso(day(2026, 11, 1), utc), 7)
    }
}
