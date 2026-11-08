"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { parsePrice, conditionGrade, formatGroup } from "@/lib/importer/parse";

const back = (id: string, msg: string, kind: "ok" | "error" = "ok") => redirect(`/admin/inventory/${id}?${kind}=${encodeURIComponent(msg)}`);
const list = (v: FormDataEntryValue | null) => String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const txt = (v: FormDataEntryValue | null) => { const t = String(v ?? "").trim(); return t === "" ? null : t; };
const done = (id: string) => { revalidatePath("/admin/inventory"); revalidatePath(`/records/${id}`); revalidatePath("/"); };

export async function saveListing(id: string, formData: FormData) {
  await requireAdmin();
  const price = parsePrice(String(formData.get("price") ?? ""));
  if ("error" in price) return back(id, price.error, "error");
  const year = String(formData.get("year") ?? "").trim();
  if (year && !/^\d{4}$/.test(year)) return back(id, "Year must be four digits, like 1979", "error");
  const status = String(formData.get("status"));
  if (!["active", "hidden", "missing"].includes(status)) return back(id, "Invalid status", "error");
  const media = txt(formData.get("media_condition")), sleeve = txt(formData.get("sleeve_condition")), format = txt(formData.get("format"));
  const { error } = await db().from("listings").update({
    artist: String(formData.get("artist") ?? "").trim(), title: String(formData.get("title") ?? "").trim(),
    label: txt(formData.get("label")), catalog_number: txt(formData.get("catalog_number")),
    format, format_group: formatGroup(format), year: year ? Number(year) : null,
    genres: list(formData.get("genres")), styles: list(formData.get("styles")),
    media_condition: media, media_grade: conditionGrade(media), sleeve_condition: sleeve, sleeve_grade: conditionGrade(sleeve),
    price_pence: price.pence, comments: txt(formData.get("comments")), location: txt(formData.get("location")),
    featured: formData.get("featured") === "on", status,
  }).eq("id", id);
  if (error) return back(id, error.message, "error");
  done(id);
  back(id, "Saved");
}

/** Quantity changes always go through adjust_stock so they are logged and can never undercut held stock. */
export async function adjustStock(id: string, formData: FormData) {
  const admin = await requireAdmin();
  const delta = parseInt(String(formData.get("delta") ?? ""), 10);
  const reason = String(formData.get("reason"));
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1000) return back(id, "Enter a number such as -1 or 3", "error");
  if (!["discogs_sale", "manual", "correction"].includes(reason)) return back(id, "Choose a reason", "error");
  const { error } = await db().rpc("adjust_stock", { p_listing_id: id, p_delta: delta, p_reason: reason, p_note: txt(formData.get("note")), p_user: admin.email });
  if (error) return back(id, /INVALID_ADJUSTMENT/.test(error.message) ? "That would take stock below what customers currently have in checkout." : error.message, "error");
  done(id);
  back(id, `Stock changed by ${delta > 0 ? "+" : ""}${delta}`);
}

export async function uploadArtwork(id: string, formData: FormData) {
  await requireAdmin();
  const file = formData.get("artwork");
  if (!(file instanceof File) || file.size === 0) return back(id, "Choose an image first", "error");
  if (file.size > 12 * 1024 * 1024) return back(id, "That image is over 12 MB", "error");
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return back(id, "Use a JPEG, PNG or WebP image", "error");
  let out: Buffer;
  try {
    // Re-encoding strips metadata (including GPS) and caps the size, so pages stay fast.
    out = await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize(1200, 1200, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  } catch { return back(id, "That file isn't a readable image", "error"); }
  const path = `listings/${id}-${Date.now()}.webp`;
  const { error } = await db().storage.from("artwork").upload(path, out, { contentType: "image/webp", cacheControl: "31536000" });
  if (error) return back(id, `Upload failed: ${error.message}`, "error");
  const { data: old } = await db().from("listings").select("image_path").eq("id", id).single();
  await db().from("listings").update({ image_path: path }).eq("id", id);
  if (old?.image_path) await db().storage.from("artwork").remove([old.image_path]);
  done(id);
  back(id, "Artwork updated");
}

export async function removeArtwork(id: string) {
  await requireAdmin();
  const { data: old } = await db().from("listings").select("image_path").eq("id", id).single();
  await db().from("listings").update({ image_path: null }).eq("id", id);
  if (old?.image_path) await db().storage.from("artwork").remove([old.image_path]);
  done(id);
  back(id, "Artwork removed");
}
