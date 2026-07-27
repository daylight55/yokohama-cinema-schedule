import { describe, expect, it } from "vitest";
import {
  buildGoogleCalendarEvent,
  decryptGoogleToken,
  encryptGoogleToken,
} from "../functions/_lib/google-calendar";
import {
  codeChallenge,
  secureStringEqual,
} from "../functions/_lib/google-oauth";
import type { MovieMarathonPlan } from "../shared/types";

describe("Google Calendar token protection", () => {
  it("encrypts OAuth refresh tokens with a unique AES-GCM nonce", async () => {
    const secret = "test-encryption-secret-with-enough-entropy";
    const first = await encryptGoogleToken("refresh-token", secret);
    const second = await encryptGoogleToken("refresh-token", secret);

    expect(first.ciphertext).not.toBe("refresh-token");
    expect(first.iv).not.toBe(second.iv);
    expect(
      await decryptGoogleToken(first.ciphertext, first.iv, secret),
    ).toBe("refresh-token");
  });

  it("compares OAuth state and creates a PKCE challenge", async () => {
    expect(await secureStringEqual("same-state", "same-state")).toBe(true);
    expect(await secureStringEqual("same-state", "different-state")).toBe(
      false,
    );
    expect(await codeChallenge("verifier")).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("Google Calendar movie marathon event", () => {
  it("covers the complete itinerary and includes each screening", () => {
    const plan: MovieMarathonPlan = {
      id: "plan",
      planDate: "2026-07-28",
      availableStart: "2026-07-28T01:00:00.000Z",
      availableEnd: "2026-07-28T14:00:00.000Z",
      status: "planned",
      googleCalendarEventId: null,
      createdAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-27T00:00:00.000Z",
      items: [
        {
          showingId: "a",
          sequence: 1,
          movieKey: "movie-a",
          title: "作品A",
          cinemaId: "cinema-a",
          cinemaName: "映画館A",
          startsAt: "2026-07-28T02:00:00.000Z",
          endsAt: "2026-07-28T04:00:00.000Z",
          bookingUrl: "https://example.com/a",
          starred: true,
          transferMinutes: 20,
        },
        {
          showingId: "b",
          sequence: 2,
          movieKey: "movie-b",
          title: "作品B",
          cinemaId: "cinema-b",
          cinemaName: "映画館B",
          startsAt: "2026-07-28T05:00:00.000Z",
          endsAt: "2026-07-28T07:00:00.000Z",
          bookingUrl: "https://example.com/b",
          starred: false,
          transferMinutes: 30,
        },
      ],
    };

    const event = buildGoogleCalendarEvent(plan);
    expect(event.start.dateTime).toBe(plan.items[0].startsAt);
    expect(event.end.dateTime).toBe(plan.items[1].endsAt);
    expect(event.description).toContain("作品A");
    expect(event.description).toContain("作品B");
  });
});
