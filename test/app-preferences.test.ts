import { describe, expect, it } from "vitest";
import { parseStoredBoolean } from "../functions/_lib/app-preferences";

describe("app preferences", () => {
  it("enables automatic location only for the stored true value", () => {
    expect(parseStoredBoolean("true")).toBe(true);
  });

  it.each(["false", "TRUE", "1", "", null])(
    "treats %s as disabled",
    (value) => {
      expect(parseStoredBoolean(value)).toBe(false);
    },
  );
});
