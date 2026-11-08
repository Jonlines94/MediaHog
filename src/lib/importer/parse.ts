import Papa from "papaparse";
import { createHash } from "node:crypto";
import { detectColumns, type ColumnMapping, type FieldKey } from "./columns";

export interface ImportRow {
  listing_id: number;
  release_id: number | null;
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
  comments: string | null;
  external_id: string | null;
  location: string | null;
  weight_grams: number | null;
  listed_at: string | null;
  // Optional enrichment: only present when the CSV has these columns.
  year?: number | null;
  genres?: string[];
  styles?: string[];
}

export interface RowIssue {
  line: number;          // 1-based line in the file, header = line 1
  listing_id?: string;
  message: string;
}

export interface ParsedCsv {
  sha256: string;
  totalRows: number;
  columns: ColumnMapping;
  rows: ImportRow[];                 // valid, de-duplicated, For Sale only
  errors: RowIssue[];                // rows rejected
  skipped: RowIssue[];               // valid rows deliberately not imported (e.g. status Sold)
  duplicates: RowIssue[];            // same listing id seen more than once in the file
  fatal?: string;                    // file-level problem; nothing can be imported
}

const IMPORTABLE_STATUS = /^(for\s*sale|active|available|)$/i;

/** "Near Mint (NM or M-)" -> "NM". Returns null for Generic / Not Graded / unknown. */
export function conditionGrade(text: string | null): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/mint\s*\(m\)/.test(t) || t.trim() === "mint" || /^m$/.test(t.trim())) return "M";
  if (/near mint|\bnm\b|m-/.test(t)) return "NM";
  if (/very good plus|vg\+/.test(t)) return "VG+";
  if (/very good|\bvg\b/.test(t)) return "VG";
  if (/good plus|g\+/.test(t)) return "G+";
  if (/fair|\bf\b/.test(t)) return "F";
  if (/poor|\bp\b/.test(t)) return "P";
  if (/good|\bg\b/.test(t)) return "G";
  return null;
}

/** Collapse Discogs format strings ("LP, Album, 180g") into a browsable group. */
export function formatGroup(format: string | null): string | null {
  if (!format) return null;
  const f = format.toLowerCase();
  if (/box set/.test(f)) return "Box Set";
  if (/cassette|\bmc\b/.test(f)) return "Cassette";
  if (/\bcd\b|cdr/.test(f)) return "CD";
  if (/\b7"|7 inch|7''/.test(f)) return '7"';
  if (/\b10"|10 inch/.test(f)) return '10"';
  if (/\b12"|12 inch/.test(f)) return '12"';
  if (/\blp\b/.test(f)) return "LP";
  if (/vinyl/.test(f)) return "Vinyl";
  if (/dvd|blu-ray|vhs/.test(f)) return "Video";
  return "Other";
}

/** Parse a GBP price string into integer pence. Returns an error string for anything unsafe. */
export function parsePrice(raw: string): { pence: number } | { error: string } {
  let s = raw.trim();
  if (!s) return { error: "Price is empty" };
  if (/[$€¥]|\b(USD|EUR|JPY|AUD|CAD)\b/i.test(s)) return { error: `Price "${raw}" is not in GBP` };
  s = s.replace(/£|GBP/gi, "").replace(/\s/g, "");
  // 1,234.56 or 1234,56 (European decimal comma)
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: `Price "${raw}" is not a valid amount` };
  const pence = Math.round(parseFloat(s) * 100);
  if (pence > 10_000_000) return { error: `Price "${raw}" is unreasonably high` };
  return { pence };
}

const clean = (v: string | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};
const list = (v: string | undefined): string[] =>
  (v ?? "").split(/[;,|]/).map((x) => x.trim()).filter(Boolean);

export function parseDiscogsCsv(text: string): ParsedCsv {
  const sha256 = createHash("sha256").update(text).digest("hex");
  const base: ParsedCsv = {
    sha256, totalRows: 0, rows: [], errors: [], skipped: [], duplicates: [],
    columns: { mapped: {}, unrecognised: [], missingRequired: [] },
  };
  if (!text.trim()) return { ...base, fatal: "The file is empty." };

  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true, skipEmptyLines: "greedy",
  });
  const headers = parsed.meta.fields ?? [];
  const columns = detectColumns(headers);
  base.columns = columns;

  if (columns.missingRequired.length) {
    return {
      ...base,
      fatal: `This does not look like a Discogs inventory export. Missing column(s): ${columns.missingRequired.join(", ")}.`,
    };
  }
  base.totalRows = parsed.data.length;
  // Papa reports malformed rows (wrong field count, bad quotes) with a row index.
  for (const e of parsed.errors) {
    if (e.row !== undefined) base.errors.push({ line: e.row + 2, message: `Malformed row: ${e.message}` });
  }
  const badLines = new Set(base.errors.map((e) => e.line));

  const m = columns.mapped;
  const get = (row: Record<string, string>, f: FieldKey) => (m[f] ? row[m[f]!] : undefined);
  const seen = new Map<number, number>(); // listing_id -> first line

  parsed.data.forEach((row, i) => {
    const line = i + 2;
    if (badLines.has(line)) return;
    const idRaw = (get(row, "listing_id") ?? "").trim();
    if (!/^\d+$/.test(idRaw)) {
      base.errors.push({ line, listing_id: idRaw, message: `Invalid listing ID "${idRaw}"` });
      return;
    }
    const listing_id = Number(idRaw);
    if (!Number.isSafeInteger(listing_id)) {
      base.errors.push({ line, listing_id: idRaw, message: "Listing ID is too large" });
      return;
    }
    const status = (get(row, "status") ?? "").trim();
    if (!IMPORTABLE_STATUS.test(status)) {
      base.skipped.push({ line, listing_id: idRaw, message: `Status is "${status}", not For Sale` });
      return;
    }
    if (seen.has(listing_id)) {
      base.duplicates.push({
        line, listing_id: idRaw,
        message: `Listing ${idRaw} already appeared on line ${seen.get(listing_id)}; later row ignored`,
      });
      return;
    }
    const price = parsePrice(get(row, "price") ?? "");
    if ("error" in price) {
      base.errors.push({ line, listing_id: idRaw, message: price.error });
      return;
    }
    const artist = clean(get(row, "artist"));
    const title = clean(get(row, "title"));
    if (!artist || !title) {
      base.errors.push({ line, listing_id: idRaw, message: "Artist or title is missing" });
      return;
    }
    let quantity = 1;
    if (m.quantity) {
      const q = (get(row, "quantity") ?? "").trim();
      if (q !== "") {
        if (!/^\d+$/.test(q) || Number(q) > 100000) {
          base.errors.push({ line, listing_id: idRaw, message: `Invalid quantity "${q}"` });
          return;
        }
        quantity = Number(q);
      }
    }
    seen.set(listing_id, line);

    const release = clean(get(row, "release_id"));
    const weight = clean(get(row, "weight"));
    const listed = clean(get(row, "listed_at"));
    const format = clean(get(row, "format"));
    const media = clean(get(row, "media_condition"));
    const sleeve = clean(get(row, "sleeve_condition"));
    const out: ImportRow = {
      listing_id,
      release_id: release && /^\d+$/.test(release) ? Number(release) : null,
      artist, title,
      label: clean(get(row, "label")),
      catalog_number: clean(get(row, "catalog_number")),
      format, format_group: formatGroup(format),
      media_condition: media, media_grade: conditionGrade(media),
      sleeve_condition: sleeve, sleeve_grade: conditionGrade(sleeve),
      price_pence: price.pence, quantity,
      comments: clean(get(row, "comments")),
      external_id: clean(get(row, "external_id")),
      location: clean(get(row, "location")),
      weight_grams: weight && /^\d+(\.\d+)?$/.test(weight) ? Math.round(Number(weight)) : null,
      listed_at: listed && !Number.isNaN(Date.parse(listed)) ? new Date(listed).toISOString() : null,
    };
    if (m.year) {
      const y = (get(row, "year") ?? "").trim();
      out.year = /^\d{4}$/.test(y) ? Number(y) : null;
    }
    if (m.genres) out.genres = list(get(row, "genres"));
    if (m.styles) out.styles = list(get(row, "styles"));
    base.rows.push(out);
  });
  return base;
}
