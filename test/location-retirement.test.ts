import { describe, expect, it, vi } from "vitest";
import { onRequestPost as register, onRequestDelete as remove } from "../functions/api/profile";
import { onRequestGet as savedRoutes, onRequestPost as currentRoutes } from "../functions/api/routes";
import { onRequestGet as guidance } from "../functions/api/route-guidance/[cinemaId]";
import { saveDepartureLocation, saveScheduleCollapseMinutes } from "../functions/_lib/user-profile";
import { testDatabase } from "./helpers/sqlite-d1";
import { sharedShowing } from "./helpers/shared-showings";
import { generateMovieMarathonProposal } from "../functions/_lib/movie-marathon";
import type { PagesEnv } from "../functions/_lib/env";

const masterKey = btoa("a".repeat(32));

describe("retired location collection", () => {
  it.each([undefined, "false", "true"])("rejects old clients regardless of PUBLIC_MODE=%s, without reading coordinates or D1", async (PUBLIC_MODE) => {
    const json = vi.fn();
    const prepare = vi.fn();
    const context = { env: { PUBLIC_MODE, DB: { prepare } }, request: { json }, data: { userId: "legacy-local" } };
    const responses = await Promise.all([
      register(context as unknown as Parameters<typeof register>[0]),
      savedRoutes(context as unknown as Parameters<typeof savedRoutes>[0]),
      currentRoutes(context as unknown as Parameters<typeof currentRoutes>[0]),
      guidance(context as unknown as Parameters<typeof guidance>[0]),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(410);
      expect(await response.json()).toEqual({ error: "location_feature_removed" });
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.has("location")).toBe(false);
    }
    expect(json).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });

  it("still deletes only the caller's saved location and preserves display preferences", async () => {
    const { sqlite, db } = testDatabase();
    try {
      sqlite.exec("INSERT INTO users(id,created_at,updated_at) VALUES ('other','now','now')");
      for (const userId of ["legacy-local", "other"]) {
        await saveDepartureLocation(db, masterKey, { latitude: 35, longitude: 139 }, [], userId);
      }
      await saveScheduleCollapseMinutes(db, 30, "legacy-local");
      const response = await remove({ env: { DB: db }, data: { userId: "legacy-local" } } as Parameters<typeof remove>[0]);
      expect(response.status).toBe(200);
      expect(sqlite.prepare("SELECT user_id FROM user_profiles").all()).toEqual([{ user_id: "other" }]);
      expect(sqlite.prepare("SELECT preference_value FROM app_preferences WHERE user_id='legacy-local' AND preference_key='schedule_collapse_minutes'").get()).toEqual({ preference_value: "30" });
    } finally { sqlite.close(); }
  });
});


it("plans with manual travel minutes or the default without decrypting an old location", async () => {
  const { sqlite, db } = testDatabase();
  try {
    const showingId = sharedShowing(sqlite, "Travel test", "2099-01-01T03:00:00Z");
    sqlite.prepare("UPDATE showings SET ends_at='2099-01-01T05:00:00Z' WHERE id=?").run(showingId);
    await saveDepartureLocation(db, masterKey, { latitude: 35, longitude: 139 }, []);
    const env = { DB: db } as PagesEnv; // No location encryption key is provided.
    const proposal = () => generateMovieMarathonProposal(env, "2099-01-01", "11:00", "18:00");
    expect((await proposal()).items[0]).toMatchObject({ showingId, transferMinutes: 30 });
    sqlite.prepare("INSERT INTO cinema_travel_preferences(user_id,cinema_id,travel_mode,custom_duration_minutes,updated_at) VALUES ('legacy-local','sharing-test','transit',20,'now')").run();
    expect((await proposal()).items[0]).toMatchObject({ showingId, transferMinutes: 20 });
  } finally { sqlite.close(); }
});
