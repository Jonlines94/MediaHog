import Link from "next/link";
import { Logo } from "./Logo";
import { BasketLink } from "./BasketLink";

export function Header({ defaultQuery = "" }: { defaultQuery?: string }) {
  return (
    <header className="bg-ink text-paper">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Logo />
        <form action="/records" role="search" className="order-last flex w-full min-w-0 flex-1 md:order-none md:w-auto">
          <label htmlFor="site-search" className="sr-only">Search records</label>
          <input id="site-search" name="q" defaultValue={defaultQuery} placeholder="Search artist, title or label"
            className="min-w-0 flex-1 bg-paper px-4 py-2.5 text-ink placeholder:text-muted" />
          <button className="bg-orange px-5 font-bold text-ink hover:bg-orange-dark">Search</button>
        </form>
        <nav aria-label="Main" className="ml-auto flex items-center gap-5 text-sm font-medium">
          <Link href="/records" className="hover:text-orange">All records</Link>
          <Link href="/records?sort=newest" className="hidden hover:text-orange sm:inline">Just in</Link>
          <BasketLink />
        </nav>
      </div>
    </header>
  );
}
