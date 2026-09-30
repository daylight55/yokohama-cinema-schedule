import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {installFixture,DATE} from './capture-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true});
await fs.mkdir('output/playwright',{recursive:true});
try {
  for(const lang of ['ja','en']) for(const width of [320,390]){
    const page=await browser.newPage({viewport:{width,height:width===320?700:844}});
    await installFixture(page,lang);
    const tr=(ja,en)=>lang==='ja'?ja:en;
    const base=process.env.GUIDE_URL || 'http://127.0.0.1:5194';
    await page.goto(`${base}/#groups`);
    const area=page.locator('.screening-invitations');await area.waitFor();
    await area.getByRole('button',{name:tr('映画に招待','Invite to a screening'),exact:true}).click();
    await area.getByText(tr('まず自分の鑑賞予定を登録してください。','Add a screening to your plans first.'),{exact:false}).waitFor();
    // An isolated fixture request represents an existing self-selected plan.
    await page.evaluate(async()=>{await fetch('/api/viewing-plans',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({showingId:'guide-0-0'})});});
    await page.reload();await area.waitFor();
    await area.getByRole('button',{name:tr('映画に招待','Invite to a screening'),exact:true}).click();
    await area.getByRole('combobox').selectOption('guide-0-0');
    await area.getByRole('checkbox').check();
    await page.screenshot({path:`output/playwright/screening-invitation-${lang}-${width}.png`});
    await area.getByRole('button',{name:tr('招待を送る','Send invitation'),exact:true}).click();
    await area.getByText(tr('返事待ち','Awaiting reply'),{exact:true}).waitFor();
    await page.reload();await area.getByText(tr('返事待ち','Awaiting reply'),{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await area.getByRole('button',{name:tr('招待を取り消す','Cancel invitation'),exact:true}).click();
    await area.getByText(tr('招待取り消し済み','Cancelled'),{exact:true}).waitFor();
    await page.goto(`${base}/#shared`);await area.waitFor();
    await page.goBack();await area.waitFor();await page.goForward();await area.waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    console.log(`${lang} ${width}px: empty plan, compose, send, reload, cancel, shared entry, history and overflow passed`);
    let incoming = {id:'incoming',senderId:'friend',recipientId:'guide',showingId:'guide-0-3',title:'サマーウォーズ',cinemaName:'横浜ブルク13',startsAt:'2026-09-28T12:00:00+09:00',status:'pending'};
    let fail = true;
    await page.route('**/api/viewing-plans', async (route)=>{
      if(incoming.status!=='accepted') return route.fallback();
      return route.fulfill({json:{plans:[{...incoming,movieKey:'サマーウォーズ',cinemaId:'burg',cinemaShortName:'ブルク13',endsAt:'2026-09-28T13:50:00+09:00',screen:null,format:null,bookingUrl:'https://tjoy.jp/yokohama_burg13',reservedAt:null,createdAt:'',updatedAt:''}]}});
    });
    await page.route('**/api/screening-invitations*',async route=>{
      if(route.request().method()==='PATCH') {
        if(fail) return route.fulfill({status:500,json:{error:'failure'}});
        incoming.status=route.request().postDataJSON().action==='accept'?'accepted':'declined';
        return route.fulfill({json:{ok:true}});
      }
      return route.fulfill({json:{invitations:[incoming]}});
    });
    await page.reload();await area.getByRole('button',{name:tr('参加する','Join'),exact:true}).waitFor();
    await area.getByRole('button',{name:tr('参加する','Join'),exact:true}).click();
    await area.getByRole('alert').waitFor();
    assert.equal(await area.getByRole('button',{name:tr('参加する','Join'),exact:true}).isEnabled(),true);
    fail=false;
    await area.getByRole('button',{name:tr('参加する','Join'),exact:true}).click();
    await area.getByText(tr('参加','Joined'),{exact:true}).waitFor();
    await page.goto(`${base}/#viewing-plans`);
    await page.locator('.viewing-plan-timeline li').waitFor();
    assert.equal(await page.locator('.viewing-plan-timeline li').count(),1);
    assert.equal(await page.locator('.viewing-plan-timeline h3').innerText(),tr('サマーウォーズ','Summer Wars'));
    await page.goto(`${base}/#shared`);
    incoming.status='pending';await page.reload();
    await area.getByRole('button',{name:tr('今回は見送る','Decline'),exact:true}).click();
    await area.getByText(tr('見送り','Declined'),{exact:true}).waitFor();
    console.log(`${lang} ${width}px: recipient accept, decline and failed save recovery passed`);
    await page.close();
  }
} finally {await browser.close();}
