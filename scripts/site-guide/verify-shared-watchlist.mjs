// Check peer interests independently of screening availability in the real UI.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {installFixture} from './capture-fixture.mjs';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true});
await fs.mkdir('output/playwright',{recursive:true});
try {
  for (const width of [320,390]) for (const lang of ['ja','en']) {
    const page = await browser.newPage({viewport:{width,height:width===320?700:844}});
    const tr=(ja,en)=>lang==='ja'?ja:en;
    const extraSharedMovies=[
      {userId:'friend',movieKey:'legacy-et',title:'E.T.',imageUrl:null,comment:'Want to see it',status:null},
      {userId:'friend',movieKey:'seen',title:'Seen film',imageUrl:null,status:'watched'},
    ];
    await installFixture(page,lang,{extraSharedMovies});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.route('**/api/preferences',async route=>{
      const body=route.request().postDataJSON();
      if(body?.title==='E.T.' && body.starred===true)
        extraSharedMovies.push({...extraSharedMovies[0],userId:'guide',comment:''});
      await route.fallback();
    });
    await page.goto(`${process.env.GUIDE_URL || 'http://127.0.0.1:5194'}/#shared`);
    await page.locator('.shared-tabs').waitFor();
    await page.locator('.shared-tabs button').nth(1).click();
    const unavailable=page.locator('.shared-unscheduled-section');
    await unavailable.waitFor();
    assert.equal(await unavailable.locator('.shared-film-title').textContent(),'E.T.');
    assert.ok((await unavailable.locator('.shared-interest-notes').textContent()).includes('Want to see it'));
    assert.equal(await unavailable.locator('.shared-showtime-link').count(),0);
    assert.equal(await page.locator('.shared-watched-section .shared-film-title').textContent(),'Seen film');
    assert.equal(await page.locator('.shared-page > .shared-movies .shared-showtime-link').count(),1);
    await page.locator('.shared-member-filter select').selectOption('guide');
    assert.equal(await unavailable.count(),0);
    await page.locator('.shared-member-filter select').selectOption('friend');
    await unavailable.waitFor();
    assert.equal(await unavailable.locator('.shared-interest-person').count(),1);
    await page.locator('.shared-member-filter select').selectOption('');
    await unavailable.getByRole('button',{name:tr('私も気になる','Add to my watchlist'),exact:true}).click();
    await unavailable.locator('.shared-note-editor').waitFor();
    assert.equal(await unavailable.locator('.shared-interest-person').count(),2);
    assert.equal(await unavailable.locator('.shared-showtime-link').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await unavailable.scrollIntoViewIfNeeded();
    await page.screenshot({path:`output/playwright/shared-watchlist-${lang}-${width}.png`});
    await unavailable.locator('.shared-film-title').click();
    await page.locator('.movie-page').getByText(tr('この作品の上映情報が見つかりません。','No showtimes were found for this film.'),{exact:true}).waitFor();
    assert.equal(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('movie'),'e.t.');
    await page.goBack(); await page.locator('.shared-tabs').waitFor();
    await page.locator('.shared-tabs button').nth(1).click();
    await unavailable.waitFor();
    await page.reload(); await page.locator('.shared-tabs').waitFor();
    await page.locator('.shared-tabs button').nth(1).click();
    await unavailable.waitFor();
    assert.equal(await unavailable.locator('.shared-interest-person').count(),2);
    assert.deepEqual(errors,[]);
    console.log(`${width}px ${lang}: peer interest without showtimes, filters, join, detail, history, reload, overflow passed`);
    await page.close();
  }
} finally {await browser.close();}
