import { useLayoutEffect, useRef } from "react";

type Snapshot = { x: number; y: number; horizontal: number[]; open: string[]; focus: string | null };
/** Scroll state belongs to a history entry, not merely a page or film. */
export function useHistoryScroll(route: string, ready: boolean) {
  const pending = useRef<{ hash: string; snapshot: Snapshot } | null>(null);
  const handledHash = useRef<string | null>(null);
  const restoring = useRef(false);
  useLayoutEffect(() => {
    const entries = new Map<string, Snapshot>();
    let url = location.href;
    let id = crypto.randomUUID();
    const identify = () => history.replaceState({ ...history.state, hamaEntry: id }, "");
    identify();
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";
    const capture = () => {
      if (pending.current || restoring.current || location.href !== url) return;
      const active = document.activeElement;
      entries.set(id, {
        x: scrollX, y: scrollY,
        horizontal: Array.from(document.querySelectorAll<HTMLElement>("[data-horizontal-scroll]"), (el) => el.scrollLeft),
        open: Array.from(document.querySelectorAll<HTMLDetailsElement>("details.schedule-window[open]"), (el) => el.id),
        focus: active instanceof HTMLElement ? active.closest<HTMLElement>("[data-showing-id], [data-movie-key]")?.dataset.showingId ?? active.closest<HTMLElement>("[data-movie-key]")?.dataset.movieKey ?? null : null,
      });
    };
    const navigate = () => {
      if (url === location.href) return;
      const next = history.state?.hamaEntry;
      const saved = next && next !== id ? entries.get(next) : null;
      id = next && next !== id ? next : crypto.randomUUID();
      url = location.href;
      identify();
      handledHash.current = null;
      pending.current = saved ? { hash: location.hash, snapshot: saved } : null;
      if (entries.size > 80) entries.delete(entries.keys().next().value!);
    };
    capture();
    document.addEventListener("scroll", capture, { capture: true, passive: true });
    document.addEventListener("click", capture, true);
    window.addEventListener("popstate", navigate);
    window.addEventListener("hashchange", navigate);
    return () => {
      history.scrollRestoration = previous;
      document.removeEventListener("scroll", capture, true);
      document.removeEventListener("click", capture, true);
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
      document.querySelectorAll<HTMLElement>("[data-horizontal-scroll]").forEach((el, i) => { el.scrollLeft = snapshot.horizontal[i] ?? 0; });
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
  return { pending, handledHash };
}
