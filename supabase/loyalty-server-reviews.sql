-- À exécuter dans Supabase SQL Editor (une fois), après schema.sql.
-- Fidélité : compte à la création du profil, crédit sur commande (trigger), réclamation via RPC.
-- Avis : une note par commande terminée, réservée au propriétaire de la commande.

-- 1) Ligne fidélité pour chaque nouveau profil client
create or replace function public.ensure_loyalty_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'customer' then
    insert into public.loyalty_accounts (user_id) values (new.id)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_ensure_loyalty on public.profiles;
create trigger profiles_ensure_loyalty
after insert on public.profiles
for each row execute function public.ensure_loyalty_account();

-- Rattrapage profils existants
insert into public.loyalty_accounts (user_id)
select id from public.profiles where role = 'customer'
on conflict (user_id) do nothing;

create unique index if not exists loyalty_events_order_kind_unique
on public.loyalty_events (order_id, kind)
where order_id is not null;

-- 2) Points + dépenses + débit crédit récompense uniquement quand la commande est terminée
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

-- 3) Réclamation récompense (sécurisée côté serveur)
create or replace function public.claim_loyalty_reward(p_threshold int default 10)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  acc record;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into acc from public.loyalty_accounts where user_id = uid for update;
  if not found then
    insert into public.loyalty_accounts (user_id) values (uid) returning * into acc;
  end if;
  if acc.points < p_threshold then
    raise exception 'points_insufficient';
  end if;
  update public.loyalty_accounts
  set
    points = points - p_threshold,
    rewards_claimed = rewards_claimed + 1,
    reward_credits = reward_credits + 1,
    updated_at = now()
  where user_id = uid
  returning * into acc;
  insert into public.loyalty_events (user_id, order_id, points, kind, description)
  values (uid, null, -p_threshold, 'reward_claim', 'Récompense fidélité réclamée');
  return to_jsonb(acc);
end;
$$;

grant execute on function public.claim_loyalty_reward(int) to authenticated;

-- 4) Avis : une commande = un avis max ; insert seulement si commande terminée et au client
drop policy if exists "reviews own insert" on public.reviews;
create policy "reviews own insert" on public.reviews
for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.orders o
    where o.id = order_id
      and o.user_id = auth.uid()
      and o.status = 'Terminée'
  )
);

create unique index if not exists reviews_one_per_order on public.reviews (order_id);
