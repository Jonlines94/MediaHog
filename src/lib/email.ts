import "server-only";
import { Resend } from "resend";
import { gbp } from "@/lib/money";
import { db } from "@/lib/supabase/admin";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Sends the confirmation once per order. Returns false (and logs) on failure; never throws. */
export async function sendOrderConfirmation(orderId: string): Promise<boolean> {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set");
    const { data: o } = await db().from("orders").select("*").eq("id", orderId).single();
    if (!o || o.confirmation_sent_at) return false;
    const { data: items } = await db().from("order_items").select("*").eq("order_id", orderId);
    const { data: shop } = await db().from("settings").select("value").eq("key", "shop").maybeSingle();
    const s = (shop?.value ?? {}) as { name?: string; contact_email?: string };

    const lines = (items ?? []).map((i) =>
      `<tr><td style="padding:8px 0;border-bottom:1px solid #e6dfd2"><strong>${esc(i.artist)}</strong><br>${esc(i.title)}${i.media_condition ? `<br><span style="color:#6b645a;font-size:13px">Media: ${esc(i.media_condition)}</span>` : ""}</td>` +
      `<td style="padding:8px 0 8px 16px;border-bottom:1px solid #e6dfd2;text-align:right;white-space:nowrap">${i.quantity} × ${gbp(i.unit_price_pence)}</td></tr>`).join("");
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#000">
      <h1 style="font-size:24px">Thanks for your order, ${esc(o.customer_name.split(" ")[0])}</h1>
      <p>Order <strong>#${o.order_number}</strong> is confirmed and paid. We'll email you again when it's posted.</p>
      <table style="width:100%;border-collapse:collapse">${lines}
        <tr><td style="padding-top:12px">Delivery</td><td style="padding-top:12px;text-align:right">${gbp(o.shipping_pence)}</td></tr>
        <tr><td style="font-weight:bold">Total</td><td style="text-align:right;font-weight:bold">${gbp(o.total_pence)}</td></tr></table>
      <p style="margin-top:24px"><strong>Delivering to</strong><br>${[o.customer_name, o.ship_line1, o.ship_line2, o.ship_city, o.ship_region, o.ship_postcode, o.ship_country].filter(Boolean).map((x: string) => esc(x)).join("<br>")}</p>
      <p style="color:#6b645a;font-size:13px">Questions? Reply to this email${s.contact_email ? ` or write to ${esc(s.contact_email)}` : ""}.</p></div>`;

    const { error } = await new Resend(key).emails.send({
      from: process.env.EMAIL_FROM ?? "MediaHog <orders@mediahog.co.uk>",
      to: o.email, replyTo: s.contact_email || undefined,
      subject: `Your MediaHog order #${o.order_number}`, html,
    });
    if (error) throw new Error(error.message);
    await db().from("orders").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", orderId);
    return true;
  } catch (err) {
    await db().from("error_log").insert({ source: "email.confirmation", message: err instanceof Error ? err.message : String(err), detail: { orderId } });
    return false;
  }
}

/** Tells the customer their order has been posted. Never throws. */
export async function sendDispatchEmail(orderId: string): Promise<boolean> {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set");
    const { data: o } = await db().from("orders").select("*").eq("id", orderId).single();
    if (!o) return false;
    const { error } = await new Resend(key).emails.send({
      from: process.env.EMAIL_FROM ?? "MediaHog <orders@mediahog.co.uk>", to: o.email,
      subject: `Your MediaHog order #${o.order_number} is on its way`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h1 style="font-size:24px">Your records are on their way</h1>
        <p>Order <strong>#${o.order_number}</strong> has been posted${o.carrier ? ` with ${esc(o.carrier)}` : ""}.</p>
        ${o.tracking_reference ? `<p>Tracking reference: <strong>${esc(o.tracking_reference)}</strong></p>` : ""}</div>`,
    });
    if (error) throw new Error(error.message);
    return true;
  } catch (err) {
    await db().from("error_log").insert({ source: "email.dispatch", message: err instanceof Error ? err.message : String(err), detail: { orderId } });
    return false;
  }
}
