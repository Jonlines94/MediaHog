"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { parsePrice } from "@/lib/importer/parse";
import { isCountry } from "@/lib/countries";

const back = (msg: string, kind: "ok" | "error" = "ok") => redirect(`/admin/settings?${kind}=${encodeURIComponent(msg)}`);
const t = (v: FormDataEntryValue | null, max = 300) => String(v ?? "").trim().slice(0, max);

export async function saveShop(formData: FormData) {
  await requireAdmin();
  const email = t(formData.get("contact_email"), 200);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return back("That email address doesn't look right", "error");
  const { data: cur } = await db().from("settings").select("value").eq("key", "shop").maybeSingle();
  const value = { ...(cur?.value ?? {}), name: t(formData.get("name"), 80) || "MediaHog", tagline: t(formData.get("tagline"), 120),
    contact_email: email, contact_phone: t(formData.get("contact_phone"), 40), address: t(formData.get("address"), 400), company: t(formData.get("company"), 160) };
  const { error } = await db().from("settings").upsert({ key: "shop", value, updated_at: new Date().toISOString() });
  if (error) return back(error.message, "error");
  revalidatePath("/", "layout");
  back("Shop details saved");
}

function parseZone(formData: FormData) {
  const first = parsePrice(t(formData.get("first"))), extra = parsePrice(t(formData.get("extra")));
  if ("error" in first) return { error: `First record price: ${first.error}` };
  if ("error" in extra) return { error: `Extra record price: ${extra.error}` };
  const freeRaw = t(formData.get("free_over"));
  let free: number | null = null;
  if (freeRaw) { const f = parsePrice(freeRaw); if ("error" in f) return { error: `Free delivery threshold: ${f.error}` }; free = f.pence; }
  const countries = t(formData.get("countries"), 2000).split(/[\s,]+/).map((c) => c.toUpperCase()).filter(Boolean);
  const bad = countries.find((c) => !isCountry(c));
  if (bad) return { error: `"${bad}" isn't a country code we can ship to. Use two-letter codes like GB, FR, US.` };
  const name = t(formData.get("name"), 80);
  if (!name) return { error: "Give the zone a name" };
  return { value: { name, first_item_pence: first.pence, additional_item_pence: extra.pence, free_over_pence: free, countries } };
}

export async function saveZone(id: string, formData: FormData) {
  await requireAdmin();
  const z = parseZone(formData);
  if ("error" in z) return back(z.error!, "error");
  const { data: cur } = await db().from("shipping_zones").select("is_default").eq("id", id).single();
  const { error } = await db().from("shipping_zones").update(cur?.is_default ? { ...z.value, countries: [] } : z.value).eq("id", id);
  if (error) return back(error.message, "error");
  revalidatePath("/delivery");
  back(`${z.value!.name} rates saved`);
}

export async function addZone(formData: FormData) {
  await requireAdmin();
  const z = parseZone(formData);
  if ("error" in z) return back(z.error!, "error");
  if (z.value!.countries.length === 0) return back("List at least one country for a new zone", "error");
  const { data: last } = await db().from("shipping_zones").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const { error } = await db().from("shipping_zones").insert({ ...z.value, is_default: false, sort_order: (last?.[0]?.sort_order ?? 0) + 1 });
  if (error) return back(error.message, "error");
  revalidatePath("/delivery");
  back("Zone added");
}

export async function deleteZone(id: string) {
  await requireAdmin();
  const { data: z } = await db().from("shipping_zones").select("is_default").eq("id", id).single();
  if (z?.is_default) return back("The catch-all zone can't be deleted, because it covers every other country", "error");
  await db().from("shipping_zones").delete().eq("id", id);
  revalidatePath("/delivery");
  back("Zone deleted");
}
