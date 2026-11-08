import "server-only";
import { NextResponse } from "next/server";
import { getAdminOrNull, type AdminUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/** Wrap an admin API handler: 401 unless a listed admin, and log unexpected errors. */
export function adminRoute<C>(source: string, handler: (req: Request, ctx: C, admin: AdminUser) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    const admin = await getAdminOrNull();
    if (!admin) return json({ error: "Not authorised" }, 401);
    try {
      return await handler(req, ctx, admin);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db().from("error_log").insert({ source, message, detail: { stack: err instanceof Error ? err.stack : null } });
      return json({ error: message }, 500);
    }
  };
}
