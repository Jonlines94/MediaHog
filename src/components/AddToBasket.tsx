"use client";
import { useState } from "react";
import { useBasket } from "./BasketProvider";
import type { Card } from "@/lib/catalogue";

export function AddToBasket({ card, size = "lg" }: { card: Card; size?: "sm" | "lg" }) {
  const basket = useBasket();
  const [justAdded, setJustAdded] = useState(false);
  const inBasket = basket.items.find((i) => i.id === card.id);
  const full = !!inBasket && inBasket.quantity >= card.available;

  const pad = size === "lg" ? "px-6 py-3.5 text-base" : "px-3 py-2 text-sm";
  return (
    <>
      <button
        type="button" disabled={full}
        onClick={() => {
          basket.add({
            id: card.id, artist: card.artist, title: card.title, price_pence: card.price_pence, image: card.image,
            format: card.format_group, grade: card.media_grade, max: card.available,
          });
          setJustAdded(true); setTimeout(() => setJustAdded(false), 1800);
        }}
        className={`${pad} bg-orange font-bold text-ink hover:bg-orange-dark disabled:cursor-not-allowed disabled:bg-line disabled:text-muted`}>
        {full ? "In your basket" : justAdded ? "Added" : "Add to basket"}
      </button>
      <span className="sr-only" role="status">{justAdded ? `${card.artist}, ${card.title} added to your basket` : ""}</span>
    </>
  );
}
