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

alter table public.profiles enable row level security;

drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles for select using (true);

grant usage on schema public to anon;
grant select on public.profiles to anon;

create or replace function public.upsert_profile(p_id text, p_name text, p_rating int, p_wins int, p_losses int)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, name, rating, wins, losses, updated_at)
  values (p_id, coalesce(nullif(p_name,''),'Player'), greatest(0,p_rating), greatest(0,p_wins), greatest(0,p_losses), now())
  on conflict (id) do update set
    name = coalesce(nullif(excluded.name,''), public.profiles.name),
    rating = excluded.rating,
    wins = excluded.wins,
    losses = excluded.losses,
    updated_at = now();
end;
$$;

grant execute on function public.upsert_profile(text,text,int,int,int) to anon;
