import XCTest
@testable import Vida

final class BillCalculatorTests: XCTestCase {
    private func period(_ date: Date, _ schedule: PaySchedule) -> PayPeriod {
        PayPeriodCalculator.period(containing: date, schedule: schedule, calendar: utc)
    }

    func testMonthlyOccurrenceFallsInsideThePeriod() {
        // Período de 25 out a 24 nov: dia 5 é em novembro, dia 28 é em outubro.
        let p = period(day(2026, 10, 30), monthly(25))
        XCTAssertEqual(BillCalculator.occurrence(dueDay: 5, period: p, frequency: .monthly, calendar: utc), day(2026, 11, 5))
        XCTAssertEqual(BillCalculator.occurrence(dueDay: 28, period: p, frequency: .monthly, calendar: utc), day(2026, 10, 28))
        XCTAssertEqual(BillCalculator.occurrence(dueDay: 25, period: p, frequency: .monthly, calendar: utc), day(2026, 10, 25))
    }

    func testMonthlyOccurrenceClampsToLastDay() {
        let p = period(day(2027, 2, 10), monthly(1))
        XCTAssertEqual(BillCalculator.occurrence(dueDay: 31, period: p, frequency: .monthly, calendar: utc), day(2027, 2, 28))
    }

    func testNoDueDayUsesPeriodStart() {
        let p = period(day(2026, 10, 30), monthly(25))
        XCTAssertEqual(BillCalculator.occurrence(dueDay: 0, period: p, frequency: .monthly, calendar: utc), day(2026, 10, 25))
    }

    func testWeeklyUsesMonthOfPeriodStart() {
        // 30 out 2026 é sexta; semana paga às sextas.
        let p = period(day(2026, 10, 30), weekly(5))
        XCTAssertEqual(BillCalculator.occurrence(dueDay: 5, period: p, frequency: .weekly, calendar: utc), day(2026, 10, 5))
        XCTAssertEqual(BillCalculator.occurrence(dueDay: 0, period: p, frequency: .weekly, calendar: utc), day(2026, 10, 1))
    }

    func testIsDue() {
        XCTAssertTrue(BillCalculator.isDue(dueDay: 5, on: day(2026, 11, 5, 14), calendar: utc))
        XCTAssertFalse(BillCalculator.isDue(dueDay: 5, on: day(2026, 11, 6), calendar: utc))
        XCTAssertTrue(BillCalculator.isDue(dueDay: 31, on: day(2026, 11, 30), calendar: utc))
        XCTAssertFalse(BillCalculator.isDue(dueDay: 0, on: day(2026, 11, 1), calendar: utc))
    }

    func testState() {
        let due = day(2026, 11, 5)
        XCTAssertEqual(BillCalculator.state(due: due, hasDueDay: true, paid: true, today: day(2026, 11, 9), calendar: utc), .paid)
        XCTAssertEqual(BillCalculator.state(due: due, hasDueDay: true, paid: false, today: day(2026, 11, 7, 20), calendar: utc), .overdue(days: 2))
        XCTAssertEqual(BillCalculator.state(due: due, hasDueDay: true, paid: false, today: day(2026, 11, 5, 23), calendar: utc), .dueToday)
        XCTAssertEqual(BillCalculator.state(due: due, hasDueDay: true, paid: false, today: day(2026, 11, 1), calendar: utc), .upcoming(days: 4))
        XCTAssertEqual(BillCalculator.state(due: due, hasDueDay: false, paid: false, today: day(2026, 11, 1), calendar: utc), .noDate)
    }

    func testBillReminderFiresOnDueDayUnlessPaid() {
        let now = day(2026, 10, 30, 8)
        let rent = BillReminder(title: "Aluguel", body: "€700", dueDay: 5, paid: [])
        let plan = NotificationPlanner.plan(rules: [], payday: nil, bills: [rent], paydayMinutes: 540, now: now, calendar: utc)
        XCTAssertEqual(plan.map(\.date), [day(2026, 11, 5, 9)])
        XCTAssertEqual(plan.first?.title, "Pagar Aluguel")
        XCTAssertEqual(plan.first?.action, NotificationPlanner.billAction)

        let paid = BillReminder(title: "Aluguel", body: "€700", dueDay: 5, paid: [day(2026, 11, 5)])
        XCTAssertTrue(NotificationPlanner.plan(rules: [], payday: nil, bills: [paid], paydayMinutes: 540, now: now, calendar: utc).isEmpty)
    }
}
