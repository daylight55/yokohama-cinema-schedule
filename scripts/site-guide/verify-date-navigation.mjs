// Exercise real Chromium touch gestures against the app with deterministic APIs.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {installFixture, DATE} from './capture-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true});
const base=process.env.GUIDE_URL || 'http://127.0.0.1:5194';
await mkdir('output/playwright',{recursive:true});
try {
  for(const language of ['ja','en']) for(const width of [320,390]) {
    const page=await browser.newPage({viewport:{width,height:width===320?700:844},hasTouch:true});
    await installFixture(page,language);
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const cdp=await page.context().newCDPSession(page);
    const tr=(ja,en)=>language==='ja'?ja:en;
    const hash=()=>new URL(page.url()).hash;
    const settle=async()=>{
      await page.waitForFunction(()=>!document.querySelector('main [aria-busy="true"]'));
      await page.waitForTimeout(150);
    };
    async function gesture(locator,dx,dy=0) {
      await locator.scrollIntoViewIfNeeded();
      const box=await locator.boundingBox();
      assert.ok(box);
      const x=dx<0?width-50:50;
      const y=Math.max(80,Math.min(box.y+box.height/2,(width===320?700:844)-130));
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      for(const fraction of [.15,.35,.65,1]) {
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*fraction,y:y+dy*fraction}]});
        await page.waitForTimeout(30);
      }
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await settle();
    }
    async function switchTo(label) {
      await page.getByRole('button',{name:tr('スケジュールを切替','Switch schedules'),exact:true}).click();
      await page.locator('.schedule-destinations').getByRole('link',{name:label,exact:true}).click();
      await settle();
    }
    async function activeDay(date) {
      const active=page.locator('.date-strip [aria-current="date"]');
      assert.equal(await active.count(),1);
      assert.ok((await active.getAttribute('href')).includes(`date=${date}`));
      const bounds=await active.boundingBox();
      assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width+1,'selected day is visible');
    }
    await page.goto(`${base}/#movies`);await settle();
    assert.equal(await page.locator('.date-strip [aria-current="page"]').count(),1,'all dates remains supported');
    await switchTo(tr('時間順','By time'));
    assert.equal(hash(),`#schedule?date=${DATE}`);
    await activeDay(DATE);
    assert.equal(await page.locator('.collection-status-link').count(),0);
    await gesture(page.locator('.page-header h1'),-170);
    assert.equal(hash(),'#schedule?date=2026-09-29');
    await switchTo(tr('作品別','By film'));
    await activeDay('2026-09-29');
    await gesture(page.locator('.page-header h1'),-170);
    assert.equal(hash(),'#movies?date=2026-09-30');
    await switchTo(tr('共有の気になる','Shared watchlist'));
    await switchTo(tr('時間順','By time'));
    assert.equal(hash(),'#schedule?date=2026-09-30','shared view keeps selected day');
    await activeDay('2026-09-30');
    // Open the last day through the floating date picker. It must remain visible
    // and allow swiping to the previous day, even on an empty schedule.
    await page.getByRole('button',{name:tr('スケジュールを切替','Switch schedules'),exact:true}).click();
    await page.locator('.schedule-jump-dates a').last().click();await settle();
    await activeDay('2026-10-04');
    await gesture(page.locator('.page-header h1'),170);
    assert.equal(hash(),'#schedule?date=2026-10-03');
    await page.reload();await settle();await activeDay('2026-10-03');
    await page.goto(`${base}/#collection-status?date=${DATE}`);await settle();
    await gesture(page.locator('.collection-overview'),-170);
    assert.equal(hash(),'#collection-status?date=2026-09-29');
    assert.equal(await page.locator('.collection-dates [aria-current="date"]').count(),1);
    await gesture(page.locator('.collection-overview'),170);
    assert.equal(hash(),`#collection-status?date=${DATE}`);
    await gesture(page.locator('.collection-overview'),170);
    assert.equal(hash(),`#collection-status?date=${DATE}`,'first date is bounded');
    const before=hash();
    await gesture(page.locator('.collection-dates'),-170);
    assert.equal(hash(),before,'date strip scroll does not change date');
    await gesture(page.locator('.collection-overview'),-5,-130);
    assert.equal(hash(),before,'vertical scrolling does not change date');
    await page.locator('.collection-dates a').last().click();await settle();
    await gesture(page.locator('.collection-overview'),-170);
    assert.equal(hash(),'#collection-status?date=2026-10-04','last date is bounded');
    await page.reload();await settle();
    assert.equal(await page.locator('.collection-dates [aria-current="date"]').count(),1);
    await page.goBack();await settle();
    assert.equal(hash(),before);
    await page.goForward();await settle();
    assert.equal(hash(),'#collection-status?date=2026-10-04');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:`output/playwright/date-navigation-${language}-${width}.png`});
    console.log(`${language} ${width}px: switch, selected date, native date swipe, bounds, strips, vertical scroll, reload/history, overflow passed`);
    await page.close();
  }
} finally {await browser.close();}
