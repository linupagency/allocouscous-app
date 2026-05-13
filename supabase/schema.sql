-- Allo Couscous V1 schema
-- À coller dans Supabase > SQL Editor > Run.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('customer', 'kitchen', 'manager', 'admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum ('Nouvelle', 'Acceptée', 'En préparation', 'Prête', 'Terminée', 'Annulée');
  end if;
  if not exists (select 1 from pg_type where typname = 'coupon_type') then
    create type public.coupon_type as enum ('percent', 'fixed');
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  first_name text not null default '',
  full_name text not null default '',
  phone text not null default '',
  postal_address text not null default '',
  preferred_restaurant_id text,
  role public.app_role not null default 'customer',
  marketing_consent boolean not null default false,
  marketing_push_consent boolean not null default false,
  welcome_email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists first_name text not null default '';
alter table public.profiles add column if not exists marketing_push_consent boolean not null default false;
alter table public.profiles add column if not exists welcome_email_sent_at timestamptz;

create table if not exists public.restaurants (
  id text primary key,
  name text not null,
  address text not null,
  phone text not null,
  hours text not null,
  schedule jsonb not null default '[]'::jsonb,
  capacity_per_slot integer not null default 4,
  accepting_orders boolean not null default true,
  exceptional_closed_until timestamptz,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id text primary key,
  label text not null unique,
  description text not null default '',
  display_order integer not null default 0,
  image_url text not null default '',
  restaurant_ids text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  name text not null,
  description text not null default '',
  category text not null references public.categories(label) on update cascade,
  price numeric(10,2) not null check (price >= 0),
  prep_minutes integer not null default 10 check (prep_minutes >= 0),
  available boolean not null default true,
  image_url text not null default '',
  extras jsonb not null default '[]'::jsonb,
  restaurant_ids text[] not null default '{}',
  labels text[] not null default '{}',
  allergens text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.offers (
  id text primary key,
  title text not null,
  body text not null,
  image_url text not null default '',
  restaurant_id text references public.restaurants(id) on delete set null,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  active boolean not null default true,
  type public.coupon_type not null default 'percent',
  value numeric(10,2) not null check (value > 0),
  min_amount numeric(10,2) not null default 0 check (min_amount >= 0),
  used integer not null default 0 check (used >= 0),
  max_uses integer not null default 1 check (max_uses > 0),
  restaurant_id text references public.restaurants(id) on delete set null,
  first_order_only boolean not null default false,
  loyal_customers_only boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  restaurant_id text not null references public.restaurants(id),
  customer_name text not null,
  customer_phone text not null,
  customer_email text not null,
  customer_postal_address text not null default '',
  pickup_at timestamptz not null,
  status public.order_status not null default 'Nouvelle',
  total numeric(10,2) not null check (total >= 0),
  coupon_code text,
  loyalty_discount numeric(10,2) not null default 0,
  payment_method text not null default 'Paiement au retrait',
  notify_when_ready boolean not null default true,
  is_preorder boolean not null default false,
  tracking_token text not null default encode(gen_random_bytes(18), 'hex'),
  refusal_reason text not null default '',
  estimated_prep_minutes integer not null default 10,
  items jsonb not null default '[]'::jsonb,
  internal_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loyalty_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  points integer not null default 0 check (points >= 0),
  total_spent numeric(10,2) not null default 0 check (total_spent >= 0),
  rewards_claimed integer not null default 0 check (rewards_claimed >= 0),
  reward_credits integer not null default 0 check (reward_credits >= 0),
  tier text not null default 'Bronze',
  updated_at timestamptz not null default now()
);

create table if not exists public.loyalty_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id text references public.orders(id) on delete set null,
  points integer not null,
  kind text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists loyalty_events_order_kind_unique
on public.loyalty_events (order_id, kind)
where order_id is not null;

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.push_campaigns (
  id text primary key,
  title text not null,
  message text not null,
  audience text not null,
  created_at timestamptz not null default now()
);

-- Jetons Expo par utilisateur pour les campagnes push « offres » (consentement marketing_push_consent).
create table if not exists public.marketing_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null,
  user_id uuid references auth.users(id) on delete cascade,
  order_id text references public.orders(id) on delete cascade,
  restaurant_id text references public.restaurants(id) on delete set null,
  customer_email text not null default '',
  platform text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (token, order_id)
);

create table if not exists public.email_campaigns (
  id text primary key,
  title text not null,
  message text not null,
  audience text not null,
  sent_count integer not null default 0 check (sent_count >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.admin_activity_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    first_name,
    full_name,
    phone,
    postal_address,
    preferred_restaurant_id,
    marketing_consent,
    marketing_push_consent,
    role
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'postal_address', ''),
    nullif(new.raw_user_meta_data->>'preferred_restaurant_id', ''),
    coalesce((new.raw_user_meta_data->>'marketing_consent')::boolean, false),
    coalesce((new.raw_user_meta_data->>'marketing_push_consent')::boolean, false),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists set_restaurants_updated_at on public.restaurants;
create trigger set_restaurants_updated_at before update on public.restaurants for each row execute function public.set_updated_at();

drop trigger if exists set_categories_updated_at on public.categories;
create trigger set_categories_updated_at before update on public.categories for each row execute function public.set_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at before update on public.products for each row execute function public.set_updated_at();

drop trigger if exists set_offers_updated_at on public.offers;
create trigger set_offers_updated_at before update on public.offers for each row execute function public.set_updated_at();

drop trigger if exists set_coupons_updated_at on public.coupons;
create trigger set_coupons_updated_at before update on public.coupons for each row execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at before update on public.orders for each row execute function public.set_updated_at();

drop trigger if exists set_push_tokens_updated_at on public.push_tokens;
create trigger set_push_tokens_updated_at before update on public.push_tokens for each row execute function public.set_updated_at();

drop trigger if exists set_marketing_push_tokens_updated_at on public.marketing_push_tokens;
create trigger set_marketing_push_tokens_updated_at before update on public.marketing_push_tokens for each row execute function public.set_updated_at();

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('kitchen', 'manager', 'admin')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('manager', 'admin')
  );
$$;

alter table public.profiles enable row level security;
alter table public.restaurants enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.offers enable row level security;
alter table public.coupons enable row level security;
alter table public.orders enable row level security;
alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_events enable row level security;
alter table public.reviews enable row level security;
alter table public.push_campaigns enable row level security;
alter table public.marketing_push_tokens enable row level security;
alter table public.push_tokens enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.admin_activity_log enable row level security;

alter table public.orders replica identity full;
alter table public.restaurants replica identity full;
alter table public.categories replica identity full;
alter table public.products replica identity full;
alter table public.offers replica identity full;
alter table public.coupons replica identity full;
alter table public.orders add column if not exists is_preorder boolean not null default false;
alter table public.orders add column if not exists tracking_token text not null default encode(gen_random_bytes(18), 'hex');
alter table public.orders add column if not exists refusal_reason text not null default '';
alter table public.orders add column if not exists estimated_prep_minutes integer not null default 10;
alter table public.categories add column if not exists restaurant_ids text[] not null default '{}';
alter table public.products add column if not exists restaurant_ids text[] not null default '{}';
alter table public.restaurants add column if not exists schedule jsonb not null default '[]'::jsonb;
alter table public.restaurants add column if not exists archived boolean not null default false;
alter table public.push_tokens add column if not exists order_id text references public.orders(id) on delete cascade;
alter table public.push_tokens add column if not exists restaurant_id text references public.restaurants(id) on delete set null;
alter table public.push_tokens add column if not exists customer_email text not null default '';
alter table public.push_tokens add column if not exists platform text not null default '';
alter table public.push_tokens add column if not exists enabled boolean not null default true;
alter table public.push_tokens add column if not exists updated_at timestamptz not null default now();
alter table public.push_tokens add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists orders_tracking_token_idx on public.orders (id, tracking_token);
create index if not exists push_tokens_order_idx on public.push_tokens (order_id);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.get_order_tracking(p_order_id text, p_tracking_token text)
returns setof public.orders
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.orders
  where id = p_order_id
    and tracking_token = p_tracking_token
  limit 1;
$$;

grant execute on function public.get_order_tracking(text, text) to anon, authenticated;

create or replace function public.cancel_customer_order(p_order_id text, p_tracking_token text)
returns setof public.orders
language sql
security definer
set search_path = public
as $$
  update public.orders
  set
    status = 'Annulée',
    refusal_reason = 'Commande annulée par le client',
    internal_note = 'Commande annulée par le client',
    updated_at = now()
  where id = p_order_id
    and tracking_token = p_tracking_token
    and status = 'Nouvelle'
  returning *;
$$;

grant execute on function public.cancel_customer_order(text, text) to anon, authenticated;

create or replace function public.orders_increment_coupon_used()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.coupon_code is not null and trim(new.coupon_code) <> '' then
    update public.coupons
    set
      used = used + 1,
      updated_at = now()
    where lower(trim(code)) = lower(trim(new.coupon_code))
      and active = true
      and used < max_uses;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_after_insert_increment_coupon on public.orders;
create trigger orders_after_insert_increment_coupon
after insert on public.orders
for each row execute function public.orders_increment_coupon_used();

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

do $$
begin
  alter publication supabase_realtime add table public.orders;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.restaurants;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.categories;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.products;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.offers;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.coupons;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

drop policy if exists "profiles own read" on public.profiles;
create policy "profiles own read" on public.profiles for select using (auth.uid() = id or public.is_staff());
drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own update" on public.profiles for update using (auth.uid() = id or public.is_admin()) with check (auth.uid() = id or public.is_admin());
drop policy if exists "profiles own insert" on public.profiles;
create policy "profiles own insert" on public.profiles for insert with check (auth.uid() = id or public.is_admin());

drop policy if exists "public restaurants read" on public.restaurants;
create policy "public restaurants read" on public.restaurants for select using (true);
drop policy if exists "staff restaurants write" on public.restaurants;
create policy "staff restaurants write" on public.restaurants for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

drop policy if exists "public categories read" on public.categories;
create policy "public categories read" on public.categories for select using (active = true or public.is_staff());
drop policy if exists "staff categories write" on public.categories;
create policy "staff categories write" on public.categories for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

drop policy if exists "public products read" on public.products;
create policy "public products read" on public.products for select using (true);
drop policy if exists "staff products write" on public.products;
create policy "staff products write" on public.products for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

drop policy if exists "public active offers read" on public.offers;
create policy "public active offers read" on public.offers for select using (active = true or public.is_staff());
drop policy if exists "staff offers write" on public.offers;
create policy "staff offers write" on public.offers for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

drop policy if exists "public active coupons read" on public.coupons;
create policy "public active coupons read" on public.coupons for select using (active = true or public.is_staff());
drop policy if exists "staff coupons write" on public.coupons;
create policy "staff coupons write" on public.coupons for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

drop policy if exists "orders own or staff read" on public.orders;
create policy "orders own or staff read" on public.orders for select using (user_id = auth.uid() or public.is_staff());
drop policy if exists "orders create authenticated" on public.orders;
create policy "orders create authenticated" on public.orders for insert with check (auth.uid() = user_id and user_id is not null);
drop policy if exists "orders staff update" on public.orders;
create policy "orders staff update" on public.orders for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists "loyalty own read" on public.loyalty_accounts;
create policy "loyalty own read" on public.loyalty_accounts for select using (user_id = auth.uid() or public.is_staff());
drop policy if exists "loyalty staff write" on public.loyalty_accounts;
create policy "loyalty staff write" on public.loyalty_accounts for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

drop policy if exists "loyalty events own read" on public.loyalty_events;
create policy "loyalty events own read" on public.loyalty_events for select using (user_id = auth.uid() or public.is_staff());
drop policy if exists "loyalty events staff write" on public.loyalty_events;
create policy "loyalty events staff write" on public.loyalty_events for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

drop policy if exists "reviews own or staff read" on public.reviews;
create policy "reviews own or staff read" on public.reviews for select using (user_id = auth.uid() or public.is_staff());
drop policy if exists "reviews own insert" on public.reviews;
create policy "reviews own insert" on public.reviews for insert with check (user_id = auth.uid());

drop policy if exists "push staff read" on public.push_campaigns;
create policy "push staff read" on public.push_campaigns for select using (public.is_staff());
drop policy if exists "push staff write" on public.push_campaigns;
create policy "push staff write" on public.push_campaigns for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

drop policy if exists "marketing push tokens own select" on public.marketing_push_tokens;
create policy "marketing push tokens own select" on public.marketing_push_tokens for select using (auth.uid() = user_id);
drop policy if exists "marketing push tokens own insert" on public.marketing_push_tokens;
create policy "marketing push tokens own insert" on public.marketing_push_tokens for insert with check (auth.uid() = user_id);
drop policy if exists "marketing push tokens own update" on public.marketing_push_tokens;
create policy "marketing push tokens own update" on public.marketing_push_tokens for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "marketing push tokens own delete" on public.marketing_push_tokens;
create policy "marketing push tokens own delete" on public.marketing_push_tokens for delete using (auth.uid() = user_id);
drop policy if exists "marketing push tokens staff all" on public.marketing_push_tokens;
create policy "marketing push tokens staff all" on public.marketing_push_tokens for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

drop policy if exists "push tokens public insert" on public.push_tokens;
create policy "push tokens public insert" on public.push_tokens for insert with check (
  auth.uid() is not null and user_id is not null and auth.uid() = user_id
);
drop policy if exists "push tokens own update" on public.push_tokens;
create policy "push tokens own update" on public.push_tokens for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "push tokens staff read" on public.push_tokens;
create policy "push tokens staff read" on public.push_tokens for select using (public.is_staff());
drop policy if exists "push tokens staff write" on public.push_tokens;
create policy "push tokens staff write" on public.push_tokens for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

drop policy if exists "email campaigns staff read" on public.email_campaigns;
create policy "email campaigns staff read" on public.email_campaigns for select using (public.is_staff());
drop policy if exists "email campaigns staff write" on public.email_campaigns;
create policy "email campaigns staff write" on public.email_campaigns for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

drop policy if exists "activity admin read" on public.admin_activity_log;
create policy "activity admin read" on public.admin_activity_log for select using (public.is_admin());
drop policy if exists "activity staff insert" on public.admin_activity_log;
create policy "activity staff insert" on public.admin_activity_log for insert with check (public.is_staff());

drop policy if exists "public product images read" on storage.objects;
create policy "public product images read"
on storage.objects for select
using (bucket_id = 'product-images');

drop policy if exists "staff product images insert" on storage.objects;
create policy "staff product images insert"
on storage.objects for insert
with check (bucket_id = 'product-images' and public.is_manager_or_admin());

drop policy if exists "staff product images update" on storage.objects;
create policy "staff product images update"
on storage.objects for update
using (bucket_id = 'product-images' and public.is_manager_or_admin())
with check (bucket_id = 'product-images' and public.is_manager_or_admin());

drop policy if exists "staff product images delete" on storage.objects;
create policy "staff product images delete"
on storage.objects for delete
using (bucket_id = 'product-images' and public.is_manager_or_admin());

insert into public.restaurants (id, name, address, phone, hours, capacity_per_slot)
values
  ('lille', 'Allo Couscous Lille', '19 Boulevard Montebello, 59000 Lille', '03 20 40 27 37', '11:00-14:00 · 17:00-21:00', 4),
  ('armentieres', 'Allo Couscous Armentières', '66 rue de Dunkerque, 59280 Armentières', '03 20 73 63 03', '11:00-14:00 · 17:30-21:30', 3)
on conflict (id) do update set
  name = excluded.name,
  address = excluded.address,
  phone = excluded.phone,
  hours = excluded.hours,
  capacity_per_slot = excluded.capacity_per_slot;

insert into public.categories (id, label, description, display_order)
values
  ('Entrées', 'Entrées', 'Entrées traditionnelles', 10),
  ('Couscous', 'Couscous', 'Couscous généreux', 20),
  ('Suppléments', 'Suppléments', 'Accompagnements', 30),
  ('Tajines', 'Tajines', 'Tajines mijotés', 40),
  ('Pâtisseries', 'Pâtisseries', 'Pâtisseries maison', 50),
  ('Boissons', 'Boissons', 'Boissons fraîches et chaudes', 60)
on conflict (id) do update set
  label = excluded.label,
  description = excluded.description,
  display_order = excluded.display_order;

insert into public.offers (id, title, body, image_url, active)
values
  ('tajines-week', 'Découvrez nos Tajines', 'Cette semaine, tous nos tajines sont à l''honneur : agneau, poulet, kefta...', 'https://images.unsplash.com/photo-1541518763669-27fef04b14ea?auto=format&fit=crop&w=900&q=80', true)
on conflict (id) do update set
  title = excluded.title,
  body = excluded.body,
  image_url = excluded.image_url,
  active = excluded.active;

insert into public.products (id, name, description, category, price, prep_minutes, available, image_url, extras, labels, allergens)
values
  (
    'feuillete-kefta',
    'Feuilleté farci "Kefta"',
    'Feuilleté doré garni de viande hachée épicée.',
    'Entrées',
    8.50,
    10,
    true,
    'https://images.unsplash.com/photo-1541518763669-27fef04b14ea?auto=format&fit=crop&w=900&q=80',
    '[{"id":"harissa","name":"Harissa maison","price":0.5},{"id":"salade","name":"Petite salade","price":2}]'::jsonb,
    array['Épicé'],
    array['Gluten','Œuf']
  ),
  (
    'pastilla-poulet',
    'Pastilla poulet ou agneau',
    'Pastilla croustillante, parfumée aux épices douces.',
    'Entrées',
    10.00,
    10,
    true,
    'https://images.unsplash.com/photo-1541518763669-27fef04b14ea?auto=format&fit=crop&w=900&q=80',
    '[{"id":"citron","name":"Citron confit","price":1}]'::jsonb,
    array['Maison'],
    array['Gluten','Fruits à coque']
  ),
  (
    'couscous-royal',
    'Couscous Royal',
    'Semoule fine, légumes, merguez, brochette et boulette.',
    'Couscous',
    25.00,
    25,
    true,
    'https://images.unsplash.com/photo-1579027989536-b7b1f875659b?auto=format&fit=crop&w=900&q=80',
    '[{"id":"semoule","name":"Semoule supplémentaire","price":3},{"id":"bouillon","name":"Bouillon légumes","price":2}]'::jsonb,
    array['Signature'],
    array['Gluten']
  ),
  (
    'tajine-pruneaux-poulet',
    'Poulet, pruneaux, amandes',
    'Tajine sucré-salé au poulet, pruneaux et amandes grillées.',
    'Tajines',
    19.00,
    25,
    true,
    'https://images.unsplash.com/photo-1541518763669-27fef04b14ea?auto=format&fit=crop&w=900&q=80',
    '[{"id":"amandes","name":"Amandes grillées","price":1.5}]'::jsonb,
    array['Sucré salé'],
    array['Fruits à coque']
  ),
  (
    'supplement-semoule',
    'Supplément semoule',
    'Portion de semoule fine vapeur.',
    'Suppléments',
    6.00,
    2,
    true,
    'https://images.unsplash.com/photo-1579027989536-b7b1f875659b?auto=format&fit=crop&w=900&q=80',
    '[]'::jsonb,
    array['Végétarien'],
    array['Gluten']
  ),
  (
    'corne-gazelle',
    'Corne de gazelle',
    'Pâtisserie aux amandes en forme de croissant.',
    'Pâtisseries',
    1.50,
    1,
    true,
    'https://images.unsplash.com/photo-1483695028939-5bb13f8648b0?auto=format&fit=crop&w=900&q=80',
    '[]'::jsonb,
    array['Maison'],
    array['Gluten','Fruits à coque']
  ),
  (
    'the-menthe',
    'Thé à la menthe',
    'Thé vert à la menthe fraîche.',
    'Boissons',
    2.00,
    1,
    true,
    'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=900&q=80',
    '[]'::jsonb,
    array['Sans alcool'],
    array[]::text[]
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  price = excluded.price,
  prep_minutes = excluded.prep_minutes,
  available = excluded.available,
  image_url = excluded.image_url,
  extras = excluded.extras,
  labels = excluded.labels,
  allergens = excluded.allergens;

insert into public.coupons (code, active, type, value, min_amount, used, max_uses)
values ('PROMO10', true, 'percent', 10, 20, 0, 5)
on conflict (code) do update set
  active = excluded.active,
  type = excluded.type,
  value = excluded.value,
  min_amount = excluded.min_amount,
  max_uses = excluded.max_uses;

-- Après avoir créé le compte admin@allocouscous.fr dans Supabase Auth,
-- relancer uniquement ce bloc si le profil admin n’existe pas encore.
insert into public.profiles (id, email, full_name, role)
select id, email, 'Allo Couscous Admin', 'admin'
from auth.users
where email = 'admin@allocouscous.fr'
on conflict (id) do update set role = 'admin', email = excluded.email;
