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
-- T61 анти-чит v2: дневной кап прироста рейтинга.
alter table public.profiles add column if not exists day_gain int not null default 0;
alter table public.profiles add column if not exists day_gain_date date;

-- T61: журнал матчей (аудит/анти-чит). Читать может игрок только свои строки.
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  player uuid not null,
  opponent uuid,
  result text not null,
  vs_bot boolean not null default false,
  delta int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.matches enable row level security;
drop policy if exists "matches_read_own" on public.matches;
create policy "matches_read_own" on public.matches for select using (auth.uid() = player);
grant select on public.matches to anon, authenticated;

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

-- T61: СЕРВЕРНЫЙ ELO v2. Сервер берёт СВОЙ хранимый рейтинг + РЕАЛЬНЫЙ рейтинг соперника
-- из БД по его auth.uid() (p_opponent) — клиентский oppRating используется только для бота.
-- K=32, кламп ±32; кулдаун 6с; дневной кап прироста (cap); self-матч отклоняется; каждый
-- матч логируется в public.matches (аудит). Остаточный риск (клиент сообщает исход) —
-- закрывается дальнейшей сверкой двух игроков (двойное подтверждение).
create or replace function public.submit_match(p_result text, p_opp_rating int, p_vs_bot boolean, p_opponent uuid default null)
returns table(rating int, delta int) language plpgsql security definer set search_path = public as $$
declare
  me uuid; my_r int; opp_r int; expected float; score float; d int;
  last_at timestamptz; new_r int; dg int; dgd date; cap int := 250; today date := current_date;
begin
  me := auth.uid();
  if me is null then return; end if;
  if p_opponent is not null and p_opponent = me then
    return query select coalesce((select p.rating from public.profiles p where p.id=me::text),1000), 0; return;
  end if;
  select p.rating, p.last_match_at, p.day_gain, p.day_gain_date into my_r, last_at, dg, dgd
    from public.profiles p where p.id = me::text;
  if my_r is null then
    insert into public.profiles(id, rating, updated_at) values (me::text, 1000, now()) on conflict do nothing;
    my_r := 1000; dg := 0; dgd := null;
  end if;
  if last_at is not null and now() - last_at < interval '6 seconds' then
    return query select my_r, 0; return;
  end if;
  if p_opponent is not null then
    select p.rating into opp_r from public.profiles p where p.id = p_opponent::text;
  end if;
  if opp_r is null then
    opp_r := least(my_r + 400, greatest(my_r - 400, coalesce(p_opp_rating, my_r)));
  end if;
  opp_r := least(3000, greatest(0, opp_r));
  score := case lower(p_result) when 'win' then 1.0 when 'draw' then 0.5 else 0.0 end;
  expected := 1.0 / (1.0 + power(10.0, (opp_r - my_r) / 400.0));
  d := round(32.0 * (score - expected))::int;
  d := least(32, greatest(-32, d));
  if dgd is distinct from today then dg := 0; end if;
  if d > 0 then
    if dg >= cap then d := 0;
    elsif dg + d > cap then d := cap - dg; end if;
  end if;
  new_r := least(3000, greatest(0, my_r + d));
  update public.profiles set
    rating = new_r,
    wins = wins + case when lower(p_result)='win' then 1 else 0 end,
    losses = losses + case when lower(p_result)='loss' then 1 else 0 end,
    last_match_at = now(), updated_at = now(),
    day_gain = coalesce(dg,0) + greatest(0, d),
    day_gain_date = today
  where id = me::text;
  insert into public.matches(player, opponent, result, vs_bot, delta)
    values (me, p_opponent, lower(p_result), coalesce(p_vs_bot,false), d);
  return query select new_r, d;
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
grant execute on function public.submit_match(text,int,boolean,uuid) to anon, authenticated;
grant execute on function public.delete_my_account() to anon, authenticated;
