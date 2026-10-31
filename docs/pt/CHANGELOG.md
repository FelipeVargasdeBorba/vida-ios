# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). [English version](../../CHANGELOG.md).

## [Não lançado]

### Adicionado
- **App web (PWA)** em `web/`: port completo de finanças, agenda e notas; instalável na Tela de Início do iPhone sem validade, offline via service worker, backup em JSON, exportação `.ics` para contas e agenda. 77 testes Vitest; publicado no GitHub Pages.
- Divisão do salário em três destinos (conta de gastos, saves e uma conta por meta), com gráfico de rosca.
- Checklist do período: separar para saves, pagar contas fixas e transferir para as metas.
- Vencimento e lembrete nos gastos fixos; o aviso não toca se a conta já foi paga.
- Sobra acumulada da conta de gastos entre períodos, com opção de zerar.
- Valor real transferido para cada meta; o plano se adapta a ele.
- Tema com cores suaves por categoria e fonte arredondada.

### Alterado
- O repositório virou um monorepo: app nativo em `ios/`, app web em `web/`, CI separados.
- A renda do período passa a ser o salário lançado, e não mais um valor fixo nas configurações.
- Tela de metas mostra só quanto transferir.

## [1.0] - 2026-10-30

### Adicionado
- Finanças por período de pagamento (mensal ou semanal), modelos de divisão, metas, adaptação automática e histórico.
- Agenda com obrigações, lembretes, dias de trabalho e notificações locais.
- Notas em listas.
