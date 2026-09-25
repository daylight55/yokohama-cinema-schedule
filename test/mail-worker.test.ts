import { expect, it, vi } from "vitest";
import mailer from "../mail-worker/index";
const origin = "https://yokohama-cinema-schedule.pages.dev";
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
