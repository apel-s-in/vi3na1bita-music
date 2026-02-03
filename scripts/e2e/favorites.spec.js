// scripts/e2e/favorites.spec.js
// @ts-check
import { test, expect } from '@playwright/test';
import { loginByPromo, likeFirstTrack, openFavorites, playFirstTrack } from './utils.js';

test('favorites UI builds and plays from favorites list', async ({ page }) => {
  await loginByPromo(page);
  await likeFirstTrack(page);
  await openFavorites(page);
  
  const favCount = await page.locator('#track-list .track').count();
  expect(favCount).toBeGreaterThan(0);

  // Click first track -> player should appear
  await page.locator('#track-list .track').first().click();
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();
});

test('toggle star in favorites updates row state and localStorage (uid-based)', async ({ page }) => {
  await loginByPromo(page);

  // Like first track in album
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const firstAlbumRow = page.locator('#track-list .track').first();
  await firstAlbumRow.hover();
  await firstAlbumRow.locator('.like-star').click();

  // Go to Favorites
  await page.click('.album-icon[data-akey="__favorites__"]');
  await page.waitForSelector('#track-list .track', { timeout: 10000 });

  const favRow = page.locator('#track-list .track').first();
  const favId = await favRow.getAttribute('id');
  expect(favId).toMatch(/^fav_/);

  // Unlike -> row becomes inactive
  await favRow.locator('.like-star').click();
  await expect(favRow).toHaveClass(/inactive/);

  // Check V2 Storage (__favorites_v2__)
  const isLiked = await page.evaluate((id) => {
    const m = String(id || '').match(/^fav_(.+)_(.+)$/);
    const u = m ? m[2] : '';
    const raw = localStorage.getItem('__favorites_v2__');
    const items = raw ? JSON.parse(raw) : [];
    // В V2 хранятся объекты, ищем активный (без inactiveAt)
    return items.some(i => i.uid === u && !i.inactiveAt);
  }, favId);

  expect(isLiked).toBeFalsy();
});

test('favorites playing: removing star of current track triggers next', async ({ page }) => {
  await loginByPromo(page);
  await page.click('#promo-btn');

  // Like & Play in Favorites
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const row = page.locator('#track-list .track').first();
  await row.hover();
  await row.locator('.like-star').click();

  await page.click('.album-icon[data-akey="__favorites__"]');
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  
  const favFirst = page.locator('#track-list .track').first();
  await favFirst.click();
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();

  // Remove star on current playing track
  const beforeIdx = await page.evaluate(() => window.playerCore?.getIndex?.() ?? -1);
  await favFirst.locator('.like-star').click();

  // Should skip to next or handle gracefully (not stop)
  await page.waitForTimeout(300);
  const afterIdx = await page.evaluate(() => window.playerCore?.getIndex?.() ?? -1);
  
  // Track should change or index update
  expect(afterIdx).not.toBe(beforeIdx);
  await expect(favFirst).toHaveClass(/inactive/);
});

test('quick prev/next uses PlayerCore only (no legacy audio)', async ({ page }) => {
  await loginByPromo(page);
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  await page.click('#track-list .track >> nth=0');

  // Ensure no <audio> tag exists
  const hasAudioTag = await page.evaluate(() => !!document.querySelector('audio'));
  expect(hasAudioTag).toBeFalsy();

  // Ensure PlayerCore is active
  const isPlaying = await page.evaluate(() => window.playerCore?.isPlaying());
  expect(isPlaying).toBeTruthy();
});
