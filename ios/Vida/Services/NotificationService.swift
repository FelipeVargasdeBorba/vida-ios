import Foundation
import SwiftData
import UserNotifications

/// Refaz a janela de notificações locais (14 dias, máx. 60) a partir dos dados atuais.
enum NotificationService {
    static func refresh(_ context: ModelContext) {
        let settings = try? context.fetch(FetchDescriptor<FinanceSettings>()).first
        let rules = ((try? context.fetch(FetchDescriptor<AgendaItem>())) ?? []).map(\.rule)
        let payday = (settings?.paydayReminderOn == true && settings?.isConfigured == true) ? settings?.schedule : nil
        let currency = settings?.currency ?? .eur
        let bills = ((try? context.fetch(FetchDescriptor<FixedExpense>())) ?? [])
            .filter { $0.remindOn && $0.dueDay > 0 }
            .map { f in
                BillReminder(title: f.name.isEmpty ? f.category.title : f.name,
                             body: "\(Money.format(f.monthlyCents, currency)) · tap to mark as paid",
                             dueDay: f.dueDay,
                             paid: Set((f.checks ?? []).filter { $0.kind == .bill }.map(\.forDate)))
            }
        let planned = NotificationPlanner.plan(
            rules: rules, payday: payday, bills: bills, paydayMinutes: settings?.reminderMinutes ?? 540,
            now: Date(), calendar: .current
        )
        apply(planned)
    }

    private static func apply(_ planned: [PlannedNotification]) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { status in
            switch status.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                schedule(planned, center)
            case .notDetermined:
                // Só pede permissão quando existe algo com aviso.
                guard !planned.isEmpty else { return }
                center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                    if granted { schedule(planned, center) }
                }
            default:
                center.removeAllPendingNotificationRequests()
            }
        }
    }

    private static func schedule(_ planned: [PlannedNotification], _ center: UNUserNotificationCenter) {
        center.removeAllPendingNotificationRequests()
        let calendar = Calendar.current
        for n in planned {
            let content = UNMutableNotificationContent()
            content.title = n.title
            content.body = n.body
            content.sound = .default
            if let action = n.action { content.userInfo = ["action": action] }
            let comps = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: n.date)
            let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
            center.add(UNNotificationRequest(identifier: n.id, content: content, trigger: trigger))
        }
    }
}
