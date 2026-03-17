// @ts-check
import { test, expect } from '@playwright/test';
import { loginByPromo, openSleepTimer, setSleepPreset, resetSleepTimer } from './utils.js';

test('play track, toggle favorites-only and sleep timer UI', async ({ page }) => {
  await loginByPromo(page);
  await expect(page.locator('#main-block')).toBeVisible();
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const first = page.locator('#track-list .track').first();
  await first.locator('.like-star').click();
  await first.click();
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();
  await expect(page.locator('#play-pause-icon')).toBeVisible();
  await page.click('#favorites-btn');
  await expect(page.locator('#favorites-btn')).toHaveClass(/favorites-active/);
  await openSleepTimer(page);
  await setSleepPreset(page, 15);
  await expect(page.locator('#sleep-timer-badge')).toBeVisible();
  await openSleepTimer(page);
  await resetSleepTimer(page);
  await expect(page.locator('#sleep-timer-badge')).toBeHidden();
});

test('favoritesOnly: ON with current non-starred jumps to first starred and keeps playing', async ({ page }) => {
  await loginByPromo(page);
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const rows = page.locator('#track-list .track');
  await rows.nth(1).locator('.like-star').click();
  await rows.nth(0).click();
  const before = await page.evaluate(() => String(window.playerCore?.getCurrentTrack?.()?.uid || ''));
  await page.click('#favorites-btn');
  const after = await page.evaluate(() => ({
    uid: String(window.playerCore?.getCurrentTrack?.()?.uid || ''),
    playing: !!window.playerCore?.isPlaying?.(),
    len: (window.playerCore?.getPlaylistSnapshot?.() || []).length
  }));
  expect(after.playing).toBeTruthy();
  expect(after.uid).not.toBe(before);
  expect(after.len).toBe(1);
});

test('favoritesOnly: OFF restores full playlist without interrupting current track', async ({ page }) => {
  await loginByPromo(page);
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const rows = page.locator('#track-list .track');
  await rows.nth(0).locator('.like-star').click();
  await rows.nth(0).click();
  await page.click('#favorites-btn');
  const onState = await page.evaluate(() => ({
    uid: String(window.playerCore?.getCurrentTrack?.()?.uid || ''),
    len: (window.playerCore?.getPlaylistSnapshot?.() || []).length,
    playing: !!window.playerCore?.isPlaying?.()
  }));
  await page.click('#favorites-btn');
  const offState = await page.evaluate(() => ({
    uid: String(window.playerCore?.getCurrentTrack?.()?.uid || ''),
    len: (window.playerCore?.getPlaylistSnapshot?.() || []).length,
    playing: !!window.playerCore?.isPlaying?.()
  }));
  expect(offState.playing).toBeTruthy();
  expect(offState.uid).toBe(onState.uid);
  expect(offState.len).toBeGreaterThan(onState.len);
});

test('favoritesOnly: removing last current starred track auto-disables F and keeps current track playing', async ({ page }) => {
  await loginByPromo(page);
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const first = page.locator('#track-list .track').first();
  await first.locator('.like-star').click();
  await first.click();
  await page.click('#favorites-btn');
  await expect(page.locator('#favorites-btn')).toHaveClass(/favorites-active/);
  const before = await page.evaluate(() => ({
    uid: String(window.playerCore?.getCurrentTrack?.()?.uid || ''),
    playing: !!window.playerCore?.isPlaying?.()
  }));
  await first.locator('.like-star').click();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({
    uid: String(window.playerCore?.getCurrentTrack?.()?.uid || ''),
    playing: !!window.playerCore?.isPlaying?.(),
    favOn: localStorage.getItem('favoritesOnlyMode') === '1'
  }));
  expect(after.playing).toBeTruthy();
  expect(after.uid).toBe(before.uid);
  expect(after.favOn).toBeFalsy();
});

test('favoritesOnly + shuffle: playlist contains only starred tracks', async ({ page }) => {
  await loginByPromo(page);
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const rows = page.locator('#track-list .track');
  await rows.nth(0).locator('.like-star').click();
  await rows.nth(1).locator('.like-star').click();
  await rows.nth(0).click();
  await page.click('#favorites-btn');
  await page.click('#shuffle-btn');
  await expect(page.locator('#shuffle-btn')).toHaveClass(/active/);
  const st = await page.evaluate(() => {
    const pl = window.playerCore?.getPlaylistSnapshot?.() || [];
    return {
      len: pl.length,
      allFav: pl.every(t => window.playerCore?.isFavorite?.(t.uid))
    };
  });
  expect(st.len).toBe(2);
  expect(st.allFav).toBeTruthy();
});

test('favoritesOnly modal: clicking non-starred track offers choices and cancel keeps previous playback', async ({ page }) => {
  await loginByPromo(page);
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const rows = page.locator('#track-list .track');
  await rows.nth(0).locator('.like-star').click();
  await rows.nth(0).click();
  await page.click('#favorites-btn');
  const before = await page.evaluate(() => String(window.playerCore?.getCurrentTrack?.()?.uid || ''));
  await rows.nth(1).click();
  await expect(page.locator('.modal-bg.active')).toBeVisible();
  await page.locator('.modal-bg.active [data-choice="cancel"]').click();
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => String(window.playerCore?.getCurrentTrack?.()?.uid || ''));
  expect(after).toBe(before);
});

test('shuffle history: next-next-prev returns to previously played track', async ({ page }) => {
  await loginByPromo(page);
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  await page.click('#track-list .track >> nth=0');
  await page.click('#shuffle-btn');
  await expect(page.locator('#shuffle-btn')).toHaveClass(/active/);
  const gU = async () => page.evaluate(() => String(window.playerCore?.getCurrentTrack?.()?.uid || ''));
  const f = await gU();
  await page.click('#next-btn');
  await page.waitForTimeout(200);
  const s = await gU();
  await page.click('#next-btn');
  await page.waitForTimeout(200);
  const t = await gU();
  await page.click('#prev-btn');
  await page.waitForTimeout(200);
  const b = await gU();
  expect(f).toBeTruthy();
  expect(s).toBeTruthy();
  expect(t).toBeTruthy();
  expect(b).toBe(s);
});

test('social achievement tracks all four news social links', async ({ page }) => {
  await loginByPromo(page);
  await page.click('.album-icon[data-akey="__reliz__"]');
  await page.waitForTimeout(300);
  for (const h of ['https://www.youtube.com/channel/UCbjm1J0V8RkWvNj4Z8-JIhA/', 'https://t.me/vitrina_razbita', 'https://vk.com/apelsinov', 'https://www.tiktok.com/@vi3na1bita']) {
    await page.locator(`#social-links a[href="${h}"]`).click();
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('MetaDB_v4', 1);
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const g = r.result.transaction('stats', 'readonly').objectStore('stats').get('global');
      g.onerror = () => rej(g.error);
      g.onsuccess = () => res(g.result?.featuresUsed || {});
    };
  }));
  expect(st.social_visit_youtube || 0).toBeGreaterThan(0);
  expect(st.social_visit_telegram || 0).toBeGreaterThan(0);
  expect(st.social_visit_vk || 0).toBeGreaterThan(0);
  expect(st.social_visit_tiktok || 0).toBeGreaterThan(0);
  expect(st.social_visit_all || 0).toBe(1);
});

test('sleep timer logs feature usage into global stats', async ({ page }) => {
  await loginByPromo(page);
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  await page.click('#track-list .track >> nth=0');
  await page.waitForSelector('#lyricsplayerblock', { timeout: 10000 });
  await page.evaluate(() => window.SleepTimer?.startMinutes?.(0.001));
  await page.waitForTimeout(1500);
  const gF = await page.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('MetaDB_v4', 1);
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const g = r.result.transaction('stats', 'readonly').objectStore('stats').get('global');
      g.onerror = () => rej(g.error);
      g.onsuccess = () => res(g.result?.featuresUsed || {});
    };
  }));
  expect(gF.sleep_timer || 0).toBeGreaterThan(0);
});
