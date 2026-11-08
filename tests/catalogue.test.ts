import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb } from "./pg-helper";
import { pgStore } from "./pg-store";
import { makeRows, toCsv } from "./fixtures/make-discogs-csv";
import { previewImport, confirmImport } from "../src/lib/importer/run";

let db: Awaited<ReturnType<typeof startTestDb>>;
beforeAll(async () => {
  db = await startTestDb(54331);
  const store = pgStore(db.pool);
  const p = await previewImport(store, "inv.csv", toCsv(makeRows(10000, 7)), "update");
  await confirmImport(store, p.importId);
  await db.pool.query("analyze listings");
});
afterAll(async () => { await db.stop(); });

const search = async (args: Record<string, unknown> = {}) => {
  const keys = Object.keys(args);
  const sql = `select * from search_listings(${keys.map((k, i) => `p_${k} => $${i + 1}`).join(", ")})`;
  return (await db.pool.query(sql, keys.map((k) => args[k]))).rows;
};

describe("catalogue search over 10,000 records", () => {
  it("pages without loading everything, and reports the total", async () => {
    const page1 = await search({ limit: 24, offset: 0 });
    const page2 = await search({ limit: 24, offset: 24 });
    expect(page1).toHaveLength(24);
    expect(Number(page1[0].total)).toBe(10000);
    expect(new Set([...page1, ...page2].map((r) => r.id)).size).toBe(48);
  });

  it("matches word prefixes across artist, title, label and catalogue number", async () => {
    const r = await search({ q: "pink flo", limit: 100 });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.artist === "Pink Floyd")).toBe(true);
    const accent = await search({ q: "björk", limit: 5 });
    expect(accent.length).toBeGreaterThan(0);
    const plain = await search({ q: "bjork", limit: 5 });          // typed without the accent
    expect(plain.length).toBeGreaterThan(0);
    expect(plain.every((x) => x.artist === "Björk")).toBe(true);
    const odd = await search({ q: "'; drop table listings; --", limit: 5 });   // hostile input is just words
    expect(Array.isArray(odd)).toBe(true);
    expect(Number((await db.pool.query("select count(*) from listings")).rows[0].count)).toBe(10000);
  });

  it("filters by format, condition, price and sorts", async () => {
    const r = await search({ format: "LP", grades: ["NM", "M"], price_max: 2000, sort: "price_asc", limit: 50 });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.format_group === "LP" && ["NM", "M"].includes(x.media_grade) && x.price_pence <= 2000)).toBe(true);
    const prices = r.map((x) => x.price_pence);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("hides sold-out and reserved-out records, and facets count only live stock", async () => {
    const one = (await search({ q: "pink", limit: 1 }))[0];
    await db.pool.query("update listings set reserved = quantity where id = $1", [one.id]);
    expect((await search({ q: "pink", limit: 100 })).some((x) => x.id === one.id)).toBe(false);
    const f = (await db.pool.query("select catalogue_facets() f")).rows[0].f;
    expect(f.total).toBe(9999);
    expect(f.formats.length).toBeGreaterThan(3);
  });

  it("answers quickly (full-text prefix search over 10,000 rows)", async () => {
    const t = performance.now();
    for (let i = 0; i < 20; i++) await search({ q: "miles blue", limit: 24 });
    const avg = (performance.now() - t) / 20;
    console.log(`avg search ms: ${avg.toFixed(1)}`);
    expect(avg).toBeLessThan(150);
  });
});
