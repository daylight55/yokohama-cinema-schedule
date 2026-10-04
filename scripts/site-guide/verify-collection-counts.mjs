import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { installFixture, DATE } from './capture-fixture.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true});
const base = process.env.GUIDE_URL || 'http://127.0.0.1:5194';
await mkdir('output/playwright', {recursive:true});
try {
  for (const language of ['ja','en']) for (const width of [320,390]) for (const role of ['admin','member']) {
    const page = await browser.newPage({viewport:{width,height:width===320?700:844}});
    await installFixture(page,language);
    let failed = false, requests = 0;
    await page.route('**/api/account/language', route => route.fulfill({json:{language,userRole:role}}));
    await page.route('**/api/admin/collection', async route => {
      requests++;
      if (failed) return route.fulfill({status:503,json:{error:'unavailable'}});
      const dates = Array.from({length:7},(_,i)=>new Date(Date.parse(`${DATE}T12:00:00Z`)+i*86400000).toISOString().slice(0,10));
      return route.fulfill({json:{status:{dates,cinemas:[
        {days:dates.map((date,i)=>({date,status:i===0?'error':'published',stale:false}))},
        {days:dates.map(date=>({date,status:'not_published',stale:false}))},
        {days:dates.map((date,i)=>({date,status:'published',stale:i===0}))},
      ]}}});
    });
    await page.goto(`${base}/#schedule?date=${DATE}`);
    await page.locator('.schedule-search input').waitFor();
    if (role==='admin') {
      await page.waitForFunction(()=>document.querySelector('.collection-count')?.textContent==='2');
      assert.deepEqual(await page.locator('.collection-count').allTextContents(),['2','0','0','0','0','0','0']);
      await page.locator('.date-strip a').nth(1).click();
      assert.ok(page.url().endsWith('#schedule?date=2026-09-29'));
      await page.reload();
      await page.waitForFunction(()=>document.querySelector('.collection-count')?.textContent==='2');
      await page.screenshot({path:`output/playwright/collection-${language}-${width}.png`,fullPage:true});
      assert.ok((await page.locator('.collection-count-key').getAttribute('href')).endsWith('date=2026-09-29'));
      failed=true;
      await page.clock.runFor(61000);
      await page.waitForFunction(()=>document.querySelector('.collection-count')?.textContent==='—');
    } else {
      assert.equal(await page.locator('.collection-count').count(),0);
      assert.equal(await page.locator('.collection-count-key').count(),0);
      assert.equal(requests,0);
      await page.screenshot({path:`output/playwright/collection-member-${language}-${width}.png`,fullPage:true});
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.goto(`${base}/#movies?date=${DATE}`);
    await page.locator('.schedule-search input').waitFor();
    assert.equal(await page.locator('.collection-count').count(),role==='admin'?7:0);
    await page.close();
  }
} finally { await browser.close(); }
console.log('Collection counts: admin/member, JA/EN, 320/390, direct dates, reload, failures and no overflow passed.');
