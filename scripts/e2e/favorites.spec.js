// @ts-check
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';

test('favorites UI builds and plays from favorites list', async ({ page }) => {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.fill('#promo-inp', 'VITRINA2025');
  await page.click('#promo-btn');

  // Отметим первый трек как избранный в текущем альбоме
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const firstRow = page.locator('#track-list .track').first();
  await firstRow.hover();
  await firstRow.locator('.like-star').click();

  // Открыть «Избранное»
  await page.click('.album-icon[data-akey="__favorites__"]');

  // Должны увидеть хотя бы одну строку
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const favCount = await page.locator('#track-list .track').count();
  expect(favCount).toBeGreaterThan(0);

  // Клик по первой строке — должен появиться блок плеера
  await page.locator('#track-list .track').first().click();
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();
});

test('toggle star in favorites updates row state and localStorage', async ({ page }) => {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.fill('#promo-inp', 'VITRINA2025');
  await page.click('#promo-btn');

  // Если пусто — отметим трек как избранный
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const firstAlbumRow = page.locator('#track-list .track').first();
  await firstAlbumRow.hover();
  await firstAlbumRow.locator('.like-star').click();

  // Войти в «Избранное»
  await page.click('.album-icon[data-akey="__favorites__"]');
  await page.waitForSelector('#track-list .track', { timeout: 10000 });

  const favRow = page.locator('#track-list .track').first();
  const favId = await favRow.getAttribute('id'); // формат fav_{a}_{t}
  expect(favId).toMatch(/^fav_/);

  // Снимем звезду — строка станет .inactive и запись пропадёт из likedTracks:v2
  await favRow.locator('.like-star').click();

  await expect(favRow).toHaveClass(/inactive/);

  // Проверим localStorage: likedTracks:v2 больше не содержит эту ссылку
  const { albumKey, trackIdx, present } = await page.evaluate((id) => {
    const m = id.match(/^fav_(.+)_(\d+)$/);
    const a = m ? m[1] : '';
    const t = m ? parseInt(m[2], 10) : -1;
    const raw = localStorage.getItem('likedTracks:v2');
    const map = raw ? JSON.parse(raw) : {};
    const arr = Array.isArray(map[a]) ? map[a] : [];
    return { albumKey: a, trackIdx: t, present: arr.includes(t) };
  }, favId);

  expect(albumKey).toBeTruthy();
  expect(trackIdx).toBeGreaterThanOrEqual(0);
  expect(present).toBeFalsy();
});
