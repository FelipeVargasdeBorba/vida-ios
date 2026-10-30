# Regras de produto

As decisões de negócio do app. Cada uma tem testes em `VidaTests`.

## Período e renda
- O período vai do dia de pagamento (inclusive) até o próximo (exclusive). Mensal ou semanal; no mensal, meses sem o dia configurado usam o último dia.
- **Renda do período** = soma das entradas com origem **Salário** lançadas no período. "Outra entrada" não muda o plano.
- Dias da semana seguem a ISO (1 = segunda … 7 = domingo); horários são minutos desde a meia-noite.

## Plano
- Cinco modelos de divisão (Equilibrado 50/30/20, Mais lazer, Poupador 30%, Agressivo 40%, Extremo 50%).
- "Outro" tira `outroPoints` (padrão 5) do percentual de Lazer, limitado ao próprio Lazer.
- Gasto efetivo de uma categoria = `max(real, fixos)`: um fixo ainda não lançado já conta.

## Para onde vai o salário
- **Conta de gastos:** as categorias escolhidas (padrão Alimentação, Transporte, Lazer, Outro).
- **Saves:** o resto (Casa, Gastos fixos) mais a **Reserva**, que é o que sobra da poupança depois das metas.
- **Conta de cada meta:** a parte da poupança destinada à meta, por prioridade, transferida direto, sem passar por saves.
- A soma de todas as fatias é igual ao salário.

## Metas
- Exigido no período = (alvo − guardado antes do período) ÷ períodos que começam antes do prazo. Fica fixo durante o período.
- Ao marcar a meta, o valor transferido de fato é o que vale. Se for maior que o plano, a diferença sai da Reserva; se for menor, o que falta continua pendente. No período seguinte a exigência cai sozinha.

## Checklist do período
- Separar para saves; cada gasto fixo (vencimento do período); cada meta com parte no plano.
- Marcar uma conta como paga não lança gasto, porque os fixos já contam no plano.
- Desfazer a transferência de uma meta apaga só os aportes criados pelo checklist.

## Gastos fixos
- `dueDay` de 1 a 31 (0 = sem data), ajustado ao último dia do mês. No período mensal vale a ocorrência dentro do período; no semanal, a do mês em que o período começa.
- O lembrete toca no dia, na hora configurada, e não toca se a conta já estiver paga.

## Sobra da conta de gastos
- Saldo acumulado de (parte do salário para gastos − usado) de todos os períodos anteriores, desde o primeiro salário lançado.
- A sobra soma em Lazer (ou na primeira categoria da conta de gastos). A falta é descontada na ordem Lazer, Outro, Alimentação, Transporte, sem deixar nenhum alvo negativo.
- "Zerar" recomeça a contagem no período atual e pede confirmação.

## Adaptação automática
- Corta categorias flexíveis, na ordem configurada, até `max(gasto, mínimo)`; depois usa só a poupança **acima** do piso exigido pelas metas.
- Casa, Gastos fixos e o piso das metas nunca são cortados.
- **Nunca muda plano ou meta sem confirmação** do usuário.
