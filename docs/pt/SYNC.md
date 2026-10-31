# Sincronização por conta (PWA)

[English version](../SYNC.md)

Entre uma vez e seus dados acompanham você em qualquer celular. Não há código de servidor para manter: o app conversa com o [Supabase](https://supabase.com) (plano gratuito) pela API REST usando `fetch`, sem biblioteca.

## Como funciona

- **Cifra no aparelho.** A chave nasce da sua senha (PBKDF2-SHA256, 600.000 iterações) e nunca sai do celular. Todo o estado é selado com AES-256-GCM antes do envio, então o servidor guarda só texto cifrado.
- **Uma linha por usuário** em `public.vault`, protegida por segurança em nível de linha (`supabase/schema.sql`): cada pessoa só lê e grava a própria linha.
- **Concorrência otimista.** Cada envio é condicionado ao carimbo `updated_at` da linha. Se outro aparelho gravou antes, nada é sobrescrito.
- **Reconciliação** (`src/syncPlan.ts`, com testes): nada / enviar / baixar / perguntar. O app nunca sobrescreve sem perguntar quando os dois lados mudaram.
- As mudanças são enviadas cerca de 1,5 s depois da edição, ao esconder o app e quando a conexão volta.
- **Contrapartida.** Como só a senha abre o cofre, uma senha esquecida não tem recuperação. O backup protegido em arquivo continua disponível como segunda cópia.

## Configuração (uma vez)

1. Crie um projeto gratuito em supabase.com.
2. SQL Editor: rode `web/supabase/schema.sql`.
3. Authentication › Providers › Email: para o fluxo mais simples, desligue *Confirm email*.
4. Project Settings › API: copie a **Project URL** e a chave **anon public** para `web/src/config.ts`. A chave anon é pública por desenho; a segurança em nível de linha protege os dados. Nunca use a chave `service_role`.
5. Authentication › URL Configuration: coloque *Site URL* como `https://felipevargasdeborba.github.io/vida-ios/`.
