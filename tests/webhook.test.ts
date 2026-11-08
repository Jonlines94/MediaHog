import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Stripe from "stripe";
import { startTestDb } from "./pg-helper";
import { pgStore } from "./pg-store";
import { supabaseShim } from "./supabase-shim";
import { makeRows, toCsv } from "./fixtures/make-discogs-csv";
import { previewImport, confirmImport } from "../src/lib/importer/run";

const SECRET = "whsec_test_secret";
let db: Awaited<ReturnType<typeof startTestDb>>;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/email", () => ({ sendOrderConfirmation: vi.fn(async () => true) }));
vi.mock("@/lib/supabase/admin", () => ({ db: () => supabaseShim(db.pool) }));

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = SECRET;

beforeAll(async () => { db = await startTestDb(54333); });
afterAll(async () => { await db.stop(); });
beforeEach(async () => {
  await db.pool.query("truncate listings, imports, orders, processed_stripe_events, error_log, stock_movements cascade");
  const store = pgStore(db.pool);
  const p = await previewImport(store, "i.csv", toCsv(makeRows(3)), "update");
  await confirmImport(store, p.importId);
});

async function pendingOrder() {
  const l = (await db.pool.query("select id from listings order by id limit 1")).rows[0].id;
  const o = (await db.pool.query(
    `insert into orders (email, customer_name, ship_line1, ship_city, ship_postcode, ship_country, subtotal_pence, shipping_pence, total_pence)
     values ('a@b.c','A','1 St','Town','AB1','GB',1000,400,1400) returning id`)).rows[0].id;
  await db.pool.query(`insert into order_items (order_id, listing_id, artist, title, unit_price_pence, quantity) values ($1,$2,'x','y',1000,1)`, [o, l]);
  await db.pool.query(`select reserve_stock($1, $2::jsonb)`, [o, JSON.stringify([{ listing_id: l, quantity: 1 }])]);
  return { orderId: o as string, listingId: l as string };
}

async function post(event: object, opts: { badSig?: boolean } = {}) {
  const { POST } = await import("../src/app/api/stripe/webhook/route");
  const payload = JSON.stringify(event);
  const sig = opts.badSig ? "t=1,v1=deadbeef" : Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return POST(new Request("http://x/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": sig }, body: payload }));
}
const completed = (id: string, orderId: string, over: Record<string, unknown> = {}) => ({
  id, object: "event", type: "checkout.session.completed",
  data: { object: { id: "cs_test_1", object: "checkout.session", payment_status: "paid", amount_total: 1400, currency: "gbp", payment_intent: "pi_123", metadata: { order_id: orderId }, ...over } },
});
const status = async (id: string) => (await db.pool.query("select status from orders where id=$1", [id])).rows[0].status;
const stock = async (id: string) => (await db.pool.query("select quantity, reserved from listings where id=$1", [id])).rows[0];

describe("Stripe webhook", () => {
  it("rejects a forged signature and changes nothing", async () => {
    const { orderId, listingId } = await pendingOrder();
    const res = await post(completed("evt_forged", orderId), { badSig: true });
    expect(res.status).toBe(400);
    expect(await status(orderId)).toBe("pending");
    expect(await stock(listingId)).toEqual({ quantity: 1, reserved: 1 });
  });

  it("marks the order paid and deducts stock exactly once, even if Stripe redelivers", async () => {
    const { orderId, listingId } = await pendingOrder();
    expect((await post(completed("evt_1", orderId))).status).toBe(200);
    expect(await status(orderId)).toBe("paid");
    expect(await stock(listingId)).toEqual({ quantity: 0, reserved: 0 });
    const again = await (await post(completed("evt_1", orderId))).json();
    expect(again.duplicate).toBe(true);
    // A different event id for the same order (e.g. async success after completed) must not double-deduct either.
    await post(completed("evt_2", orderId));
    expect(await stock(listingId)).toEqual({ quantity: 0, reserved: 0 });
    expect((await db.pool.query("select count(*)::int n from stock_movements where reason='order'")).rows[0].n).toBe(1);
  });

  it("will not mark an order paid if the amount doesn't match", async () => {
    const { orderId, listingId } = await pendingOrder();
    const res = await (await post(completed("evt_amt", orderId, { amount_total: 100 }))).json();
    expect(res.flagged).toBe(true);
    expect(await status(orderId)).toBe("pending");
    expect(await stock(listingId)).toEqual({ quantity: 1, reserved: 1 });
    expect((await db.pool.query("select count(*)::int n from error_log")).rows[0].n).toBe(1);
  });

  it("waits for money to arrive on delayed payment methods", async () => {
    const { orderId } = await pendingOrder();
    await post(completed("evt_unpaid", orderId, { payment_status: "unpaid" }));
    expect(await status(orderId)).toBe("pending");
  });

  it("releases held stock when the checkout session expires", async () => {
    const { orderId, listingId } = await pendingOrder();
    const res = await post({ id: "evt_exp", object: "event", type: "checkout.session.expired", data: { object: { id: "cs_test_1", metadata: { order_id: orderId } } } });
    expect(res.status).toBe(200);
    expect(await status(orderId)).toBe("expired");
    expect(await stock(listingId)).toEqual({ quantity: 1, reserved: 0 });
  });
});
