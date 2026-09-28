// Browser regression checks against the real app with deterministic, isolated API data.
import assert from 'node:assert/strict';
import {installFixture, DATE} from './capture-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.GUIDE_URL || 'http://127.0.0.1:5194';
const browser=await chromium.launch({headless:true});
try {
 for(const lang of ['ja','en']) for(const [width,height] of [[320,700],[390,844]]) {
  const context=await browser.newContext({viewport:{width,height}});
  const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const options={saveDelay:300}; await installFixture(page,lang,options);
  const settings=page.locator('.account-cinema-settings');
  const toggle=settings.getByRole('switch').nth(1);
  const loaded=async()=>{await page.waitForTimeout(400); await settings.getByRole('switch').nth(2).waitFor();};
  const overflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.goto(base+`/#schedule?date=${DATE}`);
  await page.locator('.cinema-strip').first().waitFor();
  assert.match(await page.locator('.cinema-strip').first().innerText(),/TOHO/);
  // An area filter must not restrict which cinemas can be configured in My page.
  await page.locator('.area-strip button').nth(1).click();
  await page.evaluate(()=>location.hash='#account'); await loaded();
  assert.equal(await settings.getByRole('switch').count(),3);
  assert.equal(await toggle.isChecked(),true);
  await overflow();
  await toggle.focus(); await page.keyboard.press('Space');
  assert.equal(await toggle.isDisabled(),true);
  await page.waitForFunction(()=>!document.querySelectorAll('.account-cinema-settings input')[1].disabled);
  assert.equal(await toggle.isChecked(),false);
  await page.reload(); await loaded(); assert.equal(await toggle.isChecked(),false);
  await settings.getByRole('link').click(); await page.locator('.cinema-strip').first().waitFor();
  assert.doesNotMatch(await page.locator('.cinema-strip').first().innerText(),/TOHO/);
  await page.goBack(); await loaded(); assert.equal(await toggle.isChecked(),false);
  options.failSave=true;
  await toggle.check(); await settings.getByRole('alert').waitFor();
  assert.equal(await toggle.isChecked(),false);
  options.failSave=false;
  await toggle.check();
  await page.waitForFunction(()=>!document.querySelectorAll('.account-cinema-settings input')[1].disabled);
  assert.equal(await settings.getByRole('alert').count(),0);
  await settings.getByRole('link').click(); await page.locator('.cinema-strip').first().waitFor();
  assert.match(await page.locator('.cinema-strip').first().innerText(),/TOHO/);
  await page.goBack(); await loaded();
  options.preferencesEnabled=false; await page.reload(); await loaded();
  assert.equal(await toggle.isDisabled(),true); await overflow();
  if(lang==='en')assert.match(await settings.innerText(),/Cinemas in your showtimes/);
  assert.deepEqual(errors,[]);
  console.log(`${lang} ${width}x${height}: save, reload, filter, rollback, keyboard, disabled, overflow passed`);
  await context.close();
 }
} finally {await browser.close();}
