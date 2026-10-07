import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
  await worker.stop();
  worker = undefined;
  // Exercise D1 batch/changes() semantics in workerd, not only Node SQLite.
  const authEntry = join(directory, "restoration.ts");
  await writeFile(authEntry, `
    import {createUserSession} from ${JSON.stringify(resolve("functions/_lib/auth.ts"))};
    import {authenticatedLogin} from ${JSON.stringify(resolve("functions/_lib/account-restoration.ts"))};
    import {withdrawAccount} from ${JSON.stringify(resolve("shared/account-lifecycle.ts"))};
    import {onRequestPost as restore} from ${JSON.stringify(resolve("functions/auth/restore.ts"))};
    export default {async fetch(request,env) {
      const id="runtime-restoration-member";
      await env.DB.prepare("INSERT INTO users(id,email,created_at,updated_at) VALUES(?,?,?,?)")
        .bind(id,"runtime@example.invalid","now","now").run();
      await createUserSession(env,id);
      await withdrawAccount(env.DB,id);
      const result=await authenticatedLogin(env,id,"#account");
      let rejected=false;try {await createUserSession(env,id);}catch {rejected=true;}
      const before=await env.DB.prepare("SELECT count(*) n FROM user_sessions WHERE user_id=?").bind(id).first();
      const confirm=()=>restore({env,request:new Request(new URL("/auth/restore",request.url),{
        method:"POST",headers:{origin:new URL(request.url).origin,cookie:result.restoreCookie.split(";")[0]},
        body:new URLSearchParams({action:"restore"})})});
      const response=await confirm();const replay=await confirm();
      const after=await env.DB.prepare("SELECT count(*) n FROM user_sessions WHERE user_id=?").bind(id).first();
      const user=await env.DB.prepare("SELECT status,withdrawn_at,delete_after FROM users WHERE id=?").bind(id).first();
      return Response.json({rejected,before:before.n,after:after.n,status:user.status,
        withdrawnAt:user.withdrawn_at,deleteAfter:user.delete_after,location:response.headers.get("location"),
        sessionCookie:response.headers.get("set-cookie").includes("yc_session=v2."),replay:replay.headers.get("location")});
    }};
  `);
  const authConfig = join(directory, "wrangler-restoration.json");
  await writeFile(authConfig, JSON.stringify({
    name: "hama-restoration-runtime-smoke", main: authEntry,
    compatibility_date: source.compatibility_date, compatibility_flags: source.compatibility_flags,
    d1_databases: source.d1_databases,
    vars: { SESSION_SECRET: "isolated-runtime-restoration-secret" },
  }));
  worker = await unstable_dev(authEntry, {
    config: authConfig, local: true, port: 0, inspectorPort: 0, logLevel: "error",
    persistTo: join(directory, "d1"),
    experimental: { forceLocal: true, disableExperimentalWarning: true, disableDevRegistry: true, watch: false },
  });
  const restorationResponse = await worker.fetch("/check");
  assert.equal(restorationResponse.status, 200);
  assert.deepEqual(await restorationResponse.json(), {
    rejected: true, before: 0, after: 1, status: "active", withdrawnAt: null, deleteAfter: null,
    location: "/#account", sessionCookie: true, replay: "/auth/login",
  });
  console.log("Account restoration confirmation and one-time session creation passed in workerd/D1.");
} finally {
  await worker?.stop();
  await rm(directory, { recursive: true, force: true });
}
