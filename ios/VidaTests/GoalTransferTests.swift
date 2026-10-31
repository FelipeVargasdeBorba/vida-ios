import SwiftData
import XCTest
@testable import Vida

final class GoalTransferTests: XCTestCase {
    private func model(transferred: Int?) throws -> FinanceModel {
        let container = try ModelContainer(for: FinanceSettings.self, FixedExpense.self, Transaction.self, Goal.self,
                                           GoalContribution.self, PeriodCheck.self,
                                           configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        let ctx = ModelContext(container)
        let settings = FinanceSettings()
        settings.payDayOfMonth = 1
        ctx.insert(settings)
        let goal = Goal(name: "Faculdade", targetCents: 120_000, deadline: day(2027, 9, 30), priority: 0)
        ctx.insert(goal)
        var contributions: [GoalContribution] = []
        if let transferred {
            let c = GoalContribution(amountCents: transferred, date: day(2026, 10, 5))
            ctx.insert(c)
            c.goal = goal
            contributions = [c]
        }
        let period = PayPeriodCalculator.period(containing: day(2026, 10, 30), schedule: settings.schedule, calendar: utc)
        let salary = Transaction(kind: .income, amountCents: 200_000, date: day(2026, 10, 1, 9), source: .salary)
        return FinanceModel.make(settings: settings, period: period, today: day(2026, 10, 30), transactions: [salary],
                                 fixed: [], goals: [goal], contributions: contributions, calendar: utc)
    }

    func testPlannedAmountWhenNothingTransferred() throws {
        let row = try model(transferred: nil).goals[0]
        XCTAssertGreaterThan(row.allocation, 0)
        XCTAssertEqual(row.toMove, row.allocation)
        XCTAssertEqual(row.effectiveAllocation, row.allocation)
    }

    func testTransferringMoreThanThePlanIsWhatCounts() throws {
        let plan = try model(transferred: nil).goals[0].allocation
        let m = try model(transferred: plan + 200)
        let row = m.goals[0]
        XCTAssertTrue(row.isDoneThisPeriod)
        XCTAssertEqual(row.toMove, 0)
        XCTAssertEqual(row.transferred, plan + 200)
        XCTAssertEqual(m.split.goals.first?.amount, plan + 200)
        // O que a meta recebe a mais sai da reserva; a soma continua batendo com o salário.
        XCTAssertEqual(m.split.spendingTotal + m.split.savesTotal + m.split.goalsTotal, 200_000)
        XCTAssertLessThan(m.split.savesKept, 40_000 - plan)
    }

    func testTransferringLessLeavesTheDifferenceToMove() throws {
        let plan = try model(transferred: nil).goals[0].allocation
        let row = try model(transferred: plan - 300).goals[0]
        XCTAssertFalse(row.isDoneThisPeriod)
        XCTAssertEqual(row.toMove, 300)
        XCTAssertEqual(row.effectiveAllocation, plan)
    }

    func testNextPeriodRequirementShrinksAfterTransferringMore() throws {
        let a = try model(transferred: nil).goals[0].status
        let b = try model(transferred: 20_000).goals[0].status
        XCTAssertEqual(a.requiredThisPeriod, b.requiredThisPeriod, "fixo durante o período")
        XCTAssertEqual(b.saved, 20_000)
        XCTAssertEqual(b.remaining, 100_000)
    }
}
