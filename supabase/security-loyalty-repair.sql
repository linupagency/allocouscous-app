-- À exécuter dans Supabase SQL Editor si le projet existe déjà.
-- Corrige :
-- 1) commande obligatoire avec compte client authentifié,
-- 2) fidélité créditée uniquement quand la commande passe en "Terminée".
-- 3) email de bienvenue envoyé une seule fois après première connexion client.

alter table public.profiles
add column if not exists welcome_email_sent_at timestamptz;

drop policy if exists "orders create authenticated" on public.orders;
create policy "orders create authenticated" on public.orders
for insert
with check (auth.uid() = user_id and user_id is not null);

create unique index if not exists loyalty_events_order_kind_unique
on public.loyalty_events (order_id, kind)
where order_id is not null;

create or replace function public.orders_apply_loyalty_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pts int;
begin
  if new.user_id is null then
    return new;
  end if;
  if new.status <> 'Terminée' or old.status = 'Terminée' then
    return new;
  end if;

  insert into public.loyalty_accounts (user_id)
  values (new.user_id)
  on conflict (user_id) do nothing;

  if not exists (
    select 1 from public.loyalty_events
    where order_id = new.id and kind = 'order'
  ) then
    pts := greatest(0, floor(new.total::numeric / 10)::int);

    update public.loyalty_accounts
    set
      points = points + pts,
      total_spent = total_spent + new.total::numeric,
      updated_at = now()
    where user_id = new.user_id;

    insert into public.loyalty_events (user_id, order_id, points, kind, description)
    values (new.user_id, new.id, pts, 'order', 'Points fidélité (commande terminée)')
    on conflict do nothing;
  end if;

  if coalesce(new.loyalty_discount, 0) > 0 and not exists (
    select 1 from public.loyalty_events
    where order_id = new.id and kind = 'reward_use'
  ) then
    update public.loyalty_accounts
    set
      reward_credits = greatest(0, reward_credits - 1),
      updated_at = now()
    where user_id = new.user_id;

    insert into public.loyalty_events (user_id, order_id, points, kind, description)
    values (new.user_id, new.id, 0, 'reward_use', 'Récompense fidélité utilisée')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_after_insert_loyalty on public.orders;
drop trigger if exists orders_after_completion_loyalty on public.orders;
create trigger orders_after_completion_loyalty
after update of status on public.orders
for each row execute function public.orders_apply_loyalty_on_completion();
