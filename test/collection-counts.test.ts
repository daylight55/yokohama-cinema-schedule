import { expect, it } from "vitest";
import { collectionCounts } from "../src/useCollectionCounts";
import type { CollectionDay, CollectionStatus } from "../shared/collection-status";

it("counts failed, missing and stale dates without treating unpublished or closed cinemas as failures", () => {
  const dates = ["2026-10-05", "2026-10-06"];
  const data = {
    dates,
    cinemas: [
      { days: [{ date: dates[0], status: "published", stale: false }, { date: dates[1], status: "published", stale: true }] },
      { days: [{ date: dates[0], status: "error", stale: true }, { date: dates[1], status: "not_published", stale: false }] },
      { days: [{ date: dates[0], status: "missing", stale: false }] },
    ].map((cinema, i) => ({ id: String(i), name: String(i), sourceUrl: "", activeUntil: null, days: cinema.days as CollectionDay[] })),
    generatedAt: "2026-10-05T00:00:00Z",
  } satisfies CollectionStatus;
  expect(collectionCounts(data)).toEqual({ "2026-10-05": 2, "2026-10-06": 1 });
});
