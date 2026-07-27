import type { AccountResponse, ManagedUser } from "../../../shared/types";
import type { AuthContextData, PagesEnv } from "../../_lib/env";
import { listPasskeys } from "../../_lib/passkeys";

interface MethodRow {
  google_count: number;
  password_count: number;
}

interface UserRow {
  id: string;
  email: string | null;
  role: ManagedUser["role"];
  status: ManagedUser["status"];
  last_login_at: string | null;
}

interface InviteRow {
  email: string;
  created_at: string;
}

export const onRequestGet: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  const user = context.data.authUser;
  const [methods, passkeys, usersResult, invitesResult] = await Promise.all([
    context.env.DB.prepare(
      `SELECT
         EXISTS(
           SELECT 1 FROM user_auth_identities
            WHERE user_id = ? AND provider = 'google'
         ) AS google_count,
         EXISTS(
           SELECT 1 FROM user_password_credentials WHERE user_id = ?
         ) AS password_count`,
    )
      .bind(user.id, user.id)
      .first<MethodRow>(),
    listPasskeys(context.env.DB, user.id),
    user.role === "admin"
      ? context.env.DB.prepare(
          `SELECT id, email, role, status, last_login_at
             FROM users
            WHERE id != 'legacy-local'
            ORDER BY created_at`,
        ).all<UserRow>()
      : Promise.resolve({ results: [] as UserRow[] }),
    user.role === "admin"
      ? context.env.DB.prepare(
          `SELECT email, created_at
             FROM user_invites
            WHERE accepted_at IS NULL
            ORDER BY created_at DESC`,
        ).all<InviteRow>()
      : Promise.resolve({ results: [] as InviteRow[] }),
  ]);
  const response: AccountResponse = {
    user: {
      id: user.id,
      email: user.email,
      displayEmail: user.displayEmail,
      role: user.role,
      legacy:
        context.data.legacySession && user.id === "legacy-local",
    },
    methods: {
      google: Boolean(methods?.google_count),
      password: Boolean(methods?.password_count),
      passkeySupported: true,
    },
    passkeys,
    users: (usersResult.results ?? []).map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      status: row.status,
      lastLoginAt: row.last_login_at,
    })),
    pendingInvites: (invitesResult.results ?? []).map((row) => ({
      email: row.email,
      createdAt: row.created_at,
    })),
    googleConfigured: Boolean(
      context.env.GOOGLE_CLIENT_ID && context.env.GOOGLE_CLIENT_SECRET,
    ),
  };
  return Response.json(response, {
    headers: { "cache-control": "private, no-store" },
  });
};
