// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { useLanguageScroll } from "../src/useLanguageScroll";

let root, capture, frames;
function Page({ language, order = ["dates", "cinema"] }) {
  capture = useLanguageScroll(language);
  return createElement("main", null, ...order.map(key =>
    createElement("div", { key, "data-horizontal-scroll": key }, language)));
}
const render = async (language, order) => {
  await act(async () => root.render(createElement(Page, { language, order })));
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  frames = new Map();
  let nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", vi.fn(callback => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn(id => frames.delete(id)));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  history.replaceState(null, "", "#schedule");
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("preserves the latest viewport and independent horizontal strips when translation reorders them", async () => {
  await render("ja");
  vi.stubGlobal("scrollX", 0);
  vi.stubGlobal("scrollY", 1250);
  document.querySelector('[data-horizontal-scroll="dates"]').scrollLeft = 180;
  document.querySelector('[data-horizontal-scroll="cinema"]').scrollLeft = 70;
  capture();
  // Model browser anchoring during the translated DOM commit.
  vi.stubGlobal("scrollY", 950);
  await render("en", ["cinema", "dates"]);
  expect(window.scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 1250, behavior: "instant" });
  expect(document.querySelector('[data-horizontal-scroll="dates"]').scrollLeft).toBe(180);
  expect(document.querySelector('[data-horizontal-scroll="cinema"]').scrollLeft).toBe(70);
  frames.forEach(callback => callback());
  expect(window.scrollTo).toHaveBeenCalledTimes(2);
});

it("does not restore on an ordinary render or a language change without a capture", async () => {
  await render("ja");
  await render("ja");
  await render("en");
  expect(window.scrollTo).not.toHaveBeenCalled();
});

it("does not override navigation before the translated render or its settling frame", async () => {
  await render("ja");
  capture();
  history.replaceState(null, "", "#movies");
  await render("en");
  frames.forEach(callback => callback());
  expect(window.scrollTo).not.toHaveBeenCalled();
  frames.clear();
  capture();
  await render("ja");
  window.scrollTo.mockClear();
  history.replaceState(null, "", "#about");
  frames.forEach(callback => callback());
  expect(window.scrollTo).not.toHaveBeenCalled();
});

it("cancels the settling frame on unmount", async () => {
  await render("ja");
  capture();
  await render("en");
  await act(async () => root.unmount());
  expect(frames.size).toBe(0);
  root = { unmount() {} };
});
