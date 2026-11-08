import { adminRoute, json } from "@/lib/http";
import { confirmImport } from "@/lib/importer/run";
import { supabaseStore } from "@/lib/importer/supabase-store";

export const maxDuration = 300;

export const POST = adminRoute("import.confirm", async (_req, ctx: RouteContext<"/api/admin/import/[id]/confirm">) => {
  const { id } = await ctx.params;
  try {
    return json({ ok: true, result: await confirmImport(supabaseStore(), id) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import failed";
    // Expected, user-correctable problems are 409; anything else is logged by adminRoute.
    if (/already been applied|no data left|Only Update/.test(msg)) return json({ error: msg }, 409);
    throw e;
  }
});
