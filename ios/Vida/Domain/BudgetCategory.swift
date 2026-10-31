import Foundation

/// Categoria única usada pelo plano, pelos gastos fixos e pelas transações.
enum BudgetCategory: String, CaseIterable, Identifiable, Codable {
    case casa, fixos, alimentacao, transporte, lazer, outro, poupanca

    var id: String { rawValue }

    /// Nome no plano.
    var title: String {
        switch self {
        case .casa: "Casa"
        case .fixos: "Gastos fixos"
        case .alimentacao: "Alimentação"
        case .transporte: "Transporte"
        case .lazer: "Lazer"
        case .outro: "Outro"
        case .poupanca: "Poupança"
        }
    }

    /// Nome no registro de transações.
    var transactionTitle: String {
        switch self {
        case .casa: "Casa/aluguel"
        case .lazer: "Entretenimento"
        default: title
        }
    }

    var symbol: String {
        switch self {
        case .casa: "house"
        case .fixos: "doc.text"
        case .alimentacao: "cart"
        case .transporte: "tram"
        case .lazer: "theatermasks"
        case .outro: "ellipsis.circle"
        case .poupanca: "banknote"
        }
    }

    /// Categorias onde se gasta (tudo menos poupança).
    static let spending: [BudgetCategory] = [.casa, .fixos, .alimentacao, .transporte, .lazer, .outro]

    /// Categorias que podem ser flexíveis (cortáveis) na adaptação.
    static let cuttable: [BudgetCategory] = [.lazer, .outro, .transporte, .alimentacao]

    static let defaultFlexibleOrder: [BudgetCategory] = [.lazer, .outro, .transporte, .alimentacao]

    static func list(from raw: String) -> [BudgetCategory] {
        var seen = Set<BudgetCategory>()
        return raw.split(separator: ",").compactMap { BudgetCategory(rawValue: String($0)) }
            .filter { cuttable.contains($0) && seen.insert($0).inserted }
    }

    static func raw(from list: [BudgetCategory]) -> String {
        list.map(\.rawValue).joined(separator: ",")
    }
}

enum PayFrequency: String, CaseIterable, Identifiable, Codable {
    case monthly, weekly

    var id: String { rawValue }
    var title: String { self == .monthly ? "Mensal" : "Semanal" }
    var periodNoun: String { self == .monthly ? "mês" : "semana" }
}

enum BudgetPreset: String, CaseIterable, Identifiable, Codable {
    case balanced, moreLeisure, saver30, aggressive40, extreme50

    var id: String { rawValue }

    var title: String {
        switch self {
        case .balanced: "Equilibrado 50/30/20"
        case .moreLeisure: "Mais lazer"
        case .saver30: "Poupador 30%"
        case .aggressive40: "Agressivo 40%"
        case .extreme50: "Extremo 50%"
        }
    }

    /// Casa, Alimentação, Fixos, Transporte, Lazer, Poupança. Cada um soma 100.
    var basePercents: [BudgetCategory: Int] {
        let v: [Int]
        switch self {
        case .balanced: v = [28, 12, 5, 5, 30, 20]
        case .moreLeisure: v = [35, 13, 5, 7, 30, 10]
        case .saver30: v = [30, 12, 8, 5, 15, 30]
        case .aggressive40: v = [30, 12, 8, 5, 5, 40]
        case .extreme50: v = [28, 10, 5, 3, 4, 50]
        }
        return [.casa: v[0], .alimentacao: v[1], .fixos: v[2], .transporte: v[3], .lazer: v[4], .outro: 0, .poupanca: v[5]]
    }

    /// Percentuais com a fatia de "Outro" tirada do Lazer (limitada ao próprio Lazer).
    func percents(outroPoints: Int) -> [BudgetCategory: Int] {
        var p = basePercents
        let lazer = p[.lazer] ?? 0
        let outro = min(max(0, outroPoints), lazer)
        p[.lazer] = lazer - outro
        p[.outro] = outro
        return p
    }

    var savingsPercent: Int { basePercents[.poupanca] ?? 0 }

    var summary: String {
        let p = basePercents
        return "Casa \(p[.casa]!) · Alim. \(p[.alimentacao]!) · Fixos \(p[.fixos]!) · Transp. \(p[.transporte]!) · Lazer \(p[.lazer]!) · Poup. \(p[.poupanca]!)"
    }

    /// Do que menos poupa para o que mais poupa.
    static let byAggressiveness: [BudgetPreset] = allCases.sorted { $0.savingsPercent < $1.savingsPercent }
}
