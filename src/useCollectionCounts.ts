import { useEffect, useState } from "react";
import type { CollectionStatus } from "../shared/collection-status";

export function collectionCounts(status: CollectionStatus): Record<string, number> {
  return Object.fromEntries(status.dates.map(date => [date, status.cinemas.filter(cinema => {
    const day = cinema.days.find(day => day.date === date);
    return day && (day.stale || day.status === "error" || day.status === "missing");
  }).length]));
}

export function useCollectionCounts(enabled: boolean) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    setCounts(null);
    if (!enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await fetch("/api/admin/collection", { signal: controller.signal });
        if (!response.ok) throw new Error("unavailable");
        const payload = await response.json() as { status: CollectionStatus };
        if (!controller.signal.aborted) setCounts(collectionCounts(payload.status));
      } catch {
        if (!controller.signal.aborted) setCounts(null);
      }
      if (!controller.signal.aborted) timer = setTimeout(load, 60000);
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [enabled]);
  return enabled ? counts : null;
}
