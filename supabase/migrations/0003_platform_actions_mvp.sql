begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '',
  email       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.email, '')
  )
  on conflict (id) do update
    set name = excluded.name,
        email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create table if not exists public.services (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text not null,
  status      text not null default 'available'
    check (status in ('available', 'coming_soon', 'error')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into public.services (name, slug, description, status)
values
  (
    'Moodle',
    'moodle',
    'Consulte cursos, atividades, usuários e informações educacionais do Moodle por meio de Actions em GPTs personalizados.',
    'available'
  ),
  (
    'Google Drive',
    'google-drive',
    'Conector futuro para arquivos, pastas e documentos privados.',
    'coming_soon'
  ),
  (
    'Planilhas',
    'spreadsheets',
    'Conector futuro para dados estruturados em planilhas.',
    'coming_soon'
  )
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description,
      status = excluded.status,
      updated_at = now();

create table if not exists public.user_services (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  service_id    uuid not null references public.services(id) on delete cascade,
  status        text not null default 'inactive'
    check (status in ('active', 'inactive', 'error')),
  activated_at  timestamptz,
  deactivated_at timestamptz,
  error_message text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, service_id)
);

alter table public.api_keys
  drop column if exists api_key,
  drop column if exists name,
  drop column if exists email;

alter table public.api_keys
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists key_hash text,
  add column if not exists key_preview text,
  add column if not exists last_used_at timestamptz,
  add column if not exists revoked_at timestamptz;

update public.api_keys
set active = false,
    revoked_at = coalesce(revoked_at, now())
where key_hash is null
  and revoked_at is null;

create unique index if not exists api_keys_key_hash_active_idx
  on public.api_keys (key_hash)
  where active = true and revoked_at is null;

create index if not exists api_keys_user_active_idx
  on public.api_keys (user_id, active, revoked_at);

alter table public.moodle_user_sessions
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists service_id uuid references public.services(id) on delete cascade,
  add column if not exists user_service_id uuid references public.user_services(id) on delete cascade;

alter table public.moodle_user_sessions
  alter column api_key_id drop not null;

create index if not exists moodle_user_sessions_user_service_active_idx
  on public.moodle_user_sessions (user_id, service_id, active, expires_at);

create unique index if not exists moodle_user_sessions_active_user_service_idx
  on public.moodle_user_sessions (user_service_id)
  where active = true;

create table if not exists public.service_schemas (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references public.services(id) on delete cascade,
  format      text not null default 'yaml' check (format in ('yaml', 'json')),
  version     text not null default '1.0.0',
  content     text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (service_id, format, version)
);

insert into public.service_schemas (service_id, format, version, content, active)
select id, 'yaml', '2.1.0', null, true
from public.services
where slug = 'moodle'
on conflict (service_id, format, version) do update
  set active = true,
      updated_at = now();

create table if not exists public.action_request_logs (
  id          uuid primary key default gen_random_uuid(),
  api_key_id  uuid references public.api_keys(id) on delete set null,
  user_id     uuid references auth.users(id) on delete set null,
  service_id  uuid references public.services(id) on delete set null,
  path        text not null,
  status      integer,
  created_at  timestamptz not null default now()
);

create index if not exists action_request_logs_key_created_idx
  on public.action_request_logs (api_key_id, created_at desc);

create index if not exists action_request_logs_user_created_idx
  on public.action_request_logs (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.user_services enable row level security;
alter table public.service_schemas enable row level security;
alter table public.action_request_logs enable row level security;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists services_select_authenticated on public.services;
drop policy if exists user_services_select_own on public.user_services;
drop policy if exists api_keys_select_own on public.api_keys;
drop policy if exists service_schemas_select_authenticated on public.service_schemas;

create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy services_select_authenticated
  on public.services for select
  to authenticated
  using (true);

create policy user_services_select_own
  on public.user_services for select
  to authenticated
  using (auth.uid() = user_id);

create policy api_keys_select_own
  on public.api_keys for select
  to authenticated
  using (auth.uid() = user_id);

create policy service_schemas_select_authenticated
  on public.service_schemas for select
  to authenticated
  using (true);

commit;
