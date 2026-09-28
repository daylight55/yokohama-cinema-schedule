// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const script = readFileSync("public/login-route.js", "utf8");
it("preserves the member ID in login forms and refuses additional redirect parameters", () => {
  for (const [hash, expected] of [
    ["#member?user=Bob-123", "#member?user=Bob-123"],
    ["#member?user=Bob&next=evil", ""],
    ["#member?user=" + "a".repeat(129), ""],
  ]) {
    location.hash = hash;
    document.body.innerHTML = '<form><input name="returnHash" value=""></form>';
    new Function(script)();
    expect(document.querySelector("input").value).toBe(expected);
  }
  document.body.innerHTML = "";
});
