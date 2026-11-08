-- Dashboard figures. Server-side only (access is revoked from browsers in 0005_security.sql).

create or replace function admin_stats() returns jsonb language sql stable as $$
  with paid as (
    select total_pence, paid_at from orders where status in ('paid', 'dispatched', 'partially_refunded') and paid_at is not null
  )
  select jsonb_build_object(
    'products',         (select count(*) from listings where status = 'active'),
    'available',        (select coalesce(sum(greatest(quantity - reserved, 0)), 0) from listings where status = 'active'),
    'out_of_stock',     (select count(*) from listings where status = 'active' and quantity - reserved <= 0),
    'not_for_sale',     (select count(*) from listings where status <> 'active'),
    'sales_today_pence',(select coalesce(sum(total_pence), 0) from paid where paid_at >= date_trunc('day', now())),
    'sales_7d_pence',   (select coalesce(sum(total_pence), 0) from paid where paid_at >= now() - interval '7 days'),
    'sales_30d_pence',  (select coalesce(sum(total_pence), 0) from paid where paid_at >= now() - interval '30 days'),
    'orders_30d',       (select count(*) from paid where paid_at >= now() - interval '30 days'),
    'to_dispatch',      (select count(*) from orders where status = 'paid'),
    'open_flags',       (select count(*) from stock_discrepancies where not resolved),
    'errors_7d',        (select count(*) from error_log where created_at > now() - interval '7 days'),
    'last_import_at',   (select max(completed_at) from imports where mode = 'update' and status = 'completed')
  );
$$;

create or replace function sales_by_day(p_days int default 30)
returns table (day date, orders bigint, pence bigint) language sql stable as $$
  select d::date, count(o.id), coalesce(sum(o.total_pence), 0)::bigint
    from generate_series(current_date - (greatest(p_days, 1) - 1), current_date, interval '1 day') d
    left join orders o on o.paid_at::date = d::date and o.status in ('paid', 'dispatched', 'partially_refunded')
   group by 1 order by 1;
$$;
