// @ts-check
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';

test('index loads and promo allows enter', async ({ page }) => {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await expect(page).toHaveTitle(/Витрина Разбита/i);

  // Промо-блок виден
  const promo = page.locator('#promocode-block');
  await expect(promo).toBeVisible();

  // Вводим промокод и входим
  await page.fill('#promo-inp', 'VITRINA2025');
  await page.click('#promo-btn');

  // Основной блок становится видимым
  await expect(page.locator('#main-block')).toBeVisible();

  // PlayerCore создан
  const hasPC = await page.evaluate(() => !!window.playerCore);
  expect(hasPC).toBeTruthy();
});

test('news page renders list or shows status', async ({ page }) => {
  await page.goto(`${BASE}/news.html`, { waitUntil: 'load' });
  await expect(page).toHaveTitle(/Новости — Витрина Разбита/i);
  // Либо есть список, либо статус "Пока новостей нет"
  const list = page.locator('#news');
  const status = page.locator('#status');
  await expect(list.or(status)).toBeVisible();
});
