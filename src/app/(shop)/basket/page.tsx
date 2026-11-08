"use client";
import Link from "next/link";
import { useBasket } from "@/components/BasketProvider";
import { Sleeve } from "@/components/Sleeve";
import { gbp } from "@/lib/money";

export default function BasketPage() {
  const { items, ready, subtotal, setQty, remove } = useBasket();
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-4xl font-extrabold tracking-tight">Your basket</h1>
      {!ready ? <p className="mt-6 text-muted" role="status">Loading your basket…</p> : items.length === 0 ? (
        <div className="mt-6 border-l-4 border-orange bg-white p-5">
          <p className="font-bold">Your basket is empty.</p>
          <p className="mt-1">Find something to spin. <Link href="/records" className="underline underline-offset-4">Browse all records</Link>.</p>
        </div>
      ) : (
        <>
          <ul className="mt-6 divide-y divide-line border-y border-line">
            {items.map((i) => (
              <li key={i.id} className="grid grid-cols-[5.5rem_1fr] gap-4 py-5 sm:grid-cols-[7rem_1fr_auto]">
                <Sleeve src={i.image} alt="" sizes="112px" />
                <div>
                  <Link href={`/records/${i.id}`} className="text-lg font-extrabold leading-tight hover:text-orange-text">{i.artist}</Link>
                  <p>{i.title}</p>
                  <p className="mt-1 text-sm text-muted">{[i.format, i.grade && `Media ${i.grade}`].filter(Boolean).join(", ")}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    {i.max > 1 && (
                      <div className="flex items-center border border-line bg-white">
                        <button aria-label={`Fewer ${i.title}`} onClick={() => setQty(i.id, i.quantity - 1)} className="h-9 w-9 text-lg hover:bg-line">−</button>
                        <span className="num w-8 text-center" aria-live="polite">{i.quantity}</span>
                        <button aria-label={`More ${i.title}`} onClick={() => setQty(i.id, i.quantity + 1)} disabled={i.quantity >= i.max} className="h-9 w-9 text-lg hover:bg-line disabled:opacity-40">+</button>
                      </div>
                    )}
                    <button onClick={() => remove(i.id)} className="text-sm underline underline-offset-4">Remove</button>
                  </div>
                </div>
                <p className="num col-start-2 text-xl font-extrabold sm:col-start-3">{gbp(i.price_pence * i.quantity)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-col items-end gap-3">
            <p className="text-lg">Subtotal <strong className="num ml-2 text-2xl">{gbp(subtotal)}</strong></p>
            <p className="text-sm text-muted">Delivery is added at the next step, once we know where it&apos;s going.</p>
            <Link href="/checkout" className="bg-orange px-8 py-3.5 text-lg font-bold text-ink hover:bg-orange-dark">Go to checkout</Link>
          </div>
        </>
      )}
    </main>
  );
}
