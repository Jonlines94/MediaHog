import { parseDiscogsCsv, type ImportRow, type ParsedCsv, type RowIssue } from "./parse";
import { computePlan, summarisePlan, type ExistingListing, type Plan } from "./plan";

export type ImportMode = "update" | "reconcile";

/** Stored report; only the fields read back by confirmImport are typed. */
export interface ImportReport { counts?: Record<string, number>; missing?: unknown[]; [key: string]: unknown }

export interface BatchResult { added: number; updated: number; unchanged: number; flagged: number }

/** Storage abstraction: Supabase in production, plain pg in tests. */
export interface ImportStore {
  fetchExisting(): Promise<ExistingListing[]>;
  findImportByHash(sha256: string): Promise<{ id: string; created_at: string } | null>;
  createImport(rec: {
    filename: string; sha256: string; mode: ImportMode; totalRows: number;
    summary: object; report: object; payload: ImportRow[] | null; createdBy?: string;
  }): Promise<string>;
  loadImport(id: string): Promise<{ id: string; mode: ImportMode; status: string; payload: ImportRow[] | null; report: ImportReport } | null>;
  claimImport(id: string): Promise<boolean>;            // previewed -> running, atomically
  applyBatch(importId: string, rows: ImportRow[]): Promise<BatchResult>;
  finishImport(id: string, patch: { status: "completed" | "failed" | "cancelled"; summary: object; report: object }): Promise<void>;
}

const BATCH_SIZE = 500;
const REPORT_SAMPLE_LIMIT = 1000; // keep stored reports small; the downloadable CSV report has everything

export interface Preview {
  importId: string;
  mode: ImportMode;
  fatal?: string;
  parsed: ParsedCsv;
  plan: Plan | null;
  alreadyImported: { id: string; created_at: string } | null;
}

function buildReport(parsed: ParsedCsv, plan: Plan) {
  const cap = <T,>(a: T[]) => a.slice(0, REPORT_SAMPLE_LIMIT);
  return {
    columns: parsed.columns,
    errors: cap<RowIssue>(parsed.errors),
    skipped: cap<RowIssue>(parsed.skipped),
    duplicates: cap<RowIssue>(parsed.duplicates),
    counts: {
      totalRows: parsed.totalRows, valid: parsed.rows.length, errors: parsed.errors.length,
      skipped: parsed.skipped.length, duplicates: parsed.duplicates.length,
    },
    added: cap(plan.added.map((r) => ({ listing_id: r.listing_id, artist: r.artist, title: r.title, price_pence: r.price_pence }))),
    updated: cap(plan.updated),
    missing: cap(plan.missing),
    discrepancies: cap(plan.discrepancies),
  };
}

/** Step 1 (both modes): validate, compare with inventory, store a preview. Changes no stock. */
export async function previewImport(
  store: ImportStore, filename: string, csvText: string, mode: ImportMode, createdBy?: string,
): Promise<Preview> {
  const parsed = parseDiscogsCsv(csvText);
  if (parsed.fatal) {
    const importId = await store.createImport({
      filename, sha256: parsed.sha256, mode, totalRows: 0,
      summary: { fatal: parsed.fatal }, report: { fatal: parsed.fatal, columns: parsed.columns },
      payload: null, createdBy,
    });
    await store.finishImport(importId, { status: "failed", summary: { fatal: parsed.fatal }, report: { fatal: parsed.fatal, columns: parsed.columns } });
    return { importId, mode, fatal: parsed.fatal, parsed, plan: null, alreadyImported: null };
  }
  const [existing, previous] = await Promise.all([store.fetchExisting(), store.findImportByHash(parsed.sha256)]);
  const plan = computePlan(parsed.rows, existing);
  const summary = {
    ...summarisePlan(plan), rows: parsed.totalRows, valid: parsed.rows.length,
    errors: parsed.errors.length, skipped: parsed.skipped.length, duplicates: parsed.duplicates.length,
  };
  const report = buildReport(parsed, plan);

  const importId = await store.createImport({
    filename, sha256: parsed.sha256, mode, totalRows: parsed.rows.length, summary, report,
    // Only the rows that would change need to be kept for confirmation.
    payload: mode === "update" ? parsed.rows : null, createdBy,
  });
  if (mode === "reconcile") {
    await store.finishImport(importId, { status: "completed", summary, report });
  }
  return { importId, mode, parsed, plan, alreadyImported: previous };
}

/** Step 2 (update mode only): apply a previewed import in batches. Safe to call once per import. */
export async function confirmImport(store: ImportStore, importId: string) {
  const imp = await store.loadImport(importId);
  if (!imp) throw new Error("Import not found");
  if (imp.mode !== "update") throw new Error("Only Update Stock imports can be applied");
  if (!imp.payload) throw new Error("This import has no data left to apply");
  if (!(await store.claimImport(importId))) throw new Error("This import has already been applied or is running");

  const totals: BatchResult = { added: 0, updated: 0, unchanged: 0, flagged: 0 };
  try {
    for (let i = 0; i < imp.payload.length; i += BATCH_SIZE) {
      const r = await store.applyBatch(importId, imp.payload.slice(i, i + BATCH_SIZE));
      totals.added += r.added; totals.updated += r.updated;
      totals.unchanged += r.unchanged; totals.flagged += r.flagged;
    }
  } catch (err) {
    await store.finishImport(importId, {
      status: "failed", summary: { ...totals, error: String(err) },
      report: { ...imp.report, error: String(err), appliedBeforeFailure: totals },
    });
    throw err;
  }
  const summary = { ...(imp.report?.counts ?? {}), ...totals, missing: imp.report?.missing?.length ?? 0 };
  await store.finishImport(importId, { status: "completed", summary, report: { ...imp.report, applied: totals } });
  return totals;
}
