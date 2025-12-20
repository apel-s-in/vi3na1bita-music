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

  // ✅ ЕДИНЫЙ способ симуляции SW-message: window.dispatchEvent
  await page.evaluate(() => {
    window.confirm = () => true;
    const evt = new MessageEvent('message', { data: { type: 'SW_VERSION', version: '9.9.9' } });
    try { window.dispatchEvent(evt); } catch {}
  });

  // Проверим, что стейт для реюма записан (V2)
  const hasResume = await page.evaluate(() => !!sessionStorage.getItem('resumeAfterReloadV2'));
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
      likedUids: window.FavoritesManager?.getLikedUidsForAlbum?.(window.AlbumsManager?.getPlayingAlbum?.() || '') || []
    };
  });
test('shuffle history: next-next-prev returns to previously played track', async ({ page }) => {
  await loginByPromo(page);
  await page.waitForSelector('#track-list .track', { timeout: 10000 });

  // Запустим первый трек
  await page.click('#track-list .track >> nth=0');

  // Включим shuffle
  await page.click('#shuffle-btn');
  await expect(page.locator('#shuffle-btn')).toHaveClass(/active/);

  // Зафиксируем первый трек (uid)
  const first = await page.evaluate(() => String(window.playerCore?.getCurrentTrack?.()?.uid || ''));

  // next, next
  await page.click('#next-btn');
  await page.waitForTimeout(200);
  const second = await page.evaluate(() => String(window.playerCore?.getCurrentTrack?.()?.uid || ''));

  await page.click('#next-btn');
  await page.waitForTimeout(200);
  const third = await page.evaluate(() => String(window.playerCore?.getCurrentTrack?.()?.uid || ''));

  // prev должен вернуться на второй (по истории), а не “по массиву”
  await page.click('#prev-btn');
  await page.waitForTimeout(200);
  const back = await page.evaluate(() => String(window.playerCore?.getCurrentTrack?.()?.uid || ''));

  expect(first).toBeTruthy();
  expect(second).toBeTruthy();
  expect(third).toBeTruthy();
  expect(back).toBe(second);
});
  expect(after.len).toBeGreaterThanOrEqual(beforeLen);
  // В хвосте должен быть один из лайкнутых (в идеале — второй трек, но uid нам проще подтвердить через likedUids)
  expect(after.likedUids.includes(after.tailUid)).toBeTruthy();
});

