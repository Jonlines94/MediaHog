// Starts a throwaway embedded PostgreSQL and applies migration 0001 for tests.
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { readFileSync, mkdirSync, mkdtempSync, rmSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

export async function startTestDb(port = 54329) {
  // Postgres refuses to run as root, so the data dir must be owned by the postgres user.
  // It lives inside the project (git-ignored) because that path is traversable by that user.
  const base = path.join(__dirname, "../.pgtest");
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(path.join(base, "db-"));
  if (process.getuid && process.getuid() === 0) {
    chmodSync(base, 0o755);
    execFileSync("chown", ["-R", "postgres:postgres", dir]);
  }
  const pg = new EmbeddedPostgres({
    databaseDir: dir, user: "postgres", password: "postgres", port, persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C.UTF-8"],
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("mediahog");
  const pool: Pool = new Pool({ connectionString: `postgres://postgres:postgres@localhost:${port}/mediahog`, max: 20 });
  pool.on("error", () => {}); // idle clients are cut when the server stops; not a test failure
  // 0005 is Supabase-specific (auth/storage schemas), so tests apply only the portable migrations.
  for (const f of ["0001_schema.sql", "0002_import.sql", "0003_admin.sql", "0004_catalogue.sql"]) {
    await pool.query(readFileSync(path.join(__dirname, "../supabase/migrations", f), "utf8"));
  }
  return {
    pool,
    async stop() { await pool.end(); await pg.stop(); rmSync(dir, { recursive: true, force: true }); },
  };
}
