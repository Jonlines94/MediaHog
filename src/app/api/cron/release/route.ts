import { NextResponse } from "next/server";
import { db } from "@/lib/supabase/admin";

/** Releases stock held by abandoned checkouts. Called on a schedule (see vercel.json). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const { data, error } = await db().rpc("release_expired_orders");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ released: data });
}
