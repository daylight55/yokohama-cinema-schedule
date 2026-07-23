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
  const result = await context.env.DB.prepare(
    `SELECT source_id, last_attempt_at, last_success_at, status,
      showing_count, error_message
    FROM source_health
    ORDER BY source_id`,
  ).all<StatusRow>();
  return Response.json(
    { generatedAt: new Date().toISOString(), sources: result.results ?? [] },
    { headers: { "cache-control": "private, no-store" } },
  );
};
