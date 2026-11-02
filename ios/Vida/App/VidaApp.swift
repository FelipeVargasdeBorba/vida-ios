import SwiftData
import SwiftUI
import UserNotifications

@main
struct VidaApp: App {
    let container: ModelContainer
    @State private var router = AppRouter.shared

    init() {
        UNUserNotificationCenter.current().delegate = NotificationDelegate.shared
        do {
            let schema = Schema([
                FinanceSettings.self, FixedExpense.self, Transaction.self, Goal.self, GoalContribution.self,
                PeriodSnapshot.self, PeriodCheck.self, WorkDay.self, AgendaItem.self, NoteList.self, NoteItem.self,
            ])
            // Local por enquanto. Para iCloud: cloudKitDatabase: .private("iCloud.<seu.bundle>").
            let config = ModelConfiguration(schema: schema, cloudKitDatabase: .none)
            container = try ModelContainer(for: schema, configurations: [config])
        } catch {
            fatalError("Não foi possível abrir o banco de dados: \(error)")
        }
        Seeder.seedIfNeeded(container.mainContext)
    }

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(router)
        }
        .modelContainer(container)
    }
}

struct RootTabView: View {
    @Environment(AppRouter.self) private var router
    @Environment(\.modelContext) private var context
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        @Bindable var router = router
        TabView(selection: $router.tab) {
            FinanceView()
                .tabItem { Label("Finance", systemImage: "eurosign.circle") }
                .tag(AppRouter.Tab.finance)
            AgendaView()
                .tabItem { Label("Agenda", systemImage: "calendar") }
                .tag(AppRouter.Tab.agenda)
            NoteListsView()
                .tabItem { Label("Notes", systemImage: "checklist") }
                .tag(AppRouter.Tab.notes)
        }
        .fontDesign(.rounded)
        .onChange(of: scenePhase, initial: true) { _, phase in
            if phase == .active {
                router.today = Date()
                NotificationService.refresh(context)
            }
        }
    }
}
