import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestDb } from "./pg-helper";
import { pgStore } from "./pg-store";
import { makeRows, toCsv } from "./fixtures/make-discogs-csv";
import { previewImport, confirmImport } from "../src/lib/importer/run";
import { parseDiscogsCsv, parsePrice, conditionGrade, formatGroup } from "../src/lib/importer/parse";
import { detectColumns } from "../src/lib/importer/columns";

let db: Awaited<ReturnType<typeof startTestDb>>;
let store: ReturnType<typeof pgStore>;
beforeAll(async () => { db = await startTestDb(54330); store = pgStore(db.pool); });
afterAll(async () => { await db.stop(); });
beforeEach(async () => {
  await db.pool.query("truncate listings, imports, stock_movements, stock_discrepancies, orders cascade");
});

const count = async (sql = "select count(*)::int n from listings") => (await db.pool.query(sql)).rows[0].n as number;
async function runUpdate(csv: string, name = "inv.csv") {
  const p = await previewImport(store, name, csv, "update");
  expect(p.fatal).toBeUndefined();
  const applied = await confirmImport(store, p.importId);
  return { p, applied };
}

describe("parsing", () => {
  it("recognises columns and money safely", () => {
    const c = detectColumns(["listing_id", "artist", "title", "catno", "price", "media_condition", "weird"]);
    expect(c.missingRequired).toEqual([]);
    expect(c.mapped.catalog_number).toBe("catno");
    expect(c.unrecognised).toEqual(["weird"]);
    expect(parsePrice("12.5")).toEqual({ pence: 1250 });
    expect(parsePrice("£1,234.50")).toEqual({ pence: 123450 });
    expect(parsePrice("0.29")).toEqual({ pence: 29 });
    expect(parsePrice("$10")).toHaveProperty("error");
    expect(parsePrice("abc")).toHaveProperty("error");
    expect(conditionGrade("Near Mint (NM or M-)")).toBe("NM");
    expect(conditionGrade("Very Good Plus (VG+)")).toBe("VG+");
    expect(conditionGrade("Mint (M)")).toBe("M");
    expect(conditionGrade("Generic")).toBeNull();
    expect(formatGroup("Vinyl, 12\", 45 RPM, EP")).toBe('12"');
    expect(formatGroup("Box Set, Vinyl, LP")).toBe("Box Set");
  });

  it("rejects non-Discogs files and reports row problems", () => {
    expect(parseDiscogsCsv("foo,bar\n1,2").fatal).toMatch(/Missing column/);
    expect(parseDiscogsCsv("").fatal).toMatch(/empty/);
    const rows = makeRows(5);
    rows[1].status = "Sold"; rows[2].price = "free"; rows[3].listing_id = rows[0].listing_id;
    const r = parseDiscogsCsv(toCsv(rows));
    expect(r.rows).toHaveLength(2);
    expect(r.skipped).toHaveLength(1);
    expect(r.errors.map((e) => e.message).join()).toMatch(/not a valid amount/);
    expect(r.duplicates).toHaveLength(1);
  });
});

describe("importing 9,000 listings", () => {
  it("imports, and importing the same file twice creates no duplicates", async () => {
    const csv = toCsv(makeRows(9000));
    const first = await runUpdate(csv);
    expect(first.applied).toMatchObject({ added: 9000, updated: 0 });
    expect(await count()).toBe(9000);

    const second = await runUpdate(csv);
    expect(second.p.alreadyImported).not.toBeNull();       // user is warned
    expect(second.p.plan!.added).toHaveLength(0);          // preview agrees...
    expect(second.p.plan!.updated).toHaveLength(0);
    expect(second.applied).toMatchObject({ added: 0, updated: 0, unchanged: 9000, flagged: 0 });
    expect(await count()).toBe(9000);                      // ...and nothing was duplicated
    expect(await count("select count(distinct discogs_listing_id)::int n from listings")).toBe(9000);
    expect(await count("select count(*)::int n from stock_movements")).toBe(9000); // no extra movements
  });

  it("preview counts equal what apply actually does", async () => {
    const rows = makeRows(300);
    await runUpdate(toCsv(rows));
    const changed = makeRows(300);
    changed[0].price = "99.99"; changed[1].media_condition = "Very Good (VG)";
    const extra = makeRows(305).slice(300);
    const p = await previewImport(store, "b.csv", toCsv([...changed, ...extra]), "update");
    const applied = await confirmImport(store, p.importId);
    expect(p.plan!.added.length).toBe(applied.added);
    expect(p.plan!.updated.length).toBe(applied.updated);
    expect(p.plan!.unchanged).toBe(applied.unchanged);
    expect(applied).toMatchObject({ added: 5, updated: 2, unchanged: 298 });
  });

  it("updates prices and conditions by listing id, not release id", async () => {
    const rows = makeRows(3);
    rows[1].release_id = rows[0].release_id;               // two copies of the same release
    await runUpdate(toCsv(rows));
    expect(await count()).toBe(3);
    rows[0].price = "50.00"; rows[0].media_condition = "Mint (M)";
    await runUpdate(toCsv(rows));
    const r = await db.pool.query("select discogs_listing_id::text id, price_pence, media_grade from listings order by 1");
    expect(r.rows.find((x) => x.id === rows[0].listing_id)).toMatchObject({ price_pence: 5000, media_grade: "M" });
    expect(r.rows.find((x) => x.id === rows[1].listing_id)!.price_pence).not.toBe(5000);
  });
});

describe("quantities, missing listings and reconcile", () => {
  it("never raises stock from a CSV, it flags a discrepancy instead", async () => {
    const rows = makeRows(2);
    await runUpdate(toCsv(rows));
    // Sell the first record on MediaHog, then re-import a stale CSV that still lists it.
    await db.pool.query("select adjust_stock((select id from listings where discogs_listing_id=$1), -1, 'order')", [rows[0].listing_id]);
    const { applied } = await runUpdate(toCsv(rows) + "\n", "stale.csv");
    expect(applied.flagged).toBe(1);
    expect(await count(`select quantity::int n from listings where discogs_listing_id=${rows[0].listing_id}`)).toBe(0);
    expect(await count("select count(*)::int n from stock_discrepancies where not resolved")).toBe(1);
  });

  it("identifies missing listings but never deletes or changes them automatically", async () => {
    const rows = makeRows(10);
    await runUpdate(toCsv(rows));
    const p = await previewImport(store, "partial.csv", toCsv(rows.slice(0, 7)), "update");
    expect(p.plan!.missing).toHaveLength(3);
    await confirmImport(store, p.importId);
    expect(await count()).toBe(10);
    expect(await count("select count(*)::int n from listings where status='active' and quantity=1")).toBe(10);
    // Only an explicit, confirmed action changes them.
    const ids = p.plan!.missing.map((m) => m.id);
    await db.pool.query("select resolve_missing($1, $2::uuid[], 'zero', 'jon')", [p.importId, ids]);
    expect(await count("select count(*)::int n from listings where quantity=0 and status='missing'")).toBe(3);
    expect(await count()).toBe(10);                         // still nothing deleted
  });

  it("reconcile reports differences and changes no inventory", async () => {
    const rows = makeRows(20);
    await runUpdate(toCsv(rows));
    const changed = rows.slice(0, 15).map((r, i) => (i === 0 ? { ...r, price: "77.00" } : r));
    const before = await db.pool.query("select md5(string_agg(id::text||price_pence::text||quantity::text, ',' order by id)) h from listings");
    const p = await previewImport(store, "r.csv", toCsv(changed), "reconcile");
    expect(p.plan!.updated).toHaveLength(1);
    expect(p.plan!.missing).toHaveLength(5);
    const after = await db.pool.query("select md5(string_agg(id::text||price_pence::text||quantity::text, ',' order by id)) h from listings");
    expect(after.rows[0].h).toBe(before.rows[0].h);
    await expect(confirmImport(store, p.importId)).rejects.toThrow();
  });

  it("an import can only be applied once", async () => {
    const p = await previewImport(store, "x.csv", toCsv(makeRows(5)), "update");
    await confirmImport(store, p.importId);
    await expect(confirmImport(store, p.importId)).rejects.toThrow();
  });
});

describe("stock safety at checkout", () => {
  async function seedOrder(listingIds: string[], qty = 1) {
    const o = await db.pool.query(
      `insert into orders (email, customer_name, ship_line1, ship_city, ship_postcode, ship_country, subtotal_pence, shipping_pence, total_pence)
       values ('a@b.c','A','1 St','Town','AB1 2CD','GB',1000,400,1400) returning id`);
    for (const l of listingIds) {
      await db.pool.query(`insert into order_items (order_id, listing_id, artist, title, unit_price_pence, quantity) values ($1,$2,'x','y',1000,$3)`, [o.rows[0].id, l, qty]);
    }
    return o.rows[0].id as string;
  }
  const items = (ids: string[], q = 1) => JSON.stringify(ids.map((id) => ({ listing_id: id, quantity: q })));

  it("cannot oversell the last copy under 40 simultaneous checkouts", async () => {
    await runUpdate(toCsv(makeRows(1)));
    const lid = (await db.pool.query("select id from listings")).rows[0].id;
    const orders = await Promise.all(Array.from({ length: 40 }, () => seedOrder([lid])));
    const results = await Promise.allSettled(orders.map((o) => db.pool.query("select reserve_stock($1,$2::jsonb)", [o, items([lid])])));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const l = (await db.pool.query("select quantity, reserved from listings")).rows[0];
    expect(l).toEqual({ quantity: 1, reserved: 1 });
  });

  it("is all-or-nothing across a multi-record basket", async () => {
    await runUpdate(toCsv(makeRows(2)));
    const [a, b] = (await db.pool.query("select id from listings order by id")).rows.map((r) => r.id);
    await db.pool.query("update listings set quantity=0 where id=$1", [b]);
    const o = await seedOrder([a, b]);
    await expect(db.pool.query("select reserve_stock($1,$2::jsonb)", [o, items([a, b])])).rejects.toThrow(/OUT_OF_STOCK/);
    expect((await db.pool.query("select reserved from listings where id=$1", [a])).rows[0].reserved).toBe(0);
  });

  it("deducts on payment exactly once, and releases abandoned checkouts", async () => {
    await runUpdate(toCsv(makeRows(2)));
    const [a, b] = (await db.pool.query("select id from listings order by id")).rows.map((r) => r.id);
    const paid = await seedOrder([a]);
    await db.pool.query("select reserve_stock($1,$2::jsonb)", [paid, items([a])]);
    expect((await db.pool.query("select finalize_order($1) r", [paid])).rows[0].r).toBe(true);
    expect((await db.pool.query("select finalize_order($1) r", [paid])).rows[0].r).toBe(false); // webhook retry
    expect((await db.pool.query("select quantity, reserved from listings where id=$1", [a])).rows[0]).toEqual({ quantity: 0, reserved: 0 });
    expect(await count(`select count(*)::int n from stock_movements where order_id='${paid}'`)).toBe(1);

    const abandoned = await seedOrder([b]);
    await db.pool.query("select reserve_stock($1,$2::jsonb)", [abandoned, items([b])]);
    await db.pool.query("update orders set reserved_until = now() - interval '1 minute' where id=$1", [abandoned]);
    expect((await db.pool.query("select release_expired_orders() n")).rows[0].n).toBe(1);
    expect((await db.pool.query("select quantity, reserved from listings where id=$1", [b])).rows[0]).toEqual({ quantity: 1, reserved: 0 });
  });
});
