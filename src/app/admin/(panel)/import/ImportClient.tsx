"use client";
import { useCallback, useRef, useState } from "react";

type Mode = "update" | "reconcile";
const money = (p: number) => `£${(p / 100).toFixed(2)}`;

interface Change { [field: string]: [unknown, unknown] }
interface AddedRow { id: number; artist: string; title: string; price_pence: number }
interface UpdatedRow { listing_id: number; artist: string; title: string; changes: Change }
interface MissingRow { listing_id: number; artist: string; title: string; quantity: number }
interface FlagRow { listing_id: number; artist: string; title: string; site_quantity: number; csv_quantity: number }
interface Issue { line: number; message: string }
interface ApplyResult { added: number; updated: number; unchanged: number; flagged: number }

interface Preview {
  importId: string; mode: Mode; fatal: string | null;
  columns: { mapped: Record<string, string>; unrecognised: string[] };
  counts: { rows: number; valid: number; errors: number; skipped: number; duplicates: number };
  plan: null | {
    added: number; updated: number; unchanged: number; missing: number; discrepancies: number; looksPartial: boolean;
    samples: { added: AddedRow[]; updated: UpdatedRow[]; missing: MissingRow[]; discrepancies: FlagRow[] };
  };
  errors: { line: number; message: string }[]; skipped: { line: number; message: string }[]; duplicates: { line: number; message: string }[];
  alreadyImported: { created_at: string } | null;
}

async function gzipFile(file: File): Promise<Blob | null> {
  if (typeof CompressionStream === "undefined") return null;
  return await new Response(file.stream().pipeThrough(new CompressionStream("gzip"))).blob();
}

export function ImportClient() {
  const [mode, setMode] = useState<Mode>("update");
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<null | "preview" | "apply">(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [missingMsg, setMissingMsg] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => { setFile(null); setPreview(null); setResult(null); setError(null); setProgress(null); setMissingMsg(null); };

  const runPreview = useCallback(async (f: File, m: Mode) => {
    setBusy("preview"); setError(null); setPreview(null); setResult(null);
    try {
      const form = new FormData();
      const gz = await gzipFile(f);
      form.set("file", gz ?? f, f.name); form.set("filename", f.name); form.set("mode", m);
      if (gz) form.set("gzip", "1");
      const res = await fetch("/api/admin/import/preview", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      setPreview(body);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(null); }
  }, []);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!/\.csv$|text\/csv|text\/plain|excel/i.test(f.name + f.type)) { setError("Choose the .csv file exported from Discogs."); return; }
    setFile(f); runPreview(f, mode);
  };

  async function apply() {
    if (!preview) return;
    setBusy("apply"); setError(null); setProgress({ done: 0, total: preview.counts.valid });
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`/api/admin/import/${preview.importId}`);
        if (r.ok) { const s = await r.json(); setProgress({ done: s.processed_rows, total: s.total_rows || preview.counts.valid }); }
      } catch { /* keep polling */ }
    }, 700);
    try {
      const res = await fetch(`/api/admin/import/${preview.importId}/confirm`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Import failed");
      setResult(body.result);
      setProgress({ done: preview.counts.valid, total: preview.counts.valid });
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed"); }
    finally { clearInterval(timer); setBusy(null); }
  }

  async function resolveMissing(action: "hide" | "zero") {
    if (!preview?.plan) return;
    const n = preview.plan.missing;
    const label = action === "zero" ? `set stock to 0 for ${n} listings` : `hide ${n} listings from the shop`;
    if (!window.confirm(`This will ${label}. Nothing is deleted, and it is recorded in the stock history. Continue?`)) return;
    const res = await fetch(`/api/admin/import/${preview.importId}/resolve-missing`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, confirmCount: n }),
    });
    const body = await res.json();
    setMissingMsg(res.ok ? `Done: ${body.affected} listings updated.` : body.error);
  }

  const p = preview?.plan;
  return (
    <div>
      <fieldset className="grid gap-3 sm:grid-cols-2" disabled={busy !== null}>
        <legend className="sr-only">Import type</legend>
        {([
          ["update", "Update stock", "Adds new listings and updates prices, conditions and quantities. Nothing is duplicated."],
          ["reconcile", "Reconcile stock", "Compares the file with the website and shows what differs. Changes nothing."],
        ] as const).map(([v, t, d]) => (
          <label key={v} className={`cursor-pointer border-2 p-4 ${mode === v ? "border-orange bg-orange/10" : "border-line bg-white"}`}>
            <input type="radio" name="mode" className="sr-only" checked={mode === v}
              onChange={() => { setMode(v); if (file) runPreview(file, v); }} />
            <span className="block font-bold">{t}</span><span className="mt-1 block text-sm text-muted">{d}</span>
          </label>
        ))}
      </fieldset>

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
        className={`mt-5 grid place-items-center border-2 border-dashed px-6 py-10 text-center ${drag ? "border-orange bg-orange/10" : "border-line bg-white"}`}>
        <p className="font-bold">{file ? file.name : "Drop your Discogs inventory CSV here"}</p>
        <button type="button" onClick={() => input.current?.click()} disabled={busy !== null}
          className="mt-3 border-2 border-ink px-4 py-2 text-sm font-bold hover:bg-ink hover:text-paper">
          {file ? "Choose a different file" : "Choose file"}
        </button>
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => pick(e.target.files?.[0])} />
        {busy === "preview" && <p role="status" className="mt-3 text-sm text-muted">Checking the file and comparing it with your stock…</p>}
      </div>

      {error && <p role="alert" className="mt-4 border-l-4 border-orange bg-orange/10 p-3">{error}</p>}
      {preview?.fatal && <p role="alert" className="mt-4 border-l-4 border-orange bg-orange/10 p-3">{preview.fatal}</p>}

      {preview && !preview.fatal && p && (
        <section className="mt-8" aria-live="polite">
          <h2 className="text-xl font-extrabold">{preview.mode === "update" ? "Preview" : "Reconcile report"}</h2>
          {preview.alreadyImported && (
            <p className="mt-2 border-l-4 border-ink bg-white p-3 text-sm">
              This exact file was already imported on {new Date(preview.alreadyImported.created_at).toLocaleString("en-GB")}. Importing it again is safe and will change nothing.
            </p>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-px bg-line sm:grid-cols-5">
            {[["New listings", p.added], ["Changed", p.updated], ["Unchanged", p.unchanged], ["Not in file", p.missing], ["Stock flags", p.discrepancies]].map(([k, v]) => (
              <div key={String(k)} className="bg-white p-4"><dt className="text-sm text-muted">{k}</dt><dd className="num text-3xl font-extrabold">{String(v)}</dd></div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-muted">
            {preview.counts.rows} rows read, {preview.counts.valid} valid, {preview.counts.errors} rejected, {preview.counts.skipped} skipped (not For Sale), {preview.counts.duplicates} duplicates ignored.
          </p>
          {preview.columns.unrecognised.length > 0 && (
            <p className="mt-1 text-sm text-muted">Columns ignored: {preview.columns.unrecognised.join(", ")}.</p>
          )}
          {p.looksPartial && (
            <p role="alert" className="mt-4 border-l-4 border-orange bg-orange/10 p-3 text-sm">
              Over a fifth of your current stock is missing from this file. It may be a filtered or partial export. Check before relying on the “Not in file” list.
            </p>
          )}

          <Samples title="Changed listings" rows={p.samples.updated} render={(r: UpdatedRow) => (
            <><strong>{r.artist}</strong>, {r.title}: {Object.entries(r.changes).map(([k, [a, b]]) =>
              `${k.replace(/_/g, " ")} ${k === "price_pence" ? `${money(Number(a))} to ${money(Number(b))}` : `${String(a ?? "none")} to ${String(b ?? "none")}`}`).join("; ")}</>
          )} total={p.updated} />
          <Samples title="New listings" rows={p.samples.added} render={(r: AddedRow) => <><strong>{r.artist}</strong>, {r.title} ({money(r.price_pence)})</>} total={p.added} />
          <Samples title="On the website but not in this file" rows={p.samples.missing} render={(r: MissingRow) => <><strong>{r.artist}</strong>, {r.title} (stock {r.quantity})</>} total={p.missing} />
          <Samples title="Stock flags: file shows more than the website" rows={p.samples.discrepancies} render={(r: FlagRow) => <><strong>{r.artist}</strong>, {r.title}: website {r.site_quantity}, file {r.csv_quantity}. Left unchanged.</>} total={p.discrepancies} />
          {preview.errors.length > 0 && <Samples title="Rejected rows" rows={preview.errors} render={(r: Issue) => <>Line {r.line}: {r.message}</>} total={preview.counts.errors} />}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {preview.mode === "update" && !result && (
              <button onClick={apply} disabled={busy !== null || (p.added + p.updated === 0 && p.unchanged === 0)}
                className="bg-orange px-5 py-3 font-bold text-ink hover:bg-orange-dark disabled:opacity-50">
                {busy === "apply" ? "Importing…" : `Apply ${p.added + p.updated} changes`}
              </button>
            )}
            <a href={`/api/admin/import/${preview.importId}/report`} className="font-bold underline underline-offset-4">Download report (CSV)</a>
            <button onClick={reset} className="text-sm underline underline-offset-4">Start again</button>
          </div>
          {progress && busy === "apply" && (
            <div className="mt-4" role="status">
              <div className="h-3 bg-line"><div className="h-3 bg-orange transition-[width]" style={{ width: `${Math.min(100, (progress.done / Math.max(progress.total, 1)) * 100)}%` }} /></div>
              <p className="num mt-1 text-sm text-muted">{progress.done} of {progress.total} rows</p>
            </div>
          )}
          {result && (
            <div className="mt-6 border-l-4 border-ink bg-white p-4" role="status">
              <p className="font-bold">Import finished</p>
              <p className="mt-1 text-sm">Added {result.added}, updated {result.updated}, unchanged {result.unchanged}, stock flags {result.flagged}.</p>
              {p.missing > 0 && (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="text-sm"><strong>{p.missing} listings</strong> were not in the file. Nothing has been changed for them. If these were sold on Discogs, you can take them off sale now.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={() => resolveMissing("zero")} className="border-2 border-ink px-3 py-2 text-sm font-bold hover:bg-ink hover:text-paper">Set stock to 0</button>
                    <button onClick={() => resolveMissing("hide")} className="border-2 border-ink px-3 py-2 text-sm font-bold hover:bg-ink hover:text-paper">Hide from shop</button>
                  </div>
                  {missingMsg && <p className="mt-2 text-sm" role="status">{missingMsg}</p>}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Samples<T>({ title, rows, render, total }: { title: string; rows: T[]; render: (r: T) => React.ReactNode; total: number }) {
  if (!rows?.length) return null;
  return (
    <details className="mt-4 border border-line bg-white" open={title === "Changed listings"}>
      <summary className="cursor-pointer p-3 font-bold">{title} ({total})</summary>
      <ul className="divide-y divide-line border-t border-line text-sm">
        {rows.map((r, i) => <li key={i} className="px-3 py-2">{render(r)}</li>)}
      </ul>
      {total > rows.length && <p className="border-t border-line px-3 py-2 text-sm text-muted">Showing {rows.length} of {total}. The CSV report has the full list.</p>}
    </details>
  );
}
