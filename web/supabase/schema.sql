-- Vida: um cofre cifrado por usuário. Rode no SQL Editor do Supabase.
-- O servidor só guarda texto cifrado no celular; ele nunca vê seus valores.

create table if not exists public.vault (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       text not null,
  salt       text not null,
  updated_at timestamptz not null default now()
);

alter table public.vault enable row level security;

create policy "vault_select_own" on public.vault for select using (auth.uid() = user_id);
create policy "vault_insert_own" on public.vault for insert with check (auth.uid() = user_id);
create policy "vault_update_own" on public.vault for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "vault_delete_own" on public.vault for delete using (auth.uid() = user_id);

create or replace function public.vault_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists vault_touch on public.vault;
create trigger vault_touch before insert or update on public.vault
  for each row execute function public.vault_touch();
