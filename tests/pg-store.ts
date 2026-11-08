import type { Pool } from "pg";
import type { ImportStore } from "../src/lib/importer/run";

/** ImportStore backed by plain pg, used by the tests (production uses Supabase). */
export function pgStore(pool: Pool): ImportStore {
  return {
    async fetchExisting() {
      const r = await pool.query(
        `select id, discogs_listing_id::float8 as discogs_listing_id, discogs_release_id::float8 as discogs_release_id,
                artist, title, label, catalog_number, format, format_group, media_condition, media_grade,
                sleeve_condition, sleeve_grade, price_pence, quantity, reserved, comments, external_id,
                location, weight_grams, year, genres, styles, status from listings`);
      return r.rows;
    },
    async findImportByHash(sha) {
      const r = await pool.query(
        `select id, created_at from imports where file_sha256=$1 and status='completed' order by created_at desc limit 1`, [sha]);
      return r.rows[0] ?? null;
    },
    async createImport(rec) {
      const r = await pool.query(
        `insert into imports (filename, file_sha256, mode, total_rows, summary, report, payload, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [rec.filename, rec.sha256, rec.mode, rec.totalRows, rec.summary, rec.report,
         rec.payload ? JSON.stringify(rec.payload) : null, rec.createdBy ?? null]);
      return r.rows[0].id;
    },
    async loadImport(id) {
      const r = await pool.query(`select id, mode, status, payload, report from imports where id=$1`, [id]);
      return r.rows[0] ?? null;
    },
    async claimImport(id) {
      const r = await pool.query(`update imports set status='running' where id=$1 and status='previewed'`, [id]);
      return r.rowCount === 1;
    },
    async applyBatch(importId, rows) {
      const r = await pool.query(`select apply_import_batch($1, $2::jsonb) as res`, [importId, JSON.stringify(rows)]);
      return r.rows[0].res;
    },
    async finishImport(id, patch) {
      await pool.query(
        `update imports set status=$2, summary=$3, report=$4, payload=null, completed_at=now() where id=$1`,
        [id, patch.status, patch.summary, patch.report]);
    },
  };
}
