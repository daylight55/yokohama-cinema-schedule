import { useEffect, useRef } from "react";
import { getDateSwipeDirection, isDateSwipeBlockedByHorizontalScroll, type DateSwipeDirection } from "./lib";

/** Recognize direction once, without rendering or measuring layout during a drag. */
export function useDateSwipe(enabled: boolean, routeKey: string, onSwipe: (direction: DateSwipeDirection) => void) {
  const ref = useRef<HTMLElement>(null);
  const current = useRef({enabled, routeKey, onSwipe});
  current.current = {enabled, routeKey, onSwipe};
  useEffect(() => {
    const main = ref.current;
    if (!main) return;
    let start: { id: number; x: number; y: number; horizontal: boolean; route: string } | null = null;
    let suppressClickUntil = 0;
    const cancel = () => { start = null; };
    const begin = (event: TouchEvent) => {
      start = null;
      suppressClickUntil = 0; // A deliberate new tap must work immediately.
      if (!current.current.enabled || event.touches.length !== 1 || isDateSwipeBlockedByHorizontalScroll(event.target)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="slider"]')) return;
      const touch = event.touches[0];
      start = { id: touch.identifier, x: touch.clientX, y: touch.clientY, horizontal: false, route: current.current.routeKey };
    };
    const move = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1) { cancel(); return; }
      const touch = event.touches[0];
      if (touch.identifier !== start.id) { cancel(); return; }
      const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
      if (!start.horizontal) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
        // A vertical/diagonal gesture belongs to the browser for its entire lifetime.
        if (!getDateSwipeDirection(dx, dy, 8)) { cancel(); return; }
        start.horizontal = true;
      }
      if (!event.cancelable) { cancel(); return; }
      event.preventDefault();
      suppressClickUntil = Date.now() + 500;
    };
    const end = (event: TouchEvent) => {
      const gesture = start;
      start = null;
      if (!gesture?.horizontal || event.touches.length || !current.current.enabled || gesture.route !== current.current.routeKey) return;
      const touch = Array.from(event.changedTouches).find(t => t.identifier === gesture.id);
      if (!touch) return;
      suppressClickUntil = Date.now() + 500;
      const direction = getDateSwipeDirection(touch.clientX - gesture.x, touch.clientY - gesture.y);
      if (direction) current.current.onSwipe(direction);
    };
    const click = (event: MouseEvent) => {
      if (event.detail === 0 || Date.now() > suppressClickUntil) return;
      event.preventDefault();event.stopPropagation();
      suppressClickUntil = 0;
    };
    // React's delegated touchmove listener is passive. A local listener can
    // claim only horizontal gestures before native scrolling cancels touchend.
    main.addEventListener("touchstart", begin, { passive: true });
    main.addEventListener("touchmove", move, { passive: false });
    main.addEventListener("touchend", end, { passive: true });
    main.addEventListener("touchcancel", cancel, { passive: true });
    main.addEventListener("click", click, true);
    return () => {
      main.removeEventListener("touchstart", begin);
      main.removeEventListener("touchmove", move);
      main.removeEventListener("touchend", end);
      main.removeEventListener("touchcancel", cancel);
      main.removeEventListener("click", click, true);
    };
  }, []);
  return ref;
}
