import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { describe, expect, it } from "vitest";
import {
  authenticatePasskey,
  authenticationOptions,
} from "../functions/_lib/passkeys";

interface StoredChallenge {
  id: string;
  user_id: string | null;
  challenge: string;
  challenge_type: "authentication";
  rp_id: string;
  expected_origin: string;
  expires_at: string;
}

function challengeDatabase() {
  let challenge: StoredChallenge | null = null;
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              if (sql.includes("INSERT INTO webauthn_challenges")) {
                challenge = {
                  id: String(values[0]),
                  user_id: null,
                  challenge: String(values[2]),
                  challenge_type: "authentication",
                  rp_id: String(values[4]),
                  expected_origin: String(values[5]),
                  expires_at: String(values[6]),
                };
              }
              if (
                sql.includes("DELETE FROM webauthn_challenges WHERE id")
              ) {
                challenge = null;
              }
              return { meta: { changes: 1 } };
            },
            async first() {
              return challenge;
            },
          };
        },
      };
    },
    async batch(
      statements: Array<{ run: () => Promise<unknown> }>,
    ) {
      for (const statement of statements) await statement.run();
      return [];
    },
  } as unknown as D1Database;
  return {
    db,
    expire: () => {
      if (challenge) challenge.expires_at = new Date(0).toISOString();
    },
  };
}

const unusedResponse = {
  id: "unused",
  rawId: "unused",
  response: {
    clientDataJSON: "unused",
    authenticatorData: "unused",
    signature: "unused",
  },
  type: "public-key",
  clientExtensionResults: {},
} satisfies AuthenticationResponseJSON;

describe("passkey challenges", () => {
  it("binds authentication to the requesting RP ID and origin", async () => {
    const { db } = challengeDatabase();
    const generated = await authenticationOptions(
      db,
      new Request("https://movies.example.com/auth/passkeys/options"),
    );
    await expect(
      authenticatePasskey(
        db,
        new Request("https://attacker.example/auth/passkeys/verify"),
        generated.challengeId,
        unusedResponse,
      ),
    ).rejects.toThrow("passkey_challenge_invalid");
  });

  it("rejects an expired authentication challenge", async () => {
    const { db, expire } = challengeDatabase();
    const generated = await authenticationOptions(
      db,
      new Request("https://movies.example.com/auth/passkeys/options"),
    );
    expire();
    await expect(
      authenticatePasskey(
        db,
        new Request("https://movies.example.com/auth/passkeys/verify"),
        generated.challengeId,
        unusedResponse,
      ),
    ).rejects.toThrow("passkey_challenge_invalid");
  });
});
