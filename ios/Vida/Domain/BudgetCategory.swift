import Foundation

/// Categoria única usada pelo plano, pelos gastos fixos e pelas transações.
enum BudgetCategory: String, CaseIterable, Identifiable, Codable {
    case casa, fixos, alimentacao, transporte, outro, poupanca

    var id: String { rawValue }

    /// "Lazer" e "Outro" viraram uma só categoria: o que foi guardado como "lazer" é lido como "outro".
    static func stored(_ raw: String) -> BudgetCategory? {
        BudgetCategory(rawValue: raw == "lazer" ? BudgetCategory.outro.rawValue : raw)
    }

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        guard let value = BudgetCategory.stored(raw) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown category: \(raw)"))
        }
        self = value
    }

    /// Nome no plano.
    var title: String {
        switch self {
        case .casa: "Home"
        case .fixos: "Fixed expenses"
        case .alimentacao: "Food"
        case .transporte: "Transport"
        case .outro: "Other"
        case .poupanca: "Savings"
        }
    }

    /// Nome no registro de transações.
    var transactionTitle: String {
        switch self {
        case .casa: "Home/rent"
        default: title
        }
    }

    var symbol: String {
        switch self {
        case .casa: "house"
        case .fixos: "doc.text"
        case .alimentacao: "cart"
        case .transporte: "tram"
        case .outro: "ellipsis.circle"
        case .poupanca: "banknote"
        }
    }

    /// Categorias onde se gasta (tudo menos poupança).
    static let spending: [BudgetCategory] = [.casa, .fixos, .alimentacao, .transporte, .outro]

    /// Categorias que podem ser flexíveis (cortáveis) na adaptação.
    static let cuttable: [BudgetCategory] = [.outro, .transporte, .alimentacao]

    static let defaultFlexibleOrder: [BudgetCategory] = [.outro, .transporte, .alimentacao]

    static func list(from raw: String) -> [BudgetCategory] {
        var seen = Set<BudgetCategory>()
        return raw.split(separator: ",").compactMap { BudgetCategory.stored(String($0)) }
            .filter { cuttable.contains($0) && seen.insert($0).inserted }
    }

    static func raw(from list: [BudgetCategory]) -> String {
        list.map(\.rawValue).joined(separator: ",")
    }
}

enum PayFrequency: String, CaseIterable, Identifiable, Codable {
    case monthly, weekly

    var id: String { rawValue }
    var title: String { self == .monthly ? "Monthly" : "Weekly" }
    var periodNoun: String { self == .monthly ? "month" : "week" }
}

enum BudgetPreset: String, CaseIterable, Identifiable, Codable {
    case balanced, moreLeisure, saver30, aggressive40, extreme50

    var id: String { rawValue }

    var title: String {
        switch self {
        case .balanced: "Balanced 50/30/20"
        case .moreLeisure: "More flexible"
        case .saver30: "Saver 30%"
        case .aggressive40: "Aggressive 40%"
        case .extreme50: "Extreme 50%"
        }
    }

    /// Casa, Alimentação, Fixos, Transporte, Outro, Poupança. Cada um soma 100.
    var percents: [BudgetCategory: Int] {
        let v: [Int]
        switch self {
        case .balanced: v = [28, 12, 5, 5, 30, 20]
        case .moreLeisure: v = [35, 13, 5, 7, 30, 10]
        case .saver30: v = [30, 12, 8, 5, 15, 30]
        case .aggressive40: v = [30, 12, 8, 5, 5, 40]
        case .extreme50: v = [28, 10, 5, 3, 4, 50]
        }
        return [.casa: v[0], .alimentacao: v[1], .fixos: v[2], .transporte: v[3], .outro: v[4], .poupanca: v[5]]
    }

    var savingsPercent: Int { percents[.poupanca] ?? 0 }

    var summary: String {
        let p = percents
        return "Home \(p[.casa]!) · Food \(p[.alimentacao]!) · Fixed \(p[.fixos]!) · Transport \(p[.transporte]!) · Other \(p[.outro]!) · Savings \(p[.poupanca]!)"
    }

    /// Do que menos poupa para o que mais poupa.
    static let byAggressiveness: [BudgetPreset] = allCases.sorted { $0.savingsPercent < $1.savingsPercent }
}
