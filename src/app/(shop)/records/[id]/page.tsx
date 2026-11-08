import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Sleeve } from "@/components/Sleeve";
import { AddToBasket } from "@/components/AddToBasket";
import { getListing } from "@/lib/catalogue";
import { gbp, GRADES } from "@/lib/money";

export async function generateMetadata({ params }: PageProps<"/records/[id]">): Promise<Metadata> {
  const l = await getListing((await params).id);
  if (!l) return { title: "Record not found" };
  return { title: `${l.artist}, ${l.title}`, description: `${l.artist}, ${l.title}${l.format ? ` on ${l.format}` : ""}. ${l.media_condition ?? ""} ${gbp(l.price_pence)}.`.trim(), openGraph: l.image ? { images: [l.image] } : undefined };
}

export default async function RecordPage({ params }: PageProps<"/records/[id]">) {
  const l = await getListing((await params).id);
  if (!l) notFound();

  const rows: [string, string | null | undefined][] = [
    ["Label", l.label], ["Catalogue number", l.catalog_number], ["Format", l.format], ["Year", l.year ? String(l.year) : null],
    ["Genre", l.genres.join(", ") || null], ["Style", l.styles.join(", ") || null],
  ];
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Product", name: `${l.artist}, ${l.title}`, image: l.image ?? undefined,
    brand: l.label ?? undefined, sku: l.catalog_number ?? undefined,
    offers: { "@type": "Offer", priceCurrency: "GBP", price: (l.price_pence / 100).toFixed(2), itemCondition: "https://schema.org/UsedCondition", availability: l.available > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" },
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/records" className="underline underline-offset-4">All records</Link></nav>
      <div className="mt-5 grid gap-10 md:grid-cols-[1fr_1fr]">
        <div className="md:sticky md:top-6 md:self-start"><Sleeve src={l.image} alt={`${l.artist}, ${l.title}`} sizes="(min-width:768px) 45vw, 100vw" priority /></div>
        <div>
          <h1 className="text-4xl font-extrabold leading-[1.02] tracking-tight md:text-5xl">{l.artist}</h1>
          <p className="mt-2 text-2xl">{l.title}</p>
          <p className="num mt-6 text-4xl font-extrabold">{gbp(l.price_pence)}</p>
          <p className="mt-1 text-sm text-muted">{l.available === 1 ? "One copy in stock" : `${l.available} copies in stock`}. <Link href="/delivery" className="underline underline-offset-4">Delivery costs</Link></p>
          <div className="mt-5"><AddToBasket card={l} /></div>

          <dl className="mt-8 divide-y divide-line border-y border-line">
            <div className="grid grid-cols-[9rem_1fr] gap-3 py-3"><dt className="text-muted">Media condition</dt><dd>{l.media_condition ?? "Not stated"}{l.media_grade && GRADES[l.media_grade] ? "" : ""}</dd></div>
            <div className="grid grid-cols-[9rem_1fr] gap-3 py-3"><dt className="text-muted">Sleeve condition</dt><dd>{l.sleeve_condition ?? "Not stated"}</dd></div>
            {rows.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[9rem_1fr] gap-3 py-3"><dt className="text-muted">{k}</dt><dd className="num">{v}</dd></div>
            ))}
          </dl>

          {l.comments && (
            <section className="mt-8" aria-labelledby="notes">
              <h2 id="notes" className="text-lg font-extrabold">Seller&apos;s notes</h2>
              <p className="notes mt-2 max-w-prose whitespace-pre-line">{l.comments}</p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
