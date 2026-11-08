import { startTestDb } from "./pg-helper";
(async () => {
  const db = await startTestDb();
  const r = await db.pool.query("select count(*) from shipping_zones");
  console.log("schema applied; shipping zones:", r.rows[0].count);
  await db.stop();
})().catch((e) => { console.error(e); process.exit(1); });
