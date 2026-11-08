import Link from "next/link";
import { Sleeve } from "./Sleeve";
import { AddToBasket } from "./AddToBasket";
import { gbp } from "@/lib/money";
import type { Card } from "@/lib/catalogue";

export function RecordCard({ card, priority = false }: { card: Card; priority?: boolean }) {
  const grades = [card.media_grade && `Media ${card.media_grade}`, card.sleeve_grade && `Sleeve ${card.sleeve_grade}`].filter(Boolean).join(", ");
  return (
    <article className="group flex flex-col">
      <Link href={`/records/${card.id}`} className="block" aria-label={`${card.artist}, ${card.title}, ${gbp(card.price_pence)}`}>
        <Sleeve src={card.image} alt={`${card.artist}, ${card.title}`} priority={priority} />
        <h3 className="mt-3 text-lg font-extrabold leading-tight tracking-tight group-hover:text-orange-text">{card.artist}</h3>
        <p className="leading-snug">{card.title}</p>
        <p className="mt-1 text-sm text-muted">{[card.format_group, card.year].filter(Boolean).join(", ")}</p>
      </Link>
      <div className="mt-2 flex flex-col gap-2">
        <div>
          <p className="num text-xl font-extrabold">{gbp(card.price_pence)}</p>
          {grades && <p className="text-xs text-muted">{grades}</p>}
        </div>
        <div className="[&>button]:w-full"><AddToBasket card={card} size="sm" /></div>
      </div>
    </article>
  );
}
