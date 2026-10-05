import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {installFixture, DATE} from './capture-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true});
const base=process.env.GUIDE_URL || 'http://127.0.0.1:5194';
await mkdir('output/playwright',{recursive:true});
try {
 for(const language of ['ja','en']) for(const width of [320,390]) {
  const page=await browser.newPage({viewport:{width,height:width===320?700:844}});
  await installFixture(page,language,{nativeNavigationTiming:true,extraMovieCount:8});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const hash of ['#schedule', `#schedule?date=${DATE}`, '#movies', '#about']) {
   await page.goto(`${base}/${hash}`);
   await page.waitForTimeout(600);
   await page.evaluate(()=>{
    window.scrollTo({top:Math.min(600,(document.documentElement.scrollHeight-innerHeight)/2),behavior:'instant'});
    document.querySelectorAll('[data-horizontal-scroll]').forEach(el=>el.scrollLeft=110);
   });
   await page.waitForTimeout(120);
   const before=await page.evaluate(()=>({y:scrollY,hash:location.hash,horizontal:[...document.querySelectorAll('[data-horizontal-scroll]')].map(el=>[el.dataset.horizontalScroll,el.scrollLeft])}));
   assert.ok(before.y>100,`${hash} has a meaningful position to restore`);
   // Data arriving after the initial render must not override the saved position.
   await page.route('**/api/showings?**',async route=>{await new Promise(resolve=>setTimeout(resolve,700));await route.fallback();});
   await page.reload();
   await page.waitForFunction(y=>Math.abs(scrollY-y)<=1,before.y);
   await page.waitForTimeout(400);
   assert.ok(Math.abs(await page.evaluate(()=>scrollY)-before.y)<=1,`${language} ${width} ${hash}`);
   assert.equal(new URL(page.url()).hash,before.hash);
   for(const [key,left] of before.horizontal) {
    const actual=await page.locator(`[data-horizontal-scroll="${key}"]`).evaluate(el=>el.scrollLeft);
    assert.ok(Math.abs(actual-left)<=1,`${key}: ${actual} != ${left}`);
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.unroute('**/api/showings?**');
   await page.screenshot({path:`output/playwright/reload-scroll-${language}-${width}-${hash.startsWith('#schedule')?'schedule':hash.slice(1)}.png`});
  }
  // A fresh direct URL keeps the existing initial-position behavior.
  await page.goto(`${base}/#movies?date=${DATE}`);
  await page.locator('.movie-list-item').first().waitFor();
  assert.equal(await page.evaluate(()=>scrollY),0);
  assert.deepEqual(errors,[]);
  await page.close();console.log(`${language} ${width}: reload position and horizontal strips passed`);
 }
} finally {await browser.close();}
