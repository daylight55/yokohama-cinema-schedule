// Run against Vite with deterministic API fixtures; no production data is changed.
// PLAYWRIGHT_MODULE may point to an installed Playwright module outside this repo.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { installFixture } from './site-guide/capture-fixture.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
const base = process.env.APP_URL || 'http://127.0.0.1:5195/';
await fs.mkdir('output/playwright', { recursive: true });
const results = [];
try {
  for (const [width, height] of [[320, 700], [390, 844]]) for (const lang of ['ja', 'en']) {
    const context = await browser.newContext({ viewport: { width, height }, locale: lang === 'ja' ? 'ja-JP' : 'en-GB' });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await installFixture(page, lang);
    let unread = 125, patches = [], denied = false;
    let profile = { userId: 'guide', displayName: 'Hama', avatarUrl: null, bio: 'Movie fan' };
    await page.route('**/api/account/profile', async route => {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON(); patches.push(body);
        profile = { ...profile, ...body, avatarUrl: body.avatar || null };
      }
      await route.fulfill({ json: profile });
    });
    await page.route('**/api/member-page**', async route => {
      const userId = new URL(route.request().url()).searchParams.get('userId') || 'guide';
      if (denied || !['guide', 'friend'].includes(userId)) return route.fulfill({ status: 404, json: {error:'not_found'} });
      await route.fulfill({ json: {
        profile: { ...profile, userId, displayName: userId === 'friend' ? 'Sora' : 'Hama' }, isSelf: userId === 'guide',
        movies: [{ movieKey: 'unscheduled', title: 'Unscheduled favorite', imageUrl: null, starred: true, status: null },
          { movieKey: 'watched', title: 'Watched without star', imageUrl: null, starred: false, status: 'watched' }],
        plans: [{ userId, showingId: 'future', title: 'Future film', startsAt: '2099-01-01T12:00:00Z', cinemaName: 'Cinema', reserved: true }], titles: [],
      } });
    });
    await page.route('**/api/notifications**', async route => {
      if (route.request().method() === 'PATCH') unread = 0;
      await route.fulfill({ json: { userId: 'guide', items: [], unread, latestId: 125, lastReadId: unread ? 0 : 125, nextBefore: null, titles: [] } });
    });
    const fits = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width} ${lang} overflow`);
    await page.goto(`${base}#account`);
    await page.locator('.member-activity-tabs').waitFor();
    await page.locator('.account-cinema-list').waitFor();
    assert.equal(await page.locator('.account-page > :last-child').getAttribute('class'), 'account-section account-cinema-settings');
    assert.equal(await page.locator('.profile-unread-badge').textContent(), '125');
    await page.locator('.profile-menu > summary').click();
    assert.equal(await page.locator('.menu-unread-badge').textContent(), '125');
    await fits();
    await page.screenshot({ path: `output/playwright/member-menu-${lang}-${width}.png` });
    await page.keyboard.press('Escape');
    // Use a known two-colour raster to verify that the applied crop matches the preview.
    const source = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 600; c.height = 300;
      const x = c.getContext('2d'); x.fillStyle = 'red'; x.fillRect(0, 0, 300, 300); x.fillStyle = 'blue'; x.fillRect(300, 0, 300, 300);
      return c.toDataURL('image/png').split(',')[1];
    });
    const upload = () => page.locator('input[type=file]').setInputFiles({ name: 'crop.png', mimeType: 'image/png', buffer: Buffer.from(source, 'base64') });
    await upload(); await page.locator('.avatar-crop-viewport img').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(patches.length, 0);
    assert.equal(await page.locator('.profile-photo-row img').count(), 0);
    await upload(); await page.locator('.avatar-crop-viewport img').waitFor();
    const ranges = page.locator('.avatar-crop-dialog input[type=range]');
    await ranges.nth(0).fill('2');
    const viewport = await page.locator('.avatar-crop-viewport').boundingBox();
    await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
    await page.mouse.down(); await page.mouse.move(viewport.x + 20, viewport.y + 20); await page.mouse.up();
    assert.ok(Number(await ranges.nth(1).inputValue()) > 0, 'drag changes position');
    await ranges.nth(1).focus(); await page.keyboard.press('End');
    await ranges.nth(2).fill('0');
    assert.equal(await ranges.nth(1).inputValue(), '1');
    await fits();
    await page.screenshot({ path: `output/playwright/member-crop-${lang}-${width}.png` });
    await page.locator('.avatar-crop-actions button').last().click();
    assert.equal(patches.length, 0, 'apply only changes the local preview');
    await page.locator('.profile-save-row button').click();
    await page.locator('.profile-save-row [role=status]').waitFor();
    assert.equal(patches.length, 1);
    const pixels = await page.evaluate(async data => {
      const img = new Image(); img.src = data; await img.decode();
      const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      return { width: img.naturalWidth, height: img.naturalHeight, centre: [...x.getImageData(128, 128, 1, 1).data], corner: [...x.getImageData(1, 1, 1, 1).data] };
    }, patches[0].avatar);
    assert.equal(pixels.width, 256); assert.equal(pixels.height, 256);
    for (const pixel of [pixels.centre, pixels.corner]) assert.ok(pixel[2] > 240 && pixel[0] < 15, 'crop contains the selected blue region');
    await upload(); await page.locator('.avatar-crop-viewport img').waitFor(); await page.keyboard.press('Escape');
    assert.equal(await page.locator('.profile-photo-row img').getAttribute('src'), patches[0].avatar);
    await page.goto(`${base}#groups`);
    await page.locator('.group-member-list a[href="#member?user=friend"]').click();
    await page.getByRole('heading', { level: 1, name: 'Sora' }).waitFor();
    await page.getByText('Unscheduled favorite', { exact: true }).waitFor();
    await page.locator('.member-activity-tabs button').nth(1).click(); await page.getByText('Watched without star', { exact: true }).waitFor();
    await page.locator('.member-activity-tabs button').nth(2).click(); await page.getByText('Future film', { exact: true }).waitFor();
    await fits(); await page.screenshot({ path: `output/playwright/member-page-${lang}-${width}.png` });
    await page.reload(); await page.getByRole('heading', { level: 1, name: 'Sora' }).waitFor();
    assert.equal(new URL(page.url()).hash, '#member?user=friend');
    await page.goBack(); await page.locator('.group-member-list').waitFor();
    await page.goForward(); await page.getByRole('heading', { level: 1, name: 'Sora' }).waitFor();
    denied = true; await page.reload(); await page.locator('.member-activity [role=alert]').waitFor();
    assert.equal(await page.getByText('Future film', { exact: true }).count(), 0);
    await page.locator('.profile-menu > summary').click(); await page.locator('.profile-menu a[href="#notifications"]').click();
    await page.locator('.notification-read').click(); await page.waitForFunction(() => !document.querySelector('.profile-unread-badge'));
    await page.locator('.profile-menu > summary').click(); assert.equal(await page.locator('.menu-unread-badge').count(), 0);
    assert.equal(await page.locator('.notification-bell').count(), 0); await fits();
    assert.deepEqual(errors, []);
    results.push({ width, height, lang, crop: pixels, memberNavigation: 'passed', notificationRead: 'passed', overflow: false });
    await context.close();
  }
  await fs.writeFile('output/playwright/member-ui-qa.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
