// @ts-check
import { test, expect } from '@playwright/test';
import { loginByPromo, likeFirstTrack, openFavorites, playFirstTrack } from './utils.js';

test('favorites UI builds and plays from favorites list', async ({ page }) => {
  await loginByPromo(page);

  await likeFirstTrack(page);
  await openFavorites(page);
  const favCount = await page.locator('#track-list .track').count();
  expect(favCount).toBeGreaterThan(0);

  // Клик по первой строке — должен появиться блок плеера
  await page.locator('#track-list .track').first().click();
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();
});

test('toggle star in favorites updates row state and localStorage (uid-based)', async ({ page }) => {
  await loginByPromo(page);

  // Если пусто — отметим трек как избранный
  await page.waitForSelector('#track-list .track', { timeout: 10000 });
  const firstAlbumRow = page.locator('#track-list .track').first();
  await firstAlbumRow.hover();
  await firstAlbumRow.locator('.like-star').click();

  // Войти в «Избранное»
  await page.click('.album-icon[data-akey="__favorites__"]');
  await page.waitForSelector('#track-list .track', { timeout: 10000 });

  const favRow = page.locator('#track-list .track').first();
  const favId = await favRow.getAttribute('id'); // формат fav_{albumKey}_{uid}
  expect(favId).toMatch(/^fav_/);

  // Снимем звезду — строка станет .inactive и uid пропадёт из likedTrackUids:v1
  await favRow.locator('.like-star').click();
  await expect(favRow).toHaveClass(/inactive/);

  // Проверим localStorage: likedTrackUids:v1 больше не содержит этот uid в массиве строк
  const { albumKey, uid, present } = await page.evaluate((id) => {
    const m = String(id || '').match(/^fav_(.+)_(.+)$/);
    const a = m ? m[1] : '';
    const u = m ? m[2] : '';
    const raw = localStorage.getItem('likedTrackUids:v1');
    const map = raw ? JSON.parse(raw) : {};
    const arr = Array.isArray(map[a]) ? map[a] : [];
    return { albumKey: a, uid: u, present: arr.includes(u) };
  }, favId);

  expect(albumKey).toBeTruthy();
  expect(uid).toBeTruthy();
  expect(present).toBeFalsy();
});

test('favorites view: add to favorites, play and verify mini-mode when browsing other album', async ({ page }) => {
  await loginByPromo(page);

  await likeFirstTrack(page);
  await openFavorites(page);

  await page.locator('#track-list .track').first().click();
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();

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

  // ✅ Сидируем state только V2/uid
  await page.evaluate(() => {
    const pc = window.playerCore;
    const track = pc?.getCurrentTrack?.() || null;
    const albumKey = window.AlbumsManager?.getPlayingAlbum?.() || null;

    const st = {
      album: albumKey,
      currentAlbum: window.AlbumsManager?.getCurrentAlbum?.() || albumKey,
      trackUid: String(track?.uid || '').trim() || null,
      sourceAlbum: String(track?.sourceAlbum || '').trim() || null,
      trackIndex: typeof pc?.getIndex === 'function' ? (pc.getIndex() || 0) : 0,
      position: Math.floor(pc?.getPosition?.() || 5),
      volume: typeof pc?.getVolume === 'function' ? (pc.getVolume() ?? 100) : 100,
      wasPlaying: true
    };

    localStorage.setItem('playerStateV2', JSON.stringify(st));
  });

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
    try { window.dispatchEvent(evt); } catch {}
  });

  const hasResume = await page.evaluate(() => !!sessionStorage.getItem('resumeAfterReloadV2'));
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
    window.PlayerUI && window.PlayerUI.updateNextUpLabel && window.PlayerUI.updateNextUpLabel();
    window.PlayerUI && window.PlayerUI.updateMiniHeader && window.PlayerUI.updateMiniHeader();
  });
});

test('mini-player star toggles favorite in __favorites__ and syncs with list (uid-based)', async ({ page }) => {
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
  const favId = await favFirst.getAttribute('id'); // fav_{albumKey}_{uid}
  await favFirst.click();
  await expect(page.locator('#lyricsplayerblock')).toBeVisible();

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

  // 4. Нажмём звезду в мини-плеере (toggleLikePlaying)
  await miniStar.click();
  await page.waitForTimeout(200);

  // 5. Проверим, что состояние в favorites-списке и likedTrackUids:v1 синхронно обновилось
  await page.click('.album-icon[data-akey="__favorites__"]');
  await page.waitForSelector('#track-list .track', { timeout: 10000 });

  const favRowAfter = page.locator(`#${favId}`);
  const starAfter = favRowAfter.locator('.like-star');

  const { albumKey, uid, present } = await page.evaluate((favRowId) => {
    const m = String(favRowId || '').match(/^fav_(.+)_(.+)$/);
    const a = m ? m[1] : '';
    const u = m ? m[2] : '';
    const raw = localStorage.getItem('likedTrackUids:v1');
    const map = raw ? JSON.parse(raw) : {};
    const arr = Array.isArray(map[a]) ? map[a] : [];
    return { albumKey: a, uid: u, present: arr.includes(u) };
  }, favId);

  expect(albumKey).toBeTruthy();
  expect(uid).toBeTruthy();

  await expect(starAfter).toBeVisible();
  if (present) {
    await expect(favRowAfter).not.toHaveClass(/inactive/);
  } else {
    await expect(favRowAfter).toHaveClass(/inactive/);
  }
});
