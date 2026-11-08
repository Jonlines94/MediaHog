-- Atomic import batch. Called with already-validated rows (see src/lib/importer).
-- Rules for EXISTING listings (matched on discogs_listing_id, never release id):
--   * prices, conditions, text fields: overwritten from the CSV
--   * CSV quantity LOWER than site  -> reduce (item sold on Discogs), never below reserved
--   * CSV quantity HIGHER than site -> keep site quantity and FLAG a discrepancy
--     (the most likely cause is a MediaHog sale not yet reflected on Discogs)
--   * an admin-hidden listing stays hidden; a 'missing' one that reappears is re-activated
-- Running the same file twice changes nothing, because identical rows compare equal.

create or replace function apply_import_batch(p_import_id uuid, p_rows jsonb)
returns jsonb language plpgsql as $$
declare
  r jsonb;
  cur listings%rowtype;
  v_id bigint;
  v_qty integer;
  v_new_qty integer;
  v_added integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_flagged integer := 0;
  v_changed boolean;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    v_id  := (r->>'listing_id')::bigint;
    v_qty := coalesce((r->>'quantity')::integer, 1);

    select * into cur from listings where discogs_listing_id = v_id for update;

    if not found then
      insert into listings (
        discogs_listing_id, discogs_release_id, artist, title, label, catalog_number,
        format, format_group, year, genres, styles,
        media_condition, media_grade, sleeve_condition, sleeve_grade,
        price_pence, quantity, comments, external_id, location, weight_grams,
        discogs_listed_at, status, last_imported_at, last_import_id)
      values (
        v_id, nullif(r->>'release_id','')::bigint,
        coalesce(r->>'artist',''), coalesce(r->>'title',''), r->>'label', r->>'catalog_number',
        r->>'format', r->>'format_group', nullif(r->>'year','')::integer,
        coalesce(array(select jsonb_array_elements_text(coalesce(r->'genres','[]'::jsonb))), '{}'),
        coalesce(array(select jsonb_array_elements_text(coalesce(r->'styles','[]'::jsonb))), '{}'),
        r->>'media_condition', r->>'media_grade', r->>'sleeve_condition', r->>'sleeve_grade',
        (r->>'price_pence')::integer, v_qty, r->>'comments', r->>'external_id', r->>'location',
        nullif(r->>'weight_grams','')::integer,
        nullif(r->>'listed_at','')::timestamptz,
        case when v_qty > 0 then 'active' else 'hidden' end, now(), p_import_id);
      insert into stock_movements (listing_id, delta, reason, import_id, note)
        select id, v_qty, 'import', p_import_id, 'New listing from CSV'
          from listings where discogs_listing_id = v_id;
      v_added := v_added + 1;
      continue;
    end if;

    -- Quantity rules
    v_new_qty := cur.quantity;
    if v_qty < cur.quantity then
      v_new_qty := greatest(v_qty, cur.reserved);
    elsif v_qty > cur.quantity then
      if not exists (select 1 from stock_discrepancies
                      where listing_id = cur.id and not resolved and csv_quantity = v_qty) then
        insert into stock_discrepancies (listing_id, import_id, site_quantity, csv_quantity, note)
        values (cur.id, p_import_id, cur.quantity, v_qty,
                'CSV shows more stock than the website. Possibly sold on MediaHog; not changed.');
        v_flagged := v_flagged + 1;
      end if;
    end if;

    v_changed :=
         cur.discogs_release_id is distinct from nullif(r->>'release_id','')::bigint
      or cur.artist             is distinct from coalesce(r->>'artist','')
      or cur.title              is distinct from coalesce(r->>'title','')
      or cur.label              is distinct from (r->>'label')
      or cur.catalog_number     is distinct from (r->>'catalog_number')
      or cur.format             is distinct from (r->>'format')
      or cur.format_group       is distinct from (r->>'format_group')
      or cur.media_condition    is distinct from (r->>'media_condition')
      or cur.media_grade        is distinct from (r->>'media_grade')
      or cur.sleeve_condition   is distinct from (r->>'sleeve_condition')
      or cur.sleeve_grade       is distinct from (r->>'sleeve_grade')
      or cur.price_pence        is distinct from (r->>'price_pence')::integer
      or cur.comments           is distinct from (r->>'comments')
      or cur.external_id        is distinct from (r->>'external_id')
      or cur.location           is distinct from (r->>'location')
      or cur.weight_grams       is distinct from nullif(r->>'weight_grams','')::integer
      or cur.quantity           is distinct from v_new_qty
      or (cur.status = 'missing' and v_new_qty > 0)
      or (r ? 'year'   and cur.year   is distinct from nullif(r->>'year','')::integer)
      or (r ? 'genres' and cur.genres is distinct from
            coalesce(array(select jsonb_array_elements_text(r->'genres')), '{}'))
      or (r ? 'styles' and cur.styles is distinct from
            coalesce(array(select jsonb_array_elements_text(r->'styles')), '{}'));

    if v_changed then
      update listings set
        discogs_release_id = nullif(r->>'release_id','')::bigint,
        artist = coalesce(r->>'artist',''), title = coalesce(r->>'title',''),
        label = r->>'label', catalog_number = r->>'catalog_number',
        format = r->>'format', format_group = r->>'format_group',
        media_condition = r->>'media_condition', media_grade = r->>'media_grade',
        sleeve_condition = r->>'sleeve_condition', sleeve_grade = r->>'sleeve_grade',
        price_pence = (r->>'price_pence')::integer,
        comments = r->>'comments', external_id = r->>'external_id', location = r->>'location',
        weight_grams = nullif(r->>'weight_grams','')::integer,
        year   = case when r ? 'year'   then nullif(r->>'year','')::integer else year end,
        genres = case when r ? 'genres' then coalesce(array(select jsonb_array_elements_text(r->'genres')), '{}') else genres end,
        styles = case when r ? 'styles' then coalesce(array(select jsonb_array_elements_text(r->'styles')), '{}') else styles end,
        quantity = v_new_qty,
        status = case when status = 'missing' and v_new_qty > 0 then 'active' else status end,
        last_imported_at = now(), last_import_id = p_import_id
      where id = cur.id;
      if v_new_qty <> cur.quantity then
        insert into stock_movements (listing_id, delta, reason, import_id, note)
        values (cur.id, v_new_qty - cur.quantity, 'import', p_import_id, 'Quantity reduced by CSV');
      end if;
      v_updated := v_updated + 1;
    else
      update listings set last_imported_at = now(), last_import_id = p_import_id where id = cur.id;
      v_unchanged := v_unchanged + 1;
    end if;
  end loop;

  update imports set processed_rows = processed_rows + jsonb_array_length(p_rows) where id = p_import_id;

  return jsonb_build_object('added', v_added, 'updated', v_updated,
                            'unchanged', v_unchanged, 'flagged', v_flagged);
end $$;

-- Explicit, admin-confirmed handling of listings that were absent from a CSV.
-- Nothing is ever deleted: 'hide' removes from the shop, 'zero' sets stock to 0 (and logs it).
create or replace function resolve_missing(p_import_id uuid, p_listing_ids uuid[], p_action text, p_user text default null)
returns integer language plpgsql as $$
declare n integer := 0; l listings%rowtype; v_lid uuid;
begin
  if p_action not in ('hide', 'zero') then raise exception 'BAD_ACTION'; end if;
  foreach v_lid in array p_listing_ids loop
    select * into l from listings where listings.id = v_lid for update;
    if not found then continue; end if;
    if p_action = 'hide' then
      update listings set status = 'missing' where listings.id = v_lid;
    else
      update listings set quantity = reserved, status = 'missing' where listings.id = v_lid;
      if l.quantity - l.reserved <> 0 then
        insert into stock_movements (listing_id, delta, reason, import_id, note, created_by)
        values (v_lid, -(l.quantity - l.reserved), 'discogs_sale', p_import_id,
                'Absent from Discogs CSV; confirmed by admin', p_user);
      end if;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
