import Link from "next/link";
import { db } from "@/lib/supabase/admin";
import { keepWebsiteQuantity, acceptCsvQuantity } from "./actions";

export const metadata = { title: "Stock flags" };

interface Flag { id: string; site_quantity: number; csv_quantity: number; created_at: string; listings: { id: string; artist: string; title: string } | null }

export default async function Flags() {
  const { data } = await db().from("stock_discrepancies").select("id,site_quantity,csv_quantity,note,created_at,listings(id,artist,title)").eq("resolved", false).order("created_at", { ascending: false }).limit(200).returns<Flag[]>();
  return (
    <main className="max-w-4xl">
      <h1 className="text-3xl font-extrabold tracking-tight">Stock flags</h1>
      <p className="mt-2 text-muted">Your last Discogs file listed more copies than the website has. The usual cause is a record sold on MediaHog that Discogs hasn&apos;t caught up with, so the website number was kept. Remove it on Discogs, or restock if you really have it.</p>
      {!data?.length ? <p className="mt-6 border-l-4 border-ink bg-white p-4">Nothing to check. Every import matches.</p> : (
        <ul className="mt-6 divide-y divide-line bg-white">
          {data.map((d: Flag) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div><Link className="font-bold underline underline-offset-4" href={`/admin/inventory/${d.listings?.id}`}>{d.listings?.artist}</Link>, {d.listings?.title}
                <p className="num text-sm text-muted">Website {d.site_quantity}, Discogs file {d.csv_quantity}. {new Date(d.created_at).toLocaleDateString("en-GB")}</p></div>
              <div className="flex gap-2">
                <form action={keepWebsiteQuantity.bind(null, d.id)}><button className="border-2 border-ink px-3 py-1.5 text-sm font-bold hover:bg-ink hover:text-paper">Keep website number</button></form>
                <form action={acceptCsvQuantity.bind(null, d.id)}><button className="border-2 border-line px-3 py-1.5 text-sm font-bold hover:border-ink">Use Discogs number</button></form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
