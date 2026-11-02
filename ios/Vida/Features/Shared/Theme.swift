import SwiftUI
import UIKit

/// Paleta suave do app: tons pastel por categoria e fundo levemente quente.
extension Color {
    init(light: UInt32, dark: UInt32) {
        self.init(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light) })
    }

    static let vidaBackground = Color(light: 0xF5F3EE, dark: 0x0E0F0F)
    static let vidaCard = Color(light: 0xFFFFFF, dark: 0x1B1D1D)
    static let vidaSpending = Color(light: 0xE59A5F, dark: 0xF0AE78)
    static let vidaSaves = Color(light: 0x4E9E8C, dark: 0x6CC2AE)
}

private extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}

extension BudgetCategory {
    var tint: Color {
        switch self {
        case .casa: Color(light: 0x7C93D8, dark: 0x93A8EC)
        case .fixos: Color(light: 0x98A3B5, dark: 0x8F9BB0)
        case .alimentacao: Color(light: 0xE9A66B, dark: 0xF0B47E)
        case .transporte: Color(light: 0xE0BA48, dark: 0xEDCB63)
        case .outro: Color(light: 0xAE93DC, dark: 0xBDA5E8)
        case .poupanca: Color(light: 0x6DB592, dark: 0x7CC6A4)
        }
    }
}

extension BankAccount {
    var tint: Color {
        switch self {
        case .spending: .vidaSpending
        case .saves: .vidaSaves
        case .goal: SplitSlice.goalTint(0)
        }
    }

    var symbol: String {
        switch self {
        case .spending: "creditcard"
        case .saves: "leaf"
        case .goal: "target"
        }
    }
}

extension SplitSlice {
    var tint: Color {
        switch kind {
        case .category(let c): c.tint
        case .goal(let i): Self.goalTint(i)
        case .reserve: BudgetCategory.poupanca.tint
        }
    }

    /// Metas em tons de verde-água, mais claros conforme a prioridade cai.
    static func goalTint(_ index: Int) -> Color {
        Color(light: 0x4FA3A5, dark: 0x63B9BA).opacity(max(0.45, 1 - Double(index) * 0.18))
    }

    var symbol: String {
        switch kind {
        case .category(let c): c.symbol
        case .goal: "target"
        case .reserve: "leaf"
        }
    }
}

/// Ícone em quadradinho arredondado com fundo da própria cor.
struct IconBadge: View {
    let symbol: String
    let tint: Color

    var body: some View {
        Image(systemName: symbol)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(tint)
            .frame(width: 30, height: 30)
            .background(tint.opacity(0.16), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// Barra fina e arredondada; fica vermelha quando passa do limite.
struct SoftBar: View {
    let progress: Double
    var tint: Color = .accentColor
    var isOver = false

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.primary.opacity(0.07))
                Capsule().fill(isOver ? Color.red.opacity(0.75) : tint)
                    .frame(width: geo.size.width * max(0, min(1, progress)))
            }
        }
        .frame(height: 5)
        .accessibilityHidden(true)
    }
}

extension View {
    /// Fundo quente nas listas do app.
    func vidaList() -> some View {
        scrollContentBackground(.hidden)
            .background(Color.vidaBackground)
    }
}
