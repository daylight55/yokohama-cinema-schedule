import type { NormalizedShowing } from "../../../shared/types";

interface AeonShow {
  id?: string;
  name?: { ja?: string };
  startDate?: string;
  endDate?: string;
  location?: {
    branchCode?: string;
    name?: { ja?: string };
  };
  superEvent?: {
    id?: string;
    workPerformed?: {
      id?: string;
      identifier?: string;
    };
  };
  offers?: unknown;
}

type AeonSchedule = Record<string, Record<string, AeonShow[]>>;

export function parseAeonSchedule(
  input: unknown,
  requestedDates: Set<string>,
): NormalizedShowing[] {
  const schedule = input as AeonSchedule;
  const result: NormalizedShowing[] = [];

  for (const [compactDate, groups] of Object.entries(schedule ?? {})) {
    const date = `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`;
    if (!requestedDates.has(date) || !groups || typeof groups !== "object") {
      continue;
    }

    for (const shows of Object.values(groups)) {
      if (!Array.isArray(shows)) continue;
      for (const show of shows) {
        if (!show.startDate || !show.name?.ja) continue;
        const movieKey =
          show.superEvent?.workPerformed?.identifier ??
          show.superEvent?.workPerformed?.id ??
          show.superEvent?.id ??
          show.id ??
          `${show.name.ja}-${show.startDate}`;
        const format = detectFormat(show.name.ja);

        result.push({
          sourceId: "aeon-minatomirai",
          cinemaId: "aeon-minatomirai",
          movieKey: String(movieKey),
          title: cleanTitle(show.name.ja),
          imageUrl: null,
          startsAt: new Date(show.startDate).toISOString(),
          endsAt: show.endDate ? new Date(show.endDate).toISOString() : null,
          screen: show.location?.name?.ja ?? null,
          format,
          bookingUrl: `https://theater.aeoncinema.com/theaters/minatomirai/?date=${compactDate}`,
          purchasable: show.offers ? true : null,
        });
      }
    }
  }

  return result;
}

function detectFormat(title: string): string | null {
  const labels = [
    "字幕",
    "吹替",
    "IMAX",
    "4DX",
    "3D",
    "Dolby Atmos",
    "DolbyCinema",
  ].filter((label) => title.toLowerCase().includes(label.toLowerCase()));
  return labels.length > 0 ? labels.join(" / ") : null;
}

function cleanTitle(title: string): string {
  return title.replace(/^(字幕|吹替)\s+/, "").trim();
}
