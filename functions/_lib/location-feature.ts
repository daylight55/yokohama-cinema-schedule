// Location collection is retired for the public service, including old clients.
export function locationFeatureUnavailable(): Response {
  return Response.json(
    { error: "location_feature_removed" },
    { status: 410, headers: { "cache-control": "private, no-store" } },
  );
}
