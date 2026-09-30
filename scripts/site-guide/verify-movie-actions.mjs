// Exercise compact controls and the title-adjacent schedule star with isolated API data.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {installFixture, DATE} from './capture-fixture.mjs';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true});
await mkdir('output/playwright',{recursive:true});
try {
  for (const language of ['ja','en']) for (const width of [320,390,1280]) {
    const page = await browser.newPage({viewport:{width,height:width===320?700:844}});
    const posterUrl='https://fixture.invalid/poster.svg';
    await installFixture(page,language,{posterUrl});
    await page.route(posterUrl,route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="270"><rect width="180" height="270" fill="#39765c"/></svg>'}));
    const tr=(ja,en)=>language==='ja'?ja:en;
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    let confirm=true;
    page.on('dialog', dialog => confirm ? dialog.accept() : dialog.dismiss());
    const base=process.env.GUIDE_URL || 'http://127.0.0.1:5194';
    const settle=()=>page.waitForTimeout(200);
    async function noOverflow() {
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    async function order(actions) {
      const buttons=actions.locator(':scope > button');
      await buttons.first().waitFor();
      assert.equal(await buttons.count(),3);
      assert.deepEqual(await buttons.evaluateAll(nodes=>nodes.map(n=>n.className.split(' ').filter(c=>c!=='active'&&c!=='starred').join(' '))),[
        'movie-options-button','movie-status-button movie-watched-button','favorite-button',
      ]);
      const boxes=await buttons.evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,overflow:n.scrollWidth>n.clientWidth,name:n.getAttribute('aria-label'),tooltip:n.title,text:n.textContent}}));
      for(let i=0;i<3;i++) {
        assert.equal(boxes[i].w,44,'compact but touch-friendly width');
        assert.equal(boxes[i].h,44,'compact but touch-friendly height');
        assert.ok(!boxes[i].overflow,'button content fits');
        assert.ok(boxes[i].name&&boxes[i].tooltip,'icon has accessible name and tooltip');
        assert.equal(boxes[i].text,'','no repeated visible labels');
        assert.equal(boxes[i].y,boxes[0].y,'single row');
        if(i)assert.ok(boxes[i-1].x+boxes[i-1].w<=boxes[i].x,'left to right order');
      }
      await noOverflow();
    }
    await page.goto(`${base}/#movies?date=${DATE}`);
    const card = page.locator('.movie-list-item').first();
    await card.waitFor();
    const movieKey=await card.getAttribute('data-movie-key');
    const cardActions=card.locator('.movie-actions');
    await order(cardActions);
    assert.equal(await card.locator('.movie-list-copy .movie-actions').count(),1,'actions share the title column beside the poster');
    assert.equal(await card.locator('.movie-external-links').count(),0,'secondary info links are deferred');
    await cardActions.locator('.movie-options-button').click();
    await page.locator('.movie-preference-actions').waitFor();
    assert.equal(await page.locator('.movie-preference-sheet .movie-external-links a').count(),2,'secondary links remain in settings');
    const hide=page.getByRole('button',{name:tr('上映スケジュールから非表示','Hide from showtimes'),exact:true});
    assert.equal(await hide.textContent(),tr('非表示','Hide'));
    assert.equal(await page.getByText(tr('興味なし','Not interested'),{exact:true}).count(),0);
    await page.screenshot({path:`output/playwright/movie-settings-${language}-${width}.png`});
    confirm=false;
    await hide.click();await settle();
    assert.equal(await hide.getAttribute('aria-pressed'),'false','cancel leaves visibility unchanged');
    confirm=true;
    await hide.click();await settle();
    await page.goto(`${base}/#schedule?date=${DATE}`);await page.locator('.program-block').first().waitFor();
    assert.equal(await page.locator(`.program-block[data-movie-key="${movieKey}"]`).count(),0,'hidden film is excluded from schedule');
    await page.goto(`${base}/#movies?date=${DATE}`);await card.waitFor();
    assert.equal(await card.locator('.not-interested').count(),0,'hide stays in settings');
    await cardActions.locator('.movie-options-button').click();
    assert.equal(await hide.getAttribute('aria-pressed'),'true','saved hidden status survives navigation');
    await hide.click();await settle();
    assert.equal(await hide.getAttribute('aria-pressed'),'false','settings restores visibility');
    await page.getByRole('button',{name:tr('作品の設定を閉じる','Close film preferences'),exact:true}).click();
    confirm=false;
    await cardActions.locator('.movie-watched-button').click();
    assert.equal(await cardActions.locator('.movie-watched-button').getAttribute('aria-pressed'),'false','cancel leaves status unchanged');
    confirm=true;
    await cardActions.locator('.movie-watched-button').click();await settle();
    assert.equal(await cardActions.locator('.movie-watched-button').getAttribute('aria-pressed'),'true');
    const href = await card.locator('.movie-image-link').getAttribute('href');
    await card.locator('.movie-image-link').click();
    const actions = page.locator('.movie-detail-actions');
    await actions.waitFor();await order(actions);
    assert.ok(await page.locator('.movie-poster').isVisible(),'poster fixture is visible');
    await page.screenshot({path:`output/playwright/movie-detail-simple-${language}-${width}.png`});
    assert.equal(await actions.locator('.movie-watched-button').getAttribute('aria-pressed'),'true');
    await actions.locator('.movie-watched-button').click();await settle();
    assert.equal(await actions.locator('.movie-watched-button').getAttribute('aria-pressed'),'false');
    await actions.locator('.favorite-button').click();
    await page.getByRole('button',{name:tr('ひとこと入力を閉じる','Close note'),exact:true}).click();
    assert.equal(await actions.locator('.favorite-button').getAttribute('aria-pressed'),'true');
    await actions.locator('.movie-watched-button').click();await settle();
    await page.reload(); await actions.waitFor();
    assert.equal(await actions.locator('.movie-watched-button').getAttribute('aria-pressed'),'true');
    assert.equal(await actions.locator('.favorite-button').getAttribute('aria-pressed'),'true','status keeps star');
    await page.route('**/api/preferences',route=>route.fulfill({status:500,json:{error:'failure'}}));
    await actions.locator('.movie-watched-button').click();
    await page.getByRole('alert').waitFor();
    assert.equal(await actions.locator('.movie-watched-button').getAttribute('aria-pressed'),'true','failure restores previous status');
    await page.unroute('**/api/preferences');
    await actions.locator('.movie-watched-button').click();await settle();
    await page.goBack(); await card.waitFor();
    await order(cardActions);
    await cardActions.scrollIntoViewIfNeeded();
    await page.screenshot({path:`output/playwright/movie-actions-simple-${language}-${width}.png`});
    await page.goForward(); await actions.waitFor();
    assert.equal(new URL(page.url()).hash,href);
    await page.goto(`${base}/#schedule?date=${DATE}`);
    const selectedProgram=page.locator(`.program-block[data-movie-key="${movieKey}"]`).first();
    await selectedProgram.waitFor();
    assert.equal(await selectedProgram.locator('.movie-actions').count(),0,'schedule has no extra action row');
    const titleRow=selectedProgram.locator('.program-title');
    const star=titleRow.locator('.favorite-button');
    await star.waitFor();
    assert.equal(await titleRow.locator('button').count(),1,'only star beside the title');
    assert.equal(await selectedProgram.locator('.movie-watched-button,.movie-options-button,.movie-not-interested-button').count(),0);
    const geometry=await titleRow.evaluate(el=>{
      const title=el.querySelector('h2').getBoundingClientRect();const star=el.querySelector('.favorite-button').getBoundingClientRect();
      return {titleRight:title.right,starLeft:star.left,starWidth:star.width,starHeight:star.height,titleMiddle:title.y+title.height/2,starMiddle:star.y+star.height/2};
    });
    assert.ok(geometry.starLeft>=geometry.titleRight,'star is on the title right');
    assert.equal(geometry.starWidth,44);assert.equal(geometry.starHeight,44);
    assert.ok(Math.abs(geometry.titleMiddle-geometry.starMiddle)<1,'title and star are aligned');
    assert.equal(await star.getAttribute('aria-pressed'),'true','schedule shares the saved star');
    await star.click();await settle();assert.equal(await star.getAttribute('aria-pressed'),'false');
    await star.click();
    await page.getByRole('button',{name:tr('ひとこと入力を閉じる','Close note'),exact:true}).click();
    assert.equal(await star.getAttribute('aria-pressed'),'true');
    await titleRow.scrollIntoViewIfNeeded();
    await noOverflow();
    await page.screenshot({path:`output/playwright/schedule-simple-${language}-${width}.png`});
    if(width===320) {
      await page.getByRole('button',{name:tr('ダークモードに切り替える','Switch to dark mode'),exact:true}).click();
      await noOverflow();
      await page.screenshot({path:`output/playwright/schedule-simple-dark-${language}-${width}.png`});
    }
    await titleRow.getByRole('link').click();await actions.waitFor();
    await actions.locator('.movie-watched-button').press('Enter');await settle();
    await page.goto(`${base}/#schedule?date=${DATE}`);await page.locator('.program-block').first().waitFor();
    assert.equal(await page.locator(`.program-block[data-movie-key="${movieKey}"]`).count(),0,'watched films remain hidden from time schedule');
    assert.deepEqual(errors,[]);
    console.log(`${language} ${width}px: three named icon buttons, title-adjacent schedule star, deferred links, cancel, save, keyboard, detail, reload, preserved star, rollback, history, filtering and overflow passed`);
    await page.close();
  }
} finally {await browser.close();}
