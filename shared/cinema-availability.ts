import type { Cinema } from "./types";

export function isCinemaActiveOn(
  cinema: Pick<Cinema, "activeUntil">,
  date: string,
): boolean {
  return cinema.activeUntil === null || date <= cinema.activeUntil;
}

export function activeDatesForCinema(
  dates: string[],
  activeUntil: string | null,
): string[] {
  return dates.filter((date) => isCinemaActiveOn({ activeUntil }, date));
}
