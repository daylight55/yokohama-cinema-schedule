// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { Storage } from "happy-dom";
import { ADMIN_MODE_STORAGE_KEY, useAdminMode } from "../src/useAdminMode";

let root, mode;
function Page({ admin }) {
  mode = useAdminMode(admin);
  return createElement("span", null, String(mode.enabled));
}
const render = async (admin) => {
  await act(async () => root.render(createElement(Page, { admin })));
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", new Storage());
  window.localStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("starts off, persists a choice across mounts and prevents non-admin activation", async () => {
  await render(true);
  expect(mode.enabled).toBe(false);
  await act(async () => mode.setEnabled(true));
  expect(mode.enabled).toBe(true);
  expect(window.localStorage.getItem(ADMIN_MODE_STORAGE_KEY)).toBe("on");
  await act(async () => root.unmount());
  root = createRoot(document.getElementById("root"));
  await render(false);
  expect(mode.enabled).toBe(false);
  await act(async () => mode.setEnabled(false));
  expect(window.localStorage.getItem(ADMIN_MODE_STORAGE_KEY)).toBe("on");
  await act(async () => mode.setEnabled(true));
  expect(mode.enabled).toBe(false);
  await render(true);
  expect(mode.enabled).toBe(true);
  await render(false);
  expect(mode.enabled).toBe(false);
});

it("reflects another tab's choice and storage clearing", async () => {
  window.localStorage.setItem(ADMIN_MODE_STORAGE_KEY, "on");
  await render(true);
  expect(mode.enabled).toBe(true);
  await act(async () => {
    window.localStorage.setItem(ADMIN_MODE_STORAGE_KEY, "off");
    window.dispatchEvent(new StorageEvent("storage", { key: ADMIN_MODE_STORAGE_KEY }));
  });
  expect(mode.enabled).toBe(false);
  await act(async () => mode.setEnabled(true));
  await act(async () => {
    window.localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
  });
  expect(mode.enabled).toBe(false);
});

it("remains usable in the current tab when storage is blocked", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  await render(true);
  expect(mode.enabled).toBe(false);
  await act(async () => mode.setEnabled(true));
  expect(mode.enabled).toBe(true);
  await act(async () => mode.setEnabled(false));
  expect(mode.enabled).toBe(false);
});
