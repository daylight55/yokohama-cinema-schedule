import { useEffect, useRef, useState } from "react";
import {
  createPerformanceMetrics,
  setActiveMetrics,
} from "./performanceMetrics";

/** Enabled only by ?perf=1. No polling or animation loop, including during capture. */
export default function PerformancePanel() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState("");
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);
  function start() {
    const metrics = createPerformanceMetrics();
    const supported =
      typeof PerformanceObserver === "undefined"
        ? []
        : PerformanceObserver.supportedEntryTypes;
    const observers: PerformanceObserver[] = [];
    const started = performance.now();
    setActiveMetrics(metrics);
    setReport("");
    setRunning(true);
    for (const type of ["longtask", "long-animation-frame", "event"]) {
      if (!supported.includes(type)) continue;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          metrics.record(entry.entryType, entry.duration);
      });
      observer.observe({
        type,
        ...(type === "event" ? { durationThreshold: 16 } : {}),
      });
      observers.push(observer);
    }
    stop.current = () => {
      for (const observer of observers) {
        for (const entry of observer.takeRecords())
          metrics.record(entry.entryType, entry.duration);
        observer.disconnect();
      }
      setActiveMetrics(null);
      const heap = (
        performance as Performance & { memory?: { usedJSHeapSize: number } }
      ).memory;
      setReport(
        JSON.stringify(
          {
            durationMs: Math.round(performance.now() - started),
            supported: supported.filter((s) =>
              ["longtask", "long-animation-frame", "event"].includes(s),
            ),
            ...metrics.snapshot(),
            domElements: document.getElementsByTagName("*").length,
            jsHeapBytes: heap?.usedJSHeapSize ?? null,
          },
          null,
          2,
        ),
      );
      setRunning(false);
      stop.current = () => {};
    };
  }
  return (
    <aside className="performance-panel" aria-label="Performance diagnostics">
      <button
        type="button"
        onClick={() => (running ? stop.current() : start())}
      >
        {running ? "Stop & report" : "Measure performance"}
      </button>
      {report && (
        <details open>
          <summary>Local report (ms)</summary>
          <pre>{report}</pre>
        </details>
      )}
    </aside>
  );
}
