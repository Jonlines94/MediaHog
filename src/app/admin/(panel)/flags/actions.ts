"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";

export async function keepWebsiteQuantity(id: string) {
  await requireAdmin();
  await db().from("stock_discrepancies").update({ resolved: true }).eq("id", id);
  revalidatePath("/admin/flags");
  redirect("/admin/flags");
}

/** Take the Discogs file's quantity as correct (for example, after you restock). Logged like any stock change. */
export async function acceptCsvQuantity(id: string) {
  const admin = await requireAdmin();
  const { data: d } = await db().from("stock_discrepancies").select("listing_id,csv_quantity,resolved").eq("id", id).single();
  if (!d || d.resolved) redirect("/admin/flags");
  const { data: l } = await db().from("listings").select("quantity").eq("id", d.listing_id).single();
  if (l) {
    const delta = d.csv_quantity - l.quantity;
    if (delta !== 0) await db().rpc("adjust_stock", { p_listing_id: d.listing_id, p_delta: delta, p_reason: "correction", p_note: "Accepted Discogs file quantity", p_user: admin.email });
  }
  await db().from("stock_discrepancies").update({ resolved: true }).eq("id", id);
  revalidatePath("/admin/flags");
  redirect("/admin/flags");
}
