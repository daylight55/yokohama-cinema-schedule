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
      bind: (...args: SQLInputValue[]) => {
        values = args;
        return statement;
      },
      first: async () => sqlite.prepare(sql).get(...values) ?? null,
      all: async () => ({
        results: sqlite.prepare(sql).all(...values),
        success: true,
        meta: {},
      }),
      run: async () => {
        const result = sqlite.prepare(sql).run(...values);
        return {
          success: true,
          results: [],
          meta: { changes: Number(result.changes) },
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
