import type { Cinema } from "../../shared/types";

interface CinemaRow {
  id: string;
  name: string;
  short_name: string;
  area: Cinema["area"];
  area_label: string;
  address: string;
  latitude: number;
  longitude: number;
  source_url: string;
  active_until: string | null;
  approval: Cinema["approval"];
}

export async function listActiveCinemas(
  db: D1Database,
  date: string,
  publicOnly: boolean,
): Promise<Cinema[]> {
  const approvalClause = publicOnly
    ? "approval = 'approved'"
    : "approval != 'disabled'";
  const result = await db
    .prepare(
      `SELECT
        id, name, short_name, area, area_label, address, latitude, longitude,
        source_url, active_until, approval
      FROM cinemas
      WHERE ${approvalClause}
        AND (active_until IS NULL OR active_until >= ?)
      ORDER BY name`,
    )
    .bind(date)
    .all<CinemaRow>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    area: row.area,
    areaLabel: row.area_label,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    sourceUrl: row.source_url,
    activeUntil: row.active_until,
    approval: row.approval,
  }));
}
