import type {
  CalendarBusyPeriod,
  MovieMarathonPlanItem,
  MovieMarathonProposal,
  Showing,
} from "./types";

export const DEFAULT_SHOWING_DURATION_MINUTES = 120;
export const SAME_CINEMA_TRANSFER_MINUTES = 10;
export const DEFAULT_HOME_TRAVEL_MINUTES = 30;

export interface MovieMarathonOptimizerInput {
  planDate: string;
  availableStart: string;
  availableEnd: string;
  showings: Showing[];
  starredMovieKeys: Set<string>;
  homeTravelMinutesByCinema: Map<string, number>;
  transferMinutesByPair: Map<string, number>;
  defaultHomeTravelMinutes?: number;
}

interface Candidate {
  showing: Showing;
  startsAtMs: number;
  endsAtMs: number;
  starred: boolean;
}

interface SearchState {
  candidates: Candidate[];
  usedMovieKeys: Set<string>;
  totalTransferMinutes: number;
  totalIdleMinutes: number;
}

function minutesBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.round((toMs - fromMs) / 60_000));
}

function pairKey(fromCinemaId: string, toCinemaId: string): string {
  return `${fromCinemaId}:${toCinemaId}`;
}

function stateScore(state: SearchState): number {
  const starredCount = state.candidates.filter(
    (candidate) => candidate.starred,
  ).length;
  return (
    starredCount * 10_000 +
    state.candidates.length * 100 -
    state.totalIdleMinutes -
    state.totalTransferMinutes
  );
}

function stateSignature(state: SearchState): string {
  const last = state.candidates.at(-1);
  return `${last?.showing.id ?? "empty"}:${[...state.usedMovieKeys]
    .sort()
    .join(",")}`;
}

function normalizeCandidate(showing: Showing): Candidate | null {
  const startsAtMs = new Date(showing.startsAt).getTime();
  const explicitEndMs = showing.endsAt
    ? new Date(showing.endsAt).getTime()
    : Number.NaN;
  const endsAtMs = Number.isFinite(explicitEndMs)
    ? explicitEndMs
    : startsAtMs + DEFAULT_SHOWING_DURATION_MINUTES * 60_000;
  if (
    !Number.isFinite(startsAtMs) ||
    !Number.isFinite(endsAtMs) ||
    endsAtMs <= startsAtMs
  ) {
    return null;
  }
  return {
    showing,
    startsAtMs,
    endsAtMs,
    starred: false,
  };
}

export function optimizeMovieMarathon(
  input: MovieMarathonOptimizerInput,
): MovieMarathonProposal {
  const windowStartMs = new Date(input.availableStart).getTime();
  const windowEndMs = new Date(input.availableEnd).getTime();
  const defaultHomeTravelMinutes =
    input.defaultHomeTravelMinutes ?? DEFAULT_HOME_TRAVEL_MINUTES;

  if (
    !Number.isFinite(windowStartMs) ||
    !Number.isFinite(windowEndMs) ||
    windowStartMs >= windowEndMs
  ) {
    throw new RangeError("Invalid movie marathon availability window");
  }

  const candidates = input.showings
    .map(normalizeCandidate)
    .filter((candidate): candidate is Candidate => candidate !== null)
    .map((candidate) => ({
      ...candidate,
      starred: input.starredMovieKeys.has(candidate.showing.movieKey),
    }))
    .filter(
      (candidate) =>
        candidate.startsAtMs >= windowStartMs &&
        candidate.endsAtMs <= windowEndMs,
    )
    .sort(
      (left, right) =>
        left.startsAtMs - right.startsAtMs ||
        left.endsAtMs - right.endsAtMs ||
        left.showing.id.localeCompare(right.showing.id),
    );

  let states: SearchState[] = [
    {
      candidates: [],
      usedMovieKeys: new Set(),
      totalTransferMinutes: 0,
      totalIdleMinutes: 0,
    },
  ];

  for (const candidate of candidates) {
    const additions: SearchState[] = [];
    for (const state of states) {
      if (state.usedMovieKeys.has(candidate.showing.movieKey)) continue;

      const previous = state.candidates.at(-1);
      const transferMinutes = previous
        ? previous.showing.cinemaId === candidate.showing.cinemaId
          ? SAME_CINEMA_TRANSFER_MINUTES
          : input.transferMinutesByPair.get(
              pairKey(
                previous.showing.cinemaId,
                candidate.showing.cinemaId,
              ),
            ) ?? Number.POSITIVE_INFINITY
        : input.homeTravelMinutesByCinema.get(candidate.showing.cinemaId) ??
          defaultHomeTravelMinutes;
      const previousEndMs = previous?.endsAtMs ?? windowStartMs;
      const earliestStartMs = previousEndMs + transferMinutes * 60_000;
      if (
        !Number.isFinite(transferMinutes) ||
        candidate.startsAtMs < earliestStartMs
      ) {
        continue;
      }

      additions.push({
        candidates: [...state.candidates, candidate],
        usedMovieKeys: new Set([
          ...state.usedMovieKeys,
          candidate.showing.movieKey,
        ]),
        totalTransferMinutes:
          state.totalTransferMinutes + transferMinutes,
        totalIdleMinutes:
          state.totalIdleMinutes +
          minutesBetween(earliestStartMs, candidate.startsAtMs),
      });
    }

    const bestBySignature = new Map<string, SearchState>();
    for (const state of [...states, ...additions]) {
      const signature = stateSignature(state);
      const current = bestBySignature.get(signature);
      if (!current || stateScore(state) > stateScore(current)) {
        bestBySignature.set(signature, state);
      }
    }
    states = [...bestBySignature.values()]
      .sort((left, right) => stateScore(right) - stateScore(left))
      .slice(0, 500);
  }

  const best = states.sort(
    (left, right) =>
      stateScore(right) - stateScore(left) ||
      left.totalTransferMinutes - right.totalTransferMinutes,
  )[0];

  const items: MovieMarathonPlanItem[] = best.candidates.map(
    (candidate, index) => {
      const previous = best.candidates[index - 1];
      const transferMinutes = previous
        ? previous.showing.cinemaId === candidate.showing.cinemaId
          ? SAME_CINEMA_TRANSFER_MINUTES
          : (input.transferMinutesByPair.get(
              pairKey(
                previous.showing.cinemaId,
                candidate.showing.cinemaId,
              ),
            ) ?? 0)
        : (input.homeTravelMinutesByCinema.get(candidate.showing.cinemaId) ??
          defaultHomeTravelMinutes);
      return {
        showingId: candidate.showing.id,
        sequence: index + 1,
        movieKey: candidate.showing.movieKey,
        title: candidate.showing.title,
        cinemaId: candidate.showing.cinemaId,
        cinemaName: candidate.showing.cinemaName,
        startsAt: candidate.showing.startsAt,
        endsAt: new Date(candidate.endsAtMs).toISOString(),
        bookingUrl: candidate.showing.bookingUrl,
        starred: candidate.starred,
        transferMinutes,
      };
    },
  );

  return {
    planDate: input.planDate,
    availableStart: input.availableStart,
    availableEnd: input.availableEnd,
    starredCount: items.filter((item) => item.starred).length,
    movieCount: items.length,
    totalTransferMinutes: items.reduce(
      (total, item) => total + item.transferMinutes,
      0,
    ),
    items,
  };
}

export function findFreeCalendarPeriods(
  windowStart: string,
  windowEnd: string,
  busyPeriods: CalendarBusyPeriod[],
  minimumMinutes = 90,
): CalendarBusyPeriod[] {
  const startMs = new Date(windowStart).getTime();
  const endMs = new Date(windowEnd).getTime();
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    startMs >= endMs
  ) {
    return [];
  }

  const merged: Array<{ startMs: number; endMs: number }> = [];
  for (const period of busyPeriods
    .map((period) => ({
      startMs: Math.max(startMs, new Date(period.start).getTime()),
      endMs: Math.min(endMs, new Date(period.end).getTime()),
    }))
    .filter(
      (period) =>
        Number.isFinite(period.startMs) &&
        Number.isFinite(period.endMs) &&
        period.startMs < period.endMs,
    )
    .sort((left, right) => left.startMs - right.startMs)) {
    const previous = merged.at(-1);
    if (previous && period.startMs <= previous.endMs) {
      previous.endMs = Math.max(previous.endMs, period.endMs);
    } else {
      merged.push({ ...period });
    }
  }

  const free: CalendarBusyPeriod[] = [];
  let cursorMs = startMs;
  for (const period of merged) {
    if (period.startMs - cursorMs >= minimumMinutes * 60_000) {
      free.push({
        start: new Date(cursorMs).toISOString(),
        end: new Date(period.startMs).toISOString(),
      });
    }
    cursorMs = Math.max(cursorMs, period.endMs);
  }
  if (endMs - cursorMs >= minimumMinutes * 60_000) {
    free.push({
      start: new Date(cursorMs).toISOString(),
      end: new Date(endMs).toISOString(),
    });
  }
  return free;
}
