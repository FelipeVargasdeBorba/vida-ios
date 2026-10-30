# Vida

[![CI](https://github.com/FelipeVargasdeBorba/vida-ios/actions/workflows/ci.yml/badge.svg)](https://github.com/FelipeVargasdeBorba/vida-ios/actions/workflows/ci.yml)
![Plataforma](https://img.shields.io/badge/iOS-17%2B-blue)
![Swift](https://img.shields.io/badge/Swift-SwiftUI%20%2B%20SwiftData-orange)
![Dependências](https://img.shields.io/badge/depend%C3%AAncias-0-brightgreen)
![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-lightgrey)

App nativo de iPhone que organiza **finanças por período de pagamento**, **agenda** e **notas**, feito em SwiftUI e SwiftData, sem nenhuma dependência externa. A interface é em português.

> [English version](README.md)

## O problema

Receber o salário e decidir, a cada mês, quanto vai para gastos, quanto fica numa conta de reserva e quanto vai para cada objetivo é um trabalho repetitivo e fácil de errar. O Vida faz essa divisão a partir do salário que a pessoa lança, mostra o que já foi pago e o que falta transferir, e carrega a sobra de um período para o seguinte.

## Funcionalidades

**Finanças**
- **O salário lançado define o plano.** A renda do período é a soma das entradas com origem "Salário"; outras entradas não mudam o plano.
- **Divisão em três destinos**, com gráfico de rosca (Swift Charts): conta de gastos (Alimentação, Transporte, Lazer, Outro), **saves** (aluguel, fixos e reserva) e **uma conta para cada meta**.
- **Cinco modelos de divisão** (de 50/30/20 a 50% de poupança) e ajuste da fatia "Outro".
- **Checklist do período:** separar para saves, pagar cada conta fixa e transferir para cada meta, com o valor real transferido (o plano se adapta).
- **Gastos fixos com vencimento e lembrete** no dia, que não toca se a conta já foi marcada como paga.
- **Sobra acumulada:** o que sobra (ou falta) na conta de gastos passa para o período seguinte.
- **Metas** com prazo e prioridade; a exigência de cada período é calculada e fica fixa durante ele.
- **Adaptação automática** do orçamento quando o gasto passa do alvo, sem cortar casa, fixos nem a poupança exigida pelas metas.
- **Histórico** com fotos imutáveis de cada período, transações e carteira de saves com saldo informado.

**Agenda:** obrigações e lembretes (únicos ou semanais), dias de trabalho e notificações locais.

**Notas:** listas de tarefas simples.

## Decisões técnicas

| Tema | Decisão |
|---|---|
| UI | SwiftUI com `List` nativa, sem animações pesadas |
| Dados | SwiftData, modelos prontos para CloudKit (campos com padrão, relações opcionais, enums como `String`) |
| Dinheiro | Sempre `Int` em centavos; divisão pelo método do maior resto para a soma bater |
| Lógica | Em `Vida/Domain`, Swift puro, com `Calendar` injetado e testes |
| Desempenho | `@Query` com `#Predicate` filtrado pelo período; cálculo feito uma vez por tela |
| Projeto | Gerado pelo XcodeGen a partir do `project.yml` |
| Dependências | Nenhuma (nem SPM, nem CocoaPods) |

Mais detalhes em [docs/pt/ARCHITECTURE.md](docs/pt/ARCHITECTURE.md) e as regras de negócio em [docs/pt/PRODUCT-RULES.md](docs/pt/PRODUCT-RULES.md). As versões em inglês estão em [docs](docs).

## Testes

**75 testes unitários** cobrindo as regras de cálculo (períodos de pagamento, orçamento, metas, adaptação, divisão entre contas, vencimentos, sobra acumulada, notificações e agenda).

```sh
xcodegen generate
xcodebuild -scheme Vida -destination 'platform=iOS Simulator,name=iPhone 17' build test
```

## Como rodar

Requisitos: Mac com Xcode 26 ou mais novo e `brew install xcodegen`.

```sh
git clone https://github.com/FelipeVargasdeBorba/vida-ios.git
cd vida-ios
xcodegen generate
open Vida.xcodeproj
```

No Xcode, escolha o esquema **Vida** e um simulador de iPhone, e aperte ⌘R.

**Instalar num iPhone de verdade** (conta gratuita da Apple):
1. Copie `Config/Local.xcconfig.example` para `Config/Local.xcconfig` e coloque o seu Team ID.
2. Rode `xcodegen generate`, conecte o iPhone e ative o Modo de Desenvolvedor.
3. Escolha o iPhone como destino e aperte ⌘R. Depois, em Ajustes › Geral › VPN e Gerenciamento de Dispositivo, confie no seu perfil.

Com a conta gratuita o app instalado vale 7 dias; os dados continuam no aparelho ao reinstalar.

## Estrutura

```
Vida/
  App/        entrada, abas, roteador de notificações, dados iniciais
  Domain/     regras de cálculo (Swift puro, testadas)
  Models/     modelos do SwiftData
  Services/   notificações locais
  Features/   telas: Finance, Agenda, Notes, Shared
VidaTests/    testes unitários
docs/         arquitetura e regras de produto
```

## Como foi feito

Projeto pessoal, desenvolvido por mim com o apoio do [Claude Code](https://claude.com/claude-code) como assistente de programação. As regras de negócio, as telas e as decisões de produto partiram das minhas necessidades; as regras do projeto estão registradas em [CLAUDE.md](CLAUDE.md).

## Próximos passos

- Sincronização por iCloud (os modelos já seguem as regras do CloudKit; falta a conta paga do Apple Developer).
- Capturas de tela e distribuição pelo TestFlight.

## Licença

[MIT](LICENSE)
