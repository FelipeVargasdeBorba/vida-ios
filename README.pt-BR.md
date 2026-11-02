# Vida

[![CI iOS](https://github.com/FelipeVargasdeBorba/vida-ios/actions/workflows/ios.yml/badge.svg)](https://github.com/FelipeVargasdeBorba/vida-ios/actions/workflows/ios.yml)
[![CI Web](https://github.com/FelipeVargasdeBorba/vida-ios/actions/workflows/web.yml/badge.svg)](https://github.com/FelipeVargasdeBorba/vida-ios/actions/workflows/web.yml)
![Plataformas](https://img.shields.io/badge/PWA-Tela%20de%20In%C3%ADcio%20do%20iPhone-blue)
![Stack](https://img.shields.io/badge/stack-TypeScript%20%7C%20SwiftUI-orange)
![Dependências](https://img.shields.io/badge/depend%C3%AAncias-0-brightgreen)
![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-lightgrey)

**Finanças por período de pagamento**, **agenda** e **notas** para o celular, sem nenhuma dependência externa em tempo de execução. O mesmo produto existe em duas versões:

| | Pasta | Stack | Instalação |
|---|---|---|---|
| **PWA (permanente, recomendado)** | [`web/`](web) | TypeScript, Vite, sem bibliotecas | Abra **https://felipevargasdeborba.github.io/vida-ios/** no Safari › Compartilhar › *Adicionar à Tela de Início* |
| App nativo iOS | [`ios/`](ios) | SwiftUI, SwiftData, Swift Charts | Compile no Xcode (a assinatura gratuita vence em 7 dias) |

A interface é em português.

> [English version](README.md)

## O problema

Receber o salário e decidir, a cada mês, quanto vai para gastos, quanto fica numa conta de reserva e quanto vai para cada objetivo é um trabalho repetitivo e fácil de errar. O Vida faz essa divisão a partir do salário que a pessoa lança, mostra o que já foi pago e o que falta transferir, e carrega a sobra de um período para o seguinte.

## Funcionalidades

**Finanças**
- **O salário lançado define o plano.** A renda do período é a soma das entradas com origem "Salário"; outras entradas não mudam o plano.
- **Divisão em três destinos**, com gráfico de rosca (Swift Charts): conta de gastos (Alimentação, Transporte, Outro), **saves** (aluguel, fixos e reserva) e **uma conta para cada meta**.
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
| Lógica | Camada de domínio pura (`ios/Vida/Domain`, `web/src/domain`), calendário injetado, testada e portada 1:1 entre Swift e TypeScript |
| Desempenho | `@Query` com `#Predicate` filtrado pelo período; cálculo feito uma vez por tela |
| Projeto | Gerado pelo XcodeGen a partir do `project.yml` |
| Dependências | Nenhuma (nem SPM, nem CocoaPods) |

A sincronização por conta está em [docs/pt/SYNC.md](docs/pt/SYNC.md).

Mais detalhes em [docs/pt/ARCHITECTURE.md](docs/pt/ARCHITECTURE.md) e as regras de negócio em [docs/pt/PRODUCT-RULES.md](docs/pt/PRODUCT-RULES.md). As versões em inglês estão em [docs](docs).

## Testes

**77 testes em Swift** (iOS) e **93 testes em Vitest** (web) cobrem as regras de cálculo (períodos de pagamento, orçamento, metas, adaptação, divisão entre contas, vencimentos, sobra acumulada e agenda). O CI roda os dois a cada push.

```sh
cd ios && xcodegen generate
xcodebuild -scheme Vida -destination 'platform=iOS Simulator,name=iPhone 17' build test

cd web && npm ci && npm test
```

## Como rodar

### PWA (permanente no iPhone)

1. Abra **https://felipevargasdeborba.github.io/vida-ios/** no **Safari**.
2. Toque em Compartilhar › **Adicionar à Tela de Início**.
3. Abra o Vida pela Tela de Início. Funciona offline.

Sem validade e sem conta de desenvolvedor. Os dados ficam no aparelho (`localStorage`); apps instalados na Tela de Início não sofrem a limpeza de 7 dias do Safari. Use *Finanças › Backup* para criar um backup protegido por senha e salvá-lo no iCloud Drive; o app avisa quando ele passa de 7 dias.

Para desenvolver: `cd web && npm ci && npm run dev`.

**Limitação do iOS:** sites não podem agendar notificações locais. Por isso contas e itens da agenda têm um botão **Calendário**, que exporta um evento recorrente `.ics` com alerta, e o checklist mostra o que vence em breve.

### App nativo iOS

Requisitos: Mac com Xcode 26 ou mais novo e `brew install xcodegen`.

```sh
git clone https://github.com/FelipeVargasdeBorba/vida-ios.git
cd vida-ios/ios
xcodegen generate
open Vida.xcodeproj
```

No Xcode, escolha o esquema **Vida** e um simulador de iPhone, e aperte ⌘R.

**Instalar num iPhone de verdade** (conta gratuita da Apple):
1. Copie `ios/Config/Local.xcconfig.example` para `ios/Config/Local.xcconfig` e coloque o seu Team ID.
2. Rode `xcodegen generate`, conecte o iPhone e ative o Modo de Desenvolvedor.
3. Escolha o iPhone como destino e aperte ⌘R. Depois, em Ajustes › Geral › VPN e Gerenciamento de Dispositivo, confie no seu perfil.

Com a conta gratuita o app instalado vale 7 dias; os dados continuam no aparelho ao reinstalar.

## Estrutura

```
ios/
  Vida/       App, Domain, Models, Services, Features
  VidaTests/  testes unitários
web/
  src/domain/ regras de cálculo (TypeScript puro, testadas)
  src/ui/     telas e componentes (DOM, sem framework)
  public/     manifesto, service worker, ícones
  tests/      testes Vitest
docs/         arquitetura e regras de produto
```

## Como foi feito

Projeto pessoal, desenvolvido por mim com o apoio do [Claude Code](https://claude.com/claude-code) como assistente de programação. As regras de negócio, as telas e as decisões de produto partiram das minhas necessidades; as regras do projeto estão registradas em [ios/CLAUDE.md](ios/CLAUDE.md).

## Próximos passos

- Backup em nuvem criptografado e opcional para o PWA.
- Sincronização por iCloud no app nativo (os modelos já seguem as regras do CloudKit; falta a conta paga do Apple Developer).
- Capturas de tela e distribuição pelo TestFlight.

## Licença

[MIT](LICENSE)
