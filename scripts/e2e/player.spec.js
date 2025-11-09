// @ts-check
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';

test('play track, toggle favorites-only and sleep timer UI', async ({ page }) => {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });

  // Вход по промокоду
  await page.fill('#promo-inp', 'VITRINA2025');
  await page.click('#promo-btn');
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

test('favorites view: add to favorites, play and verify mini-mode when browsing other album', async ({ page }) => {
  const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });

  // Войти по промокоду
  await page.fill('#promo-inp', 'VITRINA2025');
  await page.click('#promo-btn');
  await page.waitForSelector('#track-list .track', { timeout: 10000 });

  // Отметить первый трек как избранный
  const firstTrack = page.locator('#track-list .track').first();
  await firstTrack.hover();
  const star = firstTrack.locator('.like-star');
  await star.click();

  // Открыть представление «Избранное» (иконка с data-akey="__favorites__")
  await page.click('.album-icon[data-akey="__favorites__"]');

  // Кликнуть по первой строке в «Избранном», если есть
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const favFirst = page.locator('#track-list .track').first();
  await favFirst.click();

  // Плеер видим
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();

  // Переключиться на другой альбом (например, второй значок, не Favorites и не News)
  const otherIcon = page.locator('.album-icon').filter({ hasNot: page.locator('[data-akey="__favorites__"]') }).nth(1);
  await otherIcon.click();

  // Проверить, что появился mini-режим (мини-шапка)
  await expect(page.locator('#mini-now')).toBeVisible();
});

