// TEST-ONLY: just enough of the supabase-js query API, running on plain pg, to exercise the real route code.
import type { Pool } from "pg";

type Result = { data?: any; error?: { message: string } | null };

export function supabaseShim(pool: Pool) {
  const builder = (table: string) => {
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: any = null, single = false;
    const filters: [string, unknown][] = [];
    const run = async (): Promise<Result> => {
      try {
        const where = filters.map(([c], i) => `${c} = $${i + 1 + (op === "update" ? Object.keys(payload).length : 0)}`).join(" and ");
        const fv = filters.map(([, v]) => v);
        if (op === "insert") {
          const keys = Object.keys(payload);
          await pool.query(`insert into ${table} (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")})`,
            keys.map((k) => (typeof payload[k] === "object" && payload[k] !== null ? JSON.stringify(payload[k]) : payload[k])));
          return { error: null };
        }
        if (op === "update") {
          const keys = Object.keys(payload);
          await pool.query(`update ${table} set ${keys.map((k, i) => `${k} = $${i + 1}`).join(", ")} where ${where}`, [...keys.map((k) => payload[k]), ...fv]);
          return { error: null };
        }
        if (op === "delete") { await pool.query(`delete from ${table} where ${where}`, fv); return { error: null }; }
        const r = await pool.query(`select * from ${table}${where ? ` where ${where}` : ""}`, fv);
        return { data: single ? r.rows[0] ?? null : r.rows, error: single && !r.rows[0] ? { message: "no rows" } : null };
      } catch (e: any) { return { error: { message: e.message } }; }
    };
    const b: any = {
      insert: (v: any) => { op = "insert"; payload = v; return b; }, update: (v: any) => { op = "update"; payload = v; return b; },
      delete: () => { op = "delete"; return b; }, select: () => b, eq: (c: string, v: unknown) => { filters.push([c, v]); return b; },
      single: () => { single = true; return b; }, maybeSingle: () => { single = true; return b; },
      then: (res: any, rej: any) => run().then(res, rej),
    };
    return b;
  };
  return {
    from: builder,
    rpc: async (name: string, args: Record<string, unknown> = {}): Promise<Result> => {
      try {
        const keys = Object.keys(args);
        const r = await pool.query(`select ${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as v`,
          keys.map((k) => (typeof args[k] === "object" && args[k] !== null ? JSON.stringify(args[k]) : args[k])));
        return { data: r.rows[0].v, error: null };
      } catch (e: any) { return { error: { message: e.message } }; }
    },
  };
}
