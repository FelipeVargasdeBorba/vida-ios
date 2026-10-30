# Arquitetura

> [English version](../ARCHITECTURE.md)

## Visão geral

```
View (SwiftUI)  →  FinanceModel (structs prontas)  →  Domain (Swift puro)
      ↑                     ↑
   @Query (filtrada)    SwiftData (@Model)
```

- **Views** só apresentam. Recebem structs já calculadas e não contêm regra de negócio.
- **`FinanceModel.make`** roda uma vez por atualização dos dados e entrega tudo que a tela precisa (resumo, metas, divisão entre contas, checklist, adaptação).
- **Domain** concentra as regras em Swift puro: sem SwiftData, sem SwiftUI, com `Calendar` injetado. Por isso é testável com datas fixas.
- **Models** são `@Model` do SwiftData.

## Camadas

| Pasta | Conteúdo |
|---|---|
| `Vida/App` | entrada do app, abas, roteador (toque na notificação), dados iniciais |
| `Vida/Domain` | `PayPeriodCalculator`, `BudgetCalculator`, `GoalCalculator`, `PlanAdapter`, `AccountSplitCalculator`, `BillCalculator`, `CarryOverCalculator`, `NotificationPlanner`, `Money` |
| `Vida/Models` | `FinanceSettings`, `FixedExpense`, `Transaction`, `Goal`, `GoalContribution`, `PeriodCheck`, `PeriodSnapshot`, agenda e notas |
| `Vida/Services` | `NotificationService`: janela de 14 dias, no máximo 60 avisos pendentes, refeita ao abrir o app e a cada edição |
| `Vida/Features` | telas de Finance, Agenda, Notes e componentes compartilhados (`Theme`, `Components`) |

## Decisões e motivos

**Dinheiro em centavos (`Int`).** `Double` acumula erro de arredondamento. A divisão por percentuais usa o método do maior resto, então a soma das partes sempre é igual ao total.

**Modelos prontos para CloudKit.** Todo campo tem valor padrão, relações são opcionais com `inverse`, não há `@Attribute(.unique)` e enums são guardados como `String` bruto com uma propriedade calculada tipada. A relação é ligada depois do `context.insert`. Assim a sincronização por iCloud pode ser ligada depois sem migração destrutiva.

**Nada se perde.** Sem migrações destrutivas: campo novo sempre entra com valor padrão. Exemplo: `incomeCents` ficou sem uso quando a renda passou a vir do salário lançado, mas continua no modelo.

**Desempenho.** `@Query` com `#Predicate` filtra por período (transações, checks, sobra). Listas são `List` nativas e não há animação pesada.

**Notificações locais com janela deslizante.** O iOS limita a 64 notificações pendentes, então o app agenda só os próximos 14 dias (máximo 60) e refaz a janela. Pagamento do salário e contas a pagar têm prioridade.

**Projeto gerado.** O `.xcodeproj` é descartável e não vai para o git; a fonte da verdade é o `project.yml`. O time de assinatura fica em `Config/Local.xcconfig`, fora do git.

**Sem dependências.** Reduz risco de manutenção e mostra domínio das APIs da plataforma (SwiftUI, SwiftData, Swift Charts, UserNotifications).

## Testes

Os testes ficam em `VidaTests` e usam um calendário gregoriano fixo em UTC (`TestSupport.swift`), então não dependem do aparelho. Os testes de agenda e de transferência usam um `ModelContainer` em memória.

| Arquivo | Testes | O que cobre |
|---|---:|---|
| `PayPeriodTests` | 10 | períodos mensais e semanais, dia 31, virada de ano |
| `BudgetCalculatorTests` | 9 | presets somam 100, maior resto, renda do período |
| `GoalCalculatorTests` | 9 | exigência por período, distribuição por prioridade |
| `PlanAdapterTests` | 10 | cortes na ordem, piso de alimentação, atraso |
| `AccountSplitTests` | 8 | três destinos, soma igual ao salário, metas limitadas à poupança |
| `BillCalculatorTests` | 7 | vencimento no período, fim de mês, lembrete que respeita o pago |
| `CarryOverTests` | 8 | sobra e falta acumuladas, categorias, zerar |
| `GoalTransferTests` | 4 | valor transferido maior ou menor que o plano |
| `AgendaTests` | 10 | ocorrências, notificações, janela e limite |
| **Total** | **75** | |
