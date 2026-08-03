import type { Cinema, RouteOrigin, TravelMode } from "./types";

export function buildGoogleMapsDirectionsUrl(
  origin: RouteOrigin,
  destination: Pick<Cinema, "name" | "address">,
  travelMode: TravelMode,
): string {
  const googleTravelMode: Record<
    TravelMode,
    "walking" | "transit" | "bicycling"
  > = {
    walking: "walking",
    transit: "transit",
    bus: "transit",
    bicycle: "bicycling",
  };
  const params = new URLSearchParams({
    api: "1",
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.name} ${destination.address}`,
    travelmode: googleTravelMode[travelMode],
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildGoogleMapsPlaceEmbedUrl(
  apiKey: string,
  cinema: Pick<Cinema, "name" | "address">,
): string {
  const url = new URL("https://www.google.com/maps/embed/v1/place");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", `${cinema.name} ${cinema.address}`);
  url.searchParams.set("zoom", "18");
  return url.toString();
}
