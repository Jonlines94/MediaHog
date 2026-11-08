import Link from "next/link";
import { db } from "@/lib/supabase/admin";
import { gbp } from "@/lib/money";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const [{ data: stats }, { data: days }, { data: recent }] = await Promise.all([
    db().rpc("admin_stats"), db().rpc("sales_by_day", { p_days: 30 }),
    db().from("orders").select("id,order_number,customer_name,status,total_pence,created_at,paid_at").neq("status", "expired").order("created_at", { ascending: false }).limit(8),
  ]);
  const s = (stats ?? {}) as Record<string, number | string | null>;
  const series = (days ?? []) as { day: string; orders: number; pence: number }[];
  const max = Math.max(1, ...series.map((d) => Number(d.pence)));
  const tile = (label: string, value: string | number, href?: string, warn = false) => (
    <div className={`bg-white p-4 ${warn ? "border-l-4 border-orange" : ""}`}>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="num text-3xl font-extrabold">{href ? <Link href={href} className="hover:text-orange-text">{value}</Link> : value}</dd>
    </div>
  );
  return (
    <main className="max-w-6xl">
      <h1 className="text-3xl font-extrabold tracking-tight">Dashboard</h1>
      <dl className="mt-6 grid grid-cols-2 gap-px bg-line md:grid-cols-4">
        {tile("Records for sale", Number(s.products ?? 0).toLocaleString("en-GB"), "/admin/inventory")}
        {tile("Copies available", Number(s.available ?? 0).toLocaleString("en-GB"))}
        {tile("Out of stock", Number(s.out_of_stock ?? 0).toLocaleString("en-GB"), "/admin/inventory?show=out")}
        {tile("Orders to post", Number(s.to_dispatch ?? 0), "/admin/orders?status=paid", Number(s.to_dispatch) > 0)}
      </dl>
      {(Number(s.open_flags) > 0 || Number(s.errors_7d) > 0) && (
        <div className="mt-4 space-y-2" role="region" aria-label="Needs attention">
          {Number(s.open_flags) > 0 && <p className="border-l-4 border-orange bg-white p-3"><Link href="/admin/flags" className="font-bold underline underline-offset-4">{String(s.open_flags)} stock flags</Link> need a look. The website and your last Discogs file disagree.</p>}
          {Number(s.errors_7d) > 0 && <p className="border-l-4 border-orange bg-white p-3">{String(s.errors_7d)} errors were logged in the last 7 days. Check the <strong>error_log</strong> table in Supabase.</p>}
        </div>
      )}
      <h2 className="mt-10 text-xl font-extrabold">Sales</h2>
      <dl className="mt-3 grid grid-cols-2 gap-px bg-line md:grid-cols-4">
        {tile("Today", gbp(Number(s.sales_today_pence ?? 0)))}
        {tile("Last 7 days", gbp(Number(s.sales_7d_pence ?? 0)))}
        {tile("Last 30 days", gbp(Number(s.sales_30d_pence ?? 0)))}
        {tile("Orders, 30 days", Number(s.orders_30d ?? 0))}
      </dl>
      <figure className="mt-4 bg-white p-4">
        <figcaption className="mb-2 text-sm text-muted">Daily sales, last 30 days (before refunds)</figcaption>
        <div className="flex h-32 items-end gap-1" role="img" aria-label={`Daily sales over the last 30 days, highest ${gbp(max)}`}>
          {series.map((d) => <div key={d.day} title={`${d.day}: ${gbp(Number(d.pence))}`} className="flex-1 bg-orange" style={{ height: `${Math.max(2, (Number(d.pence) / max) * 100)}%`, opacity: Number(d.pence) ? 1 : 0.25 }} />)}
        </div>
      </figure>
      <p className="mt-4 text-sm text-muted">Last stock import: {s.last_import_at ? new Date(String(s.last_import_at)).toLocaleString("en-GB") : "none yet"}. <Link href="/admin/import" className="underline underline-offset-4">Import now</Link></p>

      <h2 className="mt-10 text-xl font-extrabold">Recent orders</h2>
      {!recent?.length ? <p className="mt-2 text-muted">No orders yet. They&apos;ll appear here as soon as someone buys.</p> : (
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[34rem] bg-white text-left text-sm">
          <thead><tr className="border-b border-line"><th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3">Status</th><th className="p-3 text-right">Total</th><th className="p-3">Placed</th></tr></thead>
          <tbody>{recent.map((o) => (
            <tr key={o.id} className="border-b border-line"><td className="p-3 font-bold"><Link className="underline underline-offset-4" href={`/admin/orders/${o.id}`}>#{o.order_number}</Link></td>
              <td className="p-3">{o.customer_name}</td><td className="p-3">{o.status}</td><td className="num p-3 text-right">{gbp(o.total_pence)}</td>
              <td className="p-3 whitespace-nowrap">{new Date(o.created_at).toLocaleString("en-GB")}</td></tr>
          ))}</tbody></table></div>
      )}
    </main>
  );
}
