-- Public catalogue queries. Run after 0001 (order vs 0003 does not matter).
-- search_listings: prefix full-text search ("pink flo" finds Pink Floyd) + facet filters + paging.
-- Returns the total match count on every row so the UI needs only one query per page.

create or replace function search_listings(
  p_q text default null, p_format text default null, p_genre text default null, p_style text default null,
  p_grades text[] default null, p_year_min int default null, p_year_max int default null,
  p_price_min int default null, p_price_max int default null, p_artist text default null,
  p_sort text default 'newest', p_limit int default 24, p_offset int default 0, p_in_stock boolean default true
) returns table (
  id uuid, discogs_listing_id bigint, artist text, title text, label text, catalog_number text,
  format text, format_group text, year int, media_condition text, media_grade text,
  sleeve_condition text, sleeve_grade text, price_pence int, available int, image_path text,
  created_at timestamptz, total bigint
) language plpgsql stable as $$
declare
  v_tsq tsquery;
  v_terms text;
begin
  if p_q is not null and btrim(p_q) <> '' then
    select string_agg(t || ':*', ' & ') into v_terms
      from (select distinct lower(regexp_replace(w, '[^[:alnum:]]', '', 'g')) t
              from unnest(regexp_split_to_array(mh_unaccent(btrim(p_q)), '\s+')) w) s
     where t <> '';
    if v_terms is not null then v_tsq := to_tsquery('simple', v_terms); end if;
  end if;

  return query
  select l.id, l.discogs_listing_id, l.artist, l.title, l.label, l.catalog_number,
         l.format, l.format_group, l.year, l.media_condition, l.media_grade,
         l.sleeve_condition, l.sleeve_grade, l.price_pence, (l.quantity - l.reserved) as available,
         l.image_path, l.created_at, count(*) over () as total
    from listings l
   where l.status = 'active'
     and (not p_in_stock or l.quantity - l.reserved > 0)
     and (v_tsq is null or l.search @@ v_tsq)
     and (p_format is null or l.format_group = p_format)
     and (p_genre  is null or p_genre  = any (l.genres))
     and (p_style  is null or p_style  = any (l.styles))
     and (p_grades is null or l.media_grade = any (p_grades))
     and (p_year_min  is null or l.year >= p_year_min)
     and (p_year_max  is null or l.year <= p_year_max)
     and (p_price_min is null or l.price_pence >= p_price_min)
     and (p_price_max is null or l.price_pence <= p_price_max)
     and (p_artist is null or lower(l.artist) = lower(p_artist))
   order by
     case when p_sort = 'price_asc'  then l.price_pence end asc,
     case when p_sort = 'price_desc' then l.price_pence end desc,
     case when p_sort = 'artist'     then lower(l.artist) end asc,
     case when p_sort = 'title'      then lower(l.title) end asc,
     case when p_sort = 'year_desc'  then l.year end desc nulls last,
     case when p_sort = 'relevance' and v_tsq is not null then ts_rank(l.search, v_tsq) end desc,
     l.created_at desc, l.id
   limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- Counts for the browse-by panels on the homepage and catalogue sidebar (in-stock only).
create or replace function catalogue_facets() returns jsonb language sql stable as $$
  with live as (select * from listings where status = 'active' and quantity - reserved > 0)
  select jsonb_build_object(
    'formats', coalesce((select jsonb_agg(jsonb_build_object('name', format_group, 'count', n) order by n desc)
                          from (select format_group, count(*) n from live where format_group is not null group by 1) f), '[]'),
    'genres',  coalesce((select jsonb_agg(jsonb_build_object('name', g, 'count', n) order by n desc)
                          from (select g, count(*) n from live, unnest(genres) g group by 1) x), '[]'),
    'styles',  coalesce((select jsonb_agg(jsonb_build_object('name', g, 'count', n) order by n desc)
                          from (select g, count(*) n from live, unnest(styles) g group by 1 order by 2 desc limit 60) x), '[]'),
    'grades',  coalesce((select jsonb_agg(jsonb_build_object('name', media_grade, 'count', n) order by n desc)
                          from (select media_grade, count(*) n from live where media_grade is not null group by 1) x), '[]'),
    'years',   (select jsonb_build_object('min', min(year), 'max', max(year)) from live),
    'prices',  (select jsonb_build_object('min', min(price_pence), 'max', max(price_pence)) from live),
    'total',   (select count(*) from live)
  );
$$;

-- One listing with its stock figure, for the product page (hidden/missing never shown).
create or replace function listing_detail(p_id uuid) returns table (
  id uuid, artist text, title text, label text, catalog_number text, format text, format_group text,
  year int, genres text[], styles text[], media_condition text, media_grade text,
  sleeve_condition text, sleeve_grade text, price_pence int, available int, comments text,
  image_path text, discogs_release_id bigint
) language sql stable as $$
  select id, artist, title, label, catalog_number, format, format_group, year, genres, styles,
         media_condition, media_grade, sleeve_condition, sleeve_grade, price_pence,
         quantity - reserved, comments, image_path, discogs_release_id
    from listings where id = p_id and status = 'active';
$$;
