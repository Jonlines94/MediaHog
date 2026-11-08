import Papa from "papaparse";
import { adminRoute, json } from "@/lib/http";
import { db } from "@/lib/supabase/admin";

interface Row { listing_id?: number | string; line?: number; artist?: string; title?: string; message?: string; price_pence?: number; quantity?: number; site_quantity?: number; csv_quantity?: number; changes?: unknown }
interface Report { added?: Row[]; updated?: Row[]; missing?: Row[]; discrepancies?: Row[]; errors?: Row[]; skipped?: Row[]; duplicates?: Row[] }

/** Downloadable CSV report for any past import. */
export const GET = adminRoute("import.report", async (_req, ctx: RouteContext<"/api/admin/import/[id]/report">) => {
  const { id } = await ctx.params;
  const { data } = await db().from("imports").select("filename,mode,status,created_at,summary,report").eq("id", id).maybeSingle();
  if (!data) return json({ error: "Not found" }, 404);
  const r = (data.report ?? {}) as Report;
  const rows: Record<string, unknown>[] = [];
  for (const x of r.added ?? []) rows.push({ type: "added", listing_id: x.listing_id, artist: x.artist, title: x.title, detail: `price ${((x.price_pence ?? 0) / 100).toFixed(2)}` });
  for (const x of r.updated ?? []) rows.push({ type: "updated", listing_id: x.listing_id, artist: x.artist, title: x.title, detail: JSON.stringify(x.changes) });
  for (const x of r.missing ?? []) rows.push({ type: "missing_from_csv", listing_id: x.listing_id, artist: x.artist, title: x.title, detail: `site quantity ${x.quantity}` });
  for (const x of r.discrepancies ?? []) rows.push({ type: "stock_discrepancy", listing_id: x.listing_id, artist: x.artist, title: x.title, detail: `site ${x.site_quantity} vs csv ${x.csv_quantity}` });
  for (const x of r.errors ?? []) rows.push({ type: "error", line: x.line, listing_id: x.listing_id, detail: x.message });
  for (const x of r.skipped ?? []) rows.push({ type: "skipped", line: x.line, listing_id: x.listing_id, detail: x.message });
  for (const x of r.duplicates ?? []) rows.push({ type: "duplicate", line: x.line, listing_id: x.listing_id, detail: x.message });
  const head = `# ${data.filename} | ${data.mode} | ${data.status} | ${data.created_at}\n# summary: ${JSON.stringify(data.summary)}\n# Long lists are capped at 1000 rows per type in stored reports.\n`;
  const csv = head + Papa.unparse(rows, { columns: ["type", "line", "listing_id", "artist", "title", "detail"] });
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="mediahog-import-${id.slice(0, 8)}.csv"` } });
});
