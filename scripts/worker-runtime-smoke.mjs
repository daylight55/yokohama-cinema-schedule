import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unstable_dev, unstable_readConfig } from "wrangler";

// Exercise the configured deployment entry in workerd: typecheck and dry-run
// bundling do not detect invalid named exports registered as RPC entrypoints.
const source = unstable_readConfig({ config: "worker/wrangler.jsonc" });
const directory = await mkdtemp(join(tmpdir(), "hama-worker-smoke-"));
let worker;
try {
  // Wrangler's migration parser differs from SQLite exec (notably CASE END
  // inside triggers). Apply every migration through the real local D1 path.
  execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "migrations", "apply", "yokohama-cinema-schedule", "--local", "--config", "worker/wrangler.jsonc", "--persist-to", join(directory,"d1")], {
    env: {...process.env, CI:"true", WRANGLER_SEND_METRICS:"false"}, stdio:"pipe", timeout:60000,
  });
  console.log("D1 migrations passed through Wrangler.");
  const config = join(directory, "wrangler.json");
  await writeFile(config, JSON.stringify({
    name: "hama-runtime-smoke",
    main: source.main,
    compatibility_date: source.compatibility_date,
    compatibility_flags: source.compatibility_flags,
  }));
  // No credentials, persistent data, AI binding or external requests in CI.
  worker = await unstable_dev(source.main, {
    config, local: true, port: 0, inspectorPort: 0, logLevel: "error",
    experimental: { forceLocal: true, disableExperimentalWarning: true, disableDevRegistry: true, watch: false },
  });
  assert.equal((await worker.fetch("/missing")).status, 404);
  assert.equal((await worker.fetch("/research-synopses", { method: "POST" })).status, 401);
  console.log("Worker runtime and authenticated entrypoints passed.");
} finally {
  await worker?.stop();
  await rm(directory, { recursive: true, force: true });
}
