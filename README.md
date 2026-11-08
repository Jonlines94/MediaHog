# MediaHog

Independent vinyl shop: Next.js 16, TypeScript, Tailwind, Supabase (Postgres), Stripe Checkout.

- `src/app/(shop)` storefront, `src/app/admin` dashboard, `src/app/api` checkout, Stripe webhook, import and cron endpoints
- `src/lib/importer` Discogs CSV parsing, planning and applying (match key: Discogs **listing ID**)
- `supabase/migrations` schema and the atomic stock functions (reserve, finalise, release, adjust)
- `tests` importer, catalogue search, webhook and stock tests (run on an embedded Postgres)

## Local development
```
npm install
cp .env.example .env.local   # fill in Supabase, Stripe, Resend values
npm run dev
npx vitest run               # tests
npm run lint && npx tsc --noEmit
```
To deploy, follow **DEPLOYMENT.md**.

## Key rules
- Orders become paid only in the Stripe webhook (signature-verified, idempotent).
- Stock is reserved atomically at checkout and held 30 minutes; the cron job releases expired holds.
- Importing never deletes: listings missing from a CSV are shown for you to hide or zero explicitly.
- No Discogs scraping or API use; Discogs artwork is not copied (their terms restrict it). Upload your own artwork in Admin > Inventory.
