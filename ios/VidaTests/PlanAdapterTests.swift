import XCTest
@testable import Vida

final class PlanAdapterTests: XCTestCase {
    /// Renda 2000, Equilibrado: casa 560, alim 240, fixos 100, transp 100, outro 600, poup 400.
    private func lines(alimSpent: Int = 5_000, transpSpent: Int = 2_000, outroSpent: Int = 0) -> [BudgetLine] {
        [
            BudgetLine(category: .casa, target: 56_000, fixed: 56_000, spent: 0),
            BudgetLine(category: .fixos, target: 10_000, fixed: 8_000, spent: 0),
            BudgetLine(category: .alimentacao, target: 24_000, fixed: 0, spent: alimSpent),
            BudgetLine(category: .transporte, target: 10_000, fixed: 0, spent: transpSpent),
            BudgetLine(category: .outro, target: 60_000, fixed: 0, spent: outroSpent),
        ]
    }

    private func adapt(_ lines: [BudgetLine], planned: Int = 40_000, required: Int = 40_000,
                       order: [BudgetCategory] = BudgetCategory.defaultFlexibleOrder,
                       foodMin: Int = 0, days: Int = 10) -> AdaptationResult {
        PlanAdapter.adapt(AdaptationInput(lines: lines, plannedSavings: planned, goalRequired: required,
                                          flexibleOrder: order, foodMinimum: foodMin, daysLeft: days))
    }

    func testNothingToAdapt() {
        let r = adapt(lines(outroSpent: 10_000))
        XCTAssertFalse(r.isNeeded)
        XCTAssertTrue(r.isFeasible)
        for l in r.lines { XCTAssertEqual(l.adjusted, l.original) }
        XCTAssertEqual(r.adjustedSavings, 40_000)
    }

    func testOutroOverspendCutsTheOthersInOrder() {
        // Outro estourou 100: já gasto, então o corte cai em Transporte (80) e Alimentação (20).
        let r = adapt(lines(outroSpent: 70_000))
        XCTAssertEqual(r.need, 10_000)
        XCTAssertTrue(r.isFeasible)
        XCTAssertEqual(r.line(.outro)?.adjusted, 70_000)
        XCTAssertEqual(r.line(.transporte)?.adjusted, 2_000)
        XCTAssertEqual(r.line(.alimentacao)?.adjusted, 22_000)
        XCTAssertEqual(r.adjustedSavings, 40_000)
    }

    func testCustomOrderIsRespected() {
        let r = adapt(lines(outroSpent: 70_000), order: [.alimentacao, .outro, .transporte])
        XCTAssertEqual(r.line(.alimentacao)?.adjusted, 14_000)
        XCTAssertEqual(r.line(.transporte)?.adjusted, 10_000)
    }

    func testNonFlexibleCategoryIsNotCut() {
        let r = adapt(lines(outroSpent: 70_000), order: [.alimentacao])
        XCTAssertEqual(r.line(.transporte)?.adjusted, 10_000)
        XCTAssertEqual(r.line(.alimentacao)?.adjusted, 14_000)
    }

    func testCasaAndFixosNeverCut() {
        let r = adapt(lines(outroSpent: 200_000), order: [.casa, .fixos, .outro, .transporte, .alimentacao])
        XCTAssertEqual(r.line(.casa)?.adjusted, 56_000)
        XCTAssertEqual(r.line(.fixos)?.adjusted, 10_000)
    }

    func testGoalFloorProtectedAndGapAddedToNeed() {
        // Metas exigem 500, plano reserva 400 → faltam 100 para a poupança, além de nenhum estouro.
        let r = adapt(lines(), planned: 40_000, required: 50_000)
        XCTAssertEqual(r.need, 10_000)
        XCTAssertEqual(r.adjustedSavings, 50_000)
        XCTAssertEqual(r.savingsFloor, 50_000)
        XCTAssertEqual(r.line(.outro)?.adjusted, 50_000)
    }

    func testSavingsAboveFloorIsLastReserve() {
        // Estouro enorme; piso das metas 300 e plano 400: os 100 extras são usados só depois das flexíveis.
        let r = adapt(lines(alimSpent: 24_000, transpSpent: 10_000, outroSpent: 90_000),
                      planned: 40_000, required: 30_000)
        XCTAssertEqual(r.need, 30_000)
        XCTAssertEqual(r.adjustedSavings, 30_000)
        XCTAssertEqual(r.shortfall, 20_000)
        XCTAssertGreaterThanOrEqual(r.adjustedSavings, r.savingsFloor)
    }

    func testFoodMinimum() {
        // Precisa de 300; Transporte dá 80, Alimentação só até o mínimo de 200 (gasto 50) → 40.
        let r = adapt(lines(outroSpent: 90_000), foodMin: 20_000)
        XCTAssertEqual(r.line(.alimentacao)?.adjusted, 20_000)
        XCTAssertEqual(r.shortfall, 30_000 - 8_000 - 4_000)
    }

    func testImpossibleCaseReportsShortfallAndKeepsFloor() {
        let r = adapt(lines(outroSpent: 200_000), planned: 40_000, required: 40_000)
        XCTAssertFalse(r.isFeasible)
        XCTAssertEqual(r.need, 140_000)
        // Disponível: transporte 80 + alimentação 190 = 270.
        XCTAssertEqual(r.shortfall, 140_000 - 27_000)
        XCTAssertEqual(r.adjustedSavings, 40_000)
        XCTAssertEqual(r.dailyAllowance, 0)
    }

    func testDailyAllowance() {
        // Sem estouro: restante flexível = (240−50) + (100−20) + (600−0) = 870 em 10 dias.
        let r = adapt(lines(), days: 10)
        XCTAssertEqual(r.dailyAllowance, 8_700)
    }
}
