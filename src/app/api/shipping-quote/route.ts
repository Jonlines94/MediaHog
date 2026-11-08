import { NextResponse } from "next/server";
import { publicDb } from "@/lib/public-db";
import { computeShipping, type ShippingZone } from "@/lib/shipping";

/** Display-only estimate. The charged amount is always recalculated on the server at checkout. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const country = (u.searchParams.get("country") ?? "").toUpperCase();
  const count = Math.min(Math.max(parseInt(u.searchParams.get("count") ?? "0", 10) || 0, 0), 500);
  const subtotal = Math.max(parseInt(u.searchParams.get("subtotal") ?? "0", 10) || 0, 0);
  if (!/^[A-Z]{2}$/.test(country)) return NextResponse.json({ error: "Bad country" }, { status: 400 });
  const { data } = await publicDb().from("shipping_zones").select("*");
  const q = computeShipping((data ?? []) as ShippingZone[], country, count, subtotal);
  return q ? NextResponse.json(q) : NextResponse.json({ error: "No delivery rate" }, { status: 404 });
}
