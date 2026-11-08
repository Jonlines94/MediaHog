import "server-only";
import { db } from "@/lib/supabase/admin";
import type { ImportStore } from "./run";
import type { ExistingListing } from "./plan";

const COLS = "id,discogs_listing_id,discogs_release_id,artist,title,label,catalog_number,format,format_group,media_condition,media_grade,sleeve_condition,sleeve_grade,price_pence,quantity,reserved,comments,external_id,location,weight_grams,year,genres,styles,status";

/** Production ImportStore using Supabase (service role, server side only). */
export function supabaseStore(): ImportStore {
  const c = db();
  return {
    async fetchExisting() {
      const out: ExistingListing[] = [];
      const page = 1000;
      for (let from = 0; ; from += page) {
        const { data, error } = await c.from("listings").select(COLS).order("id").range(from, from + page - 1);
        if (error) throw error;
        out.push(...((data ?? []) as ExistingListing[]));
        if (!data || data.length < page) break;
      }
      return out;
    },
    async findImportByHash(sha) {
      const { data } = await c.from("imports").select("id,created_at").eq("file_sha256", sha).eq("status", "completed")
        .order("created_at", { ascending: false }).limit(1);
      return data?.[0] ?? null;
    },
    async createImport(rec) {
      const { data, error } = await c.from("imports").insert({
        filename: rec.filename, file_sha256: rec.sha256, mode: rec.mode, total_rows: rec.totalRows,
        summary: rec.summary, report: rec.report, payload: rec.payload, created_by: rec.createdBy ?? null,
      }).select("id").single();
      if (error) throw error;
      return data.id;
    },
    async loadImport(id) {
      const { data } = await c.from("imports").select("id,mode,status,payload,report").eq("id", id).maybeSingle();
      return data;
    },
    async claimImport(id) {
      // Conditional update is atomic: only one caller can move previewed -> running.
      const { data } = await c.from("imports").update({ status: "running" }).eq("id", id).eq("status", "previewed").select("id");
      return (data?.length ?? 0) === 1;
    },
    async applyBatch(importId, rows) {
      const { data, error } = await c.rpc("apply_import_batch", { p_import_id: importId, p_rows: rows });
      if (error) throw error;
      return data;
    },
    async finishImport(id, patch) {
      const { error } = await c.from("imports").update({
        status: patch.status, summary: patch.summary, report: patch.report, payload: null,
        completed_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
  };
}
