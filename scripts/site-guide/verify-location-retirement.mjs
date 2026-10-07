// Run against the real UI with isolated data; this never sends personal locations.
import assert from 'node:assert/strict';
import {installFixture, DATE} from './capture-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.GUIDE_URL || 'http://127.0.0.1:5194';
const browser=await chromium.launch({headless:true});
try {
 for(const lang of ['ja','en']) for(const [width,height] of [[320,700],[390,844],[1280,900]]) for(const theme of ['light','dark']) {
  const context=await browser.newContext({viewport:{width,height}});
  const page=await context.newPage(); const errors=[], requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',request=>requests.push([new URL(request.url()).pathname,request.method()]));
  const options={now:`${DATE}T11:30:00+09:00`,cinemaPreferences:['burg','toho','aeon'].map(cinemaId=>({cinemaId,travelMode:'transit',customDurationMinutes:200,showInSchedule:true})), userProfile:{departureRegistered:true,departureUpdatedAt:'2026-09-01T00:00:00Z',scheduleCollapseMinutes:0}};
  await installFixture(page,lang,options);
  await page.addInitScript(theme=>{
    localStorage.setItem('hamamubi-color-theme',theme);
    window.locationRequests=0;
    navigator.geolocation.getCurrentPosition=()=>{window.locationRequests++;throw Error('Location must not be requested');};
  },theme);
  await page.goto(base+`/#schedule?date=${DATE}`);
  await page.locator('.cinema-slot.unreachable').first().waitFor();
  const slotStyle=async(selector)=>page.locator(selector).first().evaluate(el=>{const s=getComputedStyle(el);return {opacity:s.opacity,filter:s.filter,background:s.backgroundColor,border:s.borderColor};});
  const before=await slotStyle('.cinema-slot.unreachable');
  assert.equal(before.opacity,'1'); assert.equal(before.filter,'none');
  assert.equal(before.background,(await slotStyle('.cinema-slot:not(.unreachable)')).background);
  // No personal travel time removes the auxiliary label, with the same card contrast.
  const navigator=page.locator('.schedule-navigator-button'); await navigator.click();
  assert.equal(await page.locator('.schedule-location-action').count(),0);
  await page.getByRole('button',{name:lang==='ja'?'閉じる':'Close',exact:true}).click();
  await page.evaluate(()=>location.hash='#account');
  const deleteButton=page.getByRole('button',{name:lang==='ja'?'ベース出発地点を削除':'Delete starting point',exact:true});
  await deleteButton.waitFor();
  assert.equal(await page.getByRole('button',{name:/現在地|current location/i}).count(),0);
  page.once('dialog',dialog=>dialog.accept()); await deleteButton.click();
  await page.locator('.profile-location-panel').waitFor({state:'detached'});
  assert.equal(await page.locator('#schedule-collapse-minutes').inputValue(),'0');
  await page.reload(); await page.locator('#schedule-collapse-minutes').waitFor();
  assert.equal(await page.locator('.profile-location-panel').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  // Minutes still save without GPS, and Clearing removes the personalized label.
  await page.route('**/api/cinema-exterior/**',route=>route.fulfill({contentType:'text/html',body:'<p>Map</p>'}));
  await page.evaluate(()=>location.hash='#cinemas'); await page.locator('#custom-duration-burg').waitFor();
  const cinema=page.locator('.cinema-list-item').filter({has:page.locator('#custom-duration-burg')});
  await page.locator('#custom-duration-burg').fill('25');
  await cinema.locator('.cinema-duration-row').getByRole('button',{name:lang==='ja'?'保存':'Save',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('#custom-duration-burg').disabled);
  assert.equal(await page.locator('#custom-duration-burg').inputValue(),'25');
  await cinema.getByRole('button',{name:lang==='ja'?'クリア':'Clear',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('#custom-duration-burg').disabled);
  assert.equal(await page.locator('#custom-duration-burg').inputValue(),'');
  await page.reload(); await page.locator('#custom-duration-burg').waitFor();
  assert.equal(await page.locator('#custom-duration-burg').inputValue(),'');
  await page.evaluate(date=>location.hash=`#schedule?date=${date}`,DATE); await page.locator('.cinema-slot').first().waitFor();
  assert.equal(await page.locator('.cinema-slot[data-showing-id="guide-0-0"] .unreachable-label').count(),0);
  await page.reload(); await page.locator('.cinema-slot').first().waitFor();
  await page.goBack(); await page.goForward();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.evaluate(()=>window.locationRequests),0);
  assert.equal(requests.some(([path,method])=>path==='/api/routes'||path.startsWith('/api/route-guidance/')||(path==='/api/profile'&&method==='POST')),false);
  assert.deepEqual(errors,[]);
  console.log(`${lang} ${width}x${height} ${theme}: card contrast, no GPS, delete, manual minutes, clear, reload/navigation passed`);
  await context.close();
 }
} finally {await browser.close();}
