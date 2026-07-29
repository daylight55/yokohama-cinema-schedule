import { describe, expect, it } from "vitest";
import {
  decryptDepartureLocation,
  encryptDepartureLocation,
} from "../functions/_lib/profile-crypto";

const MASTER_KEY = btoa("a".repeat(32));
const OTHER_MASTER_KEY = btoa("b".repeat(32));
const LOCATION = { latitude: 35.4387, longitude: 139.6457 };

describe("departure location encryption", () => {
  it("round-trips a location for its authenticated user", async () => {
    const encrypted = await encryptDepartureLocation(
      MASTER_KEY,
      "user-a",
      LOCATION,
    );

    expect(encrypted.ciphertext).not.toContain(String(LOCATION.latitude));
    await expect(
      decryptDepartureLocation(MASTER_KEY, "user-a", encrypted),
    ).resolves.toEqual(LOCATION);
  });

  it("cannot decrypt another user's copied ciphertext", async () => {
    const encrypted = await encryptDepartureLocation(
      MASTER_KEY,
      "user-a",
      LOCATION,
    );

    await expect(
      decryptDepartureLocation(MASTER_KEY, "user-b", encrypted),
    ).rejects.toThrow("departure_location_decryption_failed");
  });

  it("rejects modified ciphertext", async () => {
    const encrypted = await encryptDepartureLocation(
      MASTER_KEY,
      "user-a",
      LOCATION,
    );
    const firstCharacter =
      encrypted.ciphertext[0] === "A" ? "B" : "A";

    await expect(
      decryptDepartureLocation(MASTER_KEY, "user-a", {
        ...encrypted,
        ciphertext: firstCharacter + encrypted.ciphertext.slice(1),
      }),
    ).rejects.toThrow("departure_location_decryption_failed");
  });

  it("rejects a different server master key", async () => {
    const encrypted = await encryptDepartureLocation(
      MASTER_KEY,
      "user-a",
      LOCATION,
    );

    await expect(
      decryptDepartureLocation(OTHER_MASTER_KEY, "user-a", encrypted),
    ).rejects.toThrow("departure_location_decryption_failed");
  });
});
