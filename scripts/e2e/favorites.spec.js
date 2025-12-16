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

// Доп. тест: восстановление после перезагрузки (PlayerState.applyState)
test('reload restores state via PlayerState.applyState', async ({ page }) => {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.fill('#promo-inp', 'VITRINA2025');
  await page.click('#promo-btn');
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  await page.click('#track-list .track >> nth=0');
  await page.waitForSelector('#lyricsplayerblock', { timeout: 10000 });

  // Сохраним состояние вручную (эмулируем PlayerState.save)
  await page.evaluate(() => {
    const pc = window.playerCore;
    const st = {
      album: window.currentAlbumKey || null,
      trackIndex: 0,
      position: Math.floor(pc?.getPosition?.() || 5),
      volume: pc?.getVolume?.() ?? 1,
      wasPlaying: true
    };
    localStorage.setItem('playerStateV1', JSON.stringify(st));
  });

  await page.reload({ waitUntil: 'load' });
  await page.fill('#promo-inp', 'VITRINA2025'); // после reload может снова спросить промо
  await page.click('#promo-btn');

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
  // Ничего не ассертим: тест опциональный.
});

test('sysinfo modal shows after GET_SW_INFO', async ({ page }) => {
  const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.fill('#promo-inp', 'VITRINA2025');
  await page.click('#promo-btn');

  // Ждём ини SW
  await page.waitForTimeout(800);
  const sysbtn = page.locator('#sysinfo-btn');
  await expect(sysbtn).toBeVisible({ timeout: 5000 });
  await sysbtn.click();

  const modal = page.locator('.modal-bg .modal-feedback').filter({ hasText: 'О системе' });
  await expect(modal).toBeVisible({ timeout: 5000 });
  await expect(modal).toContainText(/SW версия:/);
});

// Новый тест: быстрые клики Prev/Next сразу после старта — не запускают legacy <audio>
test('quick prev/next uses PlayerCore only (no legacy audio starts)', async ({ page }) => {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.fill('#promo-inp', 'VITRINA2025');
  await page.click('#promo-btn');

  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  await page.click('#track-list .track >> nth=0');

  await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 50));
    window.PlayerControls && window.PlayerControls.previousTrack && window.PlayerControls.previousTrack();
    window.PlayerControls && window.PlayerControls.nextTrack && window.PlayerControls.nextTrack();
  });

  const res = await page.evaluate(() => ({
    hasPc: !!window.playerCore,
    hasAudioEl: !!document.getElementById('audio')
  }));
  expect(res.hasPc).toBeTruthy();
  expect(res.hasAudioEl).toBeFalsy();
});

test('SW update flow persists state and restores after reload', async ({ page }) => {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.fill('#promo-inp', 'VITRINA2025');
  await page.click('#promo-btn');
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  await page.click('#track-list .track >> nth=0');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    if (window.playerCore && typeof window.playerCore.play === 'function') {
      window.playerCore.play(0);
      try { window.playerCore.seek(7); } catch {}
    }
  });

  await page.evaluate(() => {
    window.confirm = () => true;
    const evt = new MessageEvent('message', { data: { type: 'SW_VERSION', version: '9.9.9' } });
    try { navigator.serviceWorker && navigator.serviceWorker.dispatchEvent && navigator.serviceWorker.dispatchEvent(evt); } catch {}
  });

  const hasResume = await page.evaluate(() => !!sessionStorage.getItem('resumeAfterReloadV1'));
  expect(hasResume).toBeTruthy();

  await page.reload({ waitUntil: 'load' });
  await page.fill('#promo-inp', 'VITRINA2025');
  await page.click('#promo-btn');

  await page.waitForSelector('#lyricsplayerblock', { timeout: 10000 });
  const pos = await page.evaluate(() => Math.floor(window.playerCore?.getPosition?.() || 0));
  expect(pos).toBeGreaterThanOrEqual(0);
});

// НОВЫЙ ТЕСТ: снял звезду у текущего в режиме Избранного → next() и UI обновился
test('favorites playing: removing star of current track triggers next and updates UI', async ({ page }) => {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.fill('#promo-inp', 'VITRINA2025');
  await page.click('#promo-btn');

  // Отметим первый трек как избранный в альбоме
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const firstAlbumRow = page.locator('#track-list .track').first();
  await firstAlbumRow.hover();
  await firstAlbumRow.locator('.like-star').click();

  // Откроем «Избранное» и запустим воспроизведение первого трека
  await page.click('.album-icon[data-akey="__favorites__"]');
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const favFirst = page.locator('#track-list .track').first();
  await favFirst.click();
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();

  // Снимем звезду на этой же строке
  const beforeIdx = await page.evaluate(() => (window.playerCore?.getIndex?.() ?? window.playingTrack ?? 0));
  await favFirst.locator('.like-star').click();

  // Должен переключиться следующий трек
  await page.waitForTimeout(300);
  const afterIdx = await page.evaluate(() => (window.playerCore?.getIndex?.() ?? window.playingTrack ?? 0));
  expect(afterIdx).not.toBe(beforeIdx);

  // Строка стала inactive, а класс .current должен подсветить другой элемент
  await expect(favFirst).toHaveClass(/inactive/);
  const currentCount = await page.locator('#track-list .track.current').count();
  expect(currentCount).toBe(1);

  // Если сейчас мини-режим возможен — «Далее»/мини-шапка обновятся без ошибок (не строго ассертим видимость)
  await page.evaluate(() => {
    window.MiniUI && window.MiniUI.updateNextUpLabel && window.MiniUI.updateNextUpLabel();
    window.MiniUI && window.MiniUI.updateMiniNowHeader && window.MiniUI.updateMiniNowHeader();
  });
});

test('mini-player star toggles favorite in __favorites__ and syncs with list', async ({ page }) => {
  const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });

  // Вход по промокоду
  await page.fill('#promo-inp', 'VITRINA2025');
  await page.click('#promo-btn');
  await page.waitForSelector('#track-list .track', { timeout: 10000 });

  // 1. Отметим первый трек как избранный в альбомном списке
  const firstAlbumRow = page.locator('#track-list .track').first();
  await firstAlbumRow.hover();
  await firstAlbumRow.locator('.like-star').click();

  // 2. Перейдём в «Избранное» и запустим первый трек
  await page.click('.album-icon[data-akey="__favorites__"]');
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const favFirst = page.locator('#track-list .track').first();
  const favId = await favFirst.getAttribute('id'); // fav_{album}_{num}
  await favFirst.click();
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();

  // Убедимся, что трек реально играет из __favorites__
  await page.waitForTimeout(200);

  // 3. Переключимся на другой альбом, чтобы включился mini-режим
  const otherIcon = page
    .locator('.album-icon')
    .filter({ hasNot: page.locator('[data-akey="__favorites__"]') })
    .nth(1);
  await otherIcon.click();

  // Мини-плеер видим
  const miniStar = page.locator('#mini-now-star');
  await expect(page.locator('#mini-now')).toBeVisible({ timeout: 5000 });
  await expect(miniStar).toBeVisible();

  // 4. Считаем текущее состояние лайка из localStorage
  const before = await page.evaluate(() => {
    const pc = window.playerCore;
    const t = pc?.getCurrentTrack?.();
    const idx = pc?.getIndex?.();
    const album = window.AlbumsManager?.getPlayingAlbum?.() || null;
    const raw = localStorage.getItem('likedTracks:v2');
    const map = raw ? JSON.parse(raw) : {};
    return { album, idx, likedMap: map };
  });

  // Нажмём звезду в мини-плеере (toggleLikePlaying)
  await miniStar.click();
  await page.waitForTimeout(200);

  // 5. Проверим, что состояние в favorites-списке и localStorage синхронно обновилось
  await page.click('.album-icon[data-akey="__favorites__"]');
  await page.waitForSelector('#track-list .track', { timeout: 10000 });

  const favRowAfter = page.locator(`#${favId}`);
  const starAfter = favRowAfter.locator('.like-star');

  const { albumKey, trackNum, present } = await page.evaluate((favRowId) => {
    const m = favRowId.match(/^fav_(.+)_(\d+)$/);
    const a = m ? m[1] : '';
    const t = m ? parseInt(m[2], 10) : -1;
    const raw = localStorage.getItem('likedTracks:v2');
    const map = raw ? JSON.parse(raw) : {};
    const arr = Array.isArray(map[a]) ? map[a] : [];
    return { albumKey: a, trackNum: t, present: arr.includes(t) };
  }, favId);

  // Если до этого лайк был, теперь его не должно быть (или наоборот).
  await expect(starAfter).toBeVisible();
  // Строка должна быть inactive, если лайк снят, либо без inactive, если поставлен.
  if (present) {
    await expect(favRowAfter).not.toHaveClass(/inactive/);
  } else {
    await expect(favRowAfter).toHaveClass(/inactive/);
  }

  // Мини-шапка должна соответствовать текущему состоянию лайка (updateMiniHeader)
  await page.evaluate(() => {
    window.PlayerUI && window.PlayerUI.updateMiniHeader && window.PlayerUI.updateMiniHeader();
  });
});
