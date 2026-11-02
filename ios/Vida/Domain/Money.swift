import Foundation

enum Currency: String, CaseIterable, Identifiable, Codable {
    case eur = "EUR", brl = "BRL", usd = "USD", gbp = "GBP"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .eur: "Euro (€)"
        case .brl: "Brazilian real (R$)"
        case .usd: "US dollar ($)"
        case .gbp: "British pound (£)"
        }
    }
}

/// Dinheiro é sempre `Int` em centavos. Aqui só formatação e leitura de texto.
enum Money {
    /// Language of the screens: the device's if it is English, otherwise en-GB.
    static let locale: Locale = {
        let current = Locale.current
        return current.language.languageCode?.identifier == "en" ? current : Locale(identifier: "en_GB")
    }()

    private static var styles: [Currency: Decimal.FormatStyle.Currency] = [:]

    static func format(_ cents: Int, _ currency: Currency) -> String {
        let style: Decimal.FormatStyle.Currency
        if let cached = styles[currency] {
            style = cached
        } else {
            style = Decimal.FormatStyle.Currency(code: currency.rawValue, locale: locale)
            styles[currency] = style
        }
        return (Decimal(cents) / 100).formatted(style)
    }

    /// Texto editável sem símbolo, ex.: 1250 → "12,50".
    static func plain(_ cents: Int) -> String {
        let sep = locale.decimalSeparator ?? "."
        let sign = cents < 0 ? "-" : ""
        let value = abs(cents)
        let frac = value % 100
        return "\(sign)\(value / 100)\(sep)\(frac < 10 ? "0" : "")\(frac)"
    }

    /// Lê "12,50", "12.5", "1.234,56" ou "1,234.56". O último separador com 1–2 dígitos depois é o decimal.
    static func parseCents(_ raw: String) -> Int? {
        let s = raw.filter { $0.isNumber || $0 == "," || $0 == "." }
        guard s.contains(where: \.isNumber) else { return nil }
        guard let lastSep = s.lastIndex(where: { $0 == "," || $0 == "." }) else {
            return Int(s).map { $0 * 100 }
        }
        let fracDigits = s[s.index(after: lastSep)...].filter(\.isNumber)
        let intDigits = s[..<lastSep].filter(\.isNumber)
        guard fracDigits.count <= 2 else {
            return Int(s.filter(\.isNumber)).map { $0 * 100 }
        }
        let whole = Int(intDigits.isEmpty ? "0" : String(intDigits)) ?? 0
        var frac = Int(fracDigits.isEmpty ? "0" : String(fracDigits)) ?? 0
        if fracDigits.count == 1 { frac *= 10 }
        return whole * 100 + frac
    }
}
