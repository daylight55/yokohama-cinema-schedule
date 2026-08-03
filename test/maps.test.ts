import { describe, expect, it } from "vitest";
import { buildGoogleMapsPlaceEmbedUrl } from "../shared/maps";

describe("cinema map preview", () => {
  it("targets the cinema building by name and full address", () => {
    const url = new URL(
      buildGoogleMapsPlaceEmbedUrl("test-key", {
        name: "横浜ブルク13",
        address: "横浜市中区桜木町1-1-7 コレットマーレ6F",
      }),
    );

    expect(url.pathname).toBe("/maps/embed/v1/place");
    expect(url.searchParams.get("q")).toBe(
      "横浜ブルク13 横浜市中区桜木町1-1-7 コレットマーレ6F",
    );
    expect(url.searchParams.get("zoom")).toBe("18");
  });
});
