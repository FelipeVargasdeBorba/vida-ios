import SwiftData
import XCTest
@testable import Vida

final class AgendaOccurrenceTests: XCTestCase {
    private var container: ModelContainer!

    override func setUpWithError() throws {
        container = try ModelContainer(for: AgendaItem.self, configurations: ModelConfiguration(isStoredInMemoryOnly: true))
    }

    override func tearDown() {
        container = nil
    }

    @MainActor
    private func item(_ kind: AgendaKind = .obligation, mask: Int = 0) -> AgendaItem {
        let i = AgendaItem(kind: kind, title: "Teste")
        container.mainContext.insert(i)
        i.weekdaysMask = mask
        return i
    }

    @MainActor
    func testWeekdayMask() {
        let i = item(mask: 0b0000101) // segunda e quarta
        XCTAssertTrue(i.occurs(on: day(2026, 10, 26), calendar: utc))
        XCTAssertFalse(i.occurs(on: day(2026, 10, 27), calendar: utc))
        XCTAssertTrue(i.occurs(on: day(2026, 10, 28, 23, 30), calendar: utc))
        XCTAssertFalse(i.occurs(on: day(2026, 11, 1), calendar: utc))
    }

    @MainActor
    func testSundayBit() {
        let i = item(mask: 1 << 6)
        XCTAssertTrue(i.occurs(on: day(2026, 11, 1), calendar: utc))
        XCTAssertFalse(i.occurs(on: day(2026, 10, 31), calendar: utc))
    }

    @MainActor
    func testEmptyMaskNeverOccurs() {
        let i = item(mask: 0)
        XCTAssertFalse(i.occurs(on: day(2026, 10, 26), calendar: utc))
    }

    @MainActor
    func testDateRangeInclusive() {
        let i = item(mask: 0b0000101)
        i.hasDateRange = true
        i.rangeStart = day(2026, 10, 28, 15)
        i.rangeEnd = day(2026, 11, 4, 8)
        XCTAssertFalse(i.occurs(on: day(2026, 10, 26), calendar: utc))
        XCTAssertTrue(i.occurs(on: day(2026, 10, 28), calendar: utc))
        XCTAssertTrue(i.occurs(on: day(2026, 11, 2), calendar: utc))
        XCTAssertTrue(i.occurs(on: day(2026, 11, 4, 22), calendar: utc))
        XCTAssertFalse(i.occurs(on: day(2026, 11, 9), calendar: utc))
    }

    @MainActor
    func testOneTimeReminderIgnoresMask() {
        let i = item(.reminder, mask: 0b1111111)
        i.isOneTime = true
        i.oneTimeDate = day(2026, 10, 30, 10)
        XCTAssertTrue(i.occurs(on: day(2026, 10, 30), calendar: utc))
        XCTAssertFalse(i.occurs(on: day(2026, 10, 29), calendar: utc))
        XCTAssertFalse(i.occurs(on: day(2026, 10, 31), calendar: utc))
    }

    @MainActor
    func testObligationIsNeverOneTime() {
        let i = item(.obligation, mask: 1 << 4) // sexta
        i.isOneTime = true
        i.oneTimeDate = day(2026, 10, 27)
        XCTAssertTrue(i.occurs(on: day(2026, 10, 30), calendar: utc))
        XCTAssertFalse(i.occurs(on: day(2026, 10, 27), calendar: utc))
    }
}

final class NotificationPlannerTests: XCTestCase {
    private func rule(_ uid: String, minutes: Int = 480, mask: Int = 0b1111111) -> AgendaRule {
        AgendaRule(uid: uid, title: uid, kind: .reminder, startMinutes: minutes, endMinutes: minutes, weekdaysMask: mask,
                   isOneTime: false, oneTimeDate: .distantPast, hasDateRange: false, rangeStart: .distantPast,
                   rangeEnd: .distantPast, notify: true, notifyMinutesBefore: 0)
    }

    func testWindowIs14DaysAndSkipsPast() {
        let now = day(2026, 10, 30, 10)
        let plan = NotificationPlanner.plan(rules: [rule("a")], payday: nil, paydayMinutes: 540, now: now, calendar: utc)
        XCTAssertEqual(plan.count, 13) // hoje às 8h já passou
        XCTAssertEqual(plan.first?.date, day(2026, 10, 31, 8))
        XCTAssertEqual(plan.last?.date, day(2026, 11, 12, 8))
    }

    func testCapAt60AndPaydayKept() {
        let now = day(2026, 10, 30, 0, 1)
        let rules = (0..<6).map { rule("r\($0)", minutes: 60 * ($0 + 1)) }
        let plan = NotificationPlanner.plan(rules: rules, payday: monthly(1), paydayMinutes: 540, now: now, calendar: utc)
        XCTAssertEqual(plan.count, 60)
        XCTAssertTrue(plan.contains { $0.isPayday && $0.date == day(2026, 11, 1, 9) })
        XCTAssertEqual(plan.map(\.date), plan.map(\.date).sorted())
    }

    func testRespectsDateRangeAndNotifyFlag() {
        var limited = rule("lim")
        limited.hasDateRange = true
        limited.rangeStart = day(2026, 10, 30)
        limited.rangeEnd = day(2026, 11, 2)
        var silent = rule("silent")
        silent.notify = false
        let plan = NotificationPlanner.plan(rules: [limited, silent], payday: nil, paydayMinutes: 540,
                                            now: day(2026, 10, 30, 0), calendar: utc)
        XCTAssertEqual(plan.count, 4) // 30, 31, 1 e 2
        XCTAssertTrue(plan.allSatisfy { $0.id.hasPrefix("agenda-lim-") })
    }

    func testNotifyBeforeShiftsTime() {
        var r = rule("x", minutes: 600)
        r.notifyMinutesBefore = 15
        let plan = NotificationPlanner.plan(rules: [r], payday: nil, paydayMinutes: 540, now: day(2026, 10, 30, 0), calendar: utc, days: 1)
        XCTAssertEqual(plan.first?.date, day(2026, 10, 30, 9, 45))
    }
}
