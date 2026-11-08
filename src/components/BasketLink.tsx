"use client";
import Link from "next/link";
import { useBasket } from "./BasketProvider";

export function BasketLink() {
  const { count, ready } = useBasket();
  return (
    <Link href="/basket" className="flex items-center gap-2 hover:text-orange" aria-label={`Basket, ${ready ? count : 0} items`}>
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M5 8h14l-1.2 11.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </svg>
      <span className="num grid h-6 min-w-6 place-items-center bg-orange px-1.5 text-sm font-extrabold text-ink">{ready ? count : 0}</span>
    </Link>
  );
}
