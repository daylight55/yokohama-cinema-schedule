#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {installFixture,DATE,TITLE,TITLE_EN} from './capture-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.GUIDE_URL || 'http://127.0.0.1:5194';
const root=path.dirname(fileURLToPath(import.meta.url));
const output=path.join(root,'captures'); await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const scheduleOnly=process.argv.includes('--schedule-only');
const manifest=scheduleOnly ? JSON.parse(await fs.readFile(path.join(output,'manifest.json'),'utf8')) : {viewport:{width:390,height:700},sourceRevision:process.env.GUIDE_SOURCE_REVISION||'unknown',sourceWorkingTreeNote:process.env.GUIDE_SOURCE_NOTE||'Record any local changes in the source checkout here.',data:'Demonstration data in the real app; no personal accounts or external writes',languages:{}};
try {
for(const lang of ['ja','en']){
 const context=await browser.newContext({viewport:manifest.viewport,deviceScaleFactor:2,locale:lang==='ja'?'ja-JP':'en-GB',colorScheme:'light'});
 const page=await context.newPage(); const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await installFixture(page,lang);
 const tr=(ja,en)=>lang==='ja'?ja:en;
 await page.goto(base+`/#movies?date=${DATE}`); await page.locator('.schedule-search').waitFor(); await page.waitForTimeout(500);
 await page.evaluate(()=>document.fonts.ready);
 if(process.argv.includes('--inspect')) {
 await page.screenshot({path:path.join(output,`${lang}-inspect.png`)});
 await fs.writeFile(path.join(output,`${lang}-inspect.txt`),await page.locator('body').ariaSnapshot());
 }
 if(process.argv.includes('--inspect')) {console.log(await page.locator('body').ariaSnapshot()); await context.close(); continue;}

 const scenes=[];
 let current;
 const save=async(label, target=null, at=0, zoom=1.5)=>{
   await page.waitForTimeout(220);
   await page.evaluate(()=>document.fonts.ready);
   const filename=`${lang}-${String(scenes.length).padStart(2,'0')}-${label}.png`;
   const box=target?await target.boundingBox():null;
   if(target&&!box)throw Error(`Missing focus target: ${label}`);
   await page.screenshot({path:path.join(output,filename)});
   current.frames.push({at,image:filename,focus:box,zoom});
   await fs.writeFile(path.join(output,filename.replace('.png','.txt')),await page.locator('body').ariaSnapshot());
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   if(overflow)throw Error(`Page overflow: ${filename}`);
 };
 const begin=(name,duration=8)=>{current={name,kind:'screen',duration,frames:[]};};
 const end=()=>{scenes.push(current); console.log(`${lang}: captured ${current.name}`);};
 const menu=()=>page.getByRole('button',{name:tr('メニューを開く','Open menu'),exact:true});
 const film=tr(TITLE,TITLE_EN);
 const search=()=>page.getByRole('searchbox',{name:tr('作品名・映画館名','Film or cinema')});
 const searchButton=()=>page.getByRole('button',{name:tr('検索','Search'),exact:true});
 const settle=async()=>{await page.waitForTimeout(350); await page.mouse.move(389,699);};
 const nav=async(href)=>{
   await menu().click();
   await page.locator(`#primary-navigation a[href="${href}"]`).click();
   await settle();
 };
 // 0. The greeting is a dedicated mascot scene, with no app capture underneath.
 scenes.push({name:'intro',kind:'mascot',duration:10});
 // The main feature comes first: compare cinemas in the same schedule.
 begin('schedule',10);
 current.sourceRevision=process.env.GUIDE_SOURCE_REVISION||'unknown';
 current.sourceWorkingTreeNote=process.env.GUIDE_SOURCE_NOTE||'No local app changes';
 await save('entry',menu(),0,1.05);
 await menu().click();
 const scheduleLink=page.locator(`#primary-navigation a[href="#schedule?date=${DATE}"]`);
 await save('sidebar',scheduleLink,1,1.25);
 await scheduleLink.click(); await settle();
 await page.locator('.cinema-strip').first().scrollIntoViewIfNeeded(); await settle();
 await save('overview',page.locator('.timeline-hour').first(),2.8,1.05);
 await save('cinemas',page.locator('.cinema-strip').first(),5,1.35);
 await page.locator('.cinema-strip').first().evaluate(el=>el.scrollLeft=el.scrollWidth);
 await save('more-cinemas',page.locator('.cinema-strip').first(),7.4,1.35); end();
 if(scheduleOnly){
   if(errors.length)throw Error(errors.join('\n'));
   manifest.languages[lang][1]=scenes[1];
   await context.close(); continue;
 }
 // Personalize the schedule in My page, then show the actual filtered result.
 await menu().click();
 begin('cinema-settings'); await save('menu',page.locator('#primary-navigation a[href="#account"]'),0,1.3);
 await page.locator('#primary-navigation a[href="#account"]').click(); await settle();
 const settings=page.locator('.account-cinema-settings');
 await settings.scrollIntoViewIfNeeded(); await save('settings',settings,1.6,1.12);
 const cinemaSwitch=settings.getByRole('switch',{name:tr('TOHOシネマズ 上大岡','TOHO Cinemas Kamiooka'),exact:true});
 await cinemaSwitch.uncheck(); await settle(); await save('selected',settings,3.5,1.12);
 await settings.getByRole('link').click(); await settle();
 await page.locator('.cinema-strip').first().scrollIntoViewIfNeeded();
 await save('result',page.locator('.cinema-strip').first(),5.4,1.25); end();
 await nav(`#movies?date=${DATE}`);
 // 1. Real typing, submitting and the resulting filtered list.
 begin('search'); await save('before',page.locator('.schedule-search'),0,1.65);
 await search().fill(film); await save('typed',searchButton(),1.8,1.65);
 await searchButton().click(); await settle();
 await save('result',page.locator('.movie-list-item').first(),3.8,1.35); end();
 // 2. Follow the actual film title link to the seven-day detail page.
 const titleLink=page.getByRole('link',{name:film,exact:true}).last();
 await titleLink.scrollIntoViewIfNeeded(); await settle();
 begin('film'); await save('title',titleLink,0,1.7);
 await titleLink.click(); await page.locator('.movie-day').first().waitFor(); await settle();
 await save('detail',page.locator('.movie-day').first(),2.6,1.3);
 const nextDay=page.locator('.movie-day-nav button').nth(1); await nextDay.click(); await settle();
 await save('another-day',page.locator('.movie-day').nth(1),5,1.25); end();
 // 3. Focus the real official-site link. Do not submit a ticket purchase.
 const booking=page.locator('.screening-booking').nth(3);
 await booking.scrollIntoViewIfNeeded(); await settle();
 begin('booking'); await save('link',booking,0,1.6);
 await booking.focus();
 const popupPromise=page.waitForEvent('popup'); await booking.click();
 const popup=await popupPromise; await popup.close();
 await save('focused',booking,2.3,1.7);
 const href=await booking.getAttribute('href');
 if(!href.startsWith('https://'))throw Error('Booking target must be external HTTPS');
 current.externalDestination=href; end();
 // Save a film from the actual list and show the selected star.
 await page.goBack(); await page.locator('.schedule-search').waitFor(); await settle();
 const star=page.locator('.movie-list-item').filter({has:page.getByRole('link',{name:film,exact:true})}).locator('button.favorite-button').first();
 await star.scrollIntoViewIfNeeded(); await settle();
 begin('watchlist'); await save('star',star,0,1.8);
 await star.click(); await page.waitForFunction(()=>document.querySelector('.movie-list-item .favorite-button[aria-pressed="true"]'));
 await save('saved',star,2.3,1.5);
 await save('selected',star,5,1.8); end();
 // 5. Add a particular showing and follow the menu to the saved plan.
 await nav(`#schedule?date=${DATE}`);
 await search().fill(film); await searchButton().click(); await settle();
 const plan=page.locator('.viewing-plan-toggle').first();
 await plan.scrollIntoViewIfNeeded(); await settle();
 begin('plan'); await save('add',plan,0,1.8);
 await plan.click(); await page.waitForTimeout(450);
 await save('added',plan,2,1.8);
 await menu().click(); await save('menu',page.locator('#primary-navigation a[href="#viewing-plans"]'),4,1.4);
 await page.locator('#primary-navigation a[href="#viewing-plans"]').click(); await settle();
 await save('plans',page.locator('main'),5.4,1.1); end();
 // 6. Show the actual shared plans and shared watchlist tabs.
 await nav('#shared'); await page.locator('.shared-tabs').waitFor();
 begin('sharing'); await save('plans',page.locator('.shared-tabs'),0,1.4);
 await page.locator('.shared-tabs button').nth(1).click(); await settle();
 await save('watchlist',page.locator('.shared-movies').first(),2.4,1.3); end();
 // 7. Toggle the real persisted JP / EN setting and show the translated screen.
 begin('language',5); const toggle=page.getByRole('switch');
 await save('before',toggle,0,1.9); await toggle.click(); await settle();
 await save('translated',page.locator('main'),2.7,1.2);
 await toggle.click(); await settle(); await save('return',toggle,4,1.5); end();
 // 8. A separate goodbye gives the mascot time to hop, land and hold its wink.
 scenes.push({name:'outro',kind:'mascot',duration:8});
 for(const [width,height] of [[320,700],[390,844]]) {
   await page.setViewportSize({width,height}); await settle();
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error(`Overflow at ${width}`);
   await page.reload(); await page.locator('.shared-tabs').waitFor();
   await page.goBack(); await page.goForward(); await page.locator('.shared-tabs').waitFor();
   await page.screenshot({path:path.join(output,`${lang}-qa-${width}.png`)});
 }
 if(errors.length)throw Error(errors.join('\n'));
 manifest.languages[lang]=scenes;
 await context.close();
}
 await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
}finally{await browser.close();}
