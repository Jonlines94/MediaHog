import Link from "next/link";
import { db } from "@/lib/supabase/admin";
import { gbp } from "@/lib/money";

export const metadata = { title: "Orders" };
const STATUSES = ["paid", "dispatched", "pending", "refunded", "partially_refunded", "cancelled", "expired"];

export default async function Orders({ searchParams }: PageProps<"/admin/orders">) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" && STATUSES.includes(sp.status) ? sp.status : null;
  let q = db().from("orders").select("id,order_number,customer_name,email,status,total_pence,ship_country,created_at").order("created_at", { ascending: false }).limit(100);
  q = status ? q.eq("status", status) : q.not("status", "in", "(pending,expired,cancelled)");
  const { data } = await q;
  return (
    <main className="max-w-6xl">
      <h1 className="text-3xl font-extrabold tracking-tight">Orders</h1>
      <nav aria-label="Filter orders" className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/orders" className={`border-2 px-3 py-1.5 font-bold ${!status ? "border-orange bg-orange/10" : "border-line"}`}>All paid</Link>
        {STATUSES.map((s) => <Link key={s} href={`/admin/orders?status=${s}`} className={`border-2 px-3 py-1.5 font-bold ${status === s ? "border-orange bg-orange/10" : "border-line"}`}>{s.replace("_", " ")}</Link>)}
      </nav>
      {!data?.length ? <p className="mt-6 border-l-4 border-orange bg-white p-4">No orders here yet.</p> : (
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[40rem] bg-white text-left text-sm">
          <thead><tr className="border-b border-line"><th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3">Country</th><th className="p-3">Status</th><th className="p-3 text-right">Total</th><th className="p-3">Placed</th></tr></thead>
          <tbody>{data.map((o) => (
            <tr key={o.id} className="border-b border-line"><td className="p-3 font-bold"><Link className="underline underline-offset-4" href={`/admin/orders/${o.id}`}>#{o.order_number}</Link></td>
              <td className="p-3">{o.customer_name}<br /><span className="text-xs text-muted">{o.email}</span></td><td className="p-3">{o.ship_country}</td><td className="p-3">{o.status.replace("_", " ")}</td>
              <td className="num p-3 text-right">{gbp(o.total_pence)}</td><td className="p-3 whitespace-nowrap">{new Date(o.created_at).toLocaleString("en-GB")}</td></tr>
          ))}</tbody></table></div>
      )}
    </main>
  );
}
