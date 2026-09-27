// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { useHistoryScroll } from "../src/useHistoryScroll";

let root;
let frame;
function Page({ route, ready = true, order = ["first", "second"] }) {
  useHistoryScroll(route, ready);
  return createElement("main", null,
    ...order.map(key => createElement("div", { key, "data-horizontal-scroll": key },
      createElement("a", { href: "#movie", "data-movie-key": key }, key))),
    createElement("details", { id: "morning", className: "schedule-window", open: true }, createElement("summary", null, "Morning")),
  );
}
const render = async (route, props = {}) => {
  await act(async () => root.render(createElement(Page, { route, ...props })));
};
const navigate = (hash, state = null) => {
  history.replaceState(state, "", hash);
  window.dispatchEvent(new PopStateEvent("popstate", { state }));
  window.dispatchEvent(new HashChangeEvent("hashchange"));
};
const scroll = (key, left) => {
  const element = document.querySelector(`[data-horizontal-scroll="${key}"]`);
  element.scrollLeft = left;
  element.dispatchEvent(new Event("scroll"));
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("scrollX", 0);
  vi.stubGlobal("scrollY", 0);
  frame = [];
  vi.stubGlobal("requestAnimationFrame", vi.fn(callback => { frame.push(callback); return frame.length; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(window, "scrollTo").mockImplementation(({ left, top }) => {
    vi.stubGlobal("scrollX", left);
    vi.stubGlobal("scrollY", top);
  });
  history.replaceState(null, "", "#schedule");
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("history scroll capture during mobile flings", () => {
  it("does no document-wide scan across 500 horizontal scroll events", async () => {
    await render("#schedule");
    const strip = document.querySelector('[data-horizontal-scroll="first"]');
    const query = vi.spyOn(document, "querySelectorAll");
    const focusQuery = vi.spyOn(strip, "closest");
    for (let index = 0; index < 500; index++) {
      strip.scrollLeft = index;
      strip.dispatchEvent(new Event("scroll"));
    }
    expect(query).not.toHaveBeenCalled();
    expect(focusQuery).not.toHaveBeenCalled();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("restores independent horizontal positions by identity after reordered rendering and delayed loading", async () => {
    await render("#schedule");
    const scheduleState = history.state;
    scroll("first", 215);
    scroll("second", 90);
    vi.stubGlobal("scrollY", 1688);
    document.dispatchEvent(new Event("scroll"));
    document.querySelector('a[data-movie-key="first"]').focus();
    document.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    navigate("#movie");
    await render("#movie");
    // A new page's events must not mutate the saved schedule snapshot.
    scroll("first", 7);
    vi.stubGlobal("scrollY", 0);
    document.dispatchEvent(new Event("scroll"));
    navigate("#schedule", scheduleState);
    await render("#schedule", { ready: false });
    expect(window.scrollTo).not.toHaveBeenCalled();
    await render("#schedule", { ready: true, order: ["second", "first"] });
    frame.forEach(callback => callback());
    expect(window.scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 1688, behavior: "instant" });
    expect(document.querySelector('[data-horizontal-scroll="first"]').scrollLeft).toBe(215);
    expect(document.querySelector('[data-horizontal-scroll="second"]').scrollLeft).toBe(90);
    expect(document.activeElement.dataset.movieKey).toBe("first");
  });

  it("retains collapse state and captures a swipe before navigation even without a click", async () => {
    await render("#schedule");
    const state = history.state;
    const details = document.querySelector("details");
    details.open = false;
    details.dispatchEvent(new Event("toggle"));
    scroll("first", 340);
    vi.stubGlobal("scrollY", 700);
    document.dispatchEvent(new Event("scroll"));
    navigate("#movies");
    await render("#movies");
    navigate("#schedule", state);
    await render("#schedule");
    frame.forEach(callback => callback());
    expect(document.querySelector("details").open).toBe(false);
    expect(document.querySelector('[data-horizontal-scroll="first"]').scrollLeft).toBe(340);
    expect(window.scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 700, behavior: "instant" });
  });
});
