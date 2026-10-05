import { useLayoutEffect, useRef } from "react";

type Snapshot = { x: number; y: number; horizontal: Map<string, number>; open: string[]; focus: string | null };
/** Scroll state belongs to a history entry, not merely a page or film. */
export function useHistoryScroll(route: string, ready: boolean) {
  const entryURL = useRef(location.href);
  const pending = useRef<{ hash: string; snapshot: Snapshot } | null>(null);
  const handledHash = useRef<string | null>(null);
  const restoring = useRef(false);
  useLayoutEffect(() => {
    const entries = new Map<string, Snapshot>();
    let id = history.state?.hamaEntry ?? crypto.randomUUID();
    const saved = history.state?.hamaReloadScroll;
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigation?.type === "reload" && saved?.href === entryURL.current &&
      Number.isFinite(saved.x) && Number.isFinite(saved.y) &&
      Array.isArray(saved.horizontal) && Array.isArray(saved.open)) {
      const snapshot: Snapshot = { x: saved.x, y: saved.y,
        horizontal: new Map(saved.horizontal), open: saved.open, focus: saved.focus ?? null };
      entries.set(id, snapshot);
      pending.current = { hash: location.hash, snapshot };
    }
    const identify = () => history.replaceState({ ...history.state, hamaEntry: id }, "");
    identify();
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";
    const currentSnapshot = () => {
      if (pending.current || restoring.current || location.href !== entryURL.current) return null;
      let snapshot = entries.get(id);
      if (!snapshot) {
        snapshot = { x: scrollX, y: scrollY, horizontal: new Map(), open: [], focus: null };
        entries.set(id, snapshot);
      }
      return snapshot;
    };
    const capture = () => {
      const snapshot = currentSnapshot();
      if (!snapshot) return;
      const active = document.activeElement;
      snapshot.x = scrollX;
      snapshot.y = scrollY;
      snapshot.open = Array.from(document.querySelectorAll<HTMLDetailsElement>("details.schedule-window[open]"), (el) => el.id);
      snapshot.focus = active instanceof HTMLElement ? active.closest<HTMLElement>("[data-showing-id], [data-movie-key]")?.dataset.showingId ?? active.closest<HTMLElement>("[data-movie-key]")?.dataset.movieKey ?? null : null;
    };
    // A fling can emit dozens of events per second. Read only the scroller that
    // changed: no whole-page queries, layout walks, or snapshot-array allocations.
    const captureScroll = (event: Event) => {
      const snapshot = currentSnapshot();
      if (!snapshot) return;
      if (event.target === document) {
        snapshot.x = scrollX;
        snapshot.y = scrollY;
      } else if (event.target instanceof HTMLElement) {
        const key = event.target.dataset.horizontalScroll;
        if (key) snapshot.horizontal.set(key, event.target.scrollLeft);
      }
    };
    const navigate = () => {
      if (entryURL.current === location.href) return;
      const next = history.state?.hamaEntry;
      const saved = next && next !== id ? entries.get(next) : null;
      id = next && next !== id ? next : crypto.randomUUID();
      entryURL.current = location.href;
      identify();
      handledHash.current = null;
      pending.current = saved ? { hash: location.hash, snapshot: saved } : null;
      if (entries.size > 80) entries.delete(entries.keys().next().value!);
    };
    const persistForReload = () => {
      // Capture once on departure, keeping mobile scroll events inexpensive.
      const snapshot = pending.current?.snapshot ?? currentSnapshot();
      if (!snapshot || location.href !== entryURL.current) return;
      if (!pending.current && !restoring.current) {
        capture();
        for (const el of document.querySelectorAll<HTMLElement>("[data-horizontal-scroll]")) {
          snapshot.horizontal.set(el.dataset.horizontalScroll!, el.scrollLeft);
        }
      }
      history.replaceState({ ...history.state, hamaReloadScroll: {
        href: entryURL.current, x: snapshot.x, y: snapshot.y,
        horizontal: Array.from(snapshot.horizontal), open: snapshot.open, focus: snapshot.focus,
      } }, "");
    };
    capture();
    window.addEventListener("beforeunload", persistForReload);
    window.addEventListener("pagehide", persistForReload);
    document.addEventListener("scroll", captureScroll, { capture: true, passive: true });
    document.addEventListener("click", capture, true);
    document.addEventListener("toggle", capture, true);
    window.addEventListener("popstate", navigate);
    window.addEventListener("hashchange", navigate);
    return () => {
      history.scrollRestoration = previous;
      window.removeEventListener("beforeunload", persistForReload);
      window.removeEventListener("pagehide", persistForReload);
      document.removeEventListener("scroll", captureScroll, true);
      document.removeEventListener("click", capture, true);
      document.removeEventListener("toggle", capture, true);
      window.removeEventListener("popstate", navigate);
      window.removeEventListener("hashchange", navigate);
    };
  }, []);
  useLayoutEffect(() => {
    const restore = pending.current;
    if (!restore || !ready || restore.hash !== route) return;
    const { snapshot } = restore;
    restoring.current = true;
    for (const el of document.querySelectorAll<HTMLDetailsElement>("details.schedule-window")) el.open = snapshot.open.includes(el.id);
    const apply = () => {
      document.querySelectorAll<HTMLElement>("[data-horizontal-scroll]").forEach((el) => {
        el.scrollLeft = snapshot.horizontal.get(el.dataset.horizontalScroll!) ?? 0;
      });
      const focus = Array.from(document.querySelectorAll<HTMLElement>("[data-showing-id], [data-movie-key]"))
        .find((el) => el.dataset.showingId === snapshot.focus || el.dataset.movieKey === snapshot.focus);
      (focus?.querySelector<HTMLElement>("a,button") ?? focus)?.focus({ preventScroll: true });
      window.scrollTo({ left: snapshot.x, top: snapshot.y, behavior: "instant" });
    };
    apply();
    handledHash.current = route;
    pending.current = null;
    const frame = requestAnimationFrame(() => { apply(); restoring.current = false; });
    return () => { cancelAnimationFrame(frame); restoring.current = false; };
  }, [route, ready]);
  return { pending, handledHash,
    syncEntryURL: () => { entryURL.current = location.href; },
  };
}
