import "server-only";
import { redirect } from "next/navigation";
import { sessionClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/admin";

export interface AdminUser { id: string; email: string }

/**
 * The single gate for every admin page and action. Being signed in is not enough:
 * the user must also be listed in the `admins` table.
 * getUser() validates the token with Supabase (unlike reading the cookie), so it can't be forged.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const supabase = await sessionClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/admin/login");
  const { data: row } = await db().from("admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (!row) redirect("/admin/login?error=not-admin");
  return { id: data.user.id, email: data.user.email ?? "" };
}

/** Same check for API route handlers: returns null instead of redirecting. */
export async function getAdminOrNull(): Promise<AdminUser | null> {
  const supabase = await sessionClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: row } = await db().from("admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  return row ? { id: data.user.id, email: data.user.email ?? "" } : null;
}
