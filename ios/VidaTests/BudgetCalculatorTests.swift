import XCTest
@testable import Vida

final class BudgetCalculatorTests: XCTestCase {
    func testAllPresetsSumTo100() {
        for p in BudgetPreset.allCases {
            XCTAssertEqual(p.basePercents.values.reduce(0, +), 100, p.title)
            for outro in [0, 5, 50] {
                XCTAssertEqual(p.percents(outroPoints: outro).values.reduce(0, +), 100, p.title)
            }
        }
    }

    func testOutroComesFromLazerAndIsCapped() {
        let balanced = BudgetPreset.balanced.percents(outroPoints: 5)
        XCTAssertEqual(balanced[.lazer], 25)
        XCTAssertEqual(balanced[.outro], 5)
        let extreme = BudgetPreset.extreme50.percents(outroPoints: 5)
        XCTAssertEqual(extreme[.lazer], 0)
        XCTAssertEqual(extreme[.outro], 4)
    }

    func testPeriodIncomeCountsOnlySalaryEntries() {
        XCTAssertEqual(BudgetCalculator.periodIncome([]), 0)
        XCTAssertEqual(BudgetCalculator.periodIncome([(150_000, true), (20_000, false), (30_000, true)]), 180_000)
        XCTAssertEqual(BudgetCalculator.periodIncome([(50_000, false)]), 0)
    }

    func testMonthlySplitBalanced() {
        let t = BudgetCalculator.split(incomeCents: 200_000, percents: BudgetPreset.balanced.percents(outroPoints: 0))
        XCTAssertEqual(t[.casa], 56_000)
        XCTAssertEqual(t[.alimentacao], 24_000)
        XCTAssertEqual(t[.fixos], 10_000)
        XCTAssertEqual(t[.transporte], 10_000)
        XCTAssertEqual(t[.lazer], 60_000)
        XCTAssertEqual(t[.outro], 0)
        XCTAssertEqual(t[.poupanca], 40_000)
    }

    func testSplitSumIsExactWithOddCents() {
        for income in [100_001, 33_333, 1, 99, 123_457] {
            for p in BudgetPreset.allCases {
                let t = BudgetCalculator.split(incomeCents: income, percents: p.percents(outroPoints: 5))
                XCTAssertEqual(t.values.reduce(0, +), income, "\(p) \(income)")
            }
        }
    }

    func testWeeklyConversionOfMonthlyFixed() {
        XCTAssertEqual(BudgetCalculator.perPeriod(monthlyCents: 100_000, frequency: .monthly), 100_000)
        XCTAssertEqual(BudgetCalculator.perPeriod(monthlyCents: 100_000, frequency: .weekly), 23_077) // 1000 × 12/52 = 230,77
        XCTAssertEqual(BudgetCalculator.perPeriod(monthlyCents: 80_000, frequency: .weekly), 18_462) // 800 × 12/52 = 184,62
        XCTAssertEqual(BudgetCalculator.perPeriod(monthlyCents: 5_200, frequency: .weekly), 1_200)
    }

    func testSummaryMonthlyVsWeekly() {
        let percents = BudgetPreset.balanced.percents(outroPoints: 0)
        let monthlyRent = 80_000

        let m = BudgetCalculator.summary(incomeCents: 200_000, percents: percents,
                                         fixedByCategory: [.casa: BudgetCalculator.perPeriod(monthlyCents: monthlyRent, frequency: .monthly)],
                                         spentByCategory: [.alimentacao: 5_000])
        XCTAssertEqual(m.savings, 40_000)
        XCTAssertEqual(m.totalFixed, 80_000)
        XCTAssertEqual(m.free, 80_000)
        XCTAssertEqual(m.line(.casa)?.isOver, true) // aluguel 800 > alvo 560
        XCTAssertEqual(m.line(.casa)?.fixedOver, true)
        XCTAssertEqual(m.line(.alimentacao)?.remaining, 19_000)

        let w = BudgetCalculator.summary(incomeCents: 50_000, percents: percents,
                                         fixedByCategory: [.casa: BudgetCalculator.perPeriod(monthlyCents: monthlyRent, frequency: .weekly)],
                                         spentByCategory: [:])
        XCTAssertEqual(w.savings, 10_000)
        XCTAssertEqual(w.line(.casa)?.target, 14_000)
        XCTAssertEqual(w.totalFixed, 18_462)
        XCTAssertEqual(w.free, 50_000 - 18_462 - 10_000)
    }

    func testEffectiveUsesFixedUntilSpent() {
        let line = BudgetLine(category: .casa, target: 60_000, fixed: 50_000, spent: 0)
        XCTAssertEqual(line.effective, 50_000)
        XCTAssertFalse(line.isOver)
        let paid = BudgetLine(category: .casa, target: 60_000, fixed: 50_000, spent: 65_000)
        XCTAssertEqual(paid.effective, 65_000)
        XCTAssertTrue(paid.isOver)
    }

    func testMoneyParsing() {
        XCTAssertEqual(Money.parseCents("12,50"), 1250)
        XCTAssertEqual(Money.parseCents("12.5"), 1250)
        XCTAssertEqual(Money.parseCents("1.234,56"), 123_456)
        XCTAssertEqual(Money.parseCents("1,234.56"), 123_456)
        XCTAssertEqual(Money.parseCents("5000"), 500_000)
        XCTAssertEqual(Money.parseCents("1.000"), 100_000)
        XCTAssertNil(Money.parseCents(""))
    }
}
