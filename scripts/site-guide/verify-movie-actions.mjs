// Exercise real preference controls with isolated API data.
import assert from 'node:assert/strict';
import {installFixture, DATE} from './capture-fixture.mjs';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true});
try {
  for (const width of [320,390]) {
    const page = await browser.newPage({viewport:{width,height:width===320?700:844}});
    await installFixture(page,'ja');
    page.on('dialog', dialog => dialog.accept());
    await page.goto(`${process.env.GUIDE_URL || 'http://127.0.0.1:5194'}/#movies?date=${DATE}`);
    const card = page.locator('.movie-list-item').first();
    await card.waitFor();
    const options = await card.locator('.movie-options-button').boundingBox();
    const star = await card.locator('.favorite-button').boundingBox();
    assert.ok(options.x + options.width <= star.x);
    await card.locator('.movie-watched-button').click();
    await page.waitForFunction(()=>document.querySelector('.movie-watched-button')?.getAttribute('aria-pressed')==='true');
    const href = await card.locator('.movie-image-link').getAttribute('href');
    await card.locator('.movie-image-link').click();
    const actions = page.locator('.movie-detail-actions');
    await actions.waitFor();
    assert.equal(await actions.getByRole('button',{name:'鑑賞済み',exact:true}).getAttribute('aria-pressed'),'true');
    await actions.getByRole('button',{name:'鑑賞済み',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.movie-detail-actions button:nth-child(2)')?.getAttribute('aria-pressed')==='false');
    await actions.getByRole('button',{name:'気になる',exact:true}).click();
    await page.getByRole('button',{name:'ひとこと入力を閉じる',exact:true}).click();
    assert.equal(await actions.getByRole('button',{name:'気になる',exact:true}).getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.reload(); await actions.waitFor();
    assert.equal(await actions.getByRole('button',{name:'気になる',exact:true}).getAttribute('aria-pressed'),'true');
    await page.route('**/api/preferences',route=>route.fulfill({status:500,json:{error:'failure'}}));
    await actions.getByRole('button',{name:'鑑賞済み',exact:true}).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await actions.getByRole('button',{name:'鑑賞済み',exact:true}).getAttribute('aria-pressed'),'false');
    await page.goBack(); await card.waitFor();
    await page.goForward(); await actions.waitFor();
    assert.equal(new URL(page.url()).hash,href);
    console.log(`${width}px: card order, detail save, reload, rollback, history and overflow passed`);
    await page.close();
  }
} finally {await browser.close();}
