-- À exécuter dans Supabase SQL Editor pour durcir l'accès back-office.
-- Objectif :
-- - kitchen : commandes/cuisine uniquement,
-- - manager/admin : gestion complète menu, restaurants, offres, coupons, notifications,
-- - admin : gestion des rôles/profils sensibles.

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

drop policy if exists "loyalty staff write" on public.loyalty_accounts;
create policy "loyalty staff write" on public.loyalty_accounts
for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

drop policy if exists "loyalty events staff write" on public.loyalty_events;
create policy "loyalty events staff write" on public.loyalty_events
for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

drop policy if exists "push staff write" on public.push_campaigns;
create policy "push staff write" on public.push_campaigns
for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

drop policy if exists "marketing push tokens staff all" on public.marketing_push_tokens;
create policy "marketing push tokens staff all" on public.marketing_push_tokens
for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

drop policy if exists "push tokens staff write" on public.push_tokens;
create policy "push tokens staff write" on public.push_tokens
for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

drop policy if exists "email campaigns staff write" on public.email_campaigns;
create policy "email campaigns staff write" on public.email_campaigns
for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

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
