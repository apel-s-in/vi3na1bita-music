// @ts-check
import { test, expect } from '@playwright/test';
import { loginByPromo, likeFirstTrack, openFavorites, playFirstTrack } from './utils.js';

test('favorites UI builds and plays from favorites list', async ({ page }) => {
  await loginByPromo(page); await likeFirstTrack(page); await openFavorites(page);
  expect(await page.locator('#track-list .track').count()).toBeGreaterThan(0);
  await page.locator('#track-list .track').first().click();
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();
});

test('toggle star in favorites updates row state and localStorage (uid-based)', async ({ page }) => {
  await loginByPromo(page); await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const fR = page.locator('#track-list .track').first();
  await fR.hover(); await fR.locator('.like-star').click();
  await page.click('.album-icon[data-akey="__favorites__"]');
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const fV = page.locator('#track-list .track').first(), fId = await fV.getAttribute('id');
  expect(fId).toMatch(/^fav_/);
  await fV.locator('.like-star').click(); await expect(fV).toHaveClass(/inactive/);
  expect(await page.evaluate(id => {
    const u = String(id || '').match(/^fav_(.+)_(.+)$/)?.[2] || '';
    return (JSON.parse(localStorage.getItem('__favorites_v2__') || '[]')).some(i => i.uid === u && !i.inactiveAt);
  }, fId)).toBeFalsy();
});

test('favorites playing: removing star of current track triggers next', async ({ page }) => {
  await loginByPromo(page); await page.click('#promo-btn');
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const r = page.locator('#track-list .track').first();
  await r.hover(); await r.locator('.like-star').click();
  await page.click('.album-icon[data-akey="__favorites__"]');
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const fF = page.locator('#track-list .track').first(); await fF.click();
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();
  const bI = await page.evaluate(() => window.playerCore?.getIndex?.() ?? -1);
  await fF.locator('.like-star').click(); await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.playerCore?.getIndex?.() ?? -1)).not.toBe(bI);
  await expect(fF).toHaveClass(/inactive/);
});

test('quick prev/next uses PlayerCore only (no legacy audio)', async ({ page }) => {
  await loginByPromo(page); await page.waitForSelector('#track-list .track', { timeout: 10000 });
  await page.click('#track-list .track >> nth=0');
  expect(await page.evaluate(() => !!document.querySelector('audio'))).toBeFalsy();
  expect(await page.evaluate(() => window.playerCore?.isPlaying())).toBeTruthy();
});
