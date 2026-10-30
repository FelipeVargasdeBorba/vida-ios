import Foundation
import Observation
import UserNotifications

/// Rascunho para abrir o formulário de transação (novo ou edição).
struct TransactionDraft: Identifiable {
    let id = UUID()
    var transaction: Transaction?
    var kind: TransactionKind = .expense
    var date: Date = Date()
}

@Observable
final class AppRouter {
    static let shared = AppRouter()

    enum Tab: Hashable { case finance, agenda, notes }

    var tab: Tab = .finance
    var transactionDraft: TransactionDraft?
    /// Atualizado ao voltar para o app, para o período virar sozinho.
    var today = Date()

    /// Toque no lembrete "Seu salário caiu? Confirme".
    func openIncomeConfirmation() {
        tab = .finance
        transactionDraft = TransactionDraft(kind: .income, date: Date())
    }
}

final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationDelegate()

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let action = response.notification.request.content.userInfo["action"] as? String
        if action == NotificationPlanner.paydayAction {
            DispatchQueue.main.async { AppRouter.shared.openIncomeConfirmation() }
        } else if action == NotificationPlanner.billAction {
            DispatchQueue.main.async { AppRouter.shared.tab = .finance }
        }
        completionHandler()
    }
}
