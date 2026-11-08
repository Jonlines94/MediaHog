// Deterministic generator for a representative Discogs inventory export.
// Mirrors the layout of the Discogs seller export: one row per listing, no genre/year columns.
import Papa from "papaparse";

const HEADERS = [
  "listing_id", "artist", "title", "label", "catno", "format", "release_id", "status", "price",
  "listed", "comments", "media_condition", "sleeve_condition", "accept_offer", "external_id",
  "weight", "format_quantity", "flat_shipping", "location",
];

const ARTISTS = ["Pink Floyd", "Björk", "Miles Davis", "Kraftwerk", "Public Enemy", "Joy Division",
  "Sade", "Massive Attack", "Fela Kuti", "Talking Heads", "Aphex Twin", "The Smiths", "Nina Simone", "Wu-Tang Clan"];
const WORDS = ["Blue", "Night", "Echo", "Machine", "Garden", "Signals", "Dub", "Live", "Sessions", "Noir", "Remix", "Volume"];
const LABELS = ["Warp", "Factory", "Island", "Blue Note", "Def Jam", "4AD", "Rough Trade", "Parlophone"];
const FORMATS = ["Vinyl, LP, Album", "Vinyl, 12\", 45 RPM, EP", "Vinyl, 7\", 45 RPM, Single", "CD, Album", "Cassette, Album", "Box Set, Vinyl, LP"];
const MEDIA = ["Mint (M)", "Near Mint (NM or M-)", "Very Good Plus (VG+)", "Very Good (VG)", "Good Plus (G+)"];
const SLEEVE = [...MEDIA, "Generic", "Not Graded", "No Cover"];

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

export function makeRows(n: number, seed = 42): Record<string, string>[] {
  const r = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const rows: Record<string, string>[] = [];
  for (let i = 0; i < n; i++) {
    const id = 1_000_000_000 + i * 7;
    const title = `${pick(WORDS)} ${pick(WORDS)}${r() < 0.1 ? ", Pt. " + (1 + Math.floor(r() * 3)) : ""}${r() < 0.05 ? ' "Special" Edition' : ""}`;
    rows.push({
      listing_id: String(id), artist: pick(ARTISTS), title, label: pick(LABELS),
      catno: `${pick(LABELS).slice(0, 3).toUpperCase()}${Math.floor(r() * 9000 + 100)}`,
      format: pick(FORMATS), release_id: String(100000 + Math.floor(r() * 5_000_000)),
      status: "For Sale", price: (4 + r() * 80).toFixed(2),
      listed: new Date(Date.UTC(2020, 0, 1) + Math.floor(r() * 5 * 365) * 86400000).toISOString().slice(0, 19).replace("T", " "),
      comments: r() < 0.5 ? "Plays beautifully, light shelf wear." : "",
      media_condition: pick(MEDIA), sleeve_condition: pick(SLEEVE), accept_offer: r() < 0.5 ? "Y" : "N",
      external_id: r() < 0.3 ? `BOX-${Math.floor(r() * 400)}` : "", weight: String(Math.floor(100 + r() * 400)),
      format_quantity: "1", flat_shipping: "", location: r() < 0.6 ? `Shelf ${1 + Math.floor(r() * 60)}` : "",
    });
  }
  return rows;
}

export function toCsv(rows: Record<string, string>[]): string {
  return Papa.unparse({ fields: HEADERS, data: rows.map((row) => HEADERS.map((h) => row[h] ?? "")) });
}
export const CSV_HEADERS = HEADERS;
