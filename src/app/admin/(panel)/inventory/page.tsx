import Link from "next/link";
import { db } from "@/lib/supabase/admin";
import { artworkUrl } from "@/lib/public-db";
import { gbp } from "@/lib/money";

export const metadata = { title: "Inventory" };
const PER = 50;

export default async function Inventory({ searchParams }: PageProps<"/admin/inventory">) {
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").replace(/[,()*%\\]/g, " ").trim().slice(0, 80);
  const show = typeof sp.show === "string" ? sp.show : "all";
  const page = Math.max(1, parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);

  let query = db().from("listings")
    .select("id,discogs_listing_id,artist,title,catalog_number,format_group,price_pence,quantity,reserved,status,image_path", { count: "exact" })
    .order("created_at", { ascending: false }).range((page - 1) * PER, page * PER - 1);
  if (q) query = query.or(`artist.ilike.%${q}%,title.ilike.%${q}%,catalog_number.ilike.%${q}%${/^\d+$/.test(q) ? `,discogs_listing_id.eq.${q}` : ""}`);
  if (show === "out") query = query.eq("status", "active").lte("quantity", 0);
  else if (show === "hidden") query = query.neq("status", "active");
  else if (show === "active") query = query.eq("status", "active");
  const { data, count } = await query;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PER));
  const link = (p: number) => `/admin/inventory?${new URLSearchParams({ ...(q && { q }), show, page: String(p) })}`;

  return (
    <main className="max-w-6xl">
      <h1 className="text-3xl font-extrabold tracking-tight">Inventory</h1>
      <form className="mt-5 flex flex-wrap gap-2" role="search">
        <label className="sr-only" htmlFor="q">Search</label>
        <input id="q" name="q" defaultValue={q} placeholder="Artist, title, catalogue number or Discogs listing ID" className="min-w-0 flex-1 border border-line bg-white px-3 py-2.5" />
        <label className="sr-only" htmlFor="show">Show</label>
        <select id="show" name="show" defaultValue={show} className="border border-line bg-white px-3 py-2.5">
          <option value="all">Everything</option><option value="active">For sale</option><option value="out">Out of stock</option><option value="hidden">Hidden or missing</option>
        </select>
        <button className="bg-orange px-5 font-bold text-ink hover:bg-orange-dark">Search</button>
      </form>
      <p className="mt-3 text-sm text-muted" role="status"><span className="num">{(count ?? 0).toLocaleString("en-GB")}</span> listings</p>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[44rem] bg-white text-left text-sm">
        <thead><tr className="border-b border-line"><th className="p-3">Record</th><th className="p-3">Catalogue no.</th><th className="p-3">Format</th><th className="p-3 text-right">Price</th><th className="p-3 text-right">Stock</th><th className="p-3">Status</th></tr></thead>
        <tbody>{(data ?? []).map((l) => (
          <tr key={l.id} className="border-b border-line">
            <td className="p-3"><Link className="font-bold underline underline-offset-4" href={`/admin/inventory/${l.id}`}>{l.artist}</Link><br />{l.title}{artworkUrl(l.image_path) ? "" : <span className="ml-2 text-xs text-muted">no artwork</span>}</td>
            <td className="num p-3">{l.catalog_number ?? ""}</td><td className="p-3">{l.format_group ?? ""}</td>
            <td className="num p-3 text-right">{gbp(l.price_pence)}</td>
            <td className="num p-3 text-right">{l.quantity}{l.reserved > 0 && <span className="text-muted"> ({l.reserved} held)</span>}</td>
            <td className="p-3">{l.status}</td></tr>
        ))}</tbody></table></div>
      {(data ?? []).length === 0 && <p className="mt-4 border-l-4 border-orange bg-white p-4">Nothing matches. Clear the search, or <Link className="underline underline-offset-4" href="/admin/import">import your Discogs CSV</Link> if the shop is empty.</p>}
      {pages > 1 && <nav aria-label="Pages" className="mt-6 flex items-center gap-3">
        {page > 1 && <Link className="border-2 border-ink px-4 py-2 font-bold" href={link(page - 1)}>Previous</Link>}
        <span className="num text-sm text-muted">Page {page} of {pages}</span>
        {page < pages && <Link className="border-2 border-ink px-4 py-2 font-bold" href={link(page + 1)}>Next</Link>}
      </nav>}
    </main>
  );
}
