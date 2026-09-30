// Real pointer clicks avoid locator.click() scrolling the sticky header's
// original document position into view before the language switch is pressed.
import assert from 'node:assert/strict';
import {installFixture, DATE} from './capture-fixture.mjs';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true});
const base = process.env.GUIDE_URL || 'http://127.0.0.1:5194';
async function toggle(page, language) {
  const box = await page.getByRole('switch').boundingBox();
  assert.ok(box && box.y >= 0);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(lang => document.documentElement.lang === lang, language);
  await page.waitForTimeout(200);
}
try {
  for (const width of [320,390]) {
    const page = await browser.newPage({viewport:{width,height:width===320?700:844}});
    await installFixture(page,'ja');
    const errors=[];
    page.on('pageerror', error=>errors.push(error.message));
    for (const hash of [`#schedule?date=${DATE}`, '#movies', '#about']) {
      await page.goto(`${base}/${hash}`);
      await page.locator('main').waitFor();
      await page.waitForTimeout(600);
      // Stay clear of the bottom: a shorter translation can reduce max scroll.
      await page.evaluate(()=>window.scrollTo({
        top:Math.min(500,Math.floor((document.documentElement.scrollHeight-innerHeight)/2)),
        behavior:'instant',
      }));
      await page.waitForTimeout(100);
      const before = await page.evaluate(()=>({y:scrollY,hash:location.hash}));
      for (const lang of ['en','ja']) {
        await toggle(page,lang);
        assert.equal(await page.evaluate(()=>scrollY),before.y,`${width}px ${hash} ${lang}`);
        assert.equal(new URL(page.url()).hash,before.hash);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      }
    }
    await page.goto(`${base}/#schedule?date=${DATE}`);
    await page.locator('.timeline-hour').first().waitFor();
    await page.waitForTimeout(300);
    await page.evaluate(()=>{
      window.scrollTo({top:500,behavior:'instant'});
      document.querySelector('[data-horizontal-scroll="dates"]').scrollLeft=110;
    });
    const strip = await page.locator('[data-horizontal-scroll="dates"]').evaluate(el=>el.scrollLeft);
    // Hold the save response while the user continues scrolling.
    let release;
    const gate = new Promise(resolve=>{release=resolve;});
    await page.route('**/api/account/language',async route=>{
      if(route.request().method()!=='PATCH')return route.fallback();
      await gate;
      await route.fallback();
    });
    const box=await page.getByRole('switch').boundingBox();
    await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
    await page.waitForFunction(()=>document.querySelector('.language-toggle').disabled);
    await page.evaluate(()=>window.scrollTo({top:600,behavior:'instant'}));
    release();
    await page.waitForFunction(()=>document.documentElement.lang==='en');
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>scrollY),600,'scroll during save');
    assert.equal(await page.locator('[data-horizontal-scroll="dates"]').evaluate(el=>el.scrollLeft),strip);
    await page.route('**/api/account/language',route=>route.fulfill({status:500,json:{error:'failure'}}));
    const failed=await page.getByRole('switch').boundingBox();
    await page.mouse.click(failed.x+failed.width/2,failed.y+failed.height/2);
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    await page.unroute('**/api/account/language');
    await page.reload();
    await page.locator('.timeline-hour').first().waitFor();
    await page.waitForFunction(()=>document.documentElement.lang==='en');
    await page.goto(`${base}/#about`);
    await page.locator('main').waitFor();
    await page.goBack();
    await page.locator('.timeline-hour').first().waitFor();
    await page.goForward();
    await page.locator('main').waitFor();
    assert.equal(new URL(page.url()).hash,'#about');
    assert.deepEqual(errors,[]);
    await page.screenshot({path:`output/playwright/language-scroll-${width}.png`});
    console.log(`${width}px: JP/EN scroll, horizontal strips, delayed save, failure, reload, history, overflow passed`);
    await page.close();
  }
} finally {await browser.close();}
