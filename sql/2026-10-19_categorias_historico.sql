-- Categorías de premios, bono de racha, historial de temporadas, canjes extra y accesos.
-- Ejecutar UNA vez en Supabase -> SQL Editor. Es seguro correrlo más de una vez.

-- 1) Bono de racha: tipo y semana, para que nunca se pague dos veces el mismo bloque
alter table coin_bonuses add column if not exists kind text;
alter table coin_bonuses add column if not exists week text;
create unique index if not exists coin_bonuses_streak_once
  on coin_bonuses (game_id, week) where kind = 'streak';

-- 2) Temporadas (trimestres): cada reinicio queda registrado y se guarda una foto por agente
create table if not exists season_log (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  started_by text not null,
  note text
);

create table if not exists season_archive (
  id uuid primary key default gen_random_uuid(),
  season_id uuid,
  game_id text not null,
  agent_name text,
  earned_coins integer not null default 0,
  spent_coins integer not null default 0,
  breakdown jsonb,
  weeks jsonb,
  activities jsonb,
  created_at timestamptz not null default now()
);
create index if not exists season_archive_season_idx on season_archive (season_id);
create index if not exists season_archive_game_idx on season_archive (game_id);

-- 3) Canjes extra que un admin le desbloquea a un agente
create table if not exists redemption_unlocks (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  extra integer not null check (extra > 0),
  reason text not null,
  granted_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists redemption_unlocks_game_idx on redemption_unlocks (game_id);

-- 4) Quién entra a la app y cuándo
create table if not exists app_logins (
  id uuid primary key default gen_random_uuid(),
  user_type text not null check (user_type in ('agent', 'staff')),
  game_id text,
  user_name text,
  logged_in_at timestamptz not null default now(),
  user_agent text
);
create index if not exists app_logins_when_idx on app_logins (logged_in_at desc);
create index if not exists app_logins_game_idx on app_logins (game_id);

-- 5) Canjes: guardar quién (game_id) y la categoría del premio en el momento de la compra
alter table reward_redemptions add column if not exists game_id text;
alter table reward_redemptions add column if not exists category integer;

-- 6) Acceso con la llave anon (igual que el resto de las tablas de la app)
alter table season_log enable row level security;
alter table season_archive enable row level security;
alter table redemption_unlocks enable row level security;
alter table app_logins enable row level security;

drop policy if exists "season_log anon access" on season_log;
create policy "season_log anon access" on season_log for all using (true) with check (true);
drop policy if exists "season_archive anon access" on season_archive;
create policy "season_archive anon access" on season_archive for all using (true) with check (true);
drop policy if exists "redemption_unlocks anon access" on redemption_unlocks;
create policy "redemption_unlocks anon access" on redemption_unlocks for all using (true) with check (true);
drop policy if exists "app_logins anon access" on app_logins;
create policy "app_logins anon access" on app_logins for all using (true) with check (true);
