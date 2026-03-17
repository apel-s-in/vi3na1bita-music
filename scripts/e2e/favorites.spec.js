// @ts-check
import { test, expect } from '@playwright/test';
import { loginByPromo, likeFirstTrack, openFavorites } from './utils.js';

test('favorites UI builds and plays from favorites list', async ({ page }) => {
  await loginByPromo(page);
  await likeFirstTrack(page);
  await openFavorites(page);
  await expect(page.locator('#track-list .track')).toHaveCount(1);
  await page.locator('#track-list .track').first().click();
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();
});

test('toggle star in favorites updates row state and localStorage (uid-based)', async ({ page }) => {
  await loginByPromo(page);
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const fR = page.locator('#track-list .track').first();
  await fR.locator('.like-star').click();
  await page.click('.album-icon[data-akey="__favorites__"]');
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const fV = page.locator('#track-list .track').first();
  const fId = await fV.getAttribute('id');
  expect(fId).toMatch(/^fav_/);
  await fV.locator('.like-star').click();
  await expect(fV).toHaveClass(/inactive/);
  expect(await page.evaluate(id => {
    const u = String(id || '').match(/^fav_(.+)_(.+)$/)?.[2] || '';
    return (JSON.parse(localStorage.getItem('__favorites_v2__') || '[]')).some(i => i.uid === u && !i.inactiveAt);
  }, fId)).toBeFalsy();
});

test('favorites view: removing current active star turns row inactive and may switch track', async ({ page }) => {
  await loginByPromo(page);
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const rows = page.locator('#track-list .track');
  await rows.nth(0).locator('.like-star').click();
  await rows.nth(1).locator('.like-star').click();
  await page.click('.album-icon[data-akey="__favorites__"]');
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const firstFav = page.locator('#track-list .track').first();
  await firstFav.click();
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();
  const before = await page.evaluate(() => String(window.playerCore?.getCurrentTrackUid?.() || ''));
  await firstFav.locator('.like-star').click();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({
    uid: String(window.playerCore?.getCurrentTrackUid?.() || ''),
    playing: !!window.playerCore?.isPlaying?.()
  }));
  expect(after.playing).toBeTruthy();
  expect(after.uid).not.toBe(before);
});

test('favoritesOnly hides non-starred rows in current playing album', async ({ page }) => {
  await loginByPromo(page);
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const rows = page.locator('#track-list .track');
  await rows.nth(0).locator('.like-star').click();
  await rows.nth(1).locator('.like-star').click();
  await rows.nth(0).click();
  await page.click('#favorites-btn');
  await expect(page.locator('#favorites-btn')).toHaveClass(/favorites-active/);
  await page.waitForTimeout(250);
  const st = await page.evaluate(() => {
    const all = [...document.querySelectorAll('#track-list .track[data-uid]')];
    return {
      hidden: all.filter(x => x.hasAttribute('data-hidden-by-favonly')).length,
      visibleUnfav: all.filter(x => !x.hasAttribute('data-hidden-by-favonly')).map(x => x.dataset.uid).filter(uid => !window.playerCore?.isFavorite?.(uid))
    };
  });
  expect(st.hidden).toBeGreaterThan(0);
  expect(st.visibleUnfav.length).toBe(0);
});

test('favoritesOnly modal keeps previous playback on cancel', async ({ page }) => {
  await loginByPromo(page);
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const rows = page.locator('#track-list .track');
  await rows.nth(0).locator('.like-star').click();
  await rows.nth(0).click();
  await page.click('#favorites-btn');
  const before = await page.evaluate(() => String(window.playerCore?.getCurrentTrackUid?.() || ''));
  await rows.nth(2).click();
  await expect(page.locator('.modal-bg.active')).toBeVisible();
  await page.locator('.modal-bg.active [data-choice="cancel"]').click();
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => String(window.playerCore?.getCurrentTrackUid?.() || ''));
  expect(after).toBe(before);
});

test('quick prev/next uses PlayerCore only (no legacy audio)', async ({ page }) => {
  await loginByPromo(page);
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  await page.click('#track-list .track >> nth=0');
  expect(await page.evaluate(() => !!document.querySelector('audio'))).toBeFalsy();
  expect(await page.evaluate(() => window.playerCore?.isPlaying())).toBeTruthy();
});
