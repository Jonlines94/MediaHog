"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { sendDispatchEmail } from "@/lib/email";
import { parsePrice } from "@/lib/importer/parse";

const back = (id: string, msg: string, kind: "ok" | "error" = "ok") => redirect(`/admin/orders/${id}?${kind}=${encodeURIComponent(msg)}`);

export async function markDispatched(id: string, formData: FormData) {
  await requireAdmin();
  const { data: o } = await db().from("orders").select("status").eq("id", id).single();
  if (!o || !["paid", "dispatched"].includes(o.status)) return back(id, "Only paid orders can be marked as posted", "error");
  const carrier = String(formData.get("carrier") ?? "").trim().slice(0, 80) || null;
  const tracking = String(formData.get("tracking") ?? "").trim().slice(0, 120) || null;
  const first = o.status === "paid";
  await db().from("orders").update({ status: "dispatched", dispatched_at: new Date().toISOString(), carrier, tracking_reference: tracking }).eq("id", id);
  revalidatePath("/admin/orders");
  const emailed = first && formData.get("notify") === "on" ? await sendDispatchEmail(id) : null;
  back(id, emailed === false ? "Marked as posted. The email couldn't be sent, check your email settings." : "Marked as posted" + (emailed ? " and the customer has been emailed" : ""));
}

export async function refundOrder(id: string, formData: FormData) {
  const admin = await requireAdmin();
  const { data: o } = await db().from("orders").select("*").eq("id", id).single();
  if (!o) return back(id, "Order not found", "error");
  if (!["paid", "dispatched", "partially_refunded"].includes(o.status) || !o.stripe_payment_intent) return back(id, "This order can't be refunded here", "error");
  const remaining = o.total_pence - o.refunded_pence;
  const amt = parsePrice(String(formData.get("amount") ?? ""));
  if ("error" in amt) return back(id, amt.error, "error");
  if (amt.pence <= 0 || amt.pence > remaining) return back(id, `Enter an amount up to £${(remaining / 100).toFixed(2)}`, "error");
  const full = o.refunded_pence + amt.pence >= o.total_pence;
  try {
    // The idempotency key means a double click or retry can never refund twice.
    await getStripe().refunds.create({ payment_intent: o.stripe_payment_intent, amount: amt.pence, metadata: { order_id: id, by: admin.email } },
      { idempotencyKey: `refund-${id}-${o.refunded_pence}-${amt.pence}` });
  } catch (e) {
    await db().from("error_log").insert({ source: "admin.refund", message: e instanceof Error ? e.message : String(e), detail: { orderId: id } });
    return back(id, `Stripe couldn't refund: ${e instanceof Error ? e.message : "unknown error"}`, "error");
  }
  await db().from("orders").update({ refunded_pence: o.refunded_pence + amt.pence, status: full ? "refunded" : "partially_refunded" }).eq("id", id);
  let restocked = "";
  if (full && formData.get("restock") === "on") {
    const { data: items } = await db().from("order_items").select("listing_id,quantity").eq("order_id", id);
    for (const i of items ?? []) {
      if (i.listing_id) await db().rpc("adjust_stock", { p_listing_id: i.listing_id, p_delta: i.quantity, p_reason: "refund", p_note: `Refund of order #${o.order_number}`, p_user: admin.email });
    }
    restocked = " Records put back in stock.";
  }
  revalidatePath("/admin/orders");
  back(id, `Refunded £${(amt.pence / 100).toFixed(2)}.${restocked} Remember to update Discogs if you relist them there.`);
}
