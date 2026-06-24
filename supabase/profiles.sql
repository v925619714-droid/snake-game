-- Схема лидерборда/профилей (применена в Supabase через Management API).
-- RLS: чтение всем; запись ТОЛЬКО через SECURITY DEFINER функции ниже, каждая пишет
-- исключительно строку auth.uid() (нельзя править чужой профиль). Прямые INSERT/UPDATE
-- закрыты (нет write-политик). Рейтинг считает СЕРВЕР (submit_match) — клиент его не пишет.
create table if not exists public.profiles (
  id text primary key,
  name text,
  rating int not null default 1000,
  wins int not null default 0,
  losses int not null default 0,
  updated_at timestamptz not null default now()
);

-- Кошелёк/прогресс (кросс-девайс): монеты, купленные скины, выбранный скин, рекорд соло.
alter table public.profiles add column if not exists coins int not null default 0;
alter table public.profiles add column if not exists owned text[] not null default '{classic}';
alter table public.profiles add column if not exists selected text not null default 'classic';
alter table public.profiles add column if not exists best int not null default 0;
-- Анти-фарм: время последнего зачёта матча (кулдаун в submit_match).
alter table public.profiles add column if not exists last_match_at timestamptz;

alter table public.profiles enable row level security;

drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles for select using (true);

grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;

-- Гарантирует строку профиля + имя для СВОЕГО аккаунта (auth.uid()).
-- Рейтинг/wins/losses с клиента НЕ принимаются (управляет submit_match) — анти-чит.
create or replace function public.upsert_profile(p_id text, p_name text, p_rating int, p_wins int, p_losses int)
returns void language plpgsql security definer set search_path = public as $$
declare me text; nm text;
begin
  me := auth.uid()::text;
  if me is null then return; end if;
  -- имя: максимум 24 символа, без управляющих символов (анти-абьюз через прямой RPC)
  nm := nullif(regexp_replace(left(coalesce(p_name,''), 24), '[\x00-\x1F\x7F]', '', 'g'), '');
  insert into public.profiles(id, name, rating, wins, losses, updated_at)
  values (me, coalesce(nm,'Player'), 1000, 0, 0, now())
  on conflict (id) do update set
    name = coalesce(nm, public.profiles.name),
    updated_at = now();
end;
$$;

-- Кошелёк/прогресс (косметика, без анти-чита). Только своя строка. best только вверх.
create or replace function public.upsert_wallet(p_id text, p_coins int, p_owned text[], p_selected text, p_best int)
returns void language plpgsql security definer set search_path = public as $$
declare me text;
begin
  me := auth.uid()::text;
  if me is null then return; end if;
  insert into public.profiles(id, coins, owned, selected, best, updated_at)
  values (me, greatest(0,coalesce(p_coins,0)), coalesce(p_owned,'{classic}'), coalesce(nullif(p_selected,''),'classic'), greatest(0,coalesce(p_best,0)), now())
  on conflict (id) do update set
    coins = greatest(0, coalesce(excluded.coins,0)),
    owned = coalesce(excluded.owned, public.profiles.owned),
    selected = coalesce(nullif(excluded.selected,''), public.profiles.selected),
    best = greatest(public.profiles.best, coalesce(excluded.best,0)),
    updated_at = now();
end;
$$;

-- T24: СЕРВЕРНЫЙ ELO. Сервер берёт СВОЙ хранимый рейтинг игрока, считает дельту
-- (K=32, кламп ±32), применяет к строке auth.uid(). Кулдаун 6с от фарма; wins/losses тут же.
-- Рейтинг соперника берётся клиентский, но зажат в my±400 (в P2P нет uid соперника).
-- Остаточный риск (клиент сам сообщает исход) закрывается дальнейшей сверкой двух игроков.
create or replace function public.submit_match(p_result text, p_opp_rating int, p_vs_bot boolean)
returns table(rating int, delta int) language plpgsql security definer set search_path = public as $$
declare
  me text; my_r int; opp_r int; expected float; score float; d int; last_at timestamptz; new_r int;
begin
  me := auth.uid()::text;
  if me is null then return; end if;
  select p.rating, p.last_match_at into my_r, last_at from public.profiles p where p.id = me;
  if my_r is null then
    insert into public.profiles(id, rating, updated_at) values (me, 1000, now()) on conflict do nothing;
    my_r := 1000;
  end if;
  if last_at is not null and now() - last_at < interval '6 seconds' then
    return query select my_r, 0; return;
  end if;
  opp_r := least(my_r + 400, greatest(my_r - 400, coalesce(p_opp_rating, my_r)));
  opp_r := least(3000, greatest(0, opp_r));
  score := case lower(p_result) when 'win' then 1.0 when 'draw' then 0.5 else 0.0 end;
  expected := 1.0 / (1.0 + power(10.0, (opp_r - my_r) / 400.0));
  d := round(32.0 * (score - expected))::int;
  d := least(32, greatest(-32, d));
  new_r := least(3000, greatest(0, my_r + d));
  update public.profiles set
    rating = new_r,
    wins = wins + case when lower(p_result)='win' then 1 else 0 end,
    losses = losses + case when lower(p_result)='loss' then 1 else 0 end,
    last_match_at = now(), updated_at = now()
  where id = me;
  return query select new_r, (new_r - my_r);
end;
$$;

-- T28: удаление аккаунта (in-app, Apple/GDPR-требование) — ПОЛНОЕ: профиль + запись auth.users.
-- SECURITY DEFINER (owner = privileged) → может удалить из auth.users свою строку auth.uid().
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare me uuid;
begin
  me := auth.uid();
  if me is null then return; end if;
  delete from public.profiles where id = me::text;
  delete from auth.users where id = me;
end;
$$;

grant execute on function public.upsert_profile(text,text,int,int,int) to anon, authenticated;
grant execute on function public.upsert_wallet(text,int,text[],text,int) to anon, authenticated;
grant execute on function public.submit_match(text,int,boolean) to anon, authenticated;
grant execute on function public.delete_my_account() to anon, authenticated;
