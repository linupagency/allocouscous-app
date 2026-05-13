-- Réparation après changement de projet Supabase.
-- À exécuter dans Supabase SQL Editor sur le nouveau projet si les statuts,
-- horaires, produits, catégories ou offres ne se mettent pas à jour en direct.
-- Ce script ne supprime aucune donnée.

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

insert into public.profiles (id, email, full_name, role)
select id, email, 'Allo Couscous Admin', 'admin'
from auth.users
where lower(email) = lower('admin@allocouscous.fr')
on conflict (id) do update set
  email = excluded.email,
  role = 'admin';

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.restaurants enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.offers enable row level security;
alter table public.coupons enable row level security;

drop policy if exists "profiles own read" on public.profiles;
create policy "profiles own read" on public.profiles
for select using (auth.uid() = id or public.is_staff());

drop policy if exists "orders own or staff read" on public.orders;
create policy "orders own or staff read" on public.orders
for select using (user_id = auth.uid() or public.is_staff());

drop policy if exists "orders staff update" on public.orders;
create policy "orders staff update" on public.orders
for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists "staff restaurants write" on public.restaurants;
create policy "staff restaurants write" on public.restaurants
for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

drop policy if exists "staff categories write" on public.categories;
create policy "staff categories write" on public.categories
for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

drop policy if exists "staff products write" on public.products;
create policy "staff products write" on public.products
for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

drop policy if exists "staff offers write" on public.offers;
create policy "staff offers write" on public.offers
for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

drop policy if exists "staff coupons write" on public.coupons;
create policy "staff coupons write" on public.coupons
for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

alter table public.orders replica identity full;
alter table public.restaurants replica identity full;
alter table public.categories replica identity full;
alter table public.products replica identity full;
alter table public.offers replica identity full;
alter table public.coupons replica identity full;

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
