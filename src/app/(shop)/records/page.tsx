import Link from "next/link";
import type { Metadata } from "next";
import { RecordCard } from "@/components/RecordCard";
import { getFacets, parseFilters, searchCatalogue, PAGE_SIZE, type Filters, type Facets } from "@/lib/catalogue";
import { GRADES } from "@/lib/money";

export async function generateMetadata({ searchParams }: PageProps<"/records">): Promise<Metadata> {
  const f = parseFilters(await searchParams);
  const t = f.q ? `Search: ${f.q}` : f.format ?? f.genre ?? f.style ?? "All records";
  return { title: t, robots: f.q || f.page! > 1 ? { index: false, follow: true } : undefined };
}

function href(f: Filters, patch: Partial<Record<string, string | number | undefined>> = {}) {
  const p = new URLSearchParams();
  const set = (k: string, v: unknown) => { if (v !== undefined && v !== "" && v !== null) p.set(k, String(v)); };
  set("q", f.q); set("format", f.format); set("genre", f.genre); set("style", f.style); set("artist", f.artist);
  f.grades?.forEach((g) => p.append("grade", g));
  set("from", f.yearMin); set("to", f.yearMax);
  set("min", f.priceMin !== undefined ? f.priceMin / 100 : undefined); set("max", f.priceMax !== undefined ? f.priceMax / 100 : undefined);
  if (f.sort && f.sort !== (f.q ? "relevance" : "newest")) set("sort", f.sort);
  for (const [k, v] of Object.entries(patch)) { if (v === undefined) p.delete(k); else p.set(k, String(v)); }
  const s = p.toString();
  return s ? `/records?${s}` : "/records";
}

const SORTS: [string, string][] = [["newest", "Newest first"], ["price_asc", "Price, low to high"], ["price_desc", "Price, high to low"], ["artist", "Artist A to Z"], ["title", "Title A to Z"], ["year_desc", "Year, newest first"]];

export default async function Records({ searchParams }: PageProps<"/records">) {
  const f = parseFilters(await searchParams);
  const [{ cards, total }, facets] = await Promise.all([searchCatalogue(f), getFacets()]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(f.page ?? 1, pages);
  const active = [f.format, f.genre, f.style, f.artist, f.grades?.length ? f.grades.join(", ") : undefined].filter(Boolean);
  const sortOptions = f.q ? [["relevance", "Best match"] as [string, string], ...SORTS] : SORTS;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-4xl font-extrabold tracking-tight">{f.q ? `Results for “${f.q}”` : f.format ?? f.genre ?? f.style ?? "All records"}</h1>
      <p className="mt-1 text-muted" role="status"><span className="num">{total.toLocaleString("en-GB")}</span> {total === 1 ? "record" : "records"} in stock</p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[16rem_1fr]">
        <aside aria-label="Filters" className="h-fit">
          <details className="border border-line bg-white lg:hidden">
            <summary className="cursor-pointer p-3 font-bold">Filters and sorting{active.length ? ` (${active.length} applied)` : ""}</summary>
            <div className="p-3 pt-0"><FilterForm idp="m" f={f} facets={facets} sortOptions={sortOptions} /></div>
          </details>
          <div className="hidden lg:block"><FilterForm idp="d" f={f} facets={facets} sortOptions={sortOptions} /></div>
        </aside>

        <section aria-label="Records">
          {active.length > 0 && <p className="mb-4 text-sm text-muted">Filtered by {active.join(", ")}</p>}
          {cards.length === 0 ? (
            <div className="border-l-4 border-orange bg-white p-5">
              <p className="font-bold">No records match that.</p>
              <p className="mt-1">Try fewer filters or a shorter search, such as just the artist&apos;s surname. <Link className="underline underline-offset-4" href="/records">See everything</Link>.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 xl:grid-cols-4">
              {cards.map((c, i) => <RecordCard key={c.id} card={c} priority={i < 4} />)}
            </div>
          )}
          {pages > 1 && (
            <nav aria-label="Pages" className="mt-12 flex flex-wrap items-center gap-2">
              {page > 1 && <Link rel="prev" href={href(f, { page: page - 1 })} className="border-2 border-ink px-4 py-2 font-bold hover:bg-ink hover:text-paper">Previous</Link>}
              <span className="num px-3 text-sm text-muted">Page {page} of {pages}</span>
              {page < pages && <Link rel="next" href={href(f, { page: page + 1 })} className="border-2 border-ink px-4 py-2 font-bold hover:bg-ink hover:text-paper">Next</Link>}
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}

function FilterForm({ idp, f, facets, sortOptions }: { idp: string; f: Filters; facets: Facets; sortOptions: [string, string][] }) {
  return (
    <form action="/records" className="space-y-6 p-3 pt-0 lg:p-0">
    {f.q && <input type="hidden" name="q" value={f.q} />}
    <div>
      <label htmlFor={`${idp}-sort`} className="font-bold">Sort by</label>
      <select id={`${idp}-sort`} name="sort" defaultValue={f.sort} className="mt-1 w-full border border-line bg-white px-3 py-2">
        {sortOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
    {facets.formats.length > 0 && (
      <div><label htmlFor={`${idp}-format`} className="font-bold">Format</label>
        <select id={`${idp}-format`} name="format" defaultValue={f.format ?? ""} className="mt-1 w-full border border-line bg-white px-3 py-2">
          <option value="">Any format</option>{facets.formats.map((x) => <option key={x.name} value={x.name}>{x.name} ({x.count})</option>)}
        </select></div>
    )}
    {facets.genres.length > 0 && (
      <div><label htmlFor={`${idp}-genre`} className="font-bold">Genre</label>
        <select id={`${idp}-genre`} name="genre" defaultValue={f.genre ?? ""} className="mt-1 w-full border border-line bg-white px-3 py-2">
          <option value="">Any genre</option>{facets.genres.map((x) => <option key={x.name} value={x.name}>{x.name} ({x.count})</option>)}
        </select></div>
    )}
    {facets.styles.length > 0 && (
      <div><label htmlFor={`${idp}-style`} className="font-bold">Style</label>
        <select id={`${idp}-style`} name="style" defaultValue={f.style ?? ""} className="mt-1 w-full border border-line bg-white px-3 py-2">
          <option value="">Any style</option>{facets.styles.map((x) => <option key={x.name} value={x.name}>{x.name} ({x.count})</option>)}
        </select></div>
    )}
    {facets.grades.length > 0 && (
      <fieldset><legend className="font-bold">Media condition</legend>
        <div className="mt-1 space-y-1">
          {facets.grades.map((g) => (
            <label key={g.name} className="flex items-center gap-2">
              <input type="checkbox" name="grade" value={g.name} defaultChecked={f.grades?.includes(g.name)} className="h-4 w-4 accent-orange" />
              <span>{GRADES[g.name] ?? g.name} ({g.name})</span><span className="num ml-auto text-sm text-muted">{g.count}</span>
            </label>
          ))}
        </div></fieldset>
    )}
    <fieldset><legend className="font-bold">Price in pounds</legend>
      <div className="mt-1 flex items-center gap-2">
        <label className="sr-only" htmlFor={`${idp}-min`}>Lowest price</label><input id={`${idp}-min`} name="min" type="number" min="0" step="1" inputMode="numeric" placeholder="Min" defaultValue={f.priceMin !== undefined ? f.priceMin / 100 : ""} className="num w-full border border-line bg-white px-3 py-2" />
        <span aria-hidden>to</span>
        <label className="sr-only" htmlFor={`${idp}-max`}>Highest price</label><input id={`${idp}-max`} name="max" type="number" min="0" step="1" inputMode="numeric" placeholder="Max" defaultValue={f.priceMax !== undefined ? f.priceMax / 100 : ""} className="num w-full border border-line bg-white px-3 py-2" />
      </div></fieldset>
    {facets.years?.min && (
      <fieldset><legend className="font-bold">Year released</legend>
        <div className="mt-1 flex items-center gap-2">
          <label className="sr-only" htmlFor={`${idp}-from`}>From year</label><input id={`${idp}-from`} name="from" type="number" min="1900" max="2100" placeholder={String(facets.years.min)} defaultValue={f.yearMin ?? ""} className="num w-full border border-line bg-white px-3 py-2" />
          <span aria-hidden>to</span>
          <label className="sr-only" htmlFor={`${idp}-to`}>To year</label><input id={`${idp}-to`} name="to" type="number" min="1900" max="2100" placeholder={String(facets.years.max)} defaultValue={f.yearMax ?? ""} className="num w-full border border-line bg-white px-3 py-2" />
        </div></fieldset>
    )}
    <div className="flex gap-3">
      <button className="bg-orange px-5 py-2.5 font-bold text-ink hover:bg-orange-dark">Apply</button>
      <Link href={f.q ? `/records?q=${encodeURIComponent(f.q)}` : "/records"} className="py-2.5 underline underline-offset-4">Clear filters</Link>
    </div>
          </form>
  );
}
