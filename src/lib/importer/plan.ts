import type { ImportRow } from "./parse";

/** The subset of a stored listing needed to compare against a CSV row. */
export interface ExistingListing {
  id: string;
  discogs_listing_id: number;
  discogs_release_id: number | null;
  artist: string;
  title: string;
  label: string | null;
  catalog_number: string | null;
  format: string | null;
  format_group: string | null;
  media_condition: string | null;
  media_grade: string | null;
  sleeve_condition: string | null;
  sleeve_grade: string | null;
  price_pence: number;
  quantity: number;
  reserved: number;
  comments: string | null;
  external_id: string | null;
  location: string | null;
  weight_grams: number | null;
  year: number | null;
  genres: string[];
  styles: string[];
  status: "active" | "hidden" | "missing";
}

export type Change = [from: unknown, to: unknown];

export interface PlannedUpdate {
  listing_id: number;
  artist: string;
  title: string;
  changes: Record<string, Change>;
}

export interface Plan {
  added: ImportRow[];
  updated: PlannedUpdate[];
  unchanged: number;
  /** Active site listings that were NOT in the CSV. Never deleted automatically. */
  missing: { id: string; listing_id: number; artist: string; title: string; quantity: number }[];
  /** CSV shows more stock than the site: kept as is and flagged. */
  discrepancies: { listing_id: number; artist: string; title: string; site_quantity: number; csv_quantity: number }[];
  /** True when so many listings are missing that the CSV is probably a partial export. */
  looksPartial: boolean;
}

const FIELDS: [keyof ImportRow, keyof ExistingListing][] = [
  ["release_id", "discogs_release_id"], ["artist", "artist"], ["title", "title"],
  ["label", "label"], ["catalog_number", "catalog_number"], ["format", "format"],
  ["format_group", "format_group"], ["media_condition", "media_condition"],
  ["media_grade", "media_grade"], ["sleeve_condition", "sleeve_condition"],
  ["sleeve_grade", "sleeve_grade"], ["price_pence", "price_pence"], ["comments", "comments"],
  ["external_id", "external_id"], ["location", "location"], ["weight_grams", "weight_grams"],
];

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Pure comparison of CSV rows against current inventory. Mirrors the rules enforced
 * atomically in SQL (apply_import_batch), so the preview matches what will happen.
 */
export function computePlan(rows: ImportRow[], existing: ExistingListing[]): Plan {
  const byId = new Map(existing.map((e) => [e.discogs_listing_id, e]));
  const csvIds = new Set(rows.map((r) => r.listing_id));
  const plan: Plan = { added: [], updated: [], unchanged: 0, missing: [], discrepancies: [], looksPartial: false };

  for (const r of rows) {
    const cur = byId.get(r.listing_id);
    if (!cur) { plan.added.push(r); continue; }

    const changes: Record<string, Change> = {};
    for (const [rf, ef] of FIELDS) {
      const next = (r[rf] ?? null) as unknown;
      const prev = (cur[ef] ?? null) as unknown;
      if (next !== prev) changes[ef] = [prev, next];
    }
    if (r.year !== undefined && (r.year ?? null) !== cur.year) changes.year = [cur.year, r.year ?? null];
    if (r.genres && !sameList(r.genres, cur.genres)) changes.genres = [cur.genres, r.genres];
    if (r.styles && !sameList(r.styles, cur.styles)) changes.styles = [cur.styles, r.styles];

    let newQty = cur.quantity;
    if (r.quantity < cur.quantity) newQty = Math.max(r.quantity, cur.reserved);
    else if (r.quantity > cur.quantity) {
      plan.discrepancies.push({
        listing_id: r.listing_id, artist: cur.artist, title: cur.title,
        site_quantity: cur.quantity, csv_quantity: r.quantity,
      });
    }
    if (newQty !== cur.quantity) changes.quantity = [cur.quantity, newQty];
    if (cur.status === "missing" && newQty > 0) changes.status = ["missing", "active"];

    if (Object.keys(changes).length) {
      plan.updated.push({ listing_id: r.listing_id, artist: cur.artist, title: cur.title, changes });
    } else plan.unchanged++;
  }

  for (const e of existing) {
    if (e.status === "active" && e.quantity > 0 && !csvIds.has(e.discogs_listing_id)) {
      plan.missing.push({ id: e.id, listing_id: e.discogs_listing_id, artist: e.artist, title: e.title, quantity: e.quantity });
    }
  }
  const activeCount = existing.filter((e) => e.status === "active" && e.quantity > 0).length;
  plan.looksPartial = activeCount >= 50 && plan.missing.length / activeCount > 0.2;
  return plan;
}

/** Compact, storable summary of a plan (counts only). */
export function summarisePlan(plan: Plan) {
  return {
    added: plan.added.length, updated: plan.updated.length, unchanged: plan.unchanged,
    missing: plan.missing.length, discrepancies: plan.discrepancies.length,
    looksPartial: plan.looksPartial,
  };
}
