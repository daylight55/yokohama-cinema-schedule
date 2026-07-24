import { todayInJst } from "../../shared/date";
import type { PagesEnv } from "../_lib/env";

interface StatusRow {
  source_id: string;
  last_attempt_at: string;
  last_success_at: string | null;
  status: "healthy" | "error";
  showing_count: number;
  error_message: string | null;
}

export const onRequestGet: PagesFunction<PagesEnv> = async (context) => {
  const publicOnly = context.env.PUBLIC_MODE === "true";
  const approvalClause = publicOnly
    ? "c.approval = 'approved'"
    : "c.approval != 'disabled'";
  const result = await context.env.DB.prepare(
    `SELECT source_id, last_attempt_at, last_success_at, status,
      showing_count, error_message
    FROM source_health sh
    JOIN cinemas c ON c.id = sh.source_id
    WHERE ${approvalClause}
      AND (c.active_until IS NULL OR c.active_until >= ?)
    ORDER BY source_id`,
  )
    .bind(todayInJst())
    .all<StatusRow>();
  return Response.json(
    { generatedAt: new Date().toISOString(), sources: result.results ?? [] },
    { headers: { "cache-control": "private, no-store" } },
  );
};
