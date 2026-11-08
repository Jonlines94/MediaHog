import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { requireEnv } from "@/lib/env";
import { db } from "@/lib/supabase/admin";
import { sendOrderConfirmation } from "@/lib/email";

export const maxDuration = 30;

/**
 * The ONLY place an order becomes paid. Stripe signs each call; we verify the signature
 * against the raw body, and confirm the amount matches the order before touching stock.
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  const raw = await req.text();   // must be the unparsed body
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, requireEnv("STRIPE_WEBHOOK_SECRET"));
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const c = db();
  // Stripe retries and may deliver twice. Claim the event id first; a duplicate stops here.
  const { error: dup } = await c.from("processed_stripe_events").insert({ event_id: event.id, type: event.type });
  if (dup) return NextResponse.json({ received: true, duplicate: true });

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.payment_status !== "paid") return NextResponse.json({ received: true });   // wait for async success
      const orderId = s.metadata?.order_id;
      if (!orderId) throw new Error(`Session ${s.id} has no order_id`);
      const { data: order } = await c.from("orders").select("id,total_pence,status").eq("id", orderId).single();
      if (!order) throw new Error(`Order ${orderId} not found`);
      if (s.amount_total !== order.total_pence || s.currency !== "gbp") {
        await c.from("error_log").insert({ source: "stripe.webhook", message: "Amount mismatch, order NOT marked paid", detail: { orderId, stripe: s.amount_total, order: order.total_pence } });
        return NextResponse.json({ received: true, flagged: true });
      }
      const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
      await c.from("orders").update({ stripe_payment_intent: pi }).eq("id", orderId);
      const { error } = await c.rpc("finalize_order", { p_order_id: orderId });
      if (error) throw error;
      await sendOrderConfirmation(orderId);
    } else if (event.type === "checkout.session.expired") {
      const orderId = (event.data.object as Stripe.Checkout.Session).metadata?.order_id;
      if (orderId) await c.rpc("release_order", { p_order_id: orderId, p_new_status: "expired" });
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    // Un-claim so Stripe's retry can process it, and log for the admin.
    await c.from("processed_stripe_events").delete().eq("event_id", event.id);
    await c.from("error_log").insert({ source: "stripe.webhook", message: err instanceof Error ? err.message : String(err), detail: { type: event.type, id: event.id } });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
