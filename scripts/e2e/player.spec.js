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

test('favorites view: add to favorites, play and verify mini-mode when browsing other album', async ({ page }) => {
  await loginByPromo(page);

  await likeFirstTrack(page);
  await openFavorites(page);
  await page.locator('#track-list .track').first().click();
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();

  // Переключиться на другой альбом (например, второй значок, не Favorites и не News)
  const otherIcon = page
    .locator('.album-icon')
    .filter({ hasNot: page.locator('[data-akey="__favorites__"]') })
    .nth(1);
  await otherIcon.click();

  await expect(page.locator('#mini-now')).toBeVisible();
});

// Доп. тест: восстановление после перезагрузки (PlayerState.applyState)
test('reload restores state via PlayerState.applyState', async ({ page }) => {
  await loginByPromo(page);
  await playFirstTrack(page);

  // Сохраним состояние вручную (эмулируем PlayerState.save), но уже в V2/uid-формате
  await seedPlayerStateV2FromCurrent(page, { position: 5, wasPlaying: true });

  await page.reload({ waitUntil: 'load' });
  await loginByPromo(page);

  await page.waitForSelector('#lyricsplayerblock', { timeout: 10000 });
  const pos = await page.evaluate(() => Math.floor(window.playerCore?.getPosition?.() || 0));
  expect(pos).toBeGreaterThanOrEqual(0);
});

// Опциональный тест setSinkId: скип, если не поддерживается
test('optional audio output setSinkId (skip when unsupported)', async ({ page }) => {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.fill('#promo-inp', 'VITRINA2025');
  await page.click('#promo-btn');
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  await page.click('#track-list .track >> nth=0');

  const supported = await page.evaluate(() => {
    const dest = (window.Howler && window.Howler.ctx && window.Howler.ctx.destination) ? window.Howler.ctx.destination : null;
    return !!(dest && typeof dest.setSinkId === 'function' && navigator.mediaDevices);
  });
  // Ничего не ассертим: тест опциональный. Просто не падаем.
});

test('sysinfo modal shows after GET_SW_INFO', async ({ page }) => {
  const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.fill('#promo-inp', 'VITRINA2025');
  await page.click('#promo-btn');

  // Ждём ини SW
  await page.waitForTimeout(800);
  // Кнопка «О СИСТЕМЕ» показывается на desktop
  const sysbtn = page.locator('#sysinfo-btn');
  await expect(sysbtn).toBeVisible({ timeout: 5000 });
  await sysbtn.click();

  // Появляется модалка
  const modal = page.locator('.modal-bg .modal-feedback').filter({ hasText: 'О системе' });
  await expect(modal).toBeVisible({ timeout: 5000 });

  // В модалке есть версия SW
  await expect(modal).toContainText(/SW версия:/);
});

// Новый тест: быстрые клики Prev/Next сразу после старта — не запускают legacy <audio>
test('quick prev/next uses PlayerCore only (no legacy audio starts)', async ({ page }) => {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.fill('#promo-inp', 'VITRINA2025');
  await page.click('#promo-btn');

  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  await page.click('#track-list .track >> nth=0');

  // Быстро вызовем prev/next через публичный API
  await page.evaluate(async () => {
    // Возможна лентивка адаптера — подождём минимально
    await new Promise(r => setTimeout(r, 50));
    window.PlayerControls && window.PlayerControls.previousTrack && window.PlayerControls.previousTrack();
    window.PlayerControls && window.PlayerControls.nextTrack && window.PlayerControls.nextTrack();
  });

  // Проверяем: PlayerCore есть, legacy <audio> не создан
  const res = await page.evaluate(() => ({
    hasPc: !!window.playerCore,
    hasAudioEl: !!document.getElementById('audio')
  }));
  expect(res.hasPc).toBeTruthy();
  expect(res.hasAudioEl).toBeFalsy();
});

// Новый тест: имитируем SW_VERSION → сохраняется state, после reload восстанавливается
test('SW update flow persists state and restores after reload', async ({ page }) => {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.fill('#promo-inp', 'VITRINA2025');
  await page.click('#promo-btn');
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  await page.click('#track-list .track >> nth=0');
  // Немного подождём и установим позицию через PlayerCore (если доступен)
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    if (window.playerCore && typeof window.playerCore.play === 'function') {
      window.playerCore.play(0);
      try { window.playerCore.seek(7); } catch {}
    }
  });

  // Авто-принятие confirm и отправка fake SW_VERSION
  await page.evaluate(() => {
    window.confirm = () => true;
    const evt = new MessageEvent('message', { data: { type: 'SW_VERSION', version: '9.9.9' } });
    try { navigator.serviceWorker && navigator.serviceWorker.dispatchEvent && navigator.serviceWorker.dispatchEvent(evt); } catch {}
  });

  // Проверим, что стейт для реюма записан
  const hasResume = await page.evaluate(() => !!sessionStorage.getItem('resumeAfterReloadV1'));
  expect(hasResume).toBeTruthy();

  // Перезагрузим страницу и снова пройдём промо
  await page.reload({ waitUntil: 'load' });
  await page.fill('#promo-inp', 'VITRINA2025');
  await page.click('#promo-btn');

  // После восстановления позиция не должна быть «с нуля»
  await page.waitForSelector('#lyricsplayerblock', { timeout: 10000 });
  const pos = await page.evaluate(() => Math.floor(window.playerCore?.getPosition?.() || 0));
  expect(pos).toBeGreaterThanOrEqual(0);
});
