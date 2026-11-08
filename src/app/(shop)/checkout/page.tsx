"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useBasket } from "@/components/BasketProvider";
import { countryOptions } from "@/lib/countries";
import { gbp } from "@/lib/money";

type Problem = { id: string; title: string; reason: string };
const field = "mt-1 w-full border border-line bg-white px-3 py-2.5";

export default function Checkout() {
  const { items, ready, subtotal, count, remove } = useBasket();
  const [country, setCountry] = useState("GB");
  const [answer, setAnswer] = useState<{ key: string; quote: { zone: string; pence: number } | "none" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const countries = useMemo(() => countryOptions(), []);

  // The quote is tied to the exact request it answers, so a stale answer is simply ignored (no "reset" state needed).
  const key = `${country}|${count}|${subtotal}`;
  useEffect(() => {
    if (!ready || count === 0) return;
    let live = true;
    fetch(`/api/shipping-quote?country=${country}&count=${count}&subtotal=${subtotal}`)
      .then((r) => (r.ok ? r.json() : "none")).then((q) => live && setAnswer({ key, quote: q })).catch(() => live && setAnswer({ key, quote: "none" }));
    return () => { live = false; };
  }, [country, count, subtotal, ready, key]);
  const quote = answer?.key === key ? answer.quote : null;

  if (!ready) return <main className="mx-auto max-w-5xl px-4 py-8"><p role="status" className="text-muted">Loading…</p></main>;
  if (items.length === 0) return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-4xl font-extrabold tracking-tight">Checkout</h1>
      <p className="mt-4 border-l-4 border-orange bg-white p-5">Your basket is empty. <Link href="/records" className="underline underline-offset-4">Browse all records</Link>.</p>
    </main>
  );

  const shipping = quote && quote !== "none" ? quote.pence : null;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(null); setProblems([]); setFields({});
    const f = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    try {
      const res = await fetch("/api/checkout", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...f, items: items.map((i) => ({ id: i.id, quantity: i.quantity })) }),
      });
      const body = await res.json();
      if (res.ok && body.url) { window.location.href = body.url; return; }
      setError(body.error ?? "Something went wrong."); setProblems(body.problems ?? []); setFields(body.fields ?? {});
    } catch { setError("We couldn't reach the shop. Check your connection and try again."); }
    setBusy(false);
  }
  const err = (k: string) => fields[k]?.[0] && <p className="mt-1 text-sm text-orange-text" role="alert">{fields[k][0]}</p>;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-4xl font-extrabold tracking-tight">Checkout</h1>
      <div className="mt-6 grid gap-10 md:grid-cols-[1fr_20rem]">
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && (
            <div role="alert" className="border-l-4 border-orange bg-orange/10 p-4">
              <p className="font-bold">{error}</p>
              {problems.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {problems.filter((p) => p.id).map((p) => (
                    <li key={p.id}>{p.title} is {p.reason}. <button type="button" onClick={() => remove(p.id)} className="underline underline-offset-4">Remove it</button></li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <h2 className="text-xl font-extrabold">Contact</h2>
          <div><label htmlFor="email" className="font-medium">Email</label><input id="email" name="email" type="email" required autoComplete="email" className={field} />{err("email")}</div>
          <div><label htmlFor="phone" className="font-medium">Phone (optional, for the courier)</label><input id="phone" name="phone" type="tel" autoComplete="tel" className={field} /></div>
          <h2 className="pt-4 text-xl font-extrabold">Delivery address</h2>
          <div><label htmlFor="name" className="font-medium">Full name</label><input id="name" name="name" required autoComplete="name" className={field} />{err("name")}</div>
          <div><label htmlFor="country" className="font-medium">Country</label>
            <select id="country" name="country" value={country} onChange={(e) => setCountry(e.target.value)} autoComplete="country" className={field}>
              {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>{err("country")}</div>
          <div><label htmlFor="line1" className="font-medium">Address line 1</label><input id="line1" name="line1" required autoComplete="address-line1" className={field} />{err("line1")}</div>
          <div><label htmlFor="line2" className="font-medium">Address line 2 (optional)</label><input id="line2" name="line2" autoComplete="address-line2" className={field} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="city" className="font-medium">Town or city</label><input id="city" name="city" required autoComplete="address-level2" className={field} />{err("city")}</div>
            <div><label htmlFor="postcode" className="font-medium">Postcode</label><input id="postcode" name="postcode" required autoComplete="postal-code" className={field} />{err("postcode")}</div>
          </div>
          <div><label htmlFor="region" className="font-medium">County or state (optional)</label><input id="region" name="region" autoComplete="address-level1" className={field} /></div>
          <button disabled={busy || quote === "none"} className="mt-2 w-full bg-orange px-6 py-4 text-lg font-bold text-ink hover:bg-orange-dark disabled:opacity-50">
            {busy ? "Taking you to payment…" : "Continue to payment"}
          </button>
          <p className="text-sm text-muted">You&apos;ll pay on Stripe&apos;s secure page, with card, Apple Pay or Google Pay where your device supports them. We never see your card details. Records are held for you for 30 minutes while you pay.</p>
        </form>

        <aside aria-label="Order summary" className="h-fit border border-line bg-white p-5 md:sticky md:top-6">
          <h2 className="text-xl font-extrabold">Your order</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 py-2"><span><strong>{i.artist}</strong>, {i.title}{i.quantity > 1 && ` × ${i.quantity}`}</span><span className="num shrink-0">{gbp(i.price_pence * i.quantity)}</span></li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1 border-t border-line pt-3">
            <div className="flex justify-between"><dt>Subtotal</dt><dd className="num">{gbp(subtotal)}</dd></div>
            <div className="flex justify-between"><dt>Delivery{quote && quote !== "none" ? ` (${quote.zone})` : ""}</dt>
              <dd className="num" aria-live="polite">{quote === "none" ? "Not available" : shipping === null ? "…" : shipping === 0 ? "Free" : gbp(shipping)}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 text-lg font-extrabold"><dt>Total</dt><dd className="num">{shipping === null ? "…" : gbp(subtotal + shipping)}</dd></div>
          </dl>
          {quote === "none" && <p className="mt-3 text-sm text-orange-text" role="alert">We don&apos;t have a delivery rate for that country yet. <Link href="/contact" className="underline">Contact us</Link>.</p>}
        </aside>
      </div>
    </main>
  );
}
