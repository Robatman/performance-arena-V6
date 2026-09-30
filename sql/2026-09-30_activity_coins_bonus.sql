-- Actividades con coins fijos + bonus extraordinarios.
-- Ejecutar UNA vez en Supabase -> SQL Editor.

-- 1) Coins fijos por actividad (los fija el admin al crearla)
alter table activities add column if not exists coins integer;
alter table activities drop constraint if exists activities_coins_positive;
alter table activities add constraint activities_coins_positive check (coins is null or coins > 0);

-- 2) Inmutables: una vez asignados, nadie puede cambiarlos (ni desde la app ni por API)
create or replace function lock_activity_coins() returns trigger as $$
begin
  if old.coins is not null and new.coins is distinct from old.coins then
    raise exception 'Los coins de una actividad no se pueden modificar una vez asignados';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists activities_lock_coins on activities;
create trigger activities_lock_coins before update on activities
  for each row execute function lock_activity_coins();

-- 3) Bonus extraordinarios para agentes (los de staff usan staff_points_log, que ya existe)
create table if not exists coin_bonuses (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  coins integer not null check (coins > 0),
  reason text not null,
  given_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists coin_bonuses_game_id_idx on coin_bonuses (game_id);

-- La app accede con la llave anon (igual que el resto de las tablas)
alter table coin_bonuses enable row level security;
drop policy if exists "coin_bonuses anon access" on coin_bonuses;
create policy "coin_bonuses anon access" on coin_bonuses for all using (true) with check (true);
