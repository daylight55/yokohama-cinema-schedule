import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {installFixture, DATE, TITLE, TITLE_EN} from './capture-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true});
const base=process.env.GUIDE_URL || 'http://127.0.0.1:5194';
await mkdir('output/playwright',{recursive:true});
try {
 for(const language of ['ja','en']) for(const width of [320,390,1024]) {
  const page=await browser.newPage({viewport:{width,height:width===320?700:844}});
  await installFixture(page,language);
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  for(const view of ['schedule','movies']) {
   await page.goto(`${base}/#${view}?date=${DATE}`);
   const search=page.locator('#schedule-search-query'); await search.waitFor();
   const panel=page.locator('.search-area-panel');
   assert.equal(await page.locator('.schedule-controls .area-strip').count(),0);
   assert.equal(await panel.count(),0);
   await search.click(); await panel.waitFor();
   assert.equal(await panel.getByRole('button').count(),6);
   await panel.getByRole('button',{name:language==='ja'?'上大岡':'Kamiooka',exact:true}).click();
   assert.equal(await panel.count(),0);
   if(view==='schedule') {
    await page.waitForFunction(()=>document.querySelectorAll('.cinema-slot').length===2);
    assert.ok((await page.locator('.slot-cinema').allTextContents()).every(name=>name.includes(language==='ja'?'上大岡':'Kamiooka')));
   }
   assert.equal(await search.getAttribute('placeholder'),language==='ja'?'上大岡':'Kamiooka');
   await search.click(); await search.press('Escape'); assert.equal(await panel.count(),0);
   await search.click(); await page.locator('.schedule-search-submit').focus();
   await page.keyboard.press('Tab'); await panel.waitFor();
   await page.keyboard.press('Escape');
   await search.fill(language==='ja'?TITLE:TITLE_EN);
   assert.equal(await panel.count(),0);
   if(view==='schedule') await page.waitForFunction(()=>document.querySelectorAll('.cinema-slot').length===3);
   assert.ok((await search.getAttribute('placeholder')).includes(language==='ja'?'スパイダーマン':'Spider'));
   await page.locator('.schedule-search-submit').click();
   assert.ok(new URL(page.url()).hash.includes('q='));
   await page.reload(); await search.waitFor();
   assert.equal(await search.inputValue(),language==='ja'?TITLE:TITLE_EN);
   await page.locator('.schedule-search-clear').click();
   await search.click(); await panel.waitFor();
   await page.locator('.day-button').first().click(); assert.equal(await panel.count(),0);
   await search.click(); await panel.waitFor();
   await page.screenshot({path:`output/playwright/area-search-${language}-${width}-${view}.png`});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  assert.deepEqual(errors,[]); await page.close();
  console.log(`${language} ${width}: area/search interaction passed`);
 }
} finally {await browser.close();}
