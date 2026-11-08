import { adminRoute, json } from "@/lib/http";
import { db } from "@/lib/supabase/admin";

/** Progress / status polling for the import screen. */
export const GET = adminRoute("import.status", async (_req, ctx: RouteContext<"/api/admin/import/[id]">) => {
  const { id } = await ctx.params;
  const { data } = await db().from("imports")
    .select("id,filename,mode,status,total_rows,processed_rows,summary,created_at,completed_at").eq("id", id).maybeSingle();
  return data ? json(data) : json({ error: "Not found" }, 404);
});
