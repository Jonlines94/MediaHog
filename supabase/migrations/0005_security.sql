-- Supabase security layer. Run LAST (after all other migrations).
-- All writes go through server-side code using the service role key, which bypasses RLS.
-- The browser (anon key) can only READ active listings and public shipping/shop info.

create table admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email   text not null,
  created_at timestamptz not null default now()
);

alter table listings                enable row level security;
alter table imports                 enable row level security;
alter table stock_movements         enable row level security;
alter table stock_discrepancies     enable row level security;
alter table settings                enable row level security;
alter table shipping_zones          enable row level security;
alter table orders                  enable row level security;
alter table order_items             enable row level security;
alter table processed_stripe_events enable row level security;
alter table error_log               enable row level security;
alter table admins                  enable row level security;

-- Public, read-only
create policy "public can read active listings" on listings
  for select to anon, authenticated using (status = 'active');
create policy "public can read shipping zones" on shipping_zones
  for select to anon, authenticated using (true);
create policy "public can read shop settings" on settings
  for select to anon, authenticated using (key in ('shop', 'policies'));

-- No other policies: orders, imports, stock data, logs and admins are only
-- reachable with the service role key (server-side only).

-- Stock functions must not be callable from the browser.
revoke execute on function reserve_stock(uuid, jsonb, integer) from public, anon, authenticated;
revoke execute on function finalize_order(uuid)                from public, anon, authenticated;
revoke execute on function release_order(uuid, text)           from public, anon, authenticated;
revoke execute on function release_expired_orders()            from public, anon, authenticated;
revoke execute on function adjust_stock(uuid, integer, text, text, text) from public, anon, authenticated;

revoke execute on function apply_import_batch(uuid, jsonb)             from public, anon, authenticated;
revoke execute on function resolve_missing(uuid, uuid[], text, text)    from public, anon, authenticated;
revoke execute on function admin_stats()      from public, anon, authenticated;
revoke execute on function sales_by_day(int)  from public, anon, authenticated;

-- Storage bucket for artwork: public read, server-side write.
insert into storage.buckets (id, name, public) values ('artwork', 'artwork', true)
on conflict (id) do nothing;

-- Safety net: which of our own functions can a browser call? Run this in the Supabase SQL editor after
-- any future migration. The ONLY rows expected are the three public catalogue functions plus two harmless
-- helpers (search_listings, catalogue_facets, listing_detail, mh_unaccent, touch_updated_at).
-- Anything else means a new function needs a "revoke execute ... from public, anon, authenticated".
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute')
--      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')  -- skip extension functions
--    order by 1;
