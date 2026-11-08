import "server-only";
import { publicDb, artworkUrl } from "@/lib/public-db";

export const PAGE_SIZE = 24;

export interface Card {
  id: string; artist: string; title: string; label: string | null; catalog_number: string | null;
  format: string | null; format_group: string | null; year: number | null;
  media_condition: string | null; media_grade: string | null; sleeve_condition: string | null; sleeve_grade: string | null;
  price_pence: number; available: number; image: string | null;
}

export interface Filters {
  q?: string; format?: string; genre?: string; style?: string; grades?: string[];
  yearMin?: number; yearMax?: number; priceMin?: number; priceMax?: number; artist?: string;
  sort?: string; page?: number;
}

const num = (v: string | string[] | undefined) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) && (Array.isArray(v) ? v[0] : v) !== "" && v !== undefined ? n : undefined;
};
const str = (v: string | string[] | undefined) => {
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s.slice(0, 100) : undefined;
};

/** Parse URL search params into validated filters (never trust the query string). */
export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const sorts = ["newest", "price_asc", "price_desc", "artist", "title", "year_desc", "relevance"];
  const sort = str(sp.sort);
  const grades = (Array.isArray(sp.grade) ? sp.grade : sp.grade ? [sp.grade] : []).filter((g) => /^(M|NM|VG\+|VG|G\+|G|F|P)$/.test(g));
  const priceMin = num(sp.min), priceMax = num(sp.max);
  return {
    q: str(sp.q), format: str(sp.format), genre: str(sp.genre), style: str(sp.style), artist: str(sp.artist),
    grades: grades.length ? grades : undefined,
    yearMin: num(sp.from), yearMax: num(sp.to),
    priceMin: priceMin !== undefined ? Math.round(priceMin * 100) : undefined,
    priceMax: priceMax !== undefined ? Math.round(priceMax * 100) : undefined,
    sort: sort && sorts.includes(sort) ? sort : str(sp.q) ? "relevance" : "newest",
    page: Math.max(1, Math.floor(num(sp.page) ?? 1)),
  };
}

/** A row as returned by the search/detail RPCs or the listings table (columns we read). */
type Row = Omit<Card, "image" | "available"> & {
  available: number; image_path: string | null; total?: number | string;
  genres?: string[]; styles?: string[]; comments?: string | null; discogs_release_id?: number | null;
};

const toCard = (r: Row): Card => ({
  id: r.id, artist: r.artist, title: r.title, label: r.label, catalog_number: r.catalog_number,
  format: r.format, format_group: r.format_group, year: r.year,
  media_condition: r.media_condition, media_grade: r.media_grade,
  sleeve_condition: r.sleeve_condition, sleeve_grade: r.sleeve_grade,
  price_pence: r.price_pence, available: r.available, image: artworkUrl(r.image_path),
});

export async function searchCatalogue(f: Filters, limit = PAGE_SIZE) {
  const { data, error } = await publicDb().rpc("search_listings", {
    p_q: f.q ?? null, p_format: f.format ?? null, p_genre: f.genre ?? null, p_style: f.style ?? null,
    p_grades: f.grades ?? null, p_year_min: f.yearMin ?? null, p_year_max: f.yearMax ?? null,
    p_price_min: f.priceMin ?? null, p_price_max: f.priceMax ?? null, p_artist: f.artist ?? null,
    p_sort: f.sort ?? "newest", p_limit: limit, p_offset: ((f.page ?? 1) - 1) * limit,
  });
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  return { cards: rows.map(toCard), total: rows.length ? Number(rows[0].total) : 0 };
}

export interface Facets {
  formats: { name: string; count: number }[]; genres: { name: string; count: number }[];
  styles: { name: string; count: number }[]; grades: { name: string; count: number }[];
  years: { min: number | null; max: number | null }; prices: { min: number | null; max: number | null }; total: number;
}
export async function getFacets(): Promise<Facets> {
  const { data, error } = await publicDb().rpc("catalogue_facets");
  if (error) throw error;
  return data as Facets;
}

export async function getFeatured(limit = 8): Promise<Card[]> {
  const { data } = await publicDb().from("listings")
    .select("id,artist,title,label,catalog_number,format,format_group,year,media_condition,media_grade,sleeve_condition,sleeve_grade,price_pence,quantity,reserved,image_path")
    .eq("featured", true).gt("quantity", 0).order("created_at", { ascending: false }).limit(limit * 2);
  type Raw = Omit<Row, "available"> & { quantity: number; reserved: number };
  return ((data ?? []) as Raw[]).filter((r) => r.quantity - r.reserved > 0).slice(0, limit)
    .map((r) => toCard({ ...r, available: r.quantity - r.reserved }));
}

export async function getListing(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await publicDb().rpc("listing_detail", { p_id: id });
  const r = (data as Row[] | null)?.[0];
  if (!r) return null;
  return { ...toCard(r), genres: r.genres ?? [], styles: r.styles ?? [], comments: r.comments ?? null, release_id: r.discogs_release_id ?? null };
}
