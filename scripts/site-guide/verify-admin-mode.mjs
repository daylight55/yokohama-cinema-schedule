// Exercise the real UI with isolated account data; no production writes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { installFixture, DATE } from './capture-fixture.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.GUIDE_URL || 'http://127.0.0.1:5194';
const browser = await chromium.launch({ headless: true });
await mkdir('output/playwright', { recursive: true });
try {
  for (const language of ['ja', 'en']) for (const [width, height] of [[320,700], [390,844], [1280,900]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await installFixture(page, language);
    let role = 'admin', adminRequests = 0;
    await page.route('**/api/account/language', route => route.fulfill({ json: { language, userRole: role } }));
    await page.route('**/api/account', route => route.fulfill({ json: {
      user: { id:'guide', email:null, displayEmail:'demo@example.com', role, legacy:false },
      methods:{google:true,password:false,passkeySupported:false}, passkeys:[], users:[], pendingInvites:[], googleConfigured:true,
    } }));
    await page.route('**/api/account/invites', route => {
      adminRequests++;
      return route.fulfill({ json: { invites:[], emailConfigured:false } });
    });
    await page.route('**/api/admin/collection', route => {
      adminRequests++;
      return route.fulfill({ json: { status: { dates:[DATE], cinemas:[{
        id:'burg', name:'横浜ブルク13', days:[{ date:DATE, status:'error', stale:false }],
      }] }, jobs:[], history:[] } });
    });
    const go = async hash => {
      await page.evaluate(hash => { location.hash = hash; }, hash);
      await page.waitForTimeout(200);
    };
    const toggle = page.getByRole('switch', { name: language === 'ja' ? '管理者モード' : 'Administrator mode', exact:true });
    const overflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.goto(`${base}/#account`);
    await toggle.waitFor();
    assert.equal(await toggle.isChecked(), false);
    assert.equal(adminRequests, 0);
    assert.equal(await page.locator('.navigation-sheet[open]').count(), 0);
    assert.ok((await page.locator('.account-admin-mode label').boundingBox()).height >= 44);
    await overflow();
    await toggle.focus();
    await page.keyboard.press('Space');
    assert.equal(await toggle.isChecked(), true);
    await page.screenshot({ path:`output/playwright/admin-mode-${language}-${width}.png`, fullPage:true });
    await page.reload();
    await toggle.waitFor();
    assert.equal(await toggle.isChecked(), true);
    await go(`#schedule?date=${DATE}`);
    await page.waitForFunction(() => document.querySelector('.collection-count')?.textContent === '1');
    assert.equal(await page.locator('.collection-count-key').count(), 1);
    await page.getByRole('button', {name:language==='ja'?'メニューを開く':'Open menu', exact:true}).click();
    const adminLink = page.locator('.navigation-admin a[href="#admin-collection"]');
    await adminLink.waitFor({ state:'visible' });
    await adminLink.click();
    await page.locator('.admin-collection form').waitFor();
    await overflow();
    await page.goBack();
    await page.locator('.collection-count').first().waitFor();
    await page.goForward();
    await page.locator('.admin-collection form').waitFor();
    await go('#admin-users');
    await page.locator('.admin-tabs').waitFor();
    await overflow();
    await go('#account');
    await toggle.waitFor();
    await toggle.uncheck();
    assert.equal(await page.locator('.navigation-admin').count(), 0);
    const stoppedAt = adminRequests;
    for (const hash of ['#admin-collection', '#admin-users']) {
      await go(hash);
      await page.getByRole('link', {name:language==='ja'?'管理者モードを設定':'Set administrator mode'}).waitFor();
      assert.equal(await page.locator('.admin-collection, .admin-users-page').count(), 0);
      await page.reload();
      await page.getByRole('link', {name:language==='ja'?'管理者モードを設定':'Set administrator mode'}).waitFor();
    }
    await go(`#movies?date=${DATE}`);
    await page.locator('.schedule-search input').waitFor();
    assert.equal(await page.locator('.collection-count, .collection-count-key').count(), 0);
    await page.clock.runFor(61000);
    assert.equal(adminRequests, stoppedAt, 'admin polling stops when mode is off');
    await overflow();
    await go(`#collection-status?date=${DATE}`);
    await page.locator('.collection-page').waitFor();
    assert.equal(await page.locator('.collection-page').count(), 1, 'public status remains available');
    // A saved display preference must never grant a member admin UI or reads.
    role = 'member';
    await page.evaluate(() => localStorage.setItem('hamamubi-admin-mode', 'on'));
    await page.goto(`${base}/#account`);
    await page.reload(); // A new login session reloads the role from the server.
    await page.locator('.member-activity-tabs').waitFor();
    assert.equal(await toggle.count(), 0);
    await go(`#schedule?date=${DATE}`);
    await page.locator('.schedule-search input').waitFor();
    assert.equal(await page.locator('.collection-count, .navigation-admin').count(), 0);
    await go('#admin-collection');
    assert.equal(await page.locator('.admin-collection').count(), 0);
    assert.equal(await page.getByRole('link', {name:'Set administrator mode'}).count(), 0);
    assert.equal(adminRequests, stoppedAt);
    await overflow();
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`${language} ${width}x${height}: role, keyboard, persistence, direct hashes, history, polling and overflow passed`);
  }
} finally { await browser.close(); }
