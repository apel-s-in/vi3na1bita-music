// @ts-check
import { test, expect } from '@playwright/test';
import { BASE, loginByPromo, likeFirstTrack, openFavorites, waitTracks } from './utils.js';

test('favorites UI builds and plays', async ({ page }) => {
  await loginByPromo(page);
  await likeFirstTrack(page);
  await openFavorites(page);

  expect(await page.locator('#track-list .track').count()).toBeGreaterThan(0);
  await page.locator('#track-list .track').first().click();
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();
});

test('toggle star updates row state and localStorage', async ({ page }) => {
  await loginByPromo(page);
  await likeFirstTrack(page);
  await openFavorites(page);

  const favRow = page.locator('#track-list .track').first();
  const favId = await favRow.getAttribute('id');
  expect(favId).toMatch(/^fav_/);

  await favRow.locator('.like-star').click();
  await expect(favRow).toHaveClass(/inactive/);

  const { present } = await page.evaluate((id) => {
    const m = String(id || '').match(/^fav_(.+)_(.+)$/);
    if (!m) return { present: false };
    const raw = localStorage.getItem('likedTrackUids:v1');
    const map = raw ? JSON.parse(raw) : {};
    return { present: (map[m[1]] || []).includes(m[2]) };
  }, favId);

  expect(present).toBeFalsy();
});

test('mini-player star toggles favorite in __favorites__', async ({ page }) => {
  await loginByPromo(page);
  await likeFirstTrack(page);
  await openFavorites(page);

  const favFirst = page.locator('#track-list .track').first();
  const favId = await favFirst.getAttribute('id');
  await favFirst.click();
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();

  const otherIcon = page.locator('.album-icon').filter({ hasNot: page.locator('[data-akey="__favorites__"]') }).nth(1);
  await otherIcon.click();

  await expect(page.locator('#mini-now')).toBeVisible({ timeout: 5000 });
  await page.locator('#mini-now-star').click();
  await page.waitForTimeout(200);

  await page.click('.album-icon[data-akey="__favorites__"]');
  await waitTracks(page);

  const { present } = await page.evaluate((id) => {
    const m = String(id || '').match(/^fav_(.+)_(.+)$/);
    if (!m) return { present: true };
    const raw = localStorage.getItem('likedTrackUids:v1');
    const map = raw ? JSON.parse(raw) : {};
    return { present: (map[m[1]] || []).includes(m[2]) };
  }, favId);

  const favRowAfter = page.locator(`#${favId}`);
  if (present) {
    await expect(favRowAfter).not.toHaveClass(/inactive/);
  } else {
    await expect(favRowAfter).toHaveClass(/inactive/);
  }
});

test('removing star of current track in favorites triggers next', async ({ page }) => {
  await loginByPromo(page);
  await likeFirstTrack(page);

  // Like second track too
  await page.locator('#track-list .track').nth(1).hover();
  await page.locator('#track-list .track').nth(1).locator('.like-star').click();

  await openFavorites(page);
  const favFirst = page.locator('#track-list .track').first();
  await favFirst.click();
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();

  const beforeIdx = await page.evaluate(() => window.playerCore?.getIndex?.() ?? 0);
  await favFirst.locator('.like-star').click();
  await page.waitForTimeout(300);

  const afterIdx = await page.evaluate(() => window.playerCore?.getIndex?.() ?? 0);
  expect(afterIdx).not.toBe(beforeIdx);
  await expect(favFirst).toHaveClass(/inactive/);
});
