-- Sessoes Moodle vinculadas a chaves de API.
-- A senha do Moodle nao deve ser persistida. O cadastro usa usuario/senha
-- apenas para obter um token de webservice do Moodle, cifrado pela Edge Function.
create table if not exists public.moodle_user_sessions (
  id                 uuid primary key default gen_random_uuid(),
  api_key_id         uuid not null references public.api_keys(id) on delete cascade,
  moodle_user_id     bigint,
  moodle_username    text not null,
  moodle_fullname    text,
  service_name       text not null,
  token_ciphertext   text not null,
  token_iv           text not null,
  token_acquired_at  timestamptz not null default now(),
  expires_at         timestamptz,
  last_validated_at  timestamptz,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists moodle_user_sessions_api_key_id_idx
  on public.moodle_user_sessions (api_key_id);

create index if not exists moodle_user_sessions_active_idx
  on public.moodle_user_sessions (api_key_id, active, expires_at);

-- RLS habilitado: acesso apenas via service role key (Edge Functions)
alter table public.moodle_user_sessions enable row level security;
