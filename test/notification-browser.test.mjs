// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NotificationProvider, NotificationBell } from "../src/Notifications";
let root, host, result, show;
beforeEach(() => {
  vi.useFakeTimers();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value: true,
  });
  show = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("Notification", { permission: "granted" });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: vi.fn().mockResolvedValue({ showNotification: show }),
    },
  });
  localStorage.clear();
  location.hash = "#shared";
  result = {
    userId: "a",
    items: [],
    unread: 1,
    lastReadId: 0,
    latestId: 1,
    nextBefore: null,
    titles: [],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => structuredClone(result),
    })),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const mount = () =>
  act(async () =>
    root.render(
      React.createElement(
        NotificationProvider,
        null,
        React.createElement(NotificationBell),
      ),
    ),
  );
it("does not alert for history, alerts once for new unread events with opt-in and leaves private content out", async () => {
  localStorage.setItem("hama-notifications:a", "on");
  await mount();
  expect(show).not.toHaveBeenCalled();
  result.latestId = 2;
  result.unread = 2;
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(show).toHaveBeenCalledTimes(1);
  expect(show.mock.calls[0][1]).toMatchObject({ tag: "hama-group-updates" });
  expect(show.mock.calls[0][1].body).not.toContain("a@example.com");
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(show).toHaveBeenCalledTimes(1);
  result.latestId = 3;
  result.lastReadId = 3;
  result.unread = 0;
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(show).toHaveBeenCalledTimes(1);
});
it("does not alert while viewing updates, without opt-in, or with permission denied", async () => {
  await mount();
  result.latestId = 2;
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(show).not.toHaveBeenCalled();
  localStorage.setItem("hama-notifications:a", "on");
  Notification.permission = "denied";
  result.latestId = 3;
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(show).not.toHaveBeenCalled();
  Notification.permission = "granted";
  location.hash = "#notifications";
  result.latestId = 4;
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(show).not.toHaveBeenCalled();
});
it("suspends hidden tabs without permission and stops after five server failures", async () => {
  await mount();
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: true,
  });
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  await act(async () => vi.advanceTimersByTimeAsync(300000));
  expect(fetch).toHaveBeenCalledTimes(1);
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  fetch.mockRejectedValue(new Error("offline"));
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  await act(async () => vi.advanceTimersByTimeAsync(3600000));
  expect(fetch).toHaveBeenCalledTimes(6);
  await act(async () => vi.advanceTimersByTimeAsync(3600000));
  expect(fetch).toHaveBeenCalledTimes(6);
});
