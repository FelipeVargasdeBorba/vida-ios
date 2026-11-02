import XCTest
@testable import Vida

final class AccountSplitTests: XCTestCase {
    private let defaults = Set(AccountSplitCalculator.defaultSpendingCategories)

    private func targets(_ income: Int, _ preset: BudgetPreset = .balanced) -> [BudgetCategory: Int] {
        BudgetCalculator.split(incomeCents: income, percents: preset.percents)
    }

    func testDailyCategoriesStayInSpendingAccount() {
        let s = AccountSplitCalculator.split(targets: targets(200_000), spendingCategories: defaults, goals: [])
        XCTAssertEqual(s.spending.map(\.kind), [.category(.alimentacao), .category(.transporte), .category(.outro)])
        // Alimentação 12 + Transporte 5 + Outro 30 = 47%.
        XCTAssertEqual(s.spendingTotal, 94_000)
        XCTAssertEqual(s.saves.map(\.kind), [.category(.casa), .category(.fixos), .reserve])
        XCTAssertEqual(s.savesTotal, 106_000)
    }

    func testSlicesAlwaysAddUpToIncome() {
        for income in [1, 99, 33_333, 123_457, 250_000] {
            for p in BudgetPreset.allCases {
                let s = AccountSplitCalculator.split(targets: targets(income, p), spendingCategories: defaults,
                                                     goals: [("A", income / 7), ("B", income)])
                XCTAssertEqual(s.spendingTotal + s.savesTotal + s.goalsTotal, income, "\(p) \(income)")
                XCTAssertEqual(s.movedOut, income - s.spendingTotal)
            }
        }
    }

    func testGoalsGetTheirOwnAccountsAndTheRestIsReserveInSaves() {
        // Poupança do equilibrado em 2.000,00 = 400,00.
        let s = AccountSplitCalculator.split(targets: targets(200_000), spendingCategories: defaults,
                                             goals: [("Viagem", 25_000), ("Carro", 10_000), ("Sem aporte", 0)])
        XCTAssertEqual(s.goals.map(\.kind), [.goal(0), .goal(1)])
        XCTAssertEqual(s.goals.map(\.amount), [25_000, 10_000])
        XCTAssertEqual(s.goals.map(\.title), ["Viagem", "Carro"])
        XCTAssertTrue(s.goals.allSatisfy { $0.account == .goal })
        XCTAssertFalse(s.saves.contains { if case .goal = $0.kind { true } else { false } })
        XCTAssertEqual(s.saves.last?.kind, .reserve)
        XCTAssertEqual(s.saves.last?.amount, 5_000)
    }

    func testGoalsNeverTakeMoreThanTheSavings() {
        let s = AccountSplitCalculator.split(targets: targets(200_000), spendingCategories: defaults,
                                             goals: [("Grande", 30_000), ("Maior", 30_000)])
        XCTAssertEqual(s.goalsTotal, 40_000)
        XCTAssertEqual(s.goals.last?.kind, .goal(1))
        XCTAssertEqual(s.goals.last?.amount, 10_000)
        XCTAssertFalse(s.saves.contains { $0.kind == .reserve })
    }

    func testBillsAreCategoriesInSaves() {
        let s = AccountSplitCalculator.split(targets: targets(200_000), spendingCategories: defaults, goals: [("Viagem", 10_000)])
        // Casa 28% + Fixos 5%; a meta fica fora de saves.
        XCTAssertEqual(s.savesBills, 66_000)
        XCTAssertEqual(s.savesKept, 30_000)
        XCTAssertEqual(s.savesTotal, 96_000)
        XCTAssertEqual(s.goalsTotal, 10_000)
    }

    func testCategoryMovedToSavesAccount() {
        let s = AccountSplitCalculator.split(targets: targets(200_000), spendingCategories: [.alimentacao, .outro], goals: [])
        XCTAssertFalse(s.spending.contains { $0.kind == .category(.transporte) })
        XCTAssertTrue(s.saves.contains { $0.kind == .category(.transporte) })
    }

    func testZeroTargetsAreLeftOut() {
        let s = AccountSplitCalculator.split(targets: targets(200_000, .extreme50), spendingCategories: defaults, goals: [])
        XCTAssertTrue(s.all.contains { $0.kind == .category(.outro) })
    }

    func testWalletOverview() {
        // O que vai para a meta não passa por saves.
        let s = AccountSplitCalculator.split(targets: targets(200_000), spendingCategories: defaults, goals: [("Faculdade", 15_000)])
        let w = AccountSplitCalculator.wallet(balance: 500_000, split: s)
        XCTAssertEqual(w.incoming, 91_000)
        XCTAssertEqual(w.bills, 66_000)
        XCTAssertEqual(w.afterPeriod, 525_000)
    }
}
