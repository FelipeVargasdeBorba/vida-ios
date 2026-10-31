import XCTest
@testable import Vida

final class GoalCalculatorTests: XCTestCase {
    private func status(target: Int, deadline: Date, before: Int = 0, inside: Int = 0,
                        today: Date, schedule: PaySchedule) -> GoalStatus {
        let period = PayPeriodCalculator.period(containing: today, schedule: schedule, calendar: utc)
        return GoalCalculator.status(
            GoalInput(name: "Faculdade", targetCents: target, deadline: deadline, savedBeforePeriod: before, savedInPeriod: inside),
            period: period, schedule: schedule, today: today, calendar: utc)
    }

    func testFaculdadeTwelveMonthsMonthly() {
        // Hoje é dia de pagamento; prazo em 12 meses → 12 períodos.
        let s = status(target: 500_000, deadline: day(2027, 10, 1), today: day(2026, 10, 1), schedule: monthly(1))
        XCTAssertEqual(s.periodsRemaining, 12)
        XCTAssertEqual(s.requiredThisPeriod, 41_667) // 5000/12 arredondado para cima
        XCTAssertEqual(s.monthsRemaining, 12)
        XCTAssertEqual(s.remaining, 500_000)
    }

    func testMidPeriodCountsCurrentPeriod() {
        // 30/10: o período atual (01/10) ainda conta; até 30/10/2027 são 13 inícios de período.
        let s = status(target: 500_000, deadline: day(2027, 10, 30), today: day(2026, 10, 30), schedule: monthly(1))
        XCTAssertEqual(s.periodsRemaining, 13)
        XCTAssertEqual(s.requiredThisPeriod, 38_462)
    }

    func testWeeklyRequirement() {
        // Sextas de 30/10 a 18/12 → 8 períodos antes de 25/12.
        let s = status(target: 100_000, deadline: day(2026, 12, 25), today: day(2026, 10, 30), schedule: weekly(5))
        XCTAssertEqual(s.periodsRemaining, 8)
        XCTAssertEqual(s.requiredThisPeriod, 12_500)
    }

    func testRequirementStableWithinPeriod() {
        let base = status(target: 120_000, deadline: day(2027, 10, 1), before: 0, inside: 0, today: day(2026, 10, 5), schedule: monthly(1))
        let afterContribution = status(target: 120_000, deadline: day(2027, 10, 1), before: 0, inside: 4_000, today: day(2026, 10, 5), schedule: monthly(1))
        XCTAssertEqual(base.requiredThisPeriod, 10_000)
        XCTAssertEqual(afterContribution.requiredThisPeriod, 10_000)
        XCTAssertEqual(afterContribution.remainingThisPeriod, 6_000)
        XCTAssertEqual(afterContribution.saved, 4_000)
    }

    func testPastContributionsLowerRequirement() {
        let s = status(target: 120_000, deadline: day(2027, 10, 1), before: 60_000, today: day(2026, 10, 5), schedule: monthly(1))
        XCTAssertEqual(s.requiredThisPeriod, 5_000)
    }

    func testOverdueAndComplete() {
        let overdue = status(target: 100_000, deadline: day(2026, 9, 1), before: 20_000, today: day(2026, 10, 5), schedule: monthly(1))
        XCTAssertTrue(overdue.isOverdue)
        XCTAssertEqual(overdue.periodsRemaining, 1)
        XCTAssertEqual(overdue.requiredThisPeriod, 80_000)

        let done = status(target: 100_000, deadline: day(2027, 9, 1), before: 100_000, today: day(2026, 10, 5), schedule: monthly(1))
        XCTAssertTrue(done.isComplete)
        XCTAssertEqual(done.requiredThisPeriod, 0)
    }

    func testAllocateByPriority() {
        XCTAssertEqual(GoalCalculator.allocate(400, requirements: [300, 200]), [300, 100])
        XCTAssertEqual(GoalCalculator.allocate(1_000, requirements: [300, 200]), [300, 200])
        XCTAssertEqual(GoalCalculator.allocate(0, requirements: [300]), [0])
    }

    func testSavingsCheckSuggestsLightestSufficientPreset() {
        let ok = GoalCalculator.check(incomeCents: 200_000, preset: .balanced, outroPoints: 5, required: 40_000)
        XCTAssertTrue(ok.isEnough)
        XCTAssertNil(ok.suggestion)

        let short = GoalCalculator.check(incomeCents: 200_000, preset: .balanced, outroPoints: 5, required: 50_000)
        XCTAssertFalse(short.isEnough)
        XCTAssertEqual(short.shortfall, 10_000)
        XCTAssertEqual(short.suggestion, .saver30)

        let impossible = GoalCalculator.check(incomeCents: 200_000, preset: .balanced, outroPoints: 5, required: 120_000)
        XCTAssertNil(impossible.suggestion)
    }

    func testExtendedDeadline() {
        let p = PayPeriodCalculator.period(containing: day(2026, 10, 1), schedule: monthly(1), calendar: utc)
        // 1200 em 12 períodos = 100; reduzir 20 → 80 por período → 15 períodos → prazo 01/01/2028.
        let d = GoalCalculator.extendedDeadline(remainingAtStart: 120_000, required: 10_000, reduceBy: 2_000,
                                                period: p, schedule: monthly(1), calendar: utc)
        XCTAssertEqual(d, day(2028, 1, 1))
        XCTAssertEqual(PayPeriodCalculator.periodCount(from: p, through: d!, schedule: monthly(1), calendar: utc), 15)
        XCTAssertNil(GoalCalculator.extendedDeadline(remainingAtStart: 120_000, required: 10_000, reduceBy: 10_000,
                                                     period: p, schedule: monthly(1), calendar: utc))
    }
}
