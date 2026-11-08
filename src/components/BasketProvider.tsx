"use client";
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

export interface BasketItem {
  id: string; artist: string; title: string; price_pence: number; image: string | null;
  format: string | null; grade: string | null; quantity: number; max: number;
}
interface Ctx {
  items: BasketItem[]; ready: boolean; count: number; subtotal: number;
  add(item: Omit<BasketItem, "quantity">, qty?: number): void;
  setQty(id: string, qty: number): void; remove(id: string): void; clear(): void;
}
const BasketCtx = createContext<Ctx | null>(null);
const KEY = "mediahog-basket-v1";

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };   // other tabs
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(cb); window.removeEventListener("storage", onStorage); };
};
const readRaw = () => { try { return localStorage.getItem(KEY) ?? "[]"; } catch { return "[]"; } };
const noopSubscribe = () => () => {};

/** The basket lives in the browser. Prices and stock are re-checked on the server at checkout. */
export function BasketProvider({ children }: { children: React.ReactNode }) {
  // useSyncExternalStore reads localStorage without a flash or an extra render, and is safe during server rendering.
  const raw = useSyncExternalStore(subscribe, readRaw, () => "[]");
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const items = useMemo<BasketItem[]>(() => { try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; } }, [raw]);

  const save = useCallback((next: BasketItem[]) => {
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: basket just won't persist */ }
    listeners.forEach((l) => l());   // storage events don't fire in the tab that made the change
  }, []);

  const value = useMemo<Ctx>(() => ({
    items, ready,
    count: items.reduce((n, i) => n + i.quantity, 0),
    subtotal: items.reduce((n, i) => n + i.quantity * i.price_pence, 0),
    add: (item, qty = 1) => {
      const found = items.find((i) => i.id === item.id);
      if (found) save(items.map((i) => (i.id === item.id ? { ...i, ...item, quantity: Math.min(item.max, i.quantity + qty) } : i)));
      else save([...items, { ...item, quantity: Math.min(item.max, qty) }]);
    },
    setQty: (id, qty) => save(items.flatMap((i) => (i.id !== id ? [i] : qty <= 0 ? [] : [{ ...i, quantity: Math.min(i.max, qty) }]))),
    remove: (id) => save(items.filter((i) => i.id !== id)),
    clear: () => save([]),
  }), [items, ready, save]);

  return <BasketCtx.Provider value={value}>{children}</BasketCtx.Provider>;
}

export function useBasket() {
  const c = useContext(BasketCtx);
  if (!c) throw new Error("useBasket must be used inside BasketProvider");
  return c;
}
