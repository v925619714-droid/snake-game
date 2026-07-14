-- Идемпотентное начисление монет за покупки RuStore (см. server/src/iap.ts).
-- Запускать на БД бэкенда 37427 (psql внутри контейнера postgres), один раз.

create table if not exists public.processed_purchases (
  invoice_id text primary key,          -- invoiceId покупки RuStore (защита от повторного начисления)
  user_id    uuid not null,
  sku        text not null,
  coins      int  not null,
  created_at timestamptz not null default now()
);

-- Начислить монеты один раз на invoice. Возвращает начисленную дельту (0 — если invoice уже был).
create or replace function public.grant_coins(p_user uuid, p_invoice text, p_sku text, p_coins int)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.processed_purchases where invoice_id = p_invoice) then
    return 0;                            -- уже начислено ранее
  end if;
  insert into public.processed_purchases(invoice_id, user_id, sku, coins)
  values (p_invoice, p_user, p_sku, p_coins);
  update public.profiles set coins = coalesce(coins, 0) + p_coins where id = p_user;
  return p_coins;
end;
$$;

-- Вызывать функцию может только service_role (сервер валидации), не anon/authenticated.
revoke all on function public.grant_coins(uuid, text, text, int) from public;
revoke all on function public.grant_coins(uuid, text, text, int) from anon;
revoke all on function public.grant_coins(uuid, text, text, int) from authenticated;
grant execute on function public.grant_coins(uuid, text, text, int) to service_role;
