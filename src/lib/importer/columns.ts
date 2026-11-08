// Automatic column recognition for Discogs inventory exports.
// Headers are normalised (lower-case, non-alphanumerics -> "_") and matched against aliases,
// so small differences between exports ("Catalog#", "catno", "Catalogue Number") still map.

export type FieldKey =
  | "listing_id" | "release_id" | "artist" | "title" | "label" | "catalog_number"
  | "format" | "status" | "price" | "listed_at" | "comments"
  | "media_condition" | "sleeve_condition" | "external_id" | "weight" | "location"
  | "quantity" | "year" | "genres" | "styles";

export const REQUIRED_FIELDS: FieldKey[] = ["listing_id", "artist", "title", "price"];

const ALIASES: Record<FieldKey, string[]> = {
  listing_id: ["listing_id", "listing", "listingid", "discogs_listing_id", "listing_number"],
  release_id: ["release_id", "releaseid", "discogs_release_id", "release"],
  artist: ["artist", "artists", "artist_name"],
  title: ["title", "release_title", "album", "album_title"],
  label: ["label", "labels", "record_label"],
  catalog_number: ["catno", "cat_no", "catalog", "catalog_number", "catalogue_number", "catalog_no", "catalogue_no", "cat"],
  format: ["format", "formats", "release_format"],
  status: ["status", "listing_status"],
  price: ["price", "listing_price", "sale_price", "price_gbp"],
  listed_at: ["listed", "listed_date", "listed_at", "date_listed"],
  comments: ["comments", "comment", "listing_notes", "notes", "description", "seller_notes"],
  media_condition: ["media_condition", "media", "condition", "media_grade"],
  sleeve_condition: ["sleeve_condition", "sleeve", "cover_condition", "sleeve_grade"],
  external_id: ["external_id", "sku", "private_id", "seller_id"],
  weight: ["weight", "weight_g", "weight_grams"],
  location: ["location", "storage_location", "shelf"],
  quantity: ["quantity", "qty", "stock", "format_quantity_available", "copies"],
  year: ["year", "released", "release_year"],
  genres: ["genre", "genres"],
  styles: ["style", "styles"],
};

export function normaliseHeader(h: string): string {
  return h.replace(/^﻿/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export interface ColumnMapping {
  /** field -> original header text in the file */
  mapped: Partial<Record<FieldKey, string>>;
  /** headers we did not recognise (ignored, shown to the user) */
  unrecognised: string[];
  /** required fields we could not find */
  missingRequired: FieldKey[];
}

export function detectColumns(headers: string[]): ColumnMapping {
  const mapped: Partial<Record<FieldKey, string>> = {};
  const used = new Set<string>();
  const norm = headers.map((h) => ({ raw: h, n: normaliseHeader(h) }));

  // Exact alias match, trying aliases in priority order so "listing_id" beats a vague "listing".
  for (const field of Object.keys(ALIASES) as FieldKey[]) {
    for (const alias of ALIASES[field]) {
      const hit = norm.find((h) => h.n === alias && !used.has(h.raw));
      if (hit) {
        mapped[field] = hit.raw;
        used.add(hit.raw);
        break;
      }
    }
  }
  return {
    mapped,
    unrecognised: headers.filter((h) => h.trim() !== "" && !used.has(h)),
    missingRequired: REQUIRED_FIELDS.filter((f) => !mapped[f]),
  };
}
