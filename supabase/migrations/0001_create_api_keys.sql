-- Tabela de chaves de API para o proxy Moodle
create table if not exists public.api_keys (
  id              uuid primary key default gen_random_uuid(),
  api_key         uuid unique not null default gen_random_uuid(),
  name            text not null,
  email           text unique not null,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- RLS habilitado: acesso apenas via service role key (Edge Functions)
alter table public.api_keys enable row level security;
