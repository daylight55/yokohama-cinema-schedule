import { describe, expect, it, vi } from "vitest";
import { completeGoogleLogin } from "../functions/_lib/accounts";
import { listMoviePreferences } from "../functions/_lib/preferences";
import { getHomeLocation } from "../functions/_lib/user-profile";

function loginDatabase(realUsers: number, invited = false): D1Database {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: (..._values: unknown[]) => ({
        first: async () => {
          if (sql.includes("COUNT(*) AS count")) return { count: realUsers };
          if (sql.includes("FROM user_invites")) {
            return invited ? { email: "member@example.com" } : null;
          }
          return null;
        },
        run: async () => ({ meta: { changes: 1 } }),
        all: async () => ({ results: [] }),
      }),
    })),
    batch: vi.fn(async () => []),
  } as unknown as D1Database;
}

describe("multi-user account bootstrap", () => {
  it("does not let an unauthenticated Google account become first admin", async () => {
    const db = loginDatabase(0);
    await expect(
      completeGoogleLogin(
        db,
        {
          subject: "google-subject",
          email: "admin@example.com",
          emailVerified: true,
        },
        null,
      ),
    ).rejects.toThrow("admin_bootstrap_required");
  });

  it("requires an invite after the first account exists", async () => {
    const db = loginDatabase(1);
    await expect(
      completeGoogleLogin(
        db,
        {
          subject: "new-google-subject",
          email: "member@example.com",
          emailVerified: true,
        },
        null,
      ),
    ).rejects.toThrow("invite_required");
  });

  it("lets the authenticated legacy administrator claim existing data", async () => {
    const db = loginDatabase(0);
    const user = await completeGoogleLogin(
      db,
      {
        subject: "admin-google-subject",
        email: "Admin@Example.com",
        emailVerified: true,
      },
      {
        legacy: true,
        user: {
          id: "legacy-local",
          email: null,
          displayEmail: null,
          role: "admin",
          status: "active",
        },
      },
    );

    expect(user.email).toBe("admin@example.com");
    expect(user.role).toBe("admin");
    expect(db.batch).toHaveBeenCalledTimes(2);
  });
});

describe("user-owned data access", () => {
  it("binds movie preferences to the authenticated user", async () => {
    const bind = vi.fn(() => ({
      all: async () => ({ results: [] }),
    }));
    const db = {
      prepare: vi.fn(() => ({ bind })),
    } as unknown as D1Database;

    await listMoviePreferences(db, "user-a");
    expect(bind).toHaveBeenCalledWith("user-a");
  });

  it("binds the stored home location to the authenticated user", async () => {
    const first = vi.fn().mockResolvedValue(null);
    const bind = vi.fn(() => ({ first }));
    const db = {
      prepare: vi.fn(() => ({ bind })),
    } as unknown as D1Database;

    await getHomeLocation(db, "user-b");
    expect(bind).toHaveBeenCalledWith("user-b");
  });
});
