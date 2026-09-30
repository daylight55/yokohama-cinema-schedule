import { useLayoutEffect, useRef } from "react";
import type { Language } from "../shared/language";

/** A language change updates the current page without navigating away. */
export function useLanguageScroll(language: Language) {
  const pending = useRef<{
    url: string;
    x: number;
    y: number;
    horizontal: Map<string, number>;
  } | null>(null);

  useLayoutEffect(() => {
    const snapshot = pending.current;
    pending.current = null;
    if (!snapshot) return;
    const restore = () => {
      if (location.href !== snapshot.url) return;
      document.querySelectorAll<HTMLElement>("[data-horizontal-scroll]").forEach((el) => {
        const left = snapshot.horizontal.get(el.dataset.horizontalScroll!);
        if (left !== undefined) el.scrollLeft = left;
      });
      window.scrollTo({ left: snapshot.x, top: snapshot.y, behavior: "instant" });
    };
    restore();
    // Keep browser scroll anchoring from moving the viewport after layout.
    const frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [language]);

  return () => {
    pending.current = {
      url: location.href,
      x: window.scrollX,
      y: window.scrollY,
      horizontal: new Map(Array.from(
        document.querySelectorAll<HTMLElement>("[data-horizontal-scroll]"),
        (el) => [el.dataset.horizontalScroll!, el.scrollLeft],
      )),
    };
  };
}
