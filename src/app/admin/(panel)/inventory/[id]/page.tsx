import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/supabase/admin";
import { artworkUrl } from "@/lib/public-db";
import { Sleeve } from "@/components/Sleeve";
import { saveListing, adjustStock, uploadArtwork, removeArtwork } from "../actions";

export const metadata = { title: "Edit record" };
const input = "mt-1 w-full border border-line bg-white px-3 py-2";

export default async function EditListing({ params, searchParams }: PageProps<"/admin/inventory/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: l } = await db().from("listings").select("*").eq("id", id).maybeSingle();
  if (!l) notFound();
  const { data: moves } = await db().from("stock_movements").select("delta,reason,note,created_at,created_by").eq("listing_id", id).order("created_at", { ascending: false }).limit(10);
  const art = artworkUrl(l.image_path);
  const ok = typeof sp.ok === "string" ? sp.ok : null, err = typeof sp.error === "string" ? sp.error : null;

  const save = saveListing.bind(null, id), adjust = adjustStock.bind(null, id), upload = uploadArtwork.bind(null, id), remove = removeArtwork.bind(null, id);
  return (
    <main className="max-w-5xl">
      <Link href="/admin/inventory" className="text-sm underline underline-offset-4">All inventory</Link>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{l.artist}, {l.title}</h1>
      <p className="text-sm text-muted">Discogs listing {l.discogs_listing_id}. {l.status === "active" ? <Link className="underline underline-offset-4" href={`/records/${id}`}>View on shop</Link> : `Status: ${l.status}`}</p>
      {ok && <p role="status" className="mt-4 border-l-4 border-ink bg-white p-3">{ok}</p>}
      {err && <p role="alert" className="mt-4 border-l-4 border-orange bg-orange/10 p-3">{err}</p>}

      <div className="mt-6 grid gap-8 lg:grid-cols-[18rem_1fr]">
        <div className="space-y-6">
          <div><Sleeve src={art} alt="" sizes="288px" /></div>
          <form action={upload} className="space-y-2">
            <label htmlFor="artwork" className="font-bold">Artwork</label>
            <input id="artwork" name="artwork" type="file" accept="image/jpeg,image/png,image/webp" required className="block w-full text-sm" />
            <p className="text-xs text-muted">Photograph your own copy or use an image you have the rights to. It&apos;s resized and optimised automatically.</p>
            <button className="border-2 border-ink px-4 py-2 text-sm font-bold hover:bg-ink hover:text-paper">Upload artwork</button>
          </form>
          {art && <form action={remove}><button className="text-sm underline underline-offset-4">Remove artwork</button></form>}

          <form action={adjust} className="space-y-2 border border-line bg-white p-4">
            <h2 className="font-extrabold">Stock: {l.quantity} {l.reserved > 0 && <span className="font-normal text-muted">({l.reserved} held in checkouts)</span>}</h2>
            <label htmlFor="delta" className="text-sm">Change by (use -1 when a copy sells elsewhere)</label>
            <input id="delta" name="delta" type="number" step="1" defaultValue={-1} required className={`${input} num`} />
            <label htmlFor="reason" className="text-sm">Reason</label>
            <select id="reason" name="reason" className={input}><option value="discogs_sale">Sold on Discogs</option><option value="manual">Other stock change</option><option value="correction">Stock count correction</option></select>
            <label htmlFor="note" className="text-sm">Note (optional)</label>
            <input id="note" name="note" className={input} />
            <button className="bg-orange px-4 py-2 font-bold text-ink hover:bg-orange-dark">Update stock</button>
          </form>
          {moves && moves.length > 0 && (
            <div><h2 className="font-extrabold">Recent stock changes</h2>
              <ul className="mt-2 divide-y divide-line text-sm">{moves.map((m, i) => <li key={i} className="py-1.5"><span className="num font-bold">{m.delta > 0 ? "+" : ""}{m.delta}</span> {m.reason.replace("_", " ")}{m.note ? `, ${m.note}` : ""}<br /><span className="text-xs text-muted">{new Date(m.created_at).toLocaleString("en-GB")}{m.created_by ? `, ${m.created_by}` : ""}</span></li>)}</ul></div>
          )}
        </div>

        <form action={save} className="grid h-fit gap-4 sm:grid-cols-2">
          <div><label htmlFor="artist" className="font-medium">Artist</label><input id="artist" name="artist" defaultValue={l.artist} required className={input} /></div>
          <div><label htmlFor="title" className="font-medium">Title</label><input id="title" name="title" defaultValue={l.title} required className={input} /></div>
          <div><label htmlFor="price" className="font-medium">Price in pounds</label><input id="price" name="price" inputMode="decimal" defaultValue={(l.price_pence / 100).toFixed(2)} required className={`${input} num`} /></div>
          <div><label htmlFor="status" className="font-medium">Status</label>
            <select id="status" name="status" defaultValue={l.status} className={input}><option value="active">For sale</option><option value="hidden">Hidden from shop</option><option value="missing">Missing from Discogs file</option></select></div>
          <div><label htmlFor="media_condition" className="font-medium">Media condition</label><input id="media_condition" name="media_condition" defaultValue={l.media_condition ?? ""} className={input} /></div>
          <div><label htmlFor="sleeve_condition" className="font-medium">Sleeve condition</label><input id="sleeve_condition" name="sleeve_condition" defaultValue={l.sleeve_condition ?? ""} className={input} /></div>
          <div><label htmlFor="label" className="font-medium">Label</label><input id="label" name="label" defaultValue={l.label ?? ""} className={input} /></div>
          <div><label htmlFor="catalog_number" className="font-medium">Catalogue number</label><input id="catalog_number" name="catalog_number" defaultValue={l.catalog_number ?? ""} className={input} /></div>
          <div><label htmlFor="format" className="font-medium">Format</label><input id="format" name="format" defaultValue={l.format ?? ""} className={input} /></div>
          <div><label htmlFor="year" className="font-medium">Year</label><input id="year" name="year" inputMode="numeric" defaultValue={l.year ?? ""} className={`${input} num`} /></div>
          <div><label htmlFor="genres" className="font-medium">Genres (comma separated)</label><input id="genres" name="genres" defaultValue={(l.genres ?? []).join(", ")} className={input} /></div>
          <div><label htmlFor="styles" className="font-medium">Styles (comma separated)</label><input id="styles" name="styles" defaultValue={(l.styles ?? []).join(", ")} className={input} /></div>
          <div><label htmlFor="location" className="font-medium">Storage location</label><input id="location" name="location" defaultValue={l.location ?? ""} className={input} /></div>
          <label className="flex items-center gap-2 self-end pb-2"><input type="checkbox" name="featured" defaultChecked={l.featured} className="h-4 w-4 accent-orange" /> Show in homepage Featured row</label>
          <div className="sm:col-span-2"><label htmlFor="comments" className="font-medium">Seller&apos;s notes (shown on the product page)</label><textarea id="comments" name="comments" rows={5} defaultValue={l.comments ?? ""} className={input} /></div>
          <p className="text-xs text-muted sm:col-span-2">Note: the next Discogs import will overwrite price, conditions and notes with whatever is in the file. Change these in Discogs too if you want them to stick.</p>
          <div className="sm:col-span-2"><button className="bg-orange px-6 py-3 font-bold text-ink hover:bg-orange-dark">Save changes</button></div>
        </form>
      </div>
    </main>
  );
}
