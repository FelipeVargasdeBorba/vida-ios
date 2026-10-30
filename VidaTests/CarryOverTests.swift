import XCTest
@testable import Vida

final class CarryOverTests: XCTestCase {
    // Semanas pagas às sextas: 30 out, 6 nov, 13 nov, 20 nov de 2026.
    private let schedule = weekly(5)
    private let percents = BudgetPreset.balanced.percents(outroPoints: 5)
    private let spending = Set(AccountSplitCalculator.defaultSpendingCategories)

    private func week(_ d: Int, _ m: Int = 11) -> PayPeriod {
        PayPeriodCalculator.period(containing: day(2026, m, d), schedule: schedule, calendar: utc)
    }

    private func salary(_ cents: Int, _ m: Int, _ d: Int) -> LedgerEntry { LedgerEntry(date: day(2026, m, d, 9), cents: cents, kind: .salary) }
    private func spend(_ cents: Int, _ c: BudgetCategory, _ m: Int, _ d: Int) -> LedgerEntry {
        LedgerEntry(date: day(2026, m, d, 20), cents: cents, kind: .expense(c))
    }

    private func carry(_ entries: [LedgerEntry], before p: PayPeriod, since: Date = .distantPast,
                       fixed: [BudgetCategory: Int] = [:]) -> Int {
        CarryOverCalculator.carry(entries: entries, before: p, since: since, schedule: schedule, percents: percents,
                                  fixedPerPeriod: fixed, spending: spending, calendar: utc)
    }

    func testLeftoverOfTheWeekGoesToTheNext() {
        // Salário 500,00: conta de gastos 235,00 (47%). Gastou 50,00 → sobram 185,00.
        let entries = [salary(50_000, 10, 30), spend(5_000, .lazer, 11, 1), salary(50_000, 11, 6)]
        XCTAssertEqual(carry(entries, before: week(6)), 18_500)
        let targets = BudgetCalculator.split(incomeCents: 50_000, percents: percents)
        let applied = CarryOverCalculator.apply(18_500, to: targets, spending: spending)
        XCTAssertEqual(applied[.lazer], 12_500 + 18_500)
        XCTAssertEqual(applied[.alimentacao], targets[.alimentacao])
        XCTAssertEqual(applied[.poupanca], targets[.poupanca])
    }

    func testOverspendingIsTakenFromTheNextWeek() {
        // Gastou 300,00 com 235,00 de plano → falta 65,00, descontada do Lazer (125,00 → 60,00).
        let entries = [salary(50_000, 10, 30), spend(30_000, .lazer, 11, 2)]
        XCTAssertEqual(carry(entries, before: week(6)), -6_500)
        let applied = CarryOverCalculator.apply(-6_500, to: BudgetCalculator.split(incomeCents: 50_000, percents: percents),
                                                spending: spending)
        XCTAssertEqual(applied[.lazer], 6_000)
    }

    func testCarryAccumulatesOverWeeks() {
        let entries = [
            salary(50_000, 10, 30), spend(20_000, .alimentacao, 11, 1), // sobra 35,00
            salary(50_000, 11, 6), spend(23_500, .lazer, 11, 7), // usou o plano todo: sobra 0
            salary(50_000, 11, 13), spend(25_000, .outro, 11, 14), // passou 15,00
        ]
        XCTAssertEqual(carry(entries, before: week(6)), 3_500)
        XCTAssertEqual(carry(entries, before: week(13)), 3_500)
        XCTAssertEqual(carry(entries, before: week(20)), 2_000)
    }

    func testOnlySpendingAccountCategoriesCount() {
        // Casa e "Outra entrada" não mexem na conta de gastos.
        let entries = [salary(50_000, 10, 30), spend(40_000, .casa, 11, 1),
                       LedgerEntry(date: day(2026, 11, 2), cents: 99_000, kind: .otherIncome)]
        XCTAssertEqual(carry(entries, before: week(6)), 23_500)
    }

    func testFixedInSpendingAccountCountsAsUsed() {
        // Passe semanal de 20,00 cadastrado como fixo e não lançado: já conta como usado.
        let entries = [salary(50_000, 10, 30)]
        XCTAssertEqual(carry(entries, before: week(6), fixed: [.transporte: 2_000]), 23_500 - 2_000)
    }

    func testNothingBeforeTheFirstSalaryOrTheResetDate() {
        let entries = [spend(10_000, .lazer, 10, 20), salary(50_000, 10, 30)]
        XCTAssertEqual(carry(entries, before: week(30, 10)), 0)
        XCTAssertEqual(carry(entries, before: week(6)), 23_500)
        XCTAssertEqual(carry(entries, before: week(6), since: week(6).start), 0)
    }

    func testDebtNeverMakesATargetNegative() {
        let targets: [BudgetCategory: Int] = [.lazer: 1_000, .outro: 500, .alimentacao: 2_000, .transporte: 300]
        let applied = CarryOverCalculator.apply(-3_000, to: targets, spending: spending)
        XCTAssertEqual(applied[.lazer], 0)
        XCTAssertEqual(applied[.outro], 0)
        XCTAssertEqual(applied[.alimentacao], 500)
        XCTAssertEqual(applied[.transporte], 300)
        XCTAssertEqual(CarryOverCalculator.apply(-99_000, to: targets, spending: spending).values.min(), 0)
    }

    func testLeftoverGoesToFirstCategoryInTheSpendingAccount() {
        let applied = CarryOverCalculator.apply(1_000, to: [:], spending: [.alimentacao, .transporte])
        XCTAssertEqual(applied, [.alimentacao: 1_000])
        XCTAssertEqual(CarryOverCalculator.apply(1_000, to: [:], spending: []), [:])
    }
}
