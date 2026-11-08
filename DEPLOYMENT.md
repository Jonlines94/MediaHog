# Deploying MediaHog

Hosting assumed: **Vercel** (app) + **Supabase** (database, login, image storage) + **Stripe** (payments) + **Resend** (email). All have free or low-cost tiers.

## 1. Database (Supabase)
1. Create a project at supabase.com (choose a London/EU region).
2. Open **SQL Editor** and run the files in `supabase/migrations/` **in order**: `0001` to `0005`. Each one should finish with "Success".
3. Copy the URL, anon key and service-role key from **Project settings > API** (the service-role key is secret).
4. Under **Authentication > Providers**, keep Email on and switch **Allow new users to sign up OFF** (admin users are created by hand).

## 2. Admin account
1. **Authentication > Users > Add user**: enter your email and a strong password, tick "Auto confirm".
2. Copy the new user's UUID, then in the SQL Editor run:
   `insert into admins (user_id) values ('PASTE-UUID-HERE');`
3. Sign in at `/admin/login`. Only users listed in `admins` can enter the dashboard.

## 3. Stripe
1. Dashboard > Developers > API keys: copy the secret key into `STRIPE_SECRET_KEY`.
2. Developers > Webhooks > Add endpoint: `https://mediahog.co.uk/api/stripe/webhook`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.expired`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Settings > Payment methods: make sure Cards, Apple Pay and Google Pay are enabled. Apple Pay on Stripe Checkout needs no extra setup.
4. Test first with `sk_test_` keys and card `4242 4242 4242 4242`, then switch to live keys.

## 4. Email (Resend)
Add and verify `mediahog.co.uk` in Resend (it gives you DNS records to add), create an API key, set `RESEND_API_KEY` and `EMAIL_FROM`.

## 5. App (Vercel)
1. Push this folder to a GitHub repo and import it in Vercel.
2. Add every variable from `.env.example` under **Settings > Environment Variables**.
3. Deploy. `vercel.json` already schedules `/api/cron/release` every 10 minutes (releases abandoned checkouts). Vercel sends `CRON_SECRET` automatically.
4. **Domain**: Vercel > Settings > Domains > add `mediahog.co.uk` and `www.mediahog.co.uk`; at your registrar set the A record / CNAME it shows. **SSL** is issued automatically within minutes.
5. Change `NEXT_PUBLIC_SITE_URL` if the domain differs, then redeploy.

Note: Vercel's free tier limits request bodies to about 4.5 MB and functions to 10-60 s. The importer gzips the CSV in the browser and applies it in batches of 500 rows, so a 9,000-row export is well inside both limits.

## 6. First-run checklist
1. Admin > **CSV import**: upload your Discogs export, check the preview, confirm.
2. Admin > **Settings**: shop details, shipping zones and prices, policy text (the supplied delivery/returns/privacy/terms wording is generic: please review it).
3. Place a test order with Stripe test keys; confirm it shows as Paid in Admin > Orders and stock drops.
4. Switch Stripe to live keys.

## Backups
- Supabase Pro includes daily backups. On the free tier, schedule `pg_dump` yourself, or in **Database > Backups** download regularly.
- Always keep your latest Discogs export: re-importing it rebuilds the catalogue.
- Artwork lives in the `artwork` storage bucket; download it periodically if you rely on it.

## Troubleshooting
- "Missing environment variable X": add it in Vercel and redeploy.
- Order stuck unpaid: check Stripe > Webhooks for failed deliveries; resend the event.
- Cannot sign in to admin: confirm your user is in the `admins` table.
