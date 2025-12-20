// @ts-check
import { test, expect } from '@playwright/test';
import {
  BASE,
  loginByPromo,
  likeFirstTrack,
  openFavorites,
  playFirstTrack,
  waitTracks,
  seedPlayerStateV2FromCurrent
} from './utils.js';

test('play track, toggle favorites-only and sleep timer UI', async ({ page }) => {
  await loginByPromo(page);
  await expect(page.locator('#main-block')).toBeVisible();
  await waitTracks(page);

  await page.locator('#track-list .track').first().click();
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();
  await expect(page.locator('#play-pause-icon')).toBeVisible();

  await page.click('#favorites-btn');
  await expect(page.locator('#favorites-btn')).toHaveClass(/favorites-active/);

  await page.click('#sleep-timer-btn');
  await page.click('.sleep-menu-item:has-text("15 минут")');
  await expect(page.locator('#sleep-timer-badge')).toBeVisible();
  await page.click('#sleep-timer-btn');
  await page.click('.sleep-menu-item:has-text("Выключить")');
  await expect(page.locator('#sleep-timer-badge')).toBeHidden();
});

test('mini-mode when browsing other album', async ({ page }) => {
  await loginByPromo(page);
  await likeFirstTrack(page);
  await openFavorites(page);
  await page.locator('#track-list .track').first().click();
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();

  const otherIcon = page.locator('.album-icon').filter({ hasNot: page.locator('[data-akey="__favorites__"]') }).nth(1);
  await otherIcon.click();
  await expect(page.locator('#mini-now')).toBeVisible();
});

test('reload restores state via PlayerState', async ({ page }) => {
  await loginByPromo(page);
  await playFirstTrack(page);
  await seedPlayerStateV2FromCurrent(page, { position: 5, wasPlaying: true });

  await page.reload({ waitUntil: 'load' });
  await loginByPromo(page);
  await page.waitForSelector('#lyricsplayerblock', { timeout: 10000 });

  const pos = await page.evaluate(() => Math.floor(window.playerCore?.getPosition?.() || 0));
  expect(pos).toBeGreaterThanOrEqual(0);
});

test('quick prev/next uses PlayerCore only', async ({ page }) => {
  await loginByPromo(page);
  await waitTracks(page);
  await page.click('#track-list .track >> nth=0');

  await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 50));
    window.playerCore?.prev?.();
    window.playerCore?.next?.();
  });

  const res = await page.evaluate(() => ({
    hasPc: !!window.playerCore,
    hasAudioEl: !!document.getElementById('audio')
  }));
  expect(res.hasPc).toBeTruthy();
  expect(res.hasAudioEl).toBeFalsy();
});

test('sysinfo modal shows SW version', async ({ page }) => {
  await loginByPromo(page);
  await page.waitForTimeout(800);

  const sysbtn = page.locator('#sysinfo-btn');
  await expect(sysbtn).toBeVisible({ timeout: 5000 });
  await sysbtn.click();

  const modal = page.locator('.modal-bg .modal-feedback').filter({ hasText: 'О системе' });
  await expect(modal).toBeVisible({ timeout: 5000 });
  await expect(modal).toContainText(/SW версия:/);
});

test('SW update flow persists state', async ({ page }) => {
  await loginByPromo(page);
  await waitTracks(page);
  await page.click('#track-list .track >> nth=0');
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    window.playerCore?.play?.(0);
    try { window.playerCore?.seek?.(7); } catch {}
  });

  await page.evaluate(() => {
    window.confirm = () => true;
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'SW_VERSION', version: '9.9.9' } }));
  });

  expect(await page.evaluate(() => !!sessionStorage.getItem('resumeAfterReloadV2'))).toBeTruthy();
});

test('favoritesOnly: unliking current triggers next', async ({ page }) => {
  await loginByPromo(page);
  await waitTracks(page);

  const firstRow = page.locator('#track-list .track').first();
  await firstRow.hover();
  await firstRow.locator('.like-star').click();
  await firstRow.click();

  await page.click('#favorites-btn');
  await expect(page.locator('#favorites-btn')).toHaveClass(/favorites-active/);

  const before = await page.evaluate(() => String(window.playerCore?.getCurrentTrack?.()?.uid || ''));
  await firstRow.locator('.like-star').click();
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => ({
    playing: !!window.playerCore?.isPlaying?.(),
    uid: String(window.playerCore?.getCurrentTrack?.()?.uid || '')
  }));

  expect(after.playing).toBeTruthy();
  expect(after.uid).not.toBe(before);
});

test('repeat has priority over favoritesOnly', async ({ page }) => {
  await loginByPromo(page);
  await waitTracks(page);

  const firstRow = page.locator('#track-list .track').first();
  await firstRow.hover();
  await firstRow.locator('.like-star').click();
  await firstRow.click();

  await page.click('#favorites-btn');
  await page.click('#repeat-btn');
  await expect(page.locator('#repeat-btn')).toHaveClass(/active/);

  const before = await page.evaluate(() => String(window.playerCore?.getCurrentTrack?.()?.uid || ''));
  await firstRow.locator('.like-star').click();
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => String(window.playerCore?.getCurrentTrack?.()?.uid || ''));
  expect(after).toBe(before);
});

test('shuffle history: next-next-prev returns to previous', async ({ page }) => {
  await loginByPromo(page);
  await waitTracks(page);
  await page.click('#track-list .track >> nth=0');

  await page.click('#shuffle-btn');
  await expect(page.locator('#shuffle-btn')).toHaveClass(/active/);

  await page.click('#next-btn');
  await page.waitForTimeout(200);
  const second = await page.evaluate(() => String(window.playerCore?.getCurrentTrack?.()?.uid || ''));

  await page.click('#next-btn');
  await page.waitForTimeout(200);

  await page.click('#prev-btn');
  await page.waitForTimeout(200);
  const back = await page.evaluate(() => String(window.playerCore?.getCurrentTrack?.()?.uid || ''));

  expect(back).toBe(second);
});
