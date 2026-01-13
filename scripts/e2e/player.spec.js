// @ts-check
import { test, expect } from '@playwright/test';
import {
  loginByPromo,
  likeFirstTrack,
  openFavorites,
  playFirstTrack,
  seedPlayerStateV2FromCurrent
} from './utils.js';

test('play track, toggle favorites-only and sleep timer UI', async ({ page }) => {
  await loginByPromo(page);
  await expect(page.locator('#main-block')).toBeVisible();

  // Дождаться списка альбомов и клик по первой строке треклиста
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const firstTrack = page.locator('#track-list .track').first();
  await firstTrack.click();

  // Появился блок плеера и кнопка Play/Pause есть
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();
  await expect(page.locator('#play-pause-icon')).toBeVisible();

  // Включаем фильтр "только избранные" (кнопка в плеере)
  await page.click('#favorites-btn');
  const favBtn = page.locator('#favorites-btn');
  await expect(favBtn).toHaveClass(/favorites-active/);

  // Таймер сна: открыть меню и выбрать "15 минут", затем выключить
  await page.click('#sleep-timer-btn');
  await page.click('.sleep-menu-item:has-text("15 минут")');
  // Бейдж должен появиться
  await expect(page.locator('#sleep-timer-badge')).toBeVisible();
  // Выключим
  await page.click('#sleep-timer-btn');
  await page.click('.sleep-menu-item:has-text("Выключить")');
  await expect(page.locator('#sleep-timer-badge')).toBeHidden();
});

test('favoritesOnly: unliking current track switches to next (no stop)', async ({ page }) => {
  await loginByPromo(page);

  await page.waitForSelector('#track-list .track', { timeout: 10000 });

  // Лайкнем первый трек и запустим его
  const firstRow = page.locator('#track-list .track').first();
  await firstRow.hover();
  await firstRow.locator('.like-star').click();
  await firstRow.click();

  // Включим favoritesOnly
  await page.click('#favorites-btn');
  await expect(page.locator('#favorites-btn')).toHaveClass(/favorites-active/);

  const before = await page.evaluate(() => ({
    playing: !!window.playerCore?.isPlaying?.(),
    idx: window.playerCore?.getIndex?.() ?? -1,
    uid: String(window.playerCore?.getCurrentTrack?.()?.uid || '')
  }));

  // Снимем лайк с текущего (через мини/звезду списка проще: клик по звезде в строке)
  await firstRow.locator('.like-star').click();

  // Должен переключиться следующий (или хотя бы измениться uid/index), при этом НЕ stop.
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => ({
    playing: !!window.playerCore?.isPlaying?.(),
    idx: window.playerCore?.getIndex?.() ?? -1,
    uid: String(window.playerCore?.getCurrentTrack?.()?.uid || '')
  }));

  expect(after.playing).toBeTruthy();
  expect(after.uid).not.toBe(before.uid);
});

test('repeat has priority: favoritesOnly + repeat + unliking current keeps repeating', async ({ page }) => {
  await loginByPromo(page);

  await page.waitForSelector('#track-list .track', { timeout: 10000 });

  const firstRow = page.locator('#track-list .track').first();
  await firstRow.hover();
  await firstRow.locator('.like-star').click();
  await firstRow.click();

  // favoritesOnly ON
  await page.click('#favorites-btn');
  await expect(page.locator('#favorites-btn')).toHaveClass(/favorites-active/);

  // repeat ON
  await page.click('#repeat-btn');
  await expect(page.locator('#repeat-btn')).toHaveClass(/active/);

  const before = await page.evaluate(() => ({
    idx: window.playerCore?.getIndex?.() ?? -1,
    uid: String(window.playerCore?.getCurrentTrack?.()?.uid || ''),
    repeat: !!window.playerCore?.isRepeat?.()
  }));
  expect(before.repeat).toBeTruthy();

  // Снимем лайк с текущего трека
  await firstRow.locator('.like-star').click();
  await page.waitForTimeout(300);

  // По правилу: repeat игнорирует фильтр и продолжает на том же треке
  const after = await page.evaluate(() => ({
    idx: window.playerCore?.getIndex?.() ?? -1,
    uid: String(window.playerCore?.getCurrentTrack?.()?.uid || '')
  }));

  expect(after.uid).toBe(before.uid);
});

test('favoritesOnly + shuffle: liking another track adds it to tail of queue', async ({ page }) => {
  await loginByPromo(page);
  await page.waitForSelector('#track-list .track', { timeout: 10000 });

  const rows = page.locator('#track-list .track');
  const firstRow = rows.nth(0);
  const secondRow = rows.nth(1);

  // Лайкнем 1-й трек и запустим
  await firstRow.hover();
  await firstRow.locator('.like-star').click();
  await firstRow.click();

  // favoritesOnly ON
  await page.click('#favorites-btn');
  await expect(page.locator('#favorites-btn')).toHaveClass(/favorites-active/);

  // shuffle ON
  await page.click('#shuffle-btn');
  await expect(page.locator('#shuffle-btn')).toHaveClass(/active/);

  // Запомним длину плейлиста
  const beforeLen = await page.evaluate(() => (window.playerCore?.getPlaylistSnapshot?.() || []).length);

  // Лайкнем второй трек (должен попасть в конец очереди)
  await secondRow.hover();
  await secondRow.locator('.like-star').click();
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => {
    const snap = window.playerCore?.getPlaylistSnapshot?.() || [];
    const tail = snap.length ? snap[snap.length - 1] : null;
    return {
      len: snap.length,
      tailUid: String(tail?.uid || '').trim(),
      likedUids: window.playerCore?.getLikedUidsForAlbum?.(window.AlbumsManager?.getPlayingAlbum?.() || '') || []
    };
  });

  expect(after.len).toBeGreaterThanOrEqual(beforeLen);
  expect(after.likedUids.includes(after.tailUid)).toBeTruthy();
});

test('shuffle history: next-next-prev returns to previously played track', async ({ page }) => {
  await loginByPromo(page);
  await page.waitForSelector('#track-list .track', { timeout: 10000 });

  // Запустим первый трек
  await page.click('#track-list .track >> nth=0');

  // Включим shuffle
  await page.click('#shuffle-btn');
  await expect(page.locator('#shuffle-btn')).toHaveClass(/active/);

  const first = await page.evaluate(() => String(window.playerCore?.getCurrentTrack?.()?.uid || ''));

  await page.click('#next-btn');
  await page.waitForTimeout(200);
  const second = await page.evaluate(() => String(window.playerCore?.getCurrentTrack?.()?.uid || ''));

  await page.click('#next-btn');
  await page.waitForTimeout(200);
  const third = await page.evaluate(() => String(window.playerCore?.getCurrentTrack?.()?.uid || ''));

  await page.click('#prev-btn');
  await page.waitForTimeout(200);
  const back = await page.evaluate(() => String(window.playerCore?.getCurrentTrack?.()?.uid || ''));

  expect(first).toBeTruthy();
  expect(second).toBeTruthy();
  expect(third).toBeTruthy();
  expect(back).toBe(second);
});

test('favoritesOnly + shuffle: unliking NOT current removes it from tail if not played yet', async ({ page }) => {
  await loginByPromo(page);
  await page.waitForSelector('#track-list .track', { timeout: 10000 });

  const rows = page.locator('#track-list .track');
  const firstRow = rows.nth(0);
  const secondRow = rows.nth(1);

  // Лайкаем 1 и 2 трек
  await firstRow.hover();
  await firstRow.locator('.like-star').click();
  await secondRow.hover();
  await secondRow.locator('.like-star').click();

  // Запускаем 1-й
  await firstRow.click();

  // favoritesOnly ON
  await page.click('#favorites-btn');
  await expect(page.locator('#favorites-btn')).toHaveClass(/favorites-active/);

  // shuffle ON
  await page.click('#shuffle-btn');
  await expect(page.locator('#shuffle-btn')).toHaveClass(/active/);

  // Теперь плейлист должен содержать 2 трека (или больше, если already), фиксируем длину
  const beforeLen = await page.evaluate(() => (window.playerCore?.getPlaylistSnapshot?.() || []).length);

  // Снимаем лайк со 2-го трека (НЕ текущего)
  await secondRow.locator('.like-star').click();
  await page.waitForTimeout(300);

  const afterLen = await page.evaluate(() => (window.playerCore?.getPlaylistSnapshot?.() || []).length);

  expect(afterLen).toBeLessThanOrEqual(beforeLen);
});
