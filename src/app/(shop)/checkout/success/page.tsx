import Link from "next/link";
import { getStripe } from "@/lib/stripe";
import { ClearBasket } from "@/components/ClearBasket";

export const metadata = { title: "Order received", robots: { index: false } };

// Display only. This page never marks anything paid: that happens in the verified webhook.
export default async function Success({ searchParams }: PageProps<"/checkout/success">) {
  const { session_id } = await searchParams;
  let paid = false, orderNumber: string | undefined, email: string | null = null;
  if (typeof session_id === "string" && /^cs_[A-Za-z0-9_]+$/.test(session_id)) {
    try {
      const s = await getStripe().checkout.sessions.retrieve(session_id);
      paid = s.payment_status === "paid"; orderNumber = s.metadata?.order_number; email = s.customer_email;
    } catch { /* fall through to the generic message */ }
  }
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      {paid && <ClearBasket />}
      <h1 className="text-4xl font-extrabold tracking-tight">{paid ? "Thank you, your order is in" : "We're confirming your payment"}</h1>
      {paid ? (
        <p className="mt-4 text-lg">{orderNumber && <>Order <strong className="num">#{orderNumber}</strong>. </>}A confirmation is on its way{email ? <> to <strong>{email}</strong></> : ""}. We&apos;ll email again when it&apos;s posted.</p>
      ) : (
        <p className="mt-4 text-lg">If you completed payment, your confirmation email will arrive shortly. If you don&apos;t get one within a few minutes, <Link href="/contact" className="underline underline-offset-4">contact us</Link> and quote the email address you used.</p>
      )}
      <Link href="/records" className="mt-8 inline-block bg-orange px-6 py-3 font-bold text-ink hover:bg-orange-dark">Keep browsing</Link>
    </main>
  );
}
