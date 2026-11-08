import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { siteUrl } from "@/lib/env";
import { computeShipping, type ShippingZone } from "@/lib/shipping";
import { isCountry } from "@/lib/countries";

export const CheckoutBody = z.object({
  items: z.array(z.object({ id: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1).max(100),
  email: z.string().trim().email().max(200),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  line1: z.string().trim().min(2).max(160), line2: z.string().trim().max(160).optional().or(z.literal("")),
  city: z.string().trim().min(1).max(100), region: z.string().trim().max(100).optional().or(z.literal("")),
  postcode: z.string().trim().min(2).max(20),
  country: z.string().trim().length(2).refine(isCountry, "We can't ship to that country yet"),
});
export type CheckoutInput = z.infer<typeof CheckoutBody>;

export class CheckoutError extends Error {
  constructor(message: string, public status = 400, public detail?: Record<string, unknown>) { super(message); }
}

const MAX_PENDING_PER_IP = 3;

export async function createCheckout(input: CheckoutInput, ip: string) {
  const c = db();
  await c.rpc("release_expired_orders");   // free any lapsed holds first

  // Merge duplicate lines, then load AUTHORITATIVE prices and stock from the database.
  const wanted = new Map<string, number>();
  for (const i of input.items) wanted.set(i.id, (wanted.get(i.id) ?? 0) + i.quantity);
  const { data: rows, error } = await c.from("listings")
    .select("id,artist,title,format_group,media_condition,sleeve_condition,price_pence,quantity,reserved,status").in("id", [...wanted.keys()]);
  if (error) throw error;
  const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));

  const problems: { id: string; title: string; reason: string }[] = [];
  for (const [id, qty] of wanted) {
    const r = byId.get(id);
    if (!r || r.status !== "active") problems.push({ id, title: r ? `${r.artist}, ${r.title}` : "A record", reason: "no longer available" });
    else if (r.quantity - r.reserved < qty) problems.push({ id, title: `${r.artist}, ${r.title}`, reason: r.quantity - r.reserved <= 0 ? "just sold" : "not enough copies left" });
  }
  if (problems.length) throw new CheckoutError("Some records in your basket are no longer available.", 409, { problems });

  const lines = [...wanted].map(([id, quantity]) => ({ ...byId.get(id)!, quantity }));
  const subtotal = lines.reduce((n, l) => n + l.price_pence * l.quantity, 0);
  const itemCount = lines.reduce((n, l) => n + l.quantity, 0);

  const { data: zones } = await c.from("shipping_zones").select("*");
  const ship = computeShipping((zones ?? []) as ShippingZone[], input.country, itemCount, subtotal);
  if (!ship) throw new CheckoutError("We don't have a delivery rate for that country yet. Please contact us.", 422);
  const total = subtotal + ship.pence;

  // Limit abandoned-checkout abuse: a few open holds per visitor at a time.
  const ipHash = createHash("sha256").update(`${ip}|${process.env.IP_HASH_SALT ?? "mediahog"}`).digest("hex");
  const { count } = await c.from("orders").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).eq("status", "pending");
  if ((count ?? 0) >= MAX_PENDING_PER_IP) {
    throw new CheckoutError("You have several unfinished checkouts open. Please complete or wait a few minutes before starting another.", 429);
  }

  const { data: order, error: oErr } = await c.from("orders").insert({
    email: input.email, customer_name: input.name, phone: input.phone || null,
    ship_line1: input.line1, ship_line2: input.line2 || null, ship_city: input.city, ship_region: input.region || null,
    ship_postcode: input.postcode, ship_country: input.country.toUpperCase(),
    subtotal_pence: subtotal, shipping_pence: ship.pence, total_pence: total, ip_hash: ipHash,
  }).select("id,order_number").single();
  if (oErr) throw oErr;

  const cleanup = async () => { await c.from("orders").delete().eq("id", order.id); };
  const { error: iErr } = await c.from("order_items").insert(lines.map((l) => ({
    order_id: order.id, listing_id: l.id, artist: l.artist, title: l.title, format: l.format_group,
    media_condition: l.media_condition, sleeve_condition: l.sleeve_condition, unit_price_pence: l.price_pence, quantity: l.quantity,
  })));
  if (iErr) { await cleanup(); throw iErr; }

  // Atomic, all-or-nothing reservation. Loses cleanly if someone else got there first.
  const { error: rErr } = await c.rpc("reserve_stock", { p_order_id: order.id, p_items: lines.map((l) => ({ listing_id: l.id, quantity: l.quantity })), p_hold_minutes: 30 });
  if (rErr) {
    await cleanup();
    if (/OUT_OF_STOCK/.test(rErr.message)) throw new CheckoutError("One of your records was just bought by someone else.", 409, { problems: [{ id: "", title: "A record", reason: "just sold" }] });
    throw rErr;
  }

  try {
    const base = siteUrl();
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      customer_email: input.email,
      line_items: [
        ...lines.map((l) => ({
          quantity: l.quantity,
          price_data: { currency: "gbp", unit_amount: l.price_pence, product_data: { name: `${l.artist}, ${l.title}`, description: [l.format_group, l.media_condition && `Media: ${l.media_condition}`].filter(Boolean).join(", ") || undefined } },
        })),
        ...(ship.pence > 0 ? [{ quantity: 1, price_data: { currency: "gbp", unit_amount: ship.pence, product_data: { name: `Delivery (${ship.zone})` } } }] : []),
      ],
      metadata: { order_id: order.id, order_number: String(order.order_number) },
      payment_intent_data: { metadata: { order_id: order.id, order_number: String(order.order_number) }, description: `MediaHog order #${order.order_number}` },
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      success_url: `${base}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/basket?cancelled=1`,
    });
    await c.from("orders").update({ stripe_session_id: session.id }).eq("id", order.id);
    return { url: session.url!, orderNumber: order.order_number };
  } catch (err) {
    await c.rpc("release_order", { p_order_id: order.id, p_new_status: "cancelled" });
    throw err;
  }
}
