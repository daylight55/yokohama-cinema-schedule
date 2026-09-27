import { performance } from "node:perf_hooks";
import { reusableDateFormatter } from "../src/dateFormatter.ts";
const options = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
const times = Array.from(
  { length: 2000 },
  (_, i) => new Date(1790463600000 + i * 60000),
);
const results = [];
// Same inputs and output: compare only formatting CPU, not browser/battery behavior.
for (let round = 0; round < 5; round++) {
  let start = performance.now();
  const before = times.map((time) =>
    new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      ...options,
    }).format(time),
  );
  const beforeMs = performance.now() - start;
  const format = reusableDateFormatter(options, () => "ja-JP");
  start = performance.now();
  const after = times.map((time) => format.format(time));
  const afterMs = performance.now() - start;
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw Error("format changed");
  results.push({ beforeMs, afterMs });
}
const median = (key) => results.map((r) => r[key]).sort((a, b) => a - b)[2];
console.log(
  JSON.stringify(
    {
      runtime: process.version,
      samples: 2000,
      rounds: 5,
      beforeMedianMs: median("beforeMs"),
      afterMedianMs: median("afterMs"),
      formatterAllocationsBefore: 2000,
      formatterAllocationsAfter: 1,
      results,
    },
    null,
    2,
  ),
);
