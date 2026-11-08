"use client";
import { useEffect, useRef } from "react";
import { useBasket } from "./BasketProvider";

/** Empties the basket once, after a confirmed payment. */
export function ClearBasket() {
  const { clear, ready } = useBasket();
  const done = useRef(false);
  useEffect(() => { if (ready && !done.current) { done.current = true; clear(); } }, [ready, clear]);
  return null;
}
