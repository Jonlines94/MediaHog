import { db } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";
import { ConfirmButton } from "@/components/ConfirmButton";
import { saveShop, saveZone, addZone, deleteZone } from "./actions";

export const metadata = { title: "Settings" };
const input = "mt-1 w-full border border-line bg-white px-3 py-2";
const p = (n: number) => (n / 100).toFixed(2);

export default async function Settings({ searchParams }: PageProps<"/admin/settings">) {
  const sp = await searchParams;
  const [{ data: shopRow }, { data: zones }] = await Promise.all([
    db().from("settings").select("value").eq("key", "shop").maybeSingle(),
    db().from("shipping_zones").select("*").order("sort_order"),
  ]);
  const shop = (shopRow?.value ?? {}) as Record<string, string>;
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const mode = key.startsWith("sk_live_") ? "live" : key.startsWith("sk_test_") ? "test" : "not set";
  const ok = typeof sp.ok === "string" ? sp.ok : null, err = typeof sp.error === "string" ? sp.error : null;

  return (
    <main className="max-w-4xl space-y-12">
      <div><h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
        {ok && <p role="status" className="mt-4 border-l-4 border-ink bg-white p-3">{ok}</p>}
        {err && <p role="alert" className="mt-4 border-l-4 border-orange bg-orange/10 p-3">{err}</p>}</div>

      <section aria-labelledby="shop-h"><h2 id="shop-h" className="text-xl font-extrabold">Shop details</h2>
        <p className="mt-1 text-sm text-muted">Shown in the website footer, the contact page and customer emails. UK online shops must show a contact address and, for a company, its registered name.</p>
        <form action={saveShop} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="name" className="font-medium">Shop name</label><input id="name" name="name" defaultValue={shop.name ?? "MediaHog"} className={input} /></div>
          <div><label htmlFor="tagline" className="font-medium">Tagline</label><input id="tagline" name="tagline" defaultValue={shop.tagline ?? ""} className={input} /></div>
          <div><label htmlFor="contact_email" className="font-medium">Contact email</label><input id="contact_email" name="contact_email" type="email" defaultValue={shop.contact_email ?? ""} className={input} /></div>
          <div><label htmlFor="contact_phone" className="font-medium">Phone</label><input id="contact_phone" name="contact_phone" defaultValue={shop.contact_phone ?? ""} className={input} /></div>
          <div><label htmlFor="company" className="font-medium">Registered trading name</label><input id="company" name="company" defaultValue={shop.company ?? ""} className={input} /></div>
          <div className="sm:col-span-2"><label htmlFor="address" className="font-medium">Address</label><textarea id="address" name="address" rows={3} defaultValue={shop.address ?? ""} className={input} /></div>
          <div><button className="bg-orange px-5 py-2.5 font-bold text-ink hover:bg-orange-dark">Save shop details</button></div>
        </form></section>

      <section aria-labelledby="ship-h"><h2 id="ship-h" className="text-xl font-extrabold">Delivery prices</h2>
        <p className="mt-1 text-sm text-muted">The first record is charged at the first-record price, and every extra record in the same order at the lower extra-record price. Leave &ldquo;free over&rdquo; blank for no free delivery.</p>
        <div className="mt-4 space-y-4">
          {(zones ?? []).map((z) => (
            <div key={z.id} className="bg-white p-4">
              <form action={saveZone.bind(null, z.id)} className="grid gap-3 sm:grid-cols-4">
                <div className="sm:col-span-4"><label htmlFor={`n-${z.id}`} className="font-medium">Zone name{z.is_default ? " (everywhere else)" : ""}</label><input id={`n-${z.id}`} name="name" defaultValue={z.name} className={input} /></div>
                <div><label htmlFor={`f-${z.id}`} className="text-sm">First record (£)</label><input id={`f-${z.id}`} name="first" defaultValue={p(z.first_item_pence)} inputMode="decimal" className={`${input} num`} /></div>
                <div><label htmlFor={`e-${z.id}`} className="text-sm">Each extra (£)</label><input id={`e-${z.id}`} name="extra" defaultValue={p(z.additional_item_pence)} inputMode="decimal" className={`${input} num`} /></div>
                <div className="sm:col-span-2"><label htmlFor={`o-${z.id}`} className="text-sm">Free delivery over (£, optional)</label><input id={`o-${z.id}`} name="free_over" defaultValue={z.free_over_pence !== null ? p(z.free_over_pence) : ""} inputMode="decimal" className={`${input} num`} /></div>
                {z.is_default ? <input type="hidden" name="countries" value="" /> : (
                  <div className="sm:col-span-4"><label htmlFor={`c-${z.id}`} className="text-sm">Countries (two-letter codes, separated by commas)</label><textarea id={`c-${z.id}`} name="countries" rows={2} defaultValue={(z.countries ?? []).join(", ")} className={input} /></div>
                )}
                <div className="flex gap-3 sm:col-span-4"><button className="border-2 border-ink px-4 py-2 text-sm font-bold hover:bg-ink hover:text-paper">Save {z.name}</button></div>
              </form>
              {!z.is_default && <form action={deleteZone.bind(null, z.id)} className="mt-2"><ConfirmButton message={`Delete the ${z.name} zone? Those countries will use the catch-all rate.`} className="text-sm underline underline-offset-4">Delete this zone</ConfirmButton></form>}
            </div>
          ))}
          <details className="bg-white p-4"><summary className="cursor-pointer font-bold">Add a delivery zone</summary>
            <form action={addZone} className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-3"><label htmlFor="n-new" className="font-medium">Zone name</label><input id="n-new" name="name" className={input} /></div>
              <div><label htmlFor="f-new" className="text-sm">First record (£)</label><input id="f-new" name="first" inputMode="decimal" className={`${input} num`} /></div>
              <div><label htmlFor="e-new" className="text-sm">Each extra (£)</label><input id="e-new" name="extra" inputMode="decimal" className={`${input} num`} /></div>
              <div><label htmlFor="o-new" className="text-sm">Free over (£, optional)</label><input id="o-new" name="free_over" inputMode="decimal" className={`${input} num`} /></div>
              <div className="sm:col-span-3"><label htmlFor="c-new" className="text-sm">Countries (e.g. US, CA)</label><textarea id="c-new" name="countries" rows={2} className={input} /></div>
              <div><button className="bg-orange px-4 py-2 font-bold text-ink hover:bg-orange-dark">Add zone</button></div>
            </form></details>
        </div></section>

      <section aria-labelledby="pay-h"><h2 id="pay-h" className="text-xl font-extrabold">Payments</h2>
        <dl className="mt-3 divide-y divide-line bg-white text-sm">
          <div className="flex justify-between p-3"><dt>Stripe mode</dt><dd className="font-bold">{mode === "live" ? "Live (real payments)" : mode === "test" ? "Test (no real money moves)" : "Not connected"}</dd></div>
          <div className="flex justify-between gap-4 p-3"><dt>Webhook address to give Stripe</dt><dd className="break-all font-bold">{siteUrl()}/api/stripe/webhook</dd></div>
          <div className="flex justify-between p-3"><dt>Confirmation emails</dt><dd className="font-bold">{process.env.RESEND_API_KEY ? "Connected" : "Not connected"}</dd></div>
        </dl>
        <p className="mt-2 text-sm text-muted">Stripe and email keys are set as environment variables on your host, never in the website, so they can&apos;t be changed from here. See DEPLOYMENT.md.</p></section>
    </main>
  );
}
