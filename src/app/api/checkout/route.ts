import { NextResponse } from "next/server";
import { CheckoutBody, CheckoutError, createCheckout } from "@/lib/checkout";
import { db } from "@/lib/supabase/admin";

export const maxDuration = 30;

export async function POST(req: Request) {
  const parsed = CheckoutBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check your details.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  try {
    return NextResponse.json(await createCheckout(parsed.data, ip));
  } catch (err) {
    if (err instanceof CheckoutError) return NextResponse.json({ error: err.message, ...err.detail }, { status: err.status });
    await db().from("error_log").insert({ source: "checkout.create", message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Something went wrong starting your payment. You haven't been charged. Please try again." }, { status: 500 });
  }
}
