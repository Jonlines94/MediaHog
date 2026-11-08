import { gunzipSync } from "node:zlib";
import { adminRoute, json } from "@/lib/http";
import { previewImport, type ImportMode } from "@/lib/importer/run";
import { supabaseStore } from "@/lib/importer/supabase-store";

export const maxDuration = 120;

/** multipart: file (CSV, optionally gzip-compressed by the browser), mode = update | reconcile */
export const POST = adminRoute("import.preview", async (req, _ctx: unknown, admin) => {
  const form = await req.formData();
  const file = form.get("file");
  const mode = form.get("mode");
  if (!(file instanceof File)) return json({ error: "No file uploaded" }, 400);
  if (mode !== "update" && mode !== "reconcile") return json({ error: "Choose Update Stock or Reconcile Stock" }, 400);
  if (file.size > 50 * 1024 * 1024) return json({ error: "File is too large" }, 413);

  let buf = Buffer.from(await file.arrayBuffer());
  const gz = form.get("gzip") === "1";
  if (gz) {
    try { buf = gunzipSync(buf); } catch { return json({ error: "Upload was corrupted. Please try again." }, 400); }
  }
  const name = String(form.get("filename") || file.name || "inventory.csv").slice(0, 200);
  const p = await previewImport(supabaseStore(), name, buf.toString("utf8"), mode as ImportMode, admin.email);

  return json({
    importId: p.importId, mode: p.mode, fatal: p.fatal ?? null,
    columns: p.parsed.columns,
    counts: {
      rows: p.parsed.totalRows, valid: p.parsed.rows.length, errors: p.parsed.errors.length,
      skipped: p.parsed.skipped.length, duplicates: p.parsed.duplicates.length,
    },
    plan: p.plan && {
      added: p.plan.added.length, updated: p.plan.updated.length, unchanged: p.plan.unchanged,
      missing: p.plan.missing.length, discrepancies: p.plan.discrepancies.length, looksPartial: p.plan.looksPartial,
      samples: {
        added: p.plan.added.slice(0, 10).map((r) => ({ id: r.listing_id, artist: r.artist, title: r.title, price_pence: r.price_pence })),
        updated: p.plan.updated.slice(0, 15),
        missing: p.plan.missing.slice(0, 15),
        discrepancies: p.plan.discrepancies.slice(0, 15),
      },
    },
    errors: p.parsed.errors.slice(0, 50), skipped: p.parsed.skipped.slice(0, 20), duplicates: p.parsed.duplicates.slice(0, 20),
    alreadyImported: p.alreadyImported,
  });
});
