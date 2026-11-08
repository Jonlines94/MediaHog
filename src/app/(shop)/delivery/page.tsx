import { Policy } from "@/components/Policy";
import { publicDb } from "@/lib/public-db";
import { gbp } from "@/lib/money";
import type { ShippingZone } from "@/lib/shipping";

export const metadata = { title: "Delivery" };
export const revalidate = 600;

export default async function Delivery() {
  const { data } = await publicDb().from("shipping_zones").select("*").order("sort_order");
  const zones = (data ?? []) as ShippingZone[];
  return (
    <Policy title="Delivery">
      <p>We post to the UK, Europe and the rest of the world. Buy more than one record and the rest ship at a lower rate, so you pay one combined delivery charge.</p>
      <div className="overflow-x-auto font-sans">
        <table className="num w-full min-w-[28rem] border-collapse bg-white text-left text-base">
          <thead><tr className="border-b border-line"><th className="p-3">Where</th><th className="p-3">First record</th><th className="p-3">Each extra record</th></tr></thead>
          <tbody>{zones.map((z) => (
            <tr key={z.name} className="border-b border-line"><td className="p-3 font-bold">{z.name}</td><td className="p-3">{gbp(z.first_item_pence)}</td>
              <td className="p-3">{gbp(z.additional_item_pence)}{z.free_over_pence !== null && <span className="block text-sm text-muted">Free over {gbp(z.free_over_pence)}</span>}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <p>The exact charge for your address is shown at checkout before you pay. Delivery times depend on the destination and carrier, and international orders may be subject to import duties or taxes charged by your country.</p>
    </Policy>
  );
}
