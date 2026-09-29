import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
export function testDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(`migrations/${file}`, "utf8"));
  const prepare = (sql: string) => {
    let values: SQLInputValue[] = [];
    const statement = {
      bind: (...args: (SQLInputValue | ArrayBuffer)[]) => {
        values = args.map((value) =>
          value instanceof ArrayBuffer ? new Uint8Array(value) : value,
        );
        return statement;
      },
      first: async () => sqlite.prepare(sql).get(...values) ?? null,
      all: async () => ({
        results: sqlite.prepare(sql).all(...values),
        success: true,
        meta: {},
      }),
      run: async () => {
        // D1 meta.changes uses the total_changes delta, including triggers/cascades.
        const before = Number(sqlite.prepare("SELECT total_changes() n").get()?.n);
        sqlite.prepare(sql).run(...values);
        const changes = Number(sqlite.prepare("SELECT total_changes() n").get()?.n) - before;
        return {
          success: true,
          results: [],
          meta: { changes },
        };
      },
    };
    return statement;
  };
  const db = {
    prepare,
    batch: async (statements: ReturnType<typeof prepare>[]) => {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
  return { sqlite, db };
}
