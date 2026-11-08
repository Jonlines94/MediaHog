import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { computeShipping, type ShippingZone } from "../src/lib/shipping";
import { startTestDb } from "./pg-helper";

const zones: ShippingZone[] = [
  { name: "UK", countries: ["GB"], is_default: false, first_item_pence: 400, additional_item_pence: 100, free_over_pence: 10000 },
  { name: "Europe", countries: ["FR", "DE"], is_default: false, first_item_pence: 1000, additional_item_pence: 200, free_over_pence: null },
  { name: "World", countries: [], is_default: true, first_item_pence: 1800, additional_item_pence: 400, free_over_pence: null },
];

describe("shipping", () => {
  it("charges the first record in full and extras at the lower rate", () => {
    expect(computeShipping(zones, "GB", 1, 2000)).toEqual({ zone: "UK", pence: 400 });
    expect(computeShipping(zones, "GB", 4, 2000)).toEqual({ zone: "UK", pence: 700 });
    expect(computeShipping(zones, "fr", 3, 2000)).toEqual({ zone: "Europe", pence: 1400 });
  });
  it("uses the catch-all zone for other countries, and honours free delivery thresholds", () => {
    expect(computeShipping(zones, "US", 2, 2000)).toEqual({ zone: "World", pence: 2200 });
    expect(computeShipping(zones, "GB", 2, 10000)).toEqual({ zone: "UK", pence: 0 });
    expect(computeShipping(zones, "GB", 2, 9999)).toEqual({ zone: "UK", pence: 500 });
  });
  it("refuses to quote when no zone covers the country", () => {
    expect(computeShipping(zones.slice(0, 2), "US", 1, 1000)).toBeNull();
  });
});

describe("dashboard SQL", () => {
  let db: Awaited<ReturnType<typeof startTestDb>>;
  beforeAll(async () => { db = await startTestDb(54334); });
  afterAll(async () => { await db.stop(); });
  it("returns stats and a full 30-day series on an empty shop", async () => {
    const s = (await db.pool.query("select admin_stats() s")).rows[0].s;
    expect(s).toMatchObject({ products: 0, available: 0, to_dispatch: 0, open_flags: 0 });
    expect((await db.pool.query("select * from sales_by_day(30)")).rows).toHaveLength(30);
  });
});
