import Link from "next/link";
import { Pig } from "./Pig";

export interface ShopSettings { name?: string; contact_email?: string; contact_phone?: string; address?: string; company?: string }

export function Footer({ shop }: { shop: ShopSettings }) {
  return (
    <footer className="mt-20 bg-ink text-paper">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3"><Pig className="h-12 w-12" /><p className="text-xl font-extrabold">MediaHog</p></div>
          <p className="mt-3 max-w-xs text-paper/70">Vinyl. Music. Obsession. An independent record shop.</p>
        </div>
        <nav aria-label="Shop" className="text-sm">
          <p className="font-bold">Shop</p>
          <ul className="mt-3 space-y-2 text-paper/75">
            <li><Link href="/records" className="hover:text-orange">All records</Link></li>
            <li><Link href="/records?sort=newest" className="hover:text-orange">Just in</Link></li>
            <li><Link href="/basket" className="hover:text-orange">Basket</Link></li>
          </ul>
        </nav>
        <nav aria-label="Help" className="text-sm">
          <p className="font-bold">Help</p>
          <ul className="mt-3 space-y-2 text-paper/75">
            <li><Link href="/delivery" className="hover:text-orange">Delivery</Link></li>
            <li><Link href="/returns" className="hover:text-orange">Returns and refunds</Link></li>
            <li><Link href="/contact" className="hover:text-orange">Contact</Link></li>
          </ul>
        </nav>
        <div className="text-sm">
          <p className="font-bold">Contact</p>
          <address className="mt-3 space-y-2 not-italic text-paper/75">
            {shop.contact_email && <p><a className="hover:text-orange" href={`mailto:${shop.contact_email}`}>{shop.contact_email}</a></p>}
            {shop.contact_phone && <p>{shop.contact_phone}</p>}
            {shop.address && <p className="whitespace-pre-line">{shop.address}</p>}
          </address>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-x-6 gap-y-2 px-4 py-4 text-xs text-paper/60 sm:px-6">
          <span>© {new Date().getFullYear()} {shop.company || "MediaHog"}</span>
          <Link href="/privacy" className="hover:text-orange">Privacy policy</Link>
          <Link href="/terms" className="hover:text-orange">Terms of sale</Link>
        </div>
      </div>
    </footer>
  );
}
