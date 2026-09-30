// Explicit language versions stay distinguishable through the booking/planning flow.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {installFixture, DATE, TITLE, TITLE_EN} from './capture-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true});
const base=process.env.GUIDE_URL || 'http://127.0.0.1:5194';
await mkdir('output/playwright',{recursive:true});
try {
  for(const language of ['ja','en']) for(const width of [320,390]) {
    const page=await browser.newPage({viewport:{width,height:width===320?700:844}});
    await installFixture(page,language,{formats:['字幕 / IMAX','吹替版 / 2D',null]});
    const tr=(ja,en)=>language==='ja'?ja:en;
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    async function readableLabels() {
      const styles=await page.locator('.movie-day').first().locator('.screening-language').evaluateAll(nodes=>nodes.map(n=>({fg:getComputedStyle(n).color,bg:getComputedStyle(n).backgroundColor})));
      const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(v=>+v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
      assert.notEqual(styles[0].bg,styles[1].bg,'versions also differ visually');
      for(const style of styles) {
        const a=luminance(style.fg),b=luminance(style.bg);
        assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,'language labels meet text contrast');
      }
    }

    const badge=async(container,label)=>assert.equal(await container.locator('.screening-language').textContent(),label);
    await page.goto(`${base}/#movies`);
    const available=page.locator('.movie-list-item').filter({has:page.getByRole('link',{name:tr(TITLE,TITLE_EN),exact:true})}).first();
    await available.waitFor();
    assert.deepEqual(await available.locator('.movie-list-copy .screening-language').allTextContents(),[tr('字幕','Subtitled'),tr('吹替','Dubbed')]);
    await noOverflow();
    await page.goto(`${base}/#movies?date=${DATE}`);
    const film=page.locator('.movie-list-item').filter({has:page.getByRole('link',{name:tr(TITLE,TITLE_EN),exact:true})}).first(); await film.waitFor();
    const times=film.locator('.movie-times a');await times.first().waitFor();
    const subTime=times.filter({has:page.locator('.subtitled')});
    const dubTime=times.filter({has:page.locator('.dubbed')});
    const unknownTime=times.filter({hasNot:page.locator('.screening-language')});
    assert.equal(await times.count(),3);
    await badge(subTime,tr('字幕','Subtitled'));
    await badge(dubTime,tr('吹替','Dubbed'));
    assert.equal(await unknownTime.locator('.screening-language').count(),0,'unknown stays unlabeled');
    assert.ok((await subTime.getAttribute('aria-label')).includes(tr('字幕','Subtitled')));
    assert.ok((await dubTime.getAttribute('aria-label')).includes(tr('吹替','Dubbed')));
    const href=await dubTime.getAttribute('href');
    await dubTime.click(); await page.locator('.cinema-slot[data-showing-id="guide-0-1"]').waitFor();
    assert.equal(new URL(page.url()).hash,href,'time links retain the exact version');
    const subSlot=page.locator('.cinema-slot[data-showing-id="guide-0-0"]');
    const dubSlot=page.locator('.cinema-slot[data-showing-id="guide-0-1"]');
    const unknownSlot=page.locator('.cinema-slot[data-showing-id="guide-0-2"]');
    await badge(subSlot,tr('字幕','Subtitled')); await badge(dubSlot,tr('吹替','Dubbed'));
    assert.equal(await unknownSlot.locator('.screening-language').count(),0);
    const reserve=dubSlot.locator('.screening-reserve');
    assert.ok((await reserve.getAttribute('aria-label')).includes(tr('吹替','Dubbed')));
    const target=await reserve.getAttribute('href');assert.ok(target.startsWith('https://'));
    await dubSlot.scrollIntoViewIfNeeded(); await noOverflow();
    await page.screenshot({path:`output/playwright/screening-formats-schedule-${language}-${width}.png`});
    const popupPromise=page.waitForEvent('popup');await reserve.click();const popup=await popupPromise;await popup.close();
    await dubSlot.locator('.viewing-plan-toggle').click();
    await page.goto(`${base}/#viewing-plans?date=${DATE}`);
    const planned=page.locator('.viewing-plan-timeline article').first();await planned.waitFor();
    await badge(planned,tr('吹替','Dubbed'));
    assert.equal(await planned.locator('a[target="_blank"]').getAttribute('href'),target,'saved plan keeps its booking destination');
    await page.reload();await planned.waitFor();await badge(planned,tr('吹替','Dubbed'));await noOverflow();
    await page.goto(`${base}/#shared`);await page.locator('.shared-day').waitFor();
    await badge(page.locator('.shared-day').first(),tr('吹替','Dubbed'));
    await page.getByRole('button',{name:tr('映画に招待','Invite to a screening'),exact:true}).click();
    const choices=page.locator('.screening-invitations select option');
    assert.ok((await choices.allTextContents()).join(' ').includes(tr('吹替','Dubbed')));
    await page.locator('.screening-invitations select').selectOption('guide-0-1');
    await page.locator('.screening-invitations input[type="checkbox"]').check();
    await page.getByRole('button',{name:tr('招待を送る','Send invitation'),exact:true}).click();
    const invitation=page.locator('.screening-invitation-list li').first();await invitation.waitFor();
    await badge(invitation,tr('吹替','Dubbed'));await noOverflow();
    await page.goto(`${base}/#movies?date=${DATE}`);await film.waitFor();
    await film.locator('.movie-list-copy strong a').click();
    const bookings=page.locator('.movie-day').first().locator('.screening-booking');await bookings.first().waitFor();
    await badge(bookings.filter({has:page.locator('.subtitled')}),tr('字幕','Subtitled'));await badge(bookings.filter({has:page.locator('.dubbed')}),tr('吹替','Dubbed'));
    assert.equal(await bookings.filter({hasNot:page.locator('.screening-language')}).locator('.screening-language').count(),0);
    assert.ok((await bookings.filter({has:page.locator('.dubbed')}).getAttribute('aria-label')).includes(tr('吹替','Dubbed')));
    assert.equal(await bookings.filter({has:page.locator('.dubbed')}).getAttribute('href'),target);
    await bookings.filter({has:page.locator('.subtitled')}).scrollIntoViewIfNeeded();await noOverflow();await readableLabels();
    await page.screenshot({path:`output/playwright/screening-formats-detail-${language}-${width}.png`});
    await page.getByRole('button',{name:tr('ダークモードに切り替える','Switch to dark mode'),exact:true}).click();await noOverflow();await readableLabels();
    await page.screenshot({path:`output/playwright/screening-formats-dark-${language}-${width}.png`});
    // Full Japanese qualifiers must also fit narrow cinema columns in English.
    await page.close();
    const qualifiers=await browser.newPage({viewport:{width,height:700}});
    await installFixture(qualifiers,language,{formats:['日本語字幕付き / IMAX','日本語吹き替え版',null]});
    await qualifiers.goto(`${base}/#schedule?date=${DATE}`);await qualifiers.locator('.screening-language').first().waitFor();
    assert.equal(await qualifiers.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(await qualifiers.locator('.screening-language').evaluateAll(nodes=>nodes.some(n=>n.scrollWidth>n.clientWidth)),false,'long language labels wrap within their badge');
    await qualifiers.close();
    assert.deepEqual(errors,[]);
    console.log(`${language} ${width}px: labels, exact showing, booking target, saved plan, shared plans and invitations, reload, themes, unknown format and overflow passed`);
  }
} finally {await browser.close();}
