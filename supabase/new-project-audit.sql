-- Audit nouveau projet Supabase Allo Couscous.
-- À lancer dans Supabase SQL Editor.
-- Chaque bloc renvoie un résultat lisible pour vérifier ce qui manque.

select 'admin_profile' as check_name, id, email, role
from public.profiles
where lower(email) = lower('admin@allocouscous.fr');

select 'orders_count' as check_name, count(*) as total_orders
from public.orders;

select 'restaurants_count' as check_name, count(*) as total_restaurants
from public.restaurants
where archived = false;

select 'products_with_old_storage_url' as check_name, count(*) as old_url_count
from public.products
where image_url like '%kkprtmkuflsssfngeebj.supabase.co%';

select 'offers_with_old_storage_url' as check_name, count(*) as old_url_count
from public.offers
where image_url like '%kkprtmkuflsssfngeebj.supabase.co%';

select 'realtime_tables' as check_name, schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('orders', 'restaurants', 'categories', 'products', 'offers', 'coupons')
order by tablename;

select 'orders_policies' as check_name, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'orders'
order by policyname;

select 'staff_write_policies' as check_name, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('restaurants', 'categories', 'products', 'offers', 'coupons')
  and policyname like 'staff%'
order by tablename, policyname;

select 'last_orders' as check_name, id, restaurant_id, customer_email, pickup_at, status, created_at
from public.orders
order by created_at desc
limit 10;
