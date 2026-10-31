# Account sync (PWA)

[Versão em português](pt/SYNC.md)

Sign in once and your data follows you to any phone. There is no server code to run: the app talks to [Supabase](https://supabase.com) (free tier) over its REST API using `fetch`, with no client library.

## How it works

- **Client-side encryption.** The key is derived from your password (PBKDF2-SHA256, 600,000 iterations) and never leaves the device. The whole state is sealed with AES-256-GCM before upload, so the server only stores ciphertext.
- **One row per user** in `public.vault`, protected by row-level security (`supabase/schema.sql`): a user can only read and write their own row.
- **Optimistic concurrency.** Each upload is conditional on the row's `updated_at` stamp. If another device wrote first, nothing is overwritten.
- **Reconciliation** (`src/syncPlan.ts`, unit-tested): nothing / push / pull / ask. The app never overwrites data without asking when both sides changed.
- Changes are pushed about 1.5 s after an edit, when the app is hidden, and when the connection returns.
- **Trade-off.** Because only the password can open the vault, a forgotten password cannot be recovered. The password-protected file backup stays available as a second copy.

## Setup (once)

1. Create a free project at supabase.com.
2. SQL Editor: run `web/supabase/schema.sql`.
3. Authentication › Providers › Email: for the simplest flow, turn off *Confirm email*.
4. Project Settings › API: copy the **Project URL** and the **anon public** key into `web/src/config.ts`. The anon key is public by design; row-level security protects the data. Never use the `service_role` key.
5. Authentication › URL Configuration: set *Site URL* to `https://felipevargasdeborba.github.io/vida-ios/`.
