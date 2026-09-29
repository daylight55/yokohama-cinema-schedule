// Verify the published guide in a production build. APIs use isolated demo data.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { installFixture } from "./capture-fixture.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.GUIDE_URL || "http://127.0.0.1:5195";
const browser = await chromium.launch({ headless: true });
await fs.mkdir("output/playwright", { recursive: true });
const results = [];
try {
  for (const [width, height] of [
    [320, 700],
    [390, 844],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      locale: "ja-JP",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installFixture(page, "ja");
    await page.goto(`${base}/#about`);
    await page.locator("video track").waitFor({ state: "attached" });
    for (const lang of ["ja", "en"]) {
      if (lang === "en") await page.getByRole("switch").click();
      await page.waitForFunction(
        (lang) =>
          document
            .querySelector("video source")
            ?.src.endsWith(`how-to-${lang}.mp4`),
        lang,
      );
      const video = page.locator("video");
      // Model Mac/browser automatic captions before metadata is delivered.
      await video.evaluate(async (v) => {
        v.textTracks[0].mode = "showing";
        v.muted = true;
        await v.play();
      });
      await page.waitForFunction(
        () => document.querySelector("video").currentTime > 0.1,
      );
      const media = await video.evaluate((v) => ({
        duration: v.duration,
        width: v.videoWidth,
        height: v.videoHeight,
        captions: v.textTracks[0].mode,
      }));
      assert.equal(media.duration, 89);
      assert.equal(media.width, 900);
      assert.equal(media.height, 1200);
      assert.equal(media.captions, "disabled");
      await video.evaluate((v) => {
        v.pause();
        v.currentTime = 24;
      });
      await page.waitForFunction(
        () => !document.querySelector("video").seeking,
      );
      await video.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `output/playwright/guide-ui-refresh-${lang}-${width}.png`,
      });
      await video.evaluate(async (v) => {
        v.textTracks[0].mode = "showing";
        v.currentTime = 86;
        await v.play();
      });
      await page.waitForFunction(
        () => document.querySelector("video").currentTime > 86.2,
      );
      assert.equal(
        await video.evaluate((v) => v.textTracks[0].mode),
        "showing",
        "manual caption choice survives seeking",
      );
      await video.evaluate((v) => v.pause());
      await page.locator(".about-guide-transcript summary").click();
      assert.equal(
        await page.locator(".about-guide-transcript li").count(),
        11,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.locator(".about-guide-transcript summary").click();
      results.push({
        lang,
        viewport: { width, height },
        ...media,
        playback: "passed",
        seek: "passed",
        manualCaptions: "passed",
      });
    }
    await page.reload();
    await page.locator("video").waitFor({ state: "visible" });
    await page.locator("video").evaluate(async (v) => {
      v.muted = true;
      await v.play();
    });
    await page.waitForFunction(
      () => document.querySelector("video").currentTime > 0.1,
    );
    assert.equal(
      await page.locator("video").evaluate((v) => v.textTracks[0].mode),
      "disabled",
    );
    await page.locator("video").evaluate((v) => v.pause());
    await page.locator(".about-feature-list a").first().click();
    await page.goBack();
    await page.locator("video").waitFor({ state: "visible" });
    assert.equal(new URL(page.url()).hash, "#about");
    assert.deepEqual(errors, []);
    await context.close();
  }
  await fs.writeFile(
    "output/playwright/guide-ui-refresh-qa.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
