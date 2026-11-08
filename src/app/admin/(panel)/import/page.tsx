import { db } from "@/lib/supabase/admin";
import { ImportClient } from "./ImportClient";

export const metadata = { title: "CSV import" };

export default async function ImportPage() {
  const [{ data: history }, { data: last }] = await Promise.all([
    db().from("imports").select("id,filename,mode,status,summary,created_at,completed_at").order("created_at", { ascending: false }).limit(25),
    db().from("imports").select("completed_at").eq("mode", "update").eq("status", "completed").order("completed_at", { ascending: false }).limit(1),
  ]);
  const lastAt = last?.[0]?.completed_at;
  return (
    <main className="max-w-4xl">
      <h1 className="text-3xl font-extrabold tracking-tight">Import from Discogs</h1>
      <p className="mt-2 text-muted">
        Last stock import: {lastAt ? new Date(lastAt).toLocaleString("en-GB") : "none yet"}. A CSV is a snapshot, not a live link. Anything sold on Discogs since you exported it will not show until you import again.
      </p>
      <div className="mt-6"><ImportClient /></div>

      <h2 className="mt-12 text-xl font-extrabold">Import history</h2>
      {!history?.length ? <p className="mt-2 text-muted">No imports yet. Your first one will appear here.</p> : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse bg-white text-left text-sm">
            <thead><tr className="border-b border-line"><th className="p-3">When</th><th className="p-3">File</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3">Result</th><th className="p-3"><span className="sr-only">Report</span></th></tr></thead>
            <tbody>
              {history.map((h) => {
                const s = (h.summary ?? {}) as Record<string, number | string>;
                return (
                  <tr key={h.id} className="border-b border-line align-top">
                    <td className="p-3 whitespace-nowrap">{new Date(h.created_at).toLocaleString("en-GB")}</td>
                    <td className="p-3">{h.filename}</td>
                    <td className="p-3">{h.mode === "update" ? "Update" : "Reconcile"}</td>
                    <td className="p-3">{h.status}</td>
                    <td className="num p-3">{s.fatal ? String(s.fatal) : `${s.added ?? 0} new, ${s.updated ?? 0} changed, ${s.unchanged ?? 0} same`}</td>
                    <td className="p-3"><a className="font-bold underline underline-offset-4" href={`/api/admin/import/${h.id}/report`}>Report</a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
