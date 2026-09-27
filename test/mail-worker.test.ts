import { afterEach, expect, it, vi } from "vitest";
import mailer from "../mail-worker/index";
const origin = "https://hama-movie.daylight55.dev";
afterEach(() => vi.restoreAllMocks());
const payload = {
  to: "member@example.com",
  url: `${origin}/auth/invite?token=${"a".repeat(64)}`,
  expiresAt: "2026-09-26T00:00:00Z",
};
function request(body: typeof payload) {
  return new Request("https://mailer/send", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
it("sends the invitation through the Cloudflare binding", async () => {
  const send = vi.fn(async () => ({ messageId: "test-message" }));
  const response = await mailer.fetch(request(payload), {
    EMAIL: { send },
    INVITE_FROM_EMAIL: "noreply@notify.daylight55.dev",
    APP_ORIGIN: origin,
  });
  expect(response.status).toBe(200);
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      to: payload.to,
      text: expect.stringContaining(payload.url),
      html: expect.stringContaining(payload.url),
    }),
  );
});
it("rejects links outside the production origin before sending", async () => {
  const send = vi.fn();
  const response = await mailer.fetch(
    request({
      ...payload,
      url: payload.url.replace(origin, "https://evil.example"),
    }),
    {
      EMAIL: { send },
      INVITE_FROM_EMAIL: "noreply@notify.daylight55.dev",
      APP_ORIGIN: origin,
    },
  );
  expect(response.status).toBe(400);
  expect(send).not.toHaveBeenCalled();
});
it("reports service failure instead of claiming delivery", async () => {
  const send = vi.fn().mockRejectedValue(new Error("unavailable"));
  const response = await mailer.fetch(request(payload), {
    EMAIL: { send },
    INVITE_FROM_EMAIL: "noreply@notify.daylight55.dev",
    APP_ORIGIN: origin,
  });
  expect(response.status).toBe(502);
});
it("records the provider error code without logging recipient or invitation credentials", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const error = Object.assign(new Error(`Rejected ${payload.to} ${payload.url}`), {
    code: "E_RECIPIENT_SUPPRESSED",
  });
  const send = vi.fn().mockRejectedValue(error);
  const response = await mailer.fetch(request(payload), {
    EMAIL: { send },
    INVITE_FROM_EMAIL: "noreply@notify.daylight55.dev",
    APP_ORIGIN: origin,
  });
  expect(response.status).toBe(502);
  expect(send).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledExactlyOnceWith(JSON.stringify({
    event: "invitation_email_failed", reason: "E_RECIPIENT_SUPPRESSED",
  }));
});
it("does not log unrecognized provider codes or raw error messages", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const send = vi.fn().mockRejectedValue(Object.assign(new Error(payload.url), { code: payload.to }));
  await mailer.fetch(request(payload), {
    EMAIL: { send }, INVITE_FROM_EMAIL: "noreply@notify.daylight55.dev", APP_ORIGIN: origin,
  });
  expect(log).toHaveBeenCalledExactlyOnceWith(JSON.stringify({
    event: "invitation_email_failed", reason: "unknown",
  }));
});
it("sends an English invitation with a matching signup language", async () => {
  const send = vi.fn(async () => ({ messageId: "test-message" }));
  const response = await mailer.fetch(
    new Request("https://mailer/send", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        language: "en",
        url: payload.url + "&lang=en",
      }),
    }),
    {
      EMAIL: { send },
      INVITE_FROM_EMAIL: "noreply@notify.daylight55.dev",
      APP_ORIGIN: origin,
    },
  );
  expect(response.status).toBe(200);
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      subject: "Your Hama Movie! invitation (valid for 24 hours)",
      html: expect.stringContaining("&amp;lang=en"),
      text: expect.stringContaining("&lang=en"),
    }),
  );
});

it.each([
  ["ja", "Googleで登録する", "このメールを受け取ったアドレス", "マイページ", "24時間"],
  ["en", "Sign up with Google", "email address that received this invitation", "My account", "24 hours"],
])("includes signup and profile instructions in both %s email formats", async (language, signup, account, profile, expiry) => {
  const send = vi.fn().mockResolvedValue({ messageId: "test-message" });
  await mailer.fetch(new Request("https://mailer/send", {
    method: "POST",
    body: JSON.stringify({ ...payload, language }),
  }), {
    EMAIL: { send }, INVITE_FROM_EMAIL: "noreply@notify.daylight55.dev", APP_ORIGIN: origin,
  });
  const message = send.mock.calls[0][0];
  for (const format of [message.text, message.html]) {
    for (const instruction of [signup, account, profile, expiry, "Safari", "Chrome"]) {
      expect(format).toContain(instruction);
    }
  }
  expect(message.html).toContain("<ol><li>");
  expect(message.text).toContain("1. ");
  expect(message.text).toContain("4. ");
  // Language choice must survive even if the caller omitted it from the URL.
  const expectedLink = payload.url + (language === "en" ? "&lang=en" : "");
  expect(message.text).toContain(expectedLink);
  expect(message.html).toContain(`href="${expectedLink.replaceAll("&", "&amp;")}"`);
});
