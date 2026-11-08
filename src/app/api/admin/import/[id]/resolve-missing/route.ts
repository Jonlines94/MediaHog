import { z } from "zod";
import { adminRoute, json } from "@/lib/http";
import { db } from "@/lib/supabase/admin";

const Body = z.object({ action: z.enum(["hide", "zero"]), confirmCount: z.number().int().positive() });

/**
 * Listings the CSV did not contain. Exact set = active, in stock, and not touched by this import
 * (every row present in the CSV is stamped with this import's id). Requires the admin to
 * type back the number affected, so a stale screen can never act on a different set.
 */
export const POST = adminRoute("import.resolve-missing", async (req, ctx: RouteContext<"/api/admin/import/[id]/resolve-missing">, admin) => {
  const { id } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "Invalid request" }, 400);

  const { data: imp } = await db().from("imports").select("mode,status").eq("id", id).maybeSingle();
  if (!imp || imp.mode !== "update" || imp.status !== "completed") {
    return json({ error: "Only a completed Update Stock import can be used to resolve missing listings" }, 409);
  }
  const { data: rows, error } = await db().from("listings").select("id")
    .eq("status", "active").gt("quantity", 0).or(`last_import_id.is.null,last_import_id.neq.${id}`).limit(20000);
  if (error) throw error;
  const ids = (rows ?? []).map((r) => r.id as string);
  if (ids.length !== body.data.confirmCount) {
    return json({ error: `The number of affected listings changed (now ${ids.length}). Please review again.` }, 409);
  }
  const { data: n, error: e2 } = await db().rpc("resolve_missing", { p_import_id: id, p_listing_ids: ids, p_action: body.data.action, p_user: admin.email });
  if (e2) throw e2;
  return json({ ok: true, affected: n });
});
