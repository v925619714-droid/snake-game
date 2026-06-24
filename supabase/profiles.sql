-- Схема лидерборда (применена в Supabase через Management API).
-- Таблица профилей + RLS (чтение всем) + RPC для записи рейтинга (через SECURITY DEFINER).
create table if not exists public.profiles (
  id text primary key,
  name text,
  rating int not null default 1000,
  wins int not null default 0,
  losses int not null default 0,
  updated_at timestamptz not null default now()
);

-- Кошелёк/прогресс (кросс-девайс): монеты, купленные скины, выбранный скин, рекорд соло.
-- Косметика — не влияет на рейтинг, поэтому пишется без анти-чита (отдельный RPC upsert_wallet).
alter table public.profiles add column if not exists coins int not null default 0;
alter table public.profiles add column if not exists owned text[] not null default '{classic}';
alter table public.profiles add column if not exists selected text not null default 'classic';
alter table public.profiles add column if not exists best int not null default 0;

alter table public.profiles enable row level security;

drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles for select using (true);

grant usage on schema public to anon;
grant select on public.profiles to anon;

-- Стоп-гап анти-чит (до перехода на Supabase Auth, см. АУДИТ-2026-06-24.md / T22):
-- нельзя записать произвольный рейтинг. Новичок ~1000; далее не больше ±64 за вызов
-- (один матч ELO ≤ 32); потолок 3000; wins/losses только монотонно вверх.
create or replace function public.upsert_profile(p_id text, p_name text, p_rating int, p_wins int, p_losses int)
returns void language plpgsql security definer set search_path = public as $$
declare
  cur int;
  nr int;
begin
  select rating into cur from public.profiles where id = p_id;
  if cur is null then
    nr := least(1100, greatest(800, coalesce(p_rating, 1000)));
  else
    nr := least(cur + 64, greatest(cur - 64, coalesce(p_rating, cur)));
  end if;
  nr := least(3000, greatest(0, nr));
  insert into public.profiles(id, name, rating, wins, losses, updated_at)
  values (p_id, coalesce(nullif(p_name,''),'Player'), nr, greatest(0, coalesce(p_wins,0)), greatest(0, coalesce(p_losses,0)), now())
  on conflict (id) do update set
    name = coalesce(nullif(excluded.name,''), public.profiles.name),
    rating = excluded.rating,
    wins = greatest(public.profiles.wins, excluded.wins),
    losses = greatest(public.profiles.losses, excluded.losses),
    updated_at = now();
end;
$$;

grant execute on function public.upsert_profile(text,text,int,int,int) to anon;

-- Запись кошелька/прогресса (косметика, без анти-чита). best — только вверх.
create or replace function public.upsert_wallet(p_id text, p_coins int, p_owned text[], p_selected text, p_best int)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, coins, owned, selected, best, updated_at)
  values (p_id, greatest(0,coalesce(p_coins,0)), coalesce(p_owned,'{classic}'), coalesce(nullif(p_selected,''),'classic'), greatest(0,coalesce(p_best,0)), now())
  on conflict (id) do update set
    coins = greatest(0, coalesce(excluded.coins,0)),
    owned = coalesce(excluded.owned, public.profiles.owned),
    selected = coalesce(nullif(excluded.selected,''), public.profiles.selected),
    best = greatest(public.profiles.best, coalesce(excluded.best,0)),
    updated_at = now();
end;
$$;

grant execute on function public.upsert_wallet(text,int,text[],text,int) to anon;
