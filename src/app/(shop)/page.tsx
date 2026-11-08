import Link from "next/link";
import { Pig } from "@/components/Pig";
import { RecordCard } from "@/components/RecordCard";
import { getFacets, getFeatured, searchCatalogue } from "@/lib/catalogue";
import { gbp } from "@/lib/money";

// Rendered per request so the build never needs the database and stock is always current.
export const dynamic = "force-dynamic";

// Real relative diameters (12" = 1) so the discs themselves tell you the format.
const DISC: Record<string, number> = { '12"': 1, LP: 1, '10"': 0.83, '7"': 0.58, CD: 0.4, "Box Set": 1, Vinyl: 0.9 };

export default async function Home() {
  const [facets, featured, fresh] = await Promise.all([getFacets(), getFeatured(8), searchCatalogue({ sort: "newest" }, 20)]);
  const justIn = fresh.cards.slice(0, 8);
  const recent = fresh.cards.slice(8, 20);
  const formats = facets.formats.filter((f) => f.name !== "Other");
  const genreList = facets.genres.length ? facets.genres : facets.styles;
  const genreKey = facets.genres.length ? "genre" : "style";

  return (
    <>
      <section className="relative overflow-hidden bg-ink text-paper">
        <div className="pointer-events-none absolute -right-24 top-1/2 hidden aspect-square w-[34rem] -translate-y-1/2 rounded-full border border-white/10 md:block" aria-hidden>
          <div className="absolute inset-[6%] rounded-full border border-white/10" /><div className="absolute inset-[14%] rounded-full border border-white/10" />
          <div className="absolute inset-[22%] rounded-full border border-white/10" />
          <div className="absolute inset-[34%] grid place-items-center rounded-full bg-orange"><Pig className="h-[85%] w-[85%]" accent="#000" /></div>
        </div>
        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 md:py-24">
          <h1 className="max-w-3xl text-[clamp(2.75rem,8vw,6.5rem)] font-extrabold leading-[.92] tracking-tight" style={{ fontVariationSettings: '"wdth" 85' }}>
            Vinyl. Music. Obsession.
          </h1>
          <form action="/records" role="search" className="mt-8 flex max-w-2xl">
            <label htmlFor="hero-search" className="sr-only">Search {facets.total} records</label>
            <input id="hero-search" name="q" placeholder={`Search ${facets.total.toLocaleString("en-GB")} records`}
              className="min-w-0 flex-1 bg-paper px-5 py-4 text-lg text-ink placeholder:text-muted" />
            <button className="bg-orange px-7 text-lg font-bold text-ink hover:bg-orange-dark">Search</button>
          </form>
          <p className="mt-4 max-w-xl text-paper/70">Try an artist, an album, a label or a catalogue number.</p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-16 px-4 pt-14 sm:px-6">
        {justIn.length > 0 && (
          <section aria-labelledby="just-in">
            <div className="flex items-baseline justify-between"><h2 id="just-in" className="text-3xl font-extrabold tracking-tight">Just in</h2>
              <Link href="/records?sort=newest" className="font-bold underline underline-offset-4 hover:text-orange-text">See all new arrivals</Link></div>
            <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-4">{justIn.map((c, i) => <RecordCard key={c.id} card={c} priority={i < 4} />)}</div>
          </section>
        )}

        {featured.length > 0 && (
          <section aria-labelledby="featured">
            <h2 id="featured" className="text-3xl font-extrabold tracking-tight">Featured records</h2>
            <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-4">{featured.map((c) => <RecordCard key={c.id} card={c} />)}</div>
          </section>
        )}

        {formats.length > 0 && (
          <section aria-labelledby="formats">
            <h2 id="formats" className="text-3xl font-extrabold tracking-tight">Browse by format</h2>
            <ul className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-6">
              {formats.map((f) => {
                const d = DISC[f.name] ?? 0.7;
                return (
                  <li key={f.name}>
                    <Link href={`/records?format=${encodeURIComponent(f.name)}`} className="group flex flex-col items-start gap-2">
                      {f.name === "Cassette" ? (
                        <span className="flex items-center justify-around bg-ink px-3" style={{ width: "5.2rem", height: "3.3rem" }} aria-hidden>
                          <span className="h-5 w-5 rounded-full bg-orange" /><span className="h-5 w-5 rounded-full bg-orange" />
                        </span>
                      ) : (
                        <span className="grid place-items-center rounded-full bg-ink transition-transform group-hover:rotate-45"
                          style={{ width: `${Math.round(d * 8)}rem`, height: `${Math.round(d * 8)}rem` }} aria-hidden>
                          <span className="rounded-full bg-orange" style={{ width: "34%", height: "34%" }} />
                        </span>
                      )}
                      <span className="font-extrabold">{f.name}</span>
                      <span className="num -mt-2 text-sm text-muted">{f.count.toLocaleString("en-GB")} in stock</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {genreList.length > 0 && (
          <section aria-labelledby="genres">
            <h2 id="genres" className="text-3xl font-extrabold tracking-tight">Browse by {facets.genres.length ? "genre" : "style"}</h2>
            <ul className="mt-6 flex flex-wrap gap-2">
              {genreList.slice(0, 24).map((g) => (
                <li key={g.name}><Link href={`/records?${genreKey}=${encodeURIComponent(g.name)}`}
                  className="block border-2 border-ink px-4 py-2 font-bold hover:bg-ink hover:text-paper">{g.name} <span className="num font-normal text-muted">{g.count}</span></Link></li>
              ))}
            </ul>
          </section>
        )}

        {recent.length > 0 && (
          <section aria-labelledby="recent">
            <h2 id="recent" className="text-3xl font-extrabold tracking-tight">Recently added</h2>
            <ul className="mt-6 grid gap-x-10 md:grid-cols-2">
              {recent.map((c) => (
                <li key={c.id} className="border-t border-line">
                  <Link href={`/records/${c.id}`} className="flex items-baseline justify-between gap-4 py-3 hover:text-orange-text">
                    <span><strong>{c.artist}</strong>, {c.title}</span><span className="num shrink-0 font-bold">{gbp(c.price_pence)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {facets.total === 0 && (
          <p className="border-l-4 border-orange bg-white p-5">The shop is being stocked. Import your Discogs CSV in the admin area and records will appear here.</p>
        )}
      </div>
    </>
  );
}
