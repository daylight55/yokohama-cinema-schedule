// Exercise real preference controls with isolated API data.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {installFixture, DATE} from './capture-fixture.mjs';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true});
await mkdir('output/playwright',{recursive:true});
try {
  for (const language of ['ja','en']) for (const width of [320,390]) {
    const page = await browser.newPage({viewport:{width,height:width===320?700:844}});
    const posterUrl='https://fixture.invalid/poster.svg';
    await installFixture(page,language,{posterUrl});
    await page.route(posterUrl,route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="270"><rect width="180" height="270" fill="#39765c"/></svg>'}));
    const tr=(ja,en)=>language==='ja'?ja:en;
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    let confirm=true;
    page.on('dialog', dialog => confirm ? dialog.accept() : dialog.dismiss());
    const base=process.env.GUIDE_URL || 'http://127.0.0.1:5194';
    async function order(actions) {
      const buttons=actions.locator(':scope > button');
      await buttons.first().waitFor();
      assert.equal(await buttons.count(),4);
      assert.deepEqual(await buttons.evaluateAll(nodes=>nodes.map(n=>n.className.split(' ').filter(c=>c!=='active'&&c!=='starred').join(' '))),[
        'movie-options-button','movie-status-button movie-not-interested-button','movie-status-button movie-watched-button','favorite-button',
      ]);
      const boxes=await buttons.evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,overflow:n.scrollWidth>n.clientWidth}}));
      for(let i=0;i<4;i++) {
        assert.ok(boxes[i].w>=44&&boxes[i].h>=44,'tap size');
        assert.ok(!boxes[i].overflow,'button content fits');
        assert.equal(boxes[i].y,boxes[0].y,'single row');
        if(i)assert.ok(boxes[i-1].x+boxes[i-1].w<=boxes[i].x,'left to right order');
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    const settle=()=>page.waitForTimeout(200);
    await page.goto(`${base}/#movies?date=${DATE}`);
    const card = page.locator('.movie-list-item').first();
    await card.waitFor();
    const cardActions=card.locator('.movie-actions');
    await order(cardActions);
    await cardActions.locator('.movie-options-button').click();
    await page.locator('.movie-preference-actions').waitFor();
    await page.getByRole('button',{name:tr('作品の設定を閉じる','Close film preferences'),exact:true}).click();
    confirm=false;
    await cardActions.locator('.movie-not-interested-button').click();
    assert.equal(await cardActions.locator('.movie-not-interested-button').getAttribute('aria-pressed'),'false','cancel leaves status unchanged');
    confirm=true;
    await cardActions.locator('.movie-not-interested-button').click();await settle();
    assert.equal(await cardActions.locator('.movie-not-interested-button').getAttribute('aria-pressed'),'true');
    await cardActions.locator('.movie-watched-button').click();await settle();
    assert.equal(await cardActions.locator('.movie-not-interested-button').getAttribute('aria-pressed'),'false');
    assert.equal(await cardActions.locator('.movie-watched-button').getAttribute('aria-pressed'),'true');
    const href = await card.locator('.movie-image-link').getAttribute('href');
    await card.locator('.movie-image-link').click();
    const actions = page.locator('.movie-detail-actions');
    await actions.waitFor();await order(actions);
    assert.ok(await page.locator('.movie-poster').isVisible(),'poster fixture is visible');
    const detailLayout=await page.evaluate(()=>{
      const actions=document.querySelector('.movie-detail-actions').getBoundingClientRect();
      const overview=document.querySelector('.movie-overview').getBoundingClientRect();
      const poster=document.querySelector('.movie-poster').getBoundingClientRect();
      return {actionWidth:actions.width,overviewWidth:overview.width,actionsTop:actions.top,posterBottom:poster.bottom,
        labelHeights:[...document.querySelectorAll('.movie-detail-actions .movie-status-button span')].map(n=>n.getBoundingClientRect().height)};
    });
    assert.equal(detailLayout.actionWidth,Math.min(320,detailLayout.overviewWidth),'actions use the overview width');
    assert.ok(detailLayout.actionsTop>=detailLayout.posterBottom,'actions sit below the poster');
    assert.ok(detailLayout.labelHeights.every(h=>h<=(language==='ja'?18:30)),'status labels avoid broken words beside a poster');
    await page.screenshot({path:`output/playwright/movie-detail-poster-${language}-${width}.png`});
    assert.equal(await actions.locator('.movie-watched-button').getAttribute('aria-pressed'),'true');
    await actions.locator('.movie-watched-button').click();await settle();
    assert.equal(await actions.locator('.movie-watched-button').getAttribute('aria-pressed'),'false');
    await actions.locator('.favorite-button').click();
    await page.getByRole('button',{name:tr('ひとこと入力を閉じる','Close note'),exact:true}).click();
    assert.equal(await actions.locator('.favorite-button').getAttribute('aria-pressed'),'true');
    await actions.locator('.movie-not-interested-button').click();await settle();
    await page.reload(); await actions.waitFor();
    assert.equal(await actions.locator('.movie-not-interested-button').getAttribute('aria-pressed'),'true');
    assert.equal(await actions.locator('.favorite-button').getAttribute('aria-pressed'),'true','status keeps star');
    await page.route('**/api/preferences',route=>route.fulfill({status:500,json:{error:'failure'}}));
    await actions.locator('.movie-watched-button').click();
    await page.getByRole('alert').waitFor();
    assert.equal(await actions.locator('.movie-watched-button').getAttribute('aria-pressed'),'false');
    assert.equal(await actions.locator('.movie-not-interested-button').getAttribute('aria-pressed'),'true','failure restores previous status');
    await page.unroute('**/api/preferences');
    await actions.locator('.movie-not-interested-button').click();await settle();
    await page.goBack(); await card.waitFor();
    await order(cardActions);
    await cardActions.scrollIntoViewIfNeeded();
    await page.screenshot({path:`output/playwright/movie-actions-${language}-${width}.png`});
    await page.goForward(); await actions.waitFor();
    assert.equal(new URL(page.url()).hash,href);
    await page.goto(`${base}/#schedule?date=${DATE}`);
    const program=page.locator('.program-block').first();
    await program.waitFor();await order(program.locator('.movie-actions'));
    await program.locator('.movie-not-interested-button').click();await settle();
    assert.equal(await page.locator('.program-block').filter({has:page.getByRole('link',{name:tr('君の名は。','Your Name.'),exact:true})}).count(),0,'hidden from time schedule');
    assert.deepEqual(errors,[]);
    console.log(`${language} ${width}px: four-button order, tap targets, cancel, save, detail, reload, preserved star, rollback, history, schedule filtering and overflow passed`);
    await page.close();
  }
} finally {await browser.close();}
