import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/supabase/admin";
import { gbp } from "@/lib/money";
import { ConfirmButton } from "@/components/ConfirmButton";
import { markDispatched, refundOrder } from "../actions";

export const metadata = { title: "Order" };
const input = "mt-1 w-full border border-line bg-white px-3 py-2";

export default async function OrderPage({ params, searchParams }: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: o } = await db().from("orders").select("*").eq("id", id).maybeSingle();
  if (!o) notFound();
  const { data: items } = await db().from("order_items").select("*").eq("order_id", id);
  const ok = typeof sp.ok === "string" ? sp.ok : null, err = typeof sp.error === "string" ? sp.error : null;
  const remaining = o.total_pence - o.refunded_pence;
  const canRefund = ["paid", "dispatched", "partially_refunded"].includes(o.status) && !!o.stripe_payment_intent && remaining > 0;
  const dispatch = markDispatched.bind(null, id), refund = refundOrder.bind(null, id);

  return (
    <main className="max-w-4xl">
      <Link href="/admin/orders" className="text-sm underline underline-offset-4">All orders</Link>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Order #{o.order_number}</h1>
      <p className="text-muted">{o.status.replace("_", " ")}. Placed {new Date(o.created_at).toLocaleString("en-GB")}{o.paid_at ? `, paid ${new Date(o.paid_at).toLocaleString("en-GB")}` : ""}</p>
      {ok && <p role="status" className="mt-4 border-l-4 border-ink bg-white p-3">{ok}</p>}
      {err && <p role="alert" className="mt-4 border-l-4 border-orange bg-orange/10 p-3">{err}</p>}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="bg-white p-4" aria-labelledby="cust"><h2 id="cust" className="font-extrabold">Customer</h2>
          <p className="mt-2">{o.customer_name}<br /><a className="underline underline-offset-4" href={`mailto:${o.email}`}>{o.email}</a>{o.phone && <><br />{o.phone}</>}</p></section>
        <section className="bg-white p-4" aria-labelledby="addr"><h2 id="addr" className="font-extrabold">Post to</h2>
          <address className="mt-2 not-italic">{[o.customer_name, o.ship_line1, o.ship_line2, o.ship_city, o.ship_region, o.ship_postcode, o.ship_country].filter(Boolean).map((x: string, i: number) => <span key={i}>{x}<br /></span>)}</address></section>
      </div>

      <table className="mt-6 w-full bg-white text-left text-sm">
        <thead><tr className="border-b border-line"><th className="p-3">Record</th><th className="p-3">Condition</th><th className="p-3 text-right">Price</th><th className="p-3 text-right">Qty</th></tr></thead>
        <tbody>{(items ?? []).map((i) => <tr key={i.id} className="border-b border-line"><td className="p-3"><strong>{i.artist}</strong><br />{i.title}</td><td className="p-3">{i.media_condition ?? ""}</td><td className="num p-3 text-right">{gbp(i.unit_price_pence)}</td><td className="num p-3 text-right">{i.quantity}</td></tr>)}</tbody>
        <tfoot className="num"><tr><td colSpan={3} className="p-3 text-right">Delivery</td><td className="p-3 text-right">{gbp(o.shipping_pence)}</td></tr>
          <tr><td colSpan={3} className="p-3 text-right font-extrabold">Total</td><td className="p-3 text-right font-extrabold">{gbp(o.total_pence)}</td></tr>
          {o.refunded_pence > 0 && <tr><td colSpan={3} className="p-3 text-right">Refunded</td><td className="p-3 text-right">{gbp(o.refunded_pence)}</td></tr>}</tfoot>
      </table>

      {["paid", "dispatched"].includes(o.status) && (
        <form action={dispatch} className="mt-6 space-y-3 bg-white p-4">
          <h2 className="font-extrabold">{o.status === "paid" ? "Mark as posted" : "Update tracking"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="carrier" className="text-sm">Carrier</label><input id="carrier" name="carrier" defaultValue={o.carrier ?? ""} placeholder="Royal Mail, DPD…" className={input} /></div>
            <div><label htmlFor="tracking" className="text-sm">Tracking reference</label><input id="tracking" name="tracking" defaultValue={o.tracking_reference ?? ""} className={input} /></div>
          </div>
          {o.status === "paid" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify" defaultChecked className="h-4 w-4 accent-orange" /> Email the customer that it&apos;s on its way</label>}
          <button className="bg-orange px-5 py-2.5 font-bold text-ink hover:bg-orange-dark">{o.status === "paid" ? "Mark as posted" : "Save tracking"}</button>
        </form>
      )}

      {canRefund && (
        <form action={refund} className="mt-6 space-y-3 border-2 border-line bg-white p-4">
          <h2 className="font-extrabold">Refund</h2>
          <p className="text-sm text-muted">Up to {gbp(remaining)} can still be refunded to the customer&apos;s card. This can&apos;t be undone.</p>
          <div className="max-w-xs"><label htmlFor="amount" className="text-sm">Amount in pounds</label><input id="amount" name="amount" inputMode="decimal" defaultValue={(remaining / 100).toFixed(2)} className={`${input} num`} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="restock" className="h-4 w-4 accent-orange" /> Full refund only: put the records back in stock</label>
          <ConfirmButton message="Refund this customer? This sends money back to their card and can't be undone." className="border-2 border-ink px-5 py-2.5 font-bold hover:bg-ink hover:text-paper">Refund</ConfirmButton>
        </form>
      )}
    </main>
  );
}
