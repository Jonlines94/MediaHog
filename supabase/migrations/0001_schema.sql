-- MediaHog core schema (plain PostgreSQL; runs on Supabase or any Postgres 14+)
-- Money is stored in integer pence to avoid floating point errors.

create extension if not exists pg_trgm;
create extension if not exists pgcrypto;
create extension if not exists unaccent;

-- Accent-insensitive search ("bjork" finds Björk). unaccent() is only STABLE, so wrap it
-- with an explicit dictionary to allow use in an indexed generated column.
create or replace function mh_unaccent(t text) returns text
  language sql immutable parallel safe strict as $$ select unaccent('unaccent', t) $$;

-- ---------------------------------------------------------------------------
-- Listings: one row per Discogs LISTING (not per release).
-- discogs_listing_id is the primary matching key for CSV imports.
-- ---------------------------------------------------------------------------
create table listings (
  id                  uuid primary key default gen_random_uuid(),
  discogs_listing_id  bigint not null unique,
  discogs_release_id  bigint,                       -- informational only, never a match key
  artist              text not null default '',
  title               text not null default '',
  label               text,
  catalog_number      text,
  format              text,
  format_group        text,                         -- LP / 12" / 7" / CD / Cassette ... for browsing
  year                integer,
  genres              text[] not null default '{}',
  styles              text[] not null default '{}',
  media_condition     text,
  media_grade         text,                         -- M / NM / VG+ / VG / G+ / G / F / P
  sleeve_condition    text,
  sleeve_grade        text,
  price_pence         integer not null check (price_pence >= 0),
  quantity            integer not null default 1 check (quantity >= 0),
  reserved            integer not null default 0 check (reserved >= 0),
  comments            text,
  external_id         text,                         -- Discogs "external_id" / SKU field
  location            text,
  weight_grams        integer,
  image_path          text,                         -- path in storage; never a Discogs image URL
  status              text not null default 'active'
                        check (status in ('active', 'hidden', 'missing')),
  featured            boolean not null default false,  -- shown in the homepage Featured row
  discogs_listed_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  last_imported_at    timestamptz,
  last_import_id      uuid,
  search              tsvector generated always as (
    to_tsvector('simple', mh_unaccent(
      coalesce(artist, '') || ' ' || coalesce(title, '') || ' ' ||
      coalesce(label, '') || ' ' || coalesce(catalog_number, '')))
  ) stored,
  constraint reserved_within_quantity check (reserved <= quantity)
);

create index listings_search_idx      on listings using gin (search);
create index listings_artist_trgm_idx on listings using gin (artist gin_trgm_ops);
create index listings_title_trgm_idx  on listings using gin (title gin_trgm_ops);
create index listings_genres_idx      on listings using gin (genres);
create index listings_styles_idx      on listings using gin (styles);
create index listings_price_idx       on listings (price_pence);
create index listings_year_idx        on listings (year);
create index listings_format_idx      on listings (format);
create index listings_media_grade_idx on listings (media_grade);
create index listings_format_group_idx on listings (format_group);
create index listings_created_idx     on listings (created_at desc);
create index listings_available_idx   on listings (status, (quantity - reserved));
create index listings_release_idx     on listings (discogs_release_id);
create index listings_featured_idx    on listings (created_at desc) where featured;

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger listings_touch before update on listings
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Imports and stock audit trail
-- ---------------------------------------------------------------------------
create table imports (
  id            uuid primary key default gen_random_uuid(),
  filename      text not null,
  file_sha256   text not null,
  mode          text not null check (mode in ('update', 'reconcile')),
  status        text not null default 'previewed'
                  check (status in ('previewed', 'running', 'completed', 'failed', 'cancelled')),
  total_rows    integer not null default 0,
  processed_rows integer not null default 0,
  summary       jsonb not null default '{}'::jsonb,   -- counts: added/updated/unchanged/missing/errors
  report        jsonb not null default '{}'::jsonb,   -- detailed per-row results and errors
  payload       jsonb,                                -- validated rows awaiting confirmation; cleared once applied
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  created_by    text
);
create index imports_created_idx on imports (created_at desc);

-- Every change to quantity is logged, so discrepancies can be traced.
create table stock_movements (
  id          bigserial primary key,
  listing_id  uuid not null references listings(id) on delete cascade,
  delta       integer not null,
  reason      text not null check (reason in
                ('import', 'order', 'refund', 'discogs_sale', 'manual', 'correction')),
  note        text,
  order_id    uuid,
  import_id   uuid references imports(id) on delete set null,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index stock_movements_listing_idx on stock_movements (listing_id, created_at desc);

-- Flagged mismatches (e.g. CSV says 0 but site shows 1 after a MediaHog sale).
create table stock_discrepancies (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references listings(id) on delete cascade,
  import_id    uuid references imports(id) on delete set null,
  site_quantity integer not null,
  csv_quantity  integer not null,
  note         text,
  resolved     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index stock_discrepancies_open_idx on stock_discrepancies (resolved, created_at desc);

-- ---------------------------------------------------------------------------
-- Settings and shipping
-- ---------------------------------------------------------------------------
create table settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create table shipping_zones (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                    -- UK / Europe / International
  countries     text[] not null default '{}',     -- ISO-3166 alpha-2; empty + is_default = catch-all
  is_default    boolean not null default false,
  first_item_pence      integer not null check (first_item_pence >= 0),
  additional_item_pence integer not null check (additional_item_pence >= 0),
  free_over_pence       integer,                  -- optional free-shipping threshold
  sort_order    integer not null default 0
);
create unique index shipping_zones_one_default on shipping_zones (is_default) where is_default;

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create sequence order_number_seq start 1001;

create table orders (
  id                 uuid primary key default gen_random_uuid(),
  order_number       integer not null unique default nextval('order_number_seq'),
  status             text not null default 'pending'
                       check (status in ('pending', 'paid', 'dispatched', 'cancelled', 'refunded', 'partially_refunded', 'expired')),
  email              text not null,
  customer_name      text not null,
  phone              text,
  ship_line1         text not null,
  ship_line2         text,
  ship_city          text not null,
  ship_region        text,
  ship_postcode      text not null,
  ship_country       char(2) not null,
  subtotal_pence     integer not null check (subtotal_pence >= 0),
  shipping_pence     integer not null check (shipping_pence >= 0),
  total_pence        integer not null check (total_pence >= 0),
  currency           text not null default 'gbp',
  stripe_session_id  text unique,
  stripe_payment_intent text unique,
  paid_at            timestamptz,
  dispatched_at      timestamptz,
  tracking_reference text,
  carrier            text,
  refunded_pence     integer not null default 0,
  reserved_until     timestamptz,
  ip_hash            text,                       -- hashed, only used to limit abandoned-checkout abuse
  confirmation_sent_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index orders_status_idx  on orders (status, created_at desc);
create index orders_created_idx on orders (created_at desc);
create index orders_ip_pending_idx on orders (ip_hash, created_at desc) where status = 'pending';
create trigger orders_touch before update on orders
  for each row execute function touch_updated_at();

create table order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  listing_id    uuid references listings(id) on delete set null,
  -- Snapshot so history survives later edits or deletions
  artist        text not null,
  title         text not null,
  format        text,
  media_condition   text,
  sleeve_condition  text,
  unit_price_pence  integer not null check (unit_price_pence >= 0),
  quantity      integer not null check (quantity > 0)
);
create index order_items_order_idx on order_items (order_id);

-- Stripe webhooks can be delivered more than once; record ids to process each once.
create table processed_stripe_events (
  event_id     text primary key,
  type         text not null,
  processed_at timestamptz not null default now()
);

create table error_log (
  id         bigserial primary key,
  source     text not null,
  message    text not null,
  detail     jsonb,
  created_at timestamptz not null default now()
);
create index error_log_created_idx on error_log (created_at desc);

-- ---------------------------------------------------------------------------
-- Atomic stock functions. These are the ONLY paths that change reserved/quantity
-- for orders, so concurrent checkouts cannot oversell.
-- ---------------------------------------------------------------------------

-- Reserve stock for a pending order. All-or-nothing across all items.
-- items: [{"listing_id": "...", "quantity": 1}, ...]
create or replace function reserve_stock(p_order_id uuid, p_items jsonb, p_hold_minutes integer default 30)
returns jsonb language plpgsql as $$
declare
  it jsonb;
  v_listing uuid;
  v_qty integer;
  v_rows integer;
begin
  -- Lock rows in a stable order so two overlapping baskets cannot deadlock.
  for it in select * from jsonb_array_elements(p_items) order by (value->>'listing_id') loop
    v_listing := (it->>'listing_id')::uuid;
    v_qty := (it->>'quantity')::integer;
    update listings
       set reserved = reserved + v_qty
     where id = v_listing
       and status = 'active'
       and quantity - reserved >= v_qty;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      -- Raising rolls back every reservation made earlier in this call.
      raise exception 'OUT_OF_STOCK:%', v_listing using errcode = 'P0001';
    end if;
  end loop;
  update orders set reserved_until = now() + make_interval(mins => p_hold_minutes)
   where id = p_order_id;
  return jsonb_build_object('ok', true);
end $$;

-- Payment confirmed: turn reservations into real deductions. Idempotent.
create or replace function finalize_order(p_order_id uuid)
returns boolean language plpgsql as $$
declare
  o orders%rowtype;
  r record;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status in ('paid', 'dispatched') then return false; end if;   -- already done

  for r in select listing_id, quantity from order_items
            where order_id = p_order_id and listing_id is not null
            order by listing_id loop
    if o.status = 'expired' or o.status = 'cancelled' then
      -- Reservation was already released; try to take stock again.
      update listings set quantity = quantity - r.quantity
       where id = r.listing_id and quantity - reserved >= r.quantity;
      if not found then
        -- Paid for something we no longer have: still record the order for manual refund.
        insert into error_log (source, message, detail)
        values ('finalize_order', 'Paid order could not get stock after reservation expired',
                jsonb_build_object('order_id', p_order_id, 'listing_id', r.listing_id));
        continue;
      end if;
    else
      update listings
         set quantity = quantity - r.quantity,
             reserved = reserved - r.quantity
       where id = r.listing_id;
    end if;
    insert into stock_movements (listing_id, delta, reason, order_id, note)
    values (r.listing_id, -r.quantity, 'order', p_order_id, 'MediaHog order #' || o.order_number);
  end loop;

  update orders set status = 'paid', paid_at = now(), reserved_until = null
   where id = p_order_id;
  return true;
end $$;

-- Checkout abandoned or expired: give reserved stock back. Idempotent.
create or replace function release_order(p_order_id uuid, p_new_status text default 'expired')
returns boolean language plpgsql as $$
declare
  o orders%rowtype;
  r record;
begin
  select * into o from orders where id = p_order_id for update;
  if not found or o.status <> 'pending' then return false; end if;
  for r in select listing_id, quantity from order_items
            where order_id = p_order_id and listing_id is not null loop
    update listings set reserved = greatest(reserved - r.quantity, 0) where id = r.listing_id;
  end loop;
  update orders set status = p_new_status, reserved_until = null where id = p_order_id;
  return true;
end $$;

-- Sweep: release every pending order whose hold has lapsed.
create or replace function release_expired_orders()
returns integer language plpgsql as $$
declare
  n integer := 0;
  v uuid;
begin
  for v in select id from orders
            where status = 'pending' and reserved_until is not null and reserved_until < now() loop
    if release_order(v, 'expired') then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Manual stock change (e.g. a record sold on Discogs). Never goes below reserved.
create or replace function adjust_stock(p_listing_id uuid, p_delta integer, p_reason text,
                                        p_note text default null, p_user text default null)
returns integer language plpgsql as $$
declare v_new integer;
begin
  update listings set quantity = quantity + p_delta
   where id = p_listing_id and quantity + p_delta >= reserved
   returning quantity into v_new;
  if not found then raise exception 'INVALID_ADJUSTMENT'; end if;
  insert into stock_movements (listing_id, delta, reason, note, created_by)
  values (p_listing_id, p_delta, p_reason, p_note, p_user);
  return v_new;
end $$;

-- Default settings and shipping zones
insert into settings (key, value) values
  ('shop', '{"name":"MediaHog","tagline":"Vinyl. Music. Obsession.","contact_email":"hello@mediahog.co.uk","contact_phone":"","address":"","reservation_minutes":30}'),
  ('policies', '{"returns":"","delivery_info":""}')
on conflict do nothing;

insert into shipping_zones (name, countries, is_default, first_item_pence, additional_item_pence, free_over_pence, sort_order) values
  ('United Kingdom', '{GB}', false, 400, 100, null, 1),
  ('Europe', '{AT,BE,BG,HR,CY,CZ,DK,EE,FI,FR,DE,GR,HU,IE,IT,LV,LT,LU,MT,NL,PL,PT,RO,SK,SI,ES,SE,NO,CH,IS}', false, 1000, 200, null, 2),
  ('International', '{}', true, 1800, 400, null, 3);
