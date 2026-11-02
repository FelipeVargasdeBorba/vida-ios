# Vida — regras do projeto

App nativo de iPhone (iOS 17+, só iPhone) em SwiftUI + SwiftData, interface em inglês. Prioridade: funcional, minimalista, rápido.

## Build
- Projeto gerado pelo XcodeGen: edite `project.yml`, nunca o `.xcodeproj` (ele é descartável e não vai para o git).
- `xcodegen generate`
- `xcodebuild -scheme Vida -destination 'platform=iOS Simulator,name=iPhone 17' build test`
- Meta: zero erros e zero avisos. Assinatura: copie `Config/Local.xcconfig.example` para `Config/Local.xcconfig` (fora do git) com o seu Team ID.

## Regras invioláveis
- **Zero dependências externas.** Nada de SPM/CocoaPods.
- **Dinheiro sempre `Int` em centavos.** Nunca `Double` para valores. Formatação só via `Money.format`. Divisões com maior resto (`BudgetCalculator.split`) para a soma bater.
- **Modelos SwiftData prontos para CloudKit:** todo campo com valor padrão, relações opcionais com `inverse`, nada de `@Attribute(.unique)`. Enums guardados como `String` bruto (`fooRaw`) com propriedade calculada tipada. Liga-se a relação **depois** do `context.insert`.
- **Nada se perde:** sem migrações destrutivas. Campo novo sempre com padrão.
- **Lógica fora das views:** regras de cálculo vivem em `Vida/Domain` (Swift puro, sem SwiftData/SwiftUI, `Calendar` injetado) e têm teste em `VidaTests`.
- **Performance:** `@Query` com `#Predicate` filtrado pelo período (`FinancePeriodReader`, `TransactionList`). Calcule uma vez por tela (`FinanceModel.make`) e passe structs prontas para as linhas. Sem animações pesadas, listas nativas (`List`).
- **Nunca mudar plano/meta sem confirmação** do usuário (`confirmationDialog`).
- Dias da semana: ISO (1 = segunda … 7 = domingo); horários do dia em minutos desde a meia-noite.

## Estrutura
- `Vida/App` — entrada, abas, roteador (deep link da notificação de pagamento), seeder.
- `Vida/Domain` — `PayPeriodCalculator`, `BudgetCalculator`, `GoalCalculator`, `PlanAdapter`, `AccountSplitCalculator`, `BillCalculator`, `CarryOverCalculator`, `NotificationPlanner`, `Money`.
- `Vida/Features/Shared/Theme.swift` — paleta suave (cor por categoria, fundo `vidaBackground` via `.vidaList()`), `IconBadge`, `SoftBar`. Fonte arredondada no app todo.
- `Vida/Models` — `@Model` do SwiftData.
- `Vida/Services` — `NotificationService` (janela de 14 dias / 60 pendentes; refaz ao abrir o app e a cada edição).
- `Vida/Features/{Finance,Agenda,Notes,Shared}` — telas.

## Decisões de produto
- Renda do período = soma das entradas com origem **Salário** lançadas no período (`BudgetCalculator.periodIncome`). "Outra entrada" não muda o plano. `FinanceSettings.incomeCents` ficou sem uso, mas continua no modelo para não perder dados.
- "Outro" é a única categoria flexível do dia a dia: Lazer e Outro foram unidos. Dados antigos com `lazer` são lidos como `outro` (`BudgetCategory.stored`); `FinanceSettings.outroPoints` ficou sem uso, mas continua no modelo para não perder dados.
- Idioma: a interface é em inglês. Os valores guardados (`casa`, `alimentacao`, `outro`…, notas de aporte) continuam em português para não quebrar dados antigos.
- Gasto efetivo de uma categoria = `max(real, fixos)` (fixo ainda não lançado já conta).
- Exigido da meta no período = (alvo − guardado antes do período) ÷ períodos que começam antes do prazo; fica fixo durante o período.
- Adaptação: corta flexíveis na ordem configurada até `max(gasto, mínimo)`; depois usa só a poupança **acima** do piso exigido pelas metas. Piso, Casa e Fixos nunca são cortados.
- Divisão no banco: as categorias em `spendingAccount` (padrão Alimentação, Transporte, Outro) ficam na conta de gastos; o resto vai para saves. A poupança sai da conta de gastos: cada meta tem a **sua própria conta** e recebe a sua parte (`GoalRow.allocation`, por prioridade) direto, sem passar por saves. O que sobrar vira Reserva em saves. Os valores são os alvos do plano, e a soma das fatias bate com a renda.
- Carteira saves: saldo informado (`savesBalanceCents`) + o que entra em saves (sem as metas) − contas pagas de saves = quanto fica depois do período.
- Checklist do período (topo de Finanças): "Separar para saves" (`PeriodCheck` `.savesTransfer`, `forDate` = início do período), cada gasto fixo (`PeriodCheck` `.bill` ligado ao `FixedExpense`, `forDate` = vencimento de `BillCalculator.occurrence`) e cada meta com parte no plano (marcar cria um `GoalContribution` com nota `ChecklistActions.goalNote`; desmarcar apaga só esses). Marcar uma conta não lança gasto, porque os fixos já contam no plano.
- Vencimento de fixo: `dueDay` (0 = sem data), ajustado ao fim do mês. Mensal: a ocorrência dentro do período. Semanal: a do mês em que o período começa. O lembrete (`remindOn`) toca no dia, na hora dos lembretes (`reminderMinutes`), e não toca se a conta já estiver paga.
- Metas mostram só quanto colocar: `GoalRow.toMove` = parte do plano (`allocation`) − aportado no período.
- Sobra da conta de gastos (`CarryOverCalculator`): saldo acumulado de (parte do salário para gastos − usado) de todos os períodos anteriores, desde o primeiro salário lançado depois de `carryFromDate`. "Usado" = `max(real, fixos)` nos períodos com salário. Sobra soma em Outro (ou na primeira de Outro, Alimentação, Transporte que estiver na conta de gastos). Falta é descontada nessa ordem, sem alvo negativo. Saves não muda. "Zerar" (com confirmação) põe `carryFromDate` no início do período.
- Transferência para a meta: ao marcar a meta (checklist ou tela de Metas) abre o aporte com o valor do plano sugerido, editável. O que vale é o valor transferido de fato: `GoalRow.effectiveAllocation = max(plano, transferido)` alimenta a divisão (a diferença sai da Reserva) e `toMove` mostra o que falta se transferiu menos. A exigência do período fica fixa; no período seguinte ela cai sozinha, porque o guardado antes do período já inclui o valor real.
