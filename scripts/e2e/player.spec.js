// @ts-check
import { test, expect } from '@playwright/test';
import { loginByPromo, likeFirstTrack, openFavorites, playFirstTrack, openSleepTimer, setSleepPreset, resetSleepTimer, seedPlayerStateV2FromCurrent } from './utils.js';

test('play track, toggle favorites-only and sleep timer UI', async ({ page }) => {
  await loginByPromo(page); await expect(page.locator('#main-block')).toBeVisible();
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  await page.locator('#track-list .track').first().click();
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();
  await expect(page.locator('#play-pause-icon')).toBeVisible();
  await page.click('#favorites-btn'); await expect(page.locator('#favorites-btn')).toHaveClass(/favorites-active/);
  await openSleepTimer(page); await setSleepPreset(page, 15);
  await expect(page.locator('#sleep-timer-badge')).toBeVisible();
  await openSleepTimer(page); await resetSleepTimer(page);
  await expect(page.locator('#sleep-timer-badge')).toBeHidden();
});

test('favoritesOnly: unliking current track switches to next (no stop)', async ({ page }) => {
  await loginByPromo(page); await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const fR = page.locator('#track-list .track').first();
  await fR.hover(); await fR.locator('.like-star').click(); await fR.click();
  await page.click('#favorites-btn'); await expect(page.locator('#favorites-btn')).toHaveClass(/favorites-active/);
  const bef = await page.evaluate(() => ({ playing: !!window.playerCore?.isPlaying?.(), idx: window.playerCore?.getIndex?.() ?? -1, uid: String(window.playerCore?.getCurrentTrack?.()?.uid || '') }));
  await fR.locator('.like-star').click(); await page.waitForTimeout(300);
  const aft = await page.evaluate(() => ({ playing: !!window.playerCore?.isPlaying?.(), idx: window.playerCore?.getIndex?.() ?? -1, uid: String(window.playerCore?.getCurrentTrack?.()?.uid || '') }));
  expect(aft.playing).toBeTruthy(); expect(aft.uid).not.toBe(bef.uid);
});

test('favoritesOnly + repeat: unliking current track still switches to next in favorites rules', async ({ page }) => {
  await loginByPromo(page); await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const fR = page.locator('#track-list .track').first();
  await fR.hover(); await fR.locator('.like-star').click(); await fR.click();
  await page.click('#favorites-btn'); await expect(page.locator('#favorites-btn')).toHaveClass(/favorites-active/);
  await page.click('#repeat-btn'); await expect(page.locator('#repeat-btn')).toHaveClass(/active/);
  const bef = await page.evaluate(() => ({ playing: !!window.playerCore?.isPlaying?.(), uid: String(window.playerCore?.getCurrentTrack?.()?.uid || '') }));
  await fR.locator('.like-star').click(); await page.waitForTimeout(300);
  const aft = await page.evaluate(() => ({ playing: !!window.playerCore?.isPlaying?.(), uid: String(window.playerCore?.getCurrentTrack?.()?.uid || '') }));
  expect(aft.uid).not.toBe(bef.uid); expect(aft.playing).toBeTruthy();
});

test('favoritesOnly + shuffle: liking another track adds it to tail of queue', async ({ page }) => {
  await loginByPromo(page); await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const rows = page.locator('#track-list .track'), fR = rows.nth(0), sR = rows.nth(1);
  await fR.hover(); await fR.locator('.like-star').click(); await fR.click();
  await page.click('#favorites-btn'); await expect(page.locator('#favorites-btn')).toHaveClass(/favorites-active/);
  await page.click('#shuffle-btn'); await expect(page.locator('#shuffle-btn')).toHaveClass(/active/);
  const bL = await page.evaluate(() => (window.playerCore?.getPlaylistSnapshot?.() || []).length);
  await sR.hover(); await sR.locator('.like-star').click(); await page.waitForTimeout(300);
  const aft = await page.evaluate(() => { const s = window.playerCore?.getPlaylistSnapshot?.() || []; return { len: s.length, tailUid: String(s[s.length - 1]?.uid || '').trim(), likedUids: window.playerCore?.getLikedUidsForAlbum?.(window.AlbumsManager?.getPlayingAlbum?.() || '') || [] }; });
  expect(aft.len).toBeGreaterThanOrEqual(bL); expect(aft.likedUids.includes(aft.tailUid)).toBeTruthy();
});

test('shuffle history: next-next-prev returns to previously played track', async ({ page }) => {
  await loginByPromo(page); await page.waitForSelector('#track-list .track', { timeout: 10000 });
  await page.click('#track-list .track >> nth=0');
  await page.click('#shuffle-btn'); await expect(page.locator('#shuffle-btn')).toHaveClass(/active/);
  const gU = async () => page.evaluate(() => String(window.playerCore?.getCurrentTrack?.()?.uid || ''));
  const f = await gU();
  await page.click('#next-btn'); await page.waitForTimeout(200); const s = await gU();
  await page.click('#next-btn'); await page.waitForTimeout(200); const t = await gU();
  await page.click('#prev-btn'); await page.waitForTimeout(200); const b = await gU();
  expect(f).toBeTruthy(); expect(s).toBeTruthy(); expect(t).toBeTruthy(); expect(b).toBe(s);
});

test('favoritesOnly + shuffle: unliking NOT current removes it from tail if not played yet', async ({ page }) => {
  await loginByPromo(page); await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const rows = page.locator('#track-list .track'), fR = rows.nth(0), sR = rows.nth(1);
  await fR.hover(); await fR.locator('.like-star').click();
  await sR.hover(); await sR.locator('.like-star').click();
  await fR.click();
  await page.click('#favorites-btn'); await expect(page.locator('#favorites-btn')).toHaveClass(/favorites-active/);
  await page.click('#shuffle-btn'); await expect(page.locator('#shuffle-btn')).toHaveClass(/active/);
  const bL = await page.evaluate(() => (window.playerCore?.getPlaylistSnapshot?.() || []).length);
  await sR.locator('.like-star').click(); await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window.playerCore?.getPlaylistSnapshot?.() || []).length)).toBeLessThanOrEqual(bL);
});

test('social achievement tracks all four news social links', async ({ page }) => {
  await loginByPromo(page); await page.click('.album-icon[data-akey="__reliz__"]'); await page.waitForTimeout(300);
  for (const h of ['https://www.youtube.com/channel/UCbjm1J0V8RkWvNj4Z8-JIhA/', 'https://t.me/vitrina_razbita', 'https://vk.com/apelsinov', 'https://www.tiktok.com/@vi3na1bita']) {
    await page.locator(`#social-links a[href="${h}"]`).click(); await page.waitForTimeout(100);
  }
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => new Promise((res, rej) => { const r = indexedDB.open('MetaDB_v4', 1); r.onerror = () => rej(r.error); r.onsuccess = () => { const g = r.result.transaction('stats', 'readonly').objectStore('stats').get('global'); g.onerror = () => rej(g.error); g.onsuccess = () => res(g.result?.featuresUsed || {}); }; }));
  expect(st.social_visit_youtube || 0).toBeGreaterThan(0); expect(st.social_visit_telegram || 0).toBeGreaterThan(0);
  expect(st.social_visit_vk || 0).toBeGreaterThan(0); expect(st.social_visit_tiktok || 0).toBeGreaterThan(0);
  expect(st.social_visit_all || 0).toBe(1);
});

test('sleep timer logs feature usage into global stats', async ({ page }) => {
  await loginByPromo(page); await page.waitForSelector('#track-list .track', { timeout: 10000 });
  await page.click('#track-list .track >> nth=0'); await page.waitForSelector('#lyricsplayerblock', { timeout: 10000 });
  await page.evaluate(() => window.SleepTimer?.startMinutes?.(0.001)); await page.waitForTimeout(1500);
  const gF = await page.evaluate(() => new Promise((res, rej) => { const r = indexedDB.open('MetaDB_v4', 1); r.onerror = () => rej(r.error); r.onsuccess = () => { const g = r.result.transaction('stats', 'readonly').objectStore('stats').get('global'); g.onerror = () => rej(g.error); g.onsuccess = () => res(g.result?.featuresUsed || {}); }; }));
  expect(gF.sleep_timer || 0).toBeGreaterThan(0);
});
