import { describe, expect, it } from "vitest";
import { load } from "cheerio";
import { requestLanguage } from "../shared/language";
import { translate, translateScreenInfo } from "../shared/i18n";
import {
  onRequestGet,
  onRequestPatch,
} from "../functions/api/account/language";
import { onRequestGet as invitePage } from "../functions/auth/invite";
import { loginPage } from "../functions/_lib/auth";
import { completeGoogleLogin } from "../functions/_lib/accounts";
import {
  createInvite,
  registerInvitedGoogleUser,
} from "../functions/_lib/invitations";
import { appHashStateFromHash, hashForAppView } from "../src/lib";
import { testDatabase } from "./helpers/sqlite-d1";
import type { AuthContextData, PagesEnv } from "../functions/_lib/env";
const origin = "https://example.com";
function context(
  db: D1Database,
  userId: string,
  body?: unknown,
  requestOrigin = origin,
) {
  return {
    env: { DB: db },
    data: { userId },
    request: new Request(
      `${origin}/api/account/language`,
      body === undefined
        ? {}
        : {
            method: "PATCH",
            headers: {
              origin: requestOrigin,
              "content-type": "application/json",
            },
            body: JSON.stringify(body),
          },
    ),
  } as EventContext<PagesEnv, string, AuthContextData>;
}
describe("account language", () => {
  it("validates language negotiation and translates full dynamic messages without changing arbitrary data", () => {
    expect(
      requestLanguage(
        new Request(`${origin}/?lang=en`, {
          headers: { cookie: "hamamubi_language=ja" },
        }),
      ),
    ).toBe("en");
    expect(
      requestLanguage(
        new Request(`${origin}/?lang=bad`, {
          headers: { cookie: "hamamubi_language=en" },
        }),
      ),
    ).toBe("en");
    expect(translate("間に合う・移動15分", "en")).toBe(
      "Can arrive in time · 15 min travel",
    );
    expect(translate("My private note: 日本", "en")).toBe(
      "My private note: 日本",
    );
    expect(translate("はまむび！", "ja")).toBe("はまむび！");
  });
  it("stores only the authenticated user's language and rejects invalid or cross-origin writes", async () => {
    const { db, sqlite } = testDatabase();
    try {
      sqlite.exec(
        "INSERT INTO users(id,role,status,created_at,updated_at) VALUES ('other','member','active','now','now')",
      );
      expect(
        (
          await onRequestPatch(
            context(db, "legacy-local", { language: "en", userId: "other" }),
          )
        ).status,
      ).toBe(200);
      expect(
        await (await onRequestGet(context(db, "legacy-local"))).json(),
      ).toEqual({ language: "en", userRole: "admin" });
      expect(await (await onRequestGet(context(db, "other"))).json()).toEqual({
        language: "ja",
        userRole: "member",
      });
      expect(
        (await onRequestPatch(context(db, "legacy-local", { language: "fr" })))
          .status,
      ).toBe(400);
      expect(
        (
          await onRequestPatch(
            context(
              db,
              "legacy-local",
              { language: "ja" },
              "https://evil.test",
            ),
          )
        ).status,
      ).toBe(403);
    } finally {
      sqlite.close();
    }
  });
  it("saves the signup language atomically and retains it on a subsequent Google login", async () => {
    const { db, sqlite } = testDatabase();
    try {
      const invite = await createInvite(db, "", "legacy-local");
      const identity = {
        subject: "english-user",
        email: "english@example.com",
        emailVerified: true,
      };
      const user = await registerInvitedGoogleUser(
        db,
        invite.token,
        identity,
        "en",
      );
      await completeGoogleLogin(db, identity, null, "unused", "", "ja");
      expect(
        sqlite.prepare("SELECT language FROM users WHERE id=?").get(user.id)
          ?.language,
      ).toBe("en");
    } finally {
      sqlite.close();
    }
  });
  it("renders English login and signup with a default-language selector", async () => {
    const html = await loginPage(false, "", true, "", "", "en").text();
    const $ = load(html);
    expect($("html").attr("lang")).toBe("en");
    expect($("h1").text()).toBe("Hama Movie!");
    expect($("a.google").text()).toBe("Sign in with Google");
    const { db, sqlite } = testDatabase();
    try {
      const invite = await createInvite(db, "", "legacy-local");
      const response = await invitePage({
        env: {
          DB: db,
          GOOGLE_CLIENT_ID: "client",
          GOOGLE_CLIENT_SECRET: "secret",
        },
        request: new Request(
          `${origin}/auth/invite?token=${invite.token}&lang=en`,
        ),
      } as EventContext<PagesEnv, string, Record<string, unknown>>);
      const page = load(await response.text());
      expect(page('select[name="lang"] option[selected]').val()).toBe("en");
      expect(page('input[name="invite"]').val()).toBe(invite.token);
      expect(page("h1").text()).toBe("You're invited to Hama Movie!");
    } finally {
      sqlite.close();
    }
  });
  it("preserves canonical movie identifiers in a directly reloadable weekly route", () => {
    const movie = "君の名は。";
    expect(appHashStateFromHash(hashForAppView("movie", { movie }))).toEqual({
      view: "movie",
      movie,
      date: null,
      query: "",
    });
    expect(appHashStateFromHash("#movies?movie=test").view).toBe("movies");
  });
});
it("has English wording for literal Japanese messages rendered by each page", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const missing: string[] = [];
  for (const file of readdirSync("src").filter((file) =>
    file.endsWith(".tsx"),
  )) {
    const source = readFileSync(`src/${file}`, "utf8");
    for (const match of source.matchAll(
      /(?:localize|t)\(("(?:[^"\\]|\\.)*")\)/g,
    )) {
      const value = JSON.parse(match[1]) as string;
      if (
        /[\u3040-\u30ff\u3400-\u9fff]/.test(value) &&
        translate(value, "en") === value
      )
        missing.push(`${file}: ${value}`);
    }
  }
  expect(missing).toEqual([]);
});

it("translates each combined screen and presentation label", () => {
  expect(translateScreenInfo("スクリーン1 / 字幕 / IMAX", "en")).toBe(
    "Screen 1 / Subtitled / IMAX",
  );
  expect(translateScreenInfo("ムービル3 / 吹替", "en")).toBe(
    "Movil 3 / Dubbed",
  );
  expect(translateScreenInfo("字幕 / IMAX", "ja")).toBe("字幕 / IMAX");
});
