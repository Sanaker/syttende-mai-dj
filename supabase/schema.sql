-- 17. mai DJ — Supabase / Postgres schema
-- Kjør denne i Supabase SQL Editor.

create table if not exists host_tokens (
  id int primary key default 1,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text not null,
  constraint host_tokens_singleton check (id = 1)
);

create table if not exists suggestions (
  id uuid primary key,
  track_id text not null,
  uri text not null,
  title text not null,
  artists text not null,
  album_art text,
  duration_ms int not null,
  suggested_by text not null,
  created_at timestamptz not null default now(),
  status text not null check (status in ('pending','approved','rejected')),
  votes text[] not null default '{}'
);
create index if not exists suggestions_status_created_idx
  on suggestions (status, created_at);
create index if not exists suggestions_suggested_by_idx
  on suggestions (suggested_by) where status = 'pending';

create table if not exists blocked (
  type text not null check (type in ('track','artist')),
  ext_id text not null,
  label text not null,
  blocked_at timestamptz not null default now(),
  primary key (type, ext_id)
);

create table if not exists recent_tracks (
  track_id text primary key,
  expires_at timestamptz not null
);
create index if not exists recent_tracks_expires_idx on recent_tracks (expires_at);

create table if not exists cooldowns (
  guest_id text primary key,
  expires_at timestamptz not null
);

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Atomic NX+EX for cooldowns. Returns true if cooldown ble satt (gjest fikk lov),
-- false hvis det finnes en aktiv cooldown.
create or replace function set_cooldown(p_guest_id text, p_seconds int)
returns boolean
language plpgsql
as $$
declare
  v_expires timestamptz := now() + (p_seconds || ' seconds')::interval;
  v_existing timestamptz;
begin
  select expires_at into v_existing from cooldowns where guest_id = p_guest_id;
  if v_existing is not null and v_existing > now() then
    return false;
  end if;
  insert into cooldowns (guest_id, expires_at) values (p_guest_id, v_expires)
  on conflict (guest_id) do update set expires_at = excluded.expires_at;
  return true;
end;
$$;

-- Hjelpefunksjon for å rydde utløpte rader. Kall fra cron eller appen.
create or replace function purge_expired()
returns void
language sql
as $$
  delete from cooldowns where expires_at < now();
  delete from recent_tracks where expires_at < now();
$$;

-- Slå på Row Level Security. Vi bruker service_role-nøkkelen fra server-side
-- API-routes, og den omgår RLS. Ved å slå på RLS uten policies, blokkeres alle
-- andre nøkler (anon, authenticated) fra å lese/skrive disse tabellene.
alter table host_tokens   enable row level security;
alter table suggestions   enable row level security;
alter table blocked       enable row level security;
alter table recent_tracks enable row level security;
alter table cooldowns     enable row level security;
alter table settings      enable row level security;
