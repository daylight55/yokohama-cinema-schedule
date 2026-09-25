import { dateRange, todayInJst } from "../shared/date";
import { fetchTjoy } from "../worker/src/index";
const origin = process.env.COLLECTOR_ORIGIN;
const token = process.env.COLLECTOR_INGEST_TOKEN;
if (!origin || !token || new URL(origin).protocol !== "https:")
  throw new Error("Collector configuration is missing");
const dates = dateRange(todayInJst(), 7);
let failed = false;
for (const [sourceId, theaterPath] of [
  ["tjoy-yokohama", "t-joy_yokohama"],
  ["yokohama-burg13", "yokohama_burg13"],
]) {
  try {
    const fetched = await fetchTjoy(
      dates,
      sourceId,
      sourceId,
      `https://tjoy.jp/${theaterPath}`,
    );
    const response = await fetch(new URL("/ingest", origin), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sourceId,
        dates,
        showings: fetched.showings,
        dateErrors: [...fetched.dateErrors],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (response.status !== 200)
      throw new Error(`Ingestion failed: HTTP ${response.status}`);
    console.log(`${sourceId}: ${fetched.showings.length} showings saved`);
  } catch (error) {
    failed = true;
    console.error(
      `${sourceId}: ${error instanceof Error ? error.message : "collection failed"}`,
    );
  }
}
if (failed) process.exitCode = 1;
