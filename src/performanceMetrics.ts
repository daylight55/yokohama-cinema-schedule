// Opt-in, local-only counters. No event log, tokens, film titles, or network upload.
export function createPerformanceMetrics() {
  let tasks = 0,
    taskMs = 0,
    maxTaskMs = 0,
    frames = 0,
    maxFrameMs = 0,
    interactions = 0,
    maxInteractionMs = 0,
    commits = 0;
  return {
    record(type: string, duration: number) {
      if (!Number.isFinite(duration) || duration < 0) return;
      if (type === "longtask") {
        tasks++;
        taskMs += duration;
        maxTaskMs = Math.max(maxTaskMs, duration);
      }
      if (type === "long-animation-frame") {
        frames++;
        maxFrameMs = Math.max(maxFrameMs, duration);
      }
      if (type === "event") {
        interactions++;
        maxInteractionMs = Math.max(maxInteractionMs, duration);
      }
    },
    commit() {
      commits++;
    },
    snapshot() {
      return {
        tasks,
        taskMs,
        maxTaskMs,
        frames,
        maxFrameMs,
        interactions,
        maxInteractionMs,
        commits,
      };
    },
  };
}
export let activeMetrics: ReturnType<typeof createPerformanceMetrics> | null =
  null;
export function setActiveMetrics(value: typeof activeMetrics) {
  activeMetrics = value;
}
